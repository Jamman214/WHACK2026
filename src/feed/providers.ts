import { fetchFeed } from '../data/api';
import type { FeedItem, NewsProvider } from './types';
import { MOCK_ITEMS } from './mock';

/** Offline, deterministic — used by the tests. */
export const mockProvider: NewsProvider = {
  async fetch(topicIds, perTopic) {
    return topicIds.flatMap(t => MOCK_ITEMS.filter(i => i.topicId === t).slice(0, perTopic));
  },
};

/** The backend's clustered articles (POST /feed), most typical of each topic first. */
export const backendProvider: NewsProvider = {
  async fetch(topicIds, perTopic) {
    try {
      return (await fetchFeed(topicIds, perTopic)).map((a): FeedItem => ({
        id: a.id, topicId: a.topicId,
        headline: a.title,
        summary: a.description ?? '',
        source: a.source ?? '',
        url: a.url,
        publishedAt: a.publishedAt ?? '',
        image: a.image ?? undefined,
      }));
    } catch (e) {
      console.error('feed', e);
      return [];
    }
  },
};
