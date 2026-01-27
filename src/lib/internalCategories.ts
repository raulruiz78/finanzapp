export const VARIABLE_EXPENSE_NAME = "Gasto variable" as const;
export const VARIABLE_INCOME_NAME = "Ingreso variable" as const;

export const INTERNAL_CATEGORY_NAMES = new Set<string>([VARIABLE_EXPENSE_NAME, VARIABLE_INCOME_NAME]);

export function isInternalCategoryName(name: string | null | undefined) {
  return INTERNAL_CATEGORY_NAMES.has(String(name ?? "").trim());
}

export function isInternalVariableCategoryName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  return n === VARIABLE_EXPENSE_NAME || n === VARIABLE_INCOME_NAME;
}
