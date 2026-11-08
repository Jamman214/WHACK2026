export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** 0 = prefix, 1 = word start, 2 = substring (only for queries of 3+ chars), 3 = no match. `hay` and `n` are pre-normalised. */
export const tierOf = (hay: string, n: string): number =>
  hay.startsWith(n) ? 0 : (" " + hay).includes(" " + n) ? 1 : n.length >= 3 && hay.includes(n) ? 2 : 3;

/** Best (lowest) tier across a topic's searchable fields (name, category, aliases), already normalised. */
export const bestTier = (fields: string[], n: string): number => Math.min(...fields.map((f) => tierOf(f, n)));
