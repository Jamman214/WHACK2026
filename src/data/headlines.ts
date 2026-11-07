import { DEMO_BUBBLE } from "./taxonomy";

export interface Headline { id: string; topicId: string; headline: string }

// 18 mock headlines covering all 14 categories (max two per category, one politics).
// The four demo-bubble topics each get exactly one headline.
export const DECK: Headline[] = [
  { id: "h01", topicId: "cyber", headline: "Ransomware attack halts hospital blood tests across London" },
  { id: "h02", topicId: "uspol", headline: "US midterm results reshape control of Congress" },
  { id: "h03", topicId: "rates", headline: "Bond yields jump after a surprise inflation print" },
  { id: "h04", topicId: "minerals", headline: "Lithium price slump stalls new mine openings" },
  { id: "h05", topicId: "fprice", headline: "Cocoa prices push chocolate costs to a record high" },
  { id: "h06", topicId: "misinfo", headline: "Deepfake audio clip spreads ahead of a national vote" },
  { id: "h07", topicId: "remote", headline: "Big employers order staff back to the office four days a week" },
  { id: "h08", topicId: "biotech", headline: "Gene-edited rice doubles yield in drought trials" },
  { id: "h09", topicId: "sport", headline: "Premier League clubs vote to cap squad spending" },
  { id: "h10", topicId: "techhubs", headline: "Mobile-money transfers in Kenya hit a new annual record" },
  { id: "h11", topicId: "techreg", headline: "EU fines a major app store over payment rules" },
  { id: "h12", topicId: "unifund", headline: "Overseas university applications fall for a second year" },
  { id: "h13", topicId: "rail", headline: "Night Tube expansion approved for two more lines" },
  { id: "h14", topicId: "therapy", headline: "Waiting lists for talking therapies reach a new high" },
  { id: "h15", topicId: "housing", headline: "Council tax rises approved across 40 English councils" },
  { id: "h16", topicId: "gig", headline: "Court rules ride-hailing drivers are employees" },
  { id: "h17", topicId: "markets", headline: "Retail traders pile back into AI chip stocks" },
  { id: "h18", topicId: "physics", headline: "Fusion lab reports its longest sustained plasma yet" },
];

/** Demo feed: deterministic — exactly the demo-bubble topics are "in my feed". */
export const demoSeen = (h: Headline) => DEMO_BUBBLE.includes(h.topicId);

/** Bubble = topics of in-feed headlines; fewer than 2 falls back to the demo bubble. */
export function bubbleFrom(seenTopicIds: string[]): string[] {
  const unique = [...new Set(seenTopicIds)];
  return unique.length >= 2 ? unique : [...DEMO_BUBBLE];
}
