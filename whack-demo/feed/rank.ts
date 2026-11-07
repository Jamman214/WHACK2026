import type { FeedCardModel, FeedItem } from './types';

/**
 * Tag each item inside/bridge and order the feed so it's mostly outside the bubble,
 * opening with one familiar story as an on-ramp: inside, bridge, bridge, inside, bridge, bridge…
 * `pathTo(id)` returns the shortest path from the bubble to `id` (first element is a known topic),
 * e.g. the BFS from lib/layout.ts. Unreachable items are dropped.
 */
export function rankFeed(
  items: FeedItem[],
  known: Set<string>,
  pathTo: (id: string) => string[] | null,
): FeedCardModel[] {
  const inside: FeedCardModel[] = [];
  const bridges: FeedCardModel[] = [];
  for (const it of items) {
    if (known.has(it.topicId)) { inside.push({ ...it, placement: { kind: 'inside' } }); continue; }
    const p = pathTo(it.topicId);
    if (!p || p.length < 2) continue;
    bridges.push({ ...it, placement: { kind: 'bridge', from: p[0], to: it.topicId, hops: p.length - 1 } });
  }
  const byDate = (a: FeedItem, b: FeedItem) => b.publishedAt.localeCompare(a.publishedAt);
  inside.sort(byDate);
  // Nearest bridges first: they make the most sense; far ones read as random.
  bridges.sort((a, b) => hops(a) - hops(b) || byDate(a, b));

  const out: FeedCardModel[] = [];
  while (inside.length || bridges.length) {
    if (inside.length) out.push(inside.shift()!);
    out.push(...bridges.splice(0, 2));
  }
  return out;
}

const hops = (c: FeedCardModel) => (c.placement.kind === 'bridge' ? c.placement.hops : 0);
