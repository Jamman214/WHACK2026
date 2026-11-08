// The backend (backend/app.py) is the source of truth for topics, links, onboarding cards, the bubble and news.
// Dev: Vite proxies /api to the backend (vite.config.ts). Set VITE_API_URL to point elsewhere.
import { refreshModel } from "./model";
import { setTaxonomy } from "./taxonomy";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export interface Swipe { articleId: string; swipe: "left" | "right" }
export interface Card {
  id: string; groupId: string; topicId: string; title: string; url: string;
  description?: string | null; image?: string | null; source?: string | null; publishedAt?: string | null;
}
export interface Bubble { knownTopics: string[]; unknownTopics: string[] }
export interface OnboardingStep { done: boolean; card: Card | null; progress: { shown: number; max: number }; bubble: Bubble }
interface TopicMap {
  groups: { id: string; label: string }[];
  topics: { id: string; groupId: string; label: string }[];
  links: { a: string; b: string; w: number }[];
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const init = body === undefined ? undefined
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(BASE + path, init);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

/** Fetch the topic map and make it the app's taxonomy + graph model. Call once before rendering. */
export async function loadMap(): Promise<void> {
  const m = await api<TopicMap>("/map");
  // Backend weights are cosine similarities (~0.7–0.97); the map's strength stops (0.75/0.5/0.3) were tuned
  // for 0.2–0.95, so stretch them onto that range or every "Bridges allowed" setting looks the same.
  const ws = m.links.map((l) => l.w), lo = Math.min(...ws), hi = Math.max(...ws);
  const links = m.links.map((l) => ({ ...l, w: 0.2 + (0.75 * (l.w - lo)) / (hi - lo || 1) }));
  setTaxonomy(m.groups, m.topics, links);
  refreshModel();
}

export const nextOnboarding = (history: Swipe[]) => api<OnboardingStep>("/onboarding/next", { history });
export const fetchBubble = (history: Swipe[], topics: Record<string, boolean>) => api<Bubble>("/bubble", { history, topics });
export const fetchFeed = (topics: string[], perTopic: number) => api<Card[]>("/feed", { topics, perTopic });
