import { buildModel } from "../lib/layout";
import { CATEGORIES, LINKS } from "./taxonomy";

/** One graph model shared by the Atlas and the feed. */
export const MODEL = buildModel(CATEGORIES, LINKS);

/** "Related" — the one bridge strength: the Atlas, mini-map and feed all use it. */
export const DEFAULT_STRENGTH = 0.5;
