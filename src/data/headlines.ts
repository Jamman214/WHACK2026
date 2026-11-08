/** One onboarding card, as served by the backend's POST /onboarding/next. */
export interface Headline { id: string; topicId: string; headline: string }

/** Demo feed: deterministic — every third card is "in my feed". */
export const demoSeen = (index: number) => index % 3 === 0;

/** Bubble = the backend's known topics; fewer than 2 falls back to the topics the demo rule picks from `shown`. */
export function bubbleFrom(known: string[], shown: string[]): string[] {
  return known.length >= 2 ? known : [...new Set([...known, ...shown.filter((_, i) => demoSeen(i))])];
}
