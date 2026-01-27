export function humanizeSupabaseSchemaError(message: string): string | null {
	// Keep this conservative: only soften very common backend/schema errors into user-friendly text.
	// If we don't recognize it, return null so callers can show the raw message (or their own fallback).

	if (/Could not find a relationship between 'transactions' and 'categories'/i.test(message)) {
		return "Ahora mismo no podemos cargar tus movimientos por un problema temporal. Inténtalo de nuevo en unos minutos.";
	}

	if (/schema cache/i.test(message) || /column .* does not exist/i.test(message)) {
		return "Ha ocurrido un problema al cargar los datos. Inténtalo de nuevo más tarde.";
	}

	return null;
}

