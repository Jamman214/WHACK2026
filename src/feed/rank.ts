import type { FeedCardModel, FeedItem } from './types';

/** Target share of bridge cards at 1, 2 and 3+ hops. */
export type Mix = readonly [number, number, number];

/** The distance slider's stops. `ring` is how far out the mini-map highlights. */
export const DISTANCES = [
  { label: 'Nearby', mix: [1, 0, 0] as Mix, ring: 1 },
  { label: 'Wider', mix: [0.6, 0.3, 0.1] as Mix, ring: 2 },
  { label: 'Far', mix: [0.3, 0.4, 0.3] as Mix, ring: Infinity },
] as const;

/**
 * Tag each item inside/bridge and order the feed so it's mostly outside the bubble,
 * opening with one familiar story as an on-ramp: inside, bridge, bridge, inside, bridge, bridge…
 * `pathTo(id)` returns the shortest path from the bubble to `id` (first element is a known topic),
 * e.g. the BFS from lib/layout.ts. Unreachable items are dropped.
 * `mix` weights the bridges by hop distance; it reorders, it never filters.
 */
export function rankFeed(
  items: FeedItem[],
  known: Set<string>,
  pathTo: (id: string) => string[] | null,
  mix: Mix = DISTANCES[0].mix,
): FeedCardModel[] {
  const inside: FeedCardModel[] = [];
  const bridges: FeedCardModel[] = [];
  for (const it of items) {
    if (known.has(it.topicId)) { inside.push({ ...it, placement: { kind: 'inside' } }); continue; }
    const p = pathTo(it.topicId);
    if (!p || p.length < 2) continue;
    bridges.push({ ...it, placement: { kind: 'bridge', from: p[0], to: it.topicId, hops: p.length - 1, path: p } });
  }
  const byDate = (a: FeedItem, b: FeedItem) => b.publishedAt.localeCompare(a.publishedAt);
  inside.sort(byDate);
  // Nearest bridges first within each bucket: they make the most sense; far ones read as random.
  bridges.sort((a, b) => hops(a) - hops(b) || byDate(a, b));
  const mixed = mixByHops(bridges, mix);

  const out: FeedCardModel[] = [];
  while (inside.length || mixed.length) {
    if (inside.length) out.push(inside.shift()!);
    out.push(...mixed.splice(0, 2));
  }
  return out;
}

/** Each slot goes to the weighted bucket furthest behind its share; once those run dry, nearest remaining. */
function mixByHops(sorted: FeedCardModel[], mix: Mix): FeedCardModel[] {
  const buckets: FeedCardModel[][] = [[], [], []];
  for (const c of sorted) buckets[Math.min(hops(c), 3) - 1].push(c);
  const taken = [0, 0, 0];
  const out: FeedCardModel[] = [];
  while (out.length < sorted.length) {
    let pick = -1, best = -Infinity;
    for (let i = 0; i < 3; i++) {
      if (!buckets[i].length || !mix[i]) continue;
      const behind = mix[i] * (out.length + 1) - taken[i];
      if (behind > best) { best = behind; pick = i; }
    }
    if (pick < 0) pick = buckets.findIndex((b) => b.length);
    out.push(buckets[pick].shift()!);
    taken[pick]++;
  }
  return out;
}

const hops = (c: FeedCardModel) => (c.placement.kind === 'bridge' ? c.placement.hops : 0);
