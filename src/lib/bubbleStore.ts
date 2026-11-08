import { TOPIC_BY_ID } from "../data/taxonomy";

/** The bubble survives a refresh. Every access is guarded: the app works fine without storage. */
const KEY = "atlas.bubble.v1";
const START_KEY = "atlas.bubble.start.v1";

function read(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    const ids = [...new Set(v.filter((x): x is string => typeof x === "string" && !!TOPIC_BY_ID[x]))];
    return ids.length ? ids : null;
  } catch { return null; }
}
function write(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable: carry on */ }
}

export const loadBubble = () => read(KEY);
export const saveBubble = (ids: string[]) => write(KEY, ids);
/** The onboarding result, so "Reset to starting bubble" still works after a refresh. */
export const loadStart = () => read(START_KEY);
export const saveStart = (ids: string[]) => write(START_KEY, ids);
export function clearBubble() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(START_KEY); } catch { /* ignore */ }
}
