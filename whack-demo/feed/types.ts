export type FeedItem = {
  id: string;
  topicId: string;          // matches taxonomy topic ids
  headline: string;
  summary: string;          // 1–3 sentences, plain text
  source: string;           // e.g. "The Guardian"
  url: string;              // where the article lives
  publishedAt: string;      // ISO
  image?: string;
};

/** Where an item sits relative to the user's bubble. */
export type Placement =
  | { kind: 'inside' }
  | { kind: 'bridge'; from: string; to: string; hops: number }; // topic ids

export type FeedCardModel = FeedItem & { placement: Placement };

export interface NewsProvider {
  fetch(topicIds: string[], perTopic: number): Promise<FeedItem[]>;
}
