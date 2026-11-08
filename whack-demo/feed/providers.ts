import type { FeedItem, NewsProvider } from './types';
import { MOCK_ITEMS } from './mock';

/** Offline, deterministic — the demo-day default. */
export const mockProvider: NewsProvider = {
  async fetch(topicIds, perTopic) {
    return topicIds.flatMap(t => MOCK_ITEMS.filter(i => i.topicId === t).slice(0, perTopic));
  },
};

/** Guardian Open Platform. `queries` maps topicId → search terms. */
export function guardianProvider(apiKey: string, queries: Record<string, string>): NewsProvider {
  const strip = (h = '') => h.replace(/<[^>]+>/g, '').trim();
  return {
    async fetch(topicIds, perTopic) {
      const batches = await Promise.all(topicIds.map(async topicId => {
        const q = queries[topicId];
        if (!q) return [];
        const u = new URL('https://content.guardianapis.com/search');
        u.search = new URLSearchParams({
          q, 'api-key': apiKey, 'page-size': String(perTopic),
          'order-by': 'newest', 'show-fields': 'trailText,thumbnail',
        }).toString();
        try {
          const r = await fetch(u);
          if (!r.ok) return [];
          const { response } = await r.json();
          return (response.results as any[]).map((a): FeedItem => ({
            id: a.id, topicId,
            headline: a.webTitle,
            summary: strip(a.fields?.trailText),
            source: 'The Guardian',
            url: a.webUrl,
            publishedAt: a.webPublicationDate,
            image: a.fields?.thumbnail,
          }));
        } catch { return []; }
      }));
      return batches.flat();
    },
  };
}

/** Live if a key is configured, falling back to mock on empty results. */
export function defaultProvider(queries: Record<string, string>): NewsProvider {
  const key = import.meta.env.VITE_GUARDIAN_KEY as string | undefined;
  if (!key) return mockProvider;
  const live = guardianProvider(key, queries);
  return {
    async fetch(ids, n) {
      const items = await live.fetch(ids, n);
      return items.length ? items : mockProvider.fetch(ids, n);
    },
  };
}
