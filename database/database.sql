-- IMPORTANT
-- You are seeing: "relation \"accounts\" already exists" because this file contains CREATE TABLE.
-- If your tables already exist in Supabase, DO NOT run the CREATE TABLE section.
--
-- ✅ Run only the "MIGRATION (existing DB)" block below.

-- ==========================================
-- MIGRATION (existing DB)
-- Adds the missing relationship so PostgREST can join transactions -> categories.
-- ==========================================

begin;

-- If there are transactions pointing to category_id values that don't exist in categories,
-- the FK creation will fail. We auto-create placeholder categories for those IDs.
--
-- NOTE: categories.amount has a > 0 constraint, so we use 0.01.
insert into public.categories (id, user_id, name, direction, amount, created_at, updated_at)
select distinct on (t.category_id)
  t.category_id as id,
  t.user_id,
  'Migrated category ' || left(t.category_id::text, 8) as name,
  'EXPENSE' as direction,
  0.01 as amount,
  now() as created_at,
  now() as updated_at
from public.transactions t
left join public.categories c on c.id = t.category_id
where c.id is null
order by t.category_id, t.created_at asc
on conflict (id) do nothing;

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

commit;

-- Optional: force PostgREST schema reload (usually auto-refreshes, but can help)
-- notify pgrst, 'reload schema';

-- ==========================================
-- SCHEMA (fresh install only)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  current_balance numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['INCOME'::text, 'EXPENSE'::text])),
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
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