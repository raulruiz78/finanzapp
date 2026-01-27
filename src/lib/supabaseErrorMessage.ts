export function humanizeSupabaseSchemaError(message: string): string | null {
	// Keep this intentionally conservative: only transform the most common Supabase/PostgREST
	// schema mismatch errors into a clearer, actionable message.
	if (/Could not find a relationship between 'transactions' and 'categories'/i.test(message)) {
		return (
			"Supabase no encuentra la relación transactions → categories (PostgREST schema cache).\n\n" +
			"Causa: falta la foreign key `transactions.category_id -> categories.id`.\n\n" +
			"Arreglo (Supabase → SQL editor):\n" +
			"alter table public.transactions\n" +
			"  add constraint transactions_category_id_fkey\n" +
			"  foreign key (category_id) references public.categories(id);\n\n" +
			"Si ya tienes datos inconsistentes, crea la FK como NOT VALID y valida después."
		);
	}

	if (/schema cache/i.test(message) || /column .* does not exist/i.test(message)) {
		return (
			"Error de esquema en Supabase (faltan columnas o relaciones).\n" +
			"Revisa que tu schema en Supabase coincide con database/database.sql.\n\n" +
			message
		);
	}

	return null;
}

