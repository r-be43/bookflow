export function normalizeBookId(id) {
    return String(id ?? '').trim();
}

export function normalizeFavoriteIds(input) {
    const source = Array.isArray(input) ? input : [];
    return Array.from(new Set(source.map((value) => normalizeBookId(value)).filter(Boolean)));
}
