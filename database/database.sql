-- IMPORTANT
-- You are seeing: "relation \"accounts\" already exists" because this file contains CREATE TABLE.
-- If your tables already exist in Supabase, DO NOT run the CREATE TABLE section.
--
-- ✅ Run only the "MIGRATION (existing DB)" block below.

-- ==========================================
-- MIGRATION (existing DB)
-- Adds the missing relationship so PostgREST can join transactions -> categories.
-- Adds user profiles (Nombre/Apellidos) + RLS policies.
-- ==========================================

begin;

-- ==========================================
-- ACCOUNTS: account type (Ahorro/Cotidiana/Extra)
-- ==========================================

-- Add column for existing DBs (safe / idempotent)
alter table public.accounts
  add column if not exists account_type text not null default 'COTIDIANA';

-- Restrict values (safe / idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_account_type_check'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_account_type_check
      check (account_type = any (array['AHORRO'::text, 'COTIDIANA'::text, 'EXTRA'::text]));
  end if;
end
$$;

-- Needed for gen_random_uuid() on fresh installs and some older projects.
create extension if not exists pgcrypto;

-- If there are transactions pointing to category_id values that don't exist in categories,
-- the FK creation will fail. We auto-create placeholder categories for those IDs.
--
-- NOTE: categories.amount has a > 0 constraint, so we use 0.01.
insert into public.categories (id, user_id, name, direction, amount, budget_bucket, created_at, updated_at)
select distinct on (t.category_id)
  t.category_id as id,
  t.user_id,
  'Migrated category ' || left(t.category_id::text, 8) as name,
  'EXPENSE' as direction,
  0.01 as amount,
  'NEEDS' as budget_bucket,
  now() as created_at,
  now() as updated_at
from public.transactions t
left join public.categories c on c.id = t.category_id
where c.id is null
order by t.category_id, t.created_at asc
on conflict (id) do nothing;

-- ==========================================
-- CATEGORIES: budget bucket (NEEDS/WANTS)
-- ==========================================

alter table public.categories
  add column if not exists budget_bucket text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_budget_bucket_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_budget_bucket_check
      check (budget_bucket = any (array['NEEDS'::text, 'WANTS'::text]));
  end if;
end
$$;

-- Backfill for legacy data:
-- - Expenses with a fixed amount => NEEDS
-- - Expenses without amount      => WANTS
update public.categories
set budget_bucket = case
  when direction = 'EXPENSE' and amount is not null then 'NEEDS'
  when direction = 'EXPENSE' and amount is null then 'WANTS'
  else budget_bucket
end
where direction = 'EXPENSE'
  and budget_bucket is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_budget_bucket_required_for_expense'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_budget_bucket_required_for_expense
      check (direction <> 'EXPENSE' or budget_bucket is not null);
  end if;
end
$$;

-- Create FK only if it doesn't exist yet.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_category_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_category_id_fkey
      foreign key (category_id) references public.categories(id);
  end if;
end
$$;

-- ==========================================
-- USER PROFILES (Nombre/Apellidos)
-- A small table to store profile fields (optional but recommended).
-- ==========================================

create table if not exists public.profiles (
  user_id uuid not null,
  first_name text,
  last_name text,
  full_name text,
  plan_needs_pct integer not null default 50,
  plan_wants_pct integer not null default 30,
  plan_savings_pct integer not null default 20,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint profiles_pkey primary key (user_id),
  constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

-- If profiles already existed, CREATE TABLE IF NOT EXISTS won't add columns.
-- Add them explicitly for existing DBs (safe / idempotent).
alter table public.profiles
  add column if not exists plan_needs_pct integer not null default 50;

alter table public.profiles
  add column if not exists plan_wants_pct integer not null default 30;

alter table public.profiles
  add column if not exists plan_savings_pct integer not null default 20;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_budget_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_budget_plan_check
      check (
        plan_needs_pct between 0 and 100
        and plan_wants_pct between 0 and 100
        and plan_savings_pct between 0 and 100
        and (plan_needs_pct + plan_wants_pct + plan_savings_pct) = 100
      );
  end if;
end
$$;

create index if not exists profiles_user_id_idx on public.profiles (user_id);

-- Backfill profiles for existing users (uses auth.users.user_metadata when present)
insert into public.profiles (user_id, first_name, last_name, full_name, created_at, updated_at)
select
  u.id as user_id,
  nullif(trim(coalesce(u.raw_user_meta_data->>'first_name', '')), '') as first_name,
  nullif(trim(coalesce(u.raw_user_meta_data->>'last_name', '')), '') as last_name,
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), '') as full_name,
  now() as created_at,
  now() as updated_at
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_set_updated_at'
  ) then
    create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

