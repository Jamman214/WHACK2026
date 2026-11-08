import { buildModel } from "../lib/layout";
import { CATEGORIES, LINKS } from "./taxonomy";

/** One graph model shared by the Atlas and the feed. */
export const MODEL = buildModel(CATEGORIES, LINKS);

/** "Loose" — the Atlas's default bridge strength; the feed ranks with the same value. */
export const DEFAULT_STRENGTH = 0.3;
