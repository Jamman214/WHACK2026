/** One onboarding card, as served by the backend's POST /onboarding/next. */
export interface Headline { id: string; topicId: string; headline: string }

/** Demo feed: deterministic — every third card is "in my feed". */
export const demoSeen = (index: number) => index % 3 === 0;

/** Bubble = the backend's known topics; fewer than 2 falls back to adding the topics swiped "In my feed". */
export function bubbleFrom(known: string[], seen: string[]): string[] {
  return known.length >= 2 ? known : [...new Set([...known, ...seen])];
}
