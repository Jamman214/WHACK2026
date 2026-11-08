import { mockProvider } from './providers';
import type { FeedItem, NewsProvider } from './types';

const newestFirst = (a: FeedItem, b: FeedItem) => b.publishedAt.localeCompare(a.publishedAt);

function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/**
 * Articles for a set of topics (e.g. a planet's topics), newest first, de-duplicated by id.
 * Falls back to the offline mock items if the provider returns nothing (or fails).
 */
export async function articlesFor(provider: NewsProvider, topicIds: string[], perTopic = 2): Promise<FeedItem[]> {
  if (!topicIds.length) return [];
  let items: FeedItem[] = [];
  try { items = await provider.fetch(topicIds, perTopic); } catch { /* fall through to mock */ }
  if (!items.length) items = await mockProvider.fetch(topicIds, perTopic);
  return dedupe(items).sort(newestFirst);
}