-- Auto-create profile row on sign up
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, first_name, last_name, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (user_id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_profile'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user_profile();
  end if;
end
$$;

-- ==========================================
-- MULTI-USER SAFETY (RLS)
-- Ensures each user only sees/edits their own data.
-- ==========================================

-- Defaults (so inserts can omit user_id if desired)
alter table public.accounts alter column user_id set default auth.uid();
alter table public.categories alter column user_id set default auth.uid();
alter table public.transactions alter column user_id set default auth.uid();
alter table public.month_balances alter column user_id set default auth.uid();

-- Enable RLS
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.month_balances enable row level security;
alter table public.profiles enable row level security;

-- Policies: accounts
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='accounts' and policyname='accounts_select_own') then
    create policy accounts_select_own on public.accounts for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='accounts' and policyname='accounts_insert_own') then
    create policy accounts_insert_own on public.accounts for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='accounts' and policyname='accounts_update_own') then
    create policy accounts_update_own on public.accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='accounts' and policyname='accounts_delete_own') then
    create policy accounts_delete_own on public.accounts for delete to authenticated using (user_id = auth.uid());
  end if;
end
$$;

-- Policies: categories
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='categories' and policyname='categories_select_own') then
    create policy categories_select_own on public.categories for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='categories' and policyname='categories_insert_own') then
    create policy categories_insert_own on public.categories for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='categories' and policyname='categories_update_own') then
    create policy categories_update_own on public.categories for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='categories' and policyname='categories_delete_own') then
    create policy categories_delete_own on public.categories for delete to authenticated using (user_id = auth.uid());
  end if;
end
$$;

-- Policies: transactions (also enforce that referenced account/category belong to the same user)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='transactions_select_own') then
    create policy transactions_select_own on public.transactions for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='transactions_insert_own') then
    create policy transactions_insert_own on public.transactions
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
        and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='transactions_update_own') then
    create policy transactions_update_own on public.transactions
      for update to authenticated
      using (user_id = auth.uid())
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
        and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='transactions_delete_own') then
    create policy transactions_delete_own on public.transactions for delete to authenticated using (user_id = auth.uid());
  end if;
end
$$;

-- Policies: month_balances
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='month_balances' and policyname='month_balances_select_own') then
    create policy month_balances_select_own on public.month_balances for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='month_balances' and policyname='month_balances_insert_own') then
    create policy month_balances_insert_own on public.month_balances
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='month_balances' and policyname='month_balances_update_own') then
    create policy month_balances_update_own on public.month_balances
      for update to authenticated
      using (user_id = auth.uid())
      with check (
        user_id = auth.uid()
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='month_balances' and policyname='month_balances_delete_own') then
    create policy month_balances_delete_own on public.month_balances for delete to authenticated using (user_id = auth.uid());
  end if;
end
$$;

-- Policies: profiles
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end
$$;

commit;

-- Optional: force PostgREST schema reload (usually auto-refreshes, but can help)
-- notify pgrst, 'reload schema';

-- ==========================================
-- SCHEMA (fresh install only)
-- ==========================================

create extension if not exists pgcrypto;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'COTIDIANA' CHECK (account_type = ANY (ARRAY['AHORRO'::text, 'COTIDIANA'::text, 'EXTRA'::text])),
  current_balance numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid NOT NULL,
  first_name text,
  last_name text,
  full_name text,
  plan_needs_pct integer NOT NULL DEFAULT 50,
  plan_wants_pct integer NOT NULL DEFAULT 30,
  plan_savings_pct integer NOT NULL DEFAULT 20,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_budget_plan_check CHECK (
    plan_needs_pct BETWEEN 0 AND 100
    AND plan_wants_pct BETWEEN 0 AND 100
    AND plan_savings_pct BETWEEN 0 AND 100
    AND (plan_needs_pct + plan_wants_pct + plan_savings_pct) = 100
  )
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'profiles_set_updated_at'
  ) then
    create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, first_name, last_name, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (user_id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_profile'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user_profile();
  end if;
end
$$;
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['INCOME'::text, 'EXPENSE'::text])),
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  budget_bucket text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT categories_budget_bucket_check CHECK (budget_bucket = ANY (ARRAY['NEEDS'::text, 'WANTS'::text])),
  CONSTRAINT categories_budget_bucket_required_for_expense CHECK (direction <> 'EXPENSE'::text OR budget_bucket IS NOT NULL),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.month_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  ym text NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT month_balances_pkey PRIMARY KEY (id),
  CONSTRAINT month_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT month_balances_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  category_id uuid NOT NULL,
  ym text NOT NULL,
  tx_date date,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  transfer_group_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);