import { CATEGORY_BY_ID, TOPIC_BY_ID, type CategoryId } from "../../data/taxonomy";

/** What the scene calls an open planet: a category, or the "You" home planet at the centre. */
export type PlanetKey = CategoryId | "home";

export interface Insets { top: number; right: number; bottom: number; left: number }

export const HOME_NAME = "You";
export const SOURCE_DEMO = "Demo summary";

export const planetName = (p: PlanetKey) => (p === "home" ? HOME_NAME : CATEGORY_BY_ID[p].name);
export const planetColor = (p: PlanetKey) => (p === "home" ? "var(--sun)" : `var(--c-${p})`);
export const topicName = (id: string) => TOPIC_BY_ID[id]?.name ?? id;
export const catOf = (topicId: string): CategoryId => TOPIC_BY_ID[topicId].category;
export const catName = (topicId: string) => CATEGORY_BY_ID[catOf(topicId)].name;

/** "In your bubble" / "1 step" / "2 steps" / "Out of reach", from a topic's ring. */
export const stepsText = (ring: number) =>
  ring === 0 ? "In your bubble" : !Number.isFinite(ring) ? "Out of reach" : ring === 1 ? "1 step" : ring + " steps";

/** "1 step out" / "3 steps out". */
export const stepsOut = (n: number) => (n === 1 ? "1 step out" : n + " steps out");

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const ago = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3.6e6));
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export const SAME_INSETS = (a: Insets, b: Insets) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
