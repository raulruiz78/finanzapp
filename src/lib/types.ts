export type Direction = "INCOME" | "EXPENSE";

export type AccountType = "AHORRO" | "COTIDIANA" | "EXTRA";

export type BudgetBucket = "NEEDS" | "WANTS";

// PostgREST join helper: Supabase can return nested rows as an object or array
// depending on relationship cardinality and select syntax.
export type OneOrMany<T> = T | T[];

export type Account = {
  id: string;
  name: string;
  account_type?: AccountType;
  current_balance: number;
};

export type AccountLite = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  direction: Direction;
  amount: number;
  budget_bucket?: BudgetBucket | null;
  created_at?: string;
};

export type CategoryJoin = {
  name?: string | null;
  direction?: Direction | null;
  amount?: number | null;
  budget_bucket?: BudgetBucket | null;
};

export type AccountJoin = {
  name?: string | null;
};
