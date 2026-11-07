import { describe, expect, it } from "vitest";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { DEMO_BUBBLE, TOPIC_BY_ID, TOPICS } from "../data/taxonomy";
import { layout, nearbyTopics, reachablePath } from "../lib/layout";
import { MOCK_ITEMS } from "./mock";
import { mockProvider } from "./providers";
import { QUERIES } from "./queries";
import { rankFeed } from "./rank";

/** Same wiring as screens/Home.tsx. */
async function feedFor(bubble: string[]) {
  const lay = layout(MODEL, bubble, DEFAULT_STRENGTH);
  const items = await mockProvider.fetch(nearbyTopics(lay, 2), 2);
  return rankFeed(items, new Set(bubble), (id) => reachablePath(lay, id));
}

describe("feed data", () => {
  it("mock items use real taxonomy ids, demo labels and Guardian search links", () => {
    for (const it of MOCK_ITEMS) {
      expect(TOPIC_BY_ID[it.topicId], it.id).toBeDefined();
      expect(it.source).toBe("Demo summary");
      expect(it.url.startsWith("https://www.theguardian.com/search?q=")).toBe(true);
    }
    expect(new Set(MOCK_ITEMS.map((i) => i.id)).size).toBe(MOCK_ITEMS.length);
  });

  it("has Guardian search terms for every taxonomy topic, and nothing else", () => {
    expect(Object.keys(QUERIES).sort()).toEqual(TOPICS.map((t) => t.id).sort());
    for (const q of Object.values(QUERIES)) expect(q.trim()).not.toBe("");
  });
});

describe("feed wiring", () => {
  it("demo bubble gives 8+ cards across 4+ categories, opening inside the bubble", async () => {
    const cards = await feedFor(DEMO_BUBBLE);
    expect(cards.length).toBeGreaterThanOrEqual(8);
    expect(new Set(cards.map((c) => TOPIC_BY_ID[c.topicId].category)).size).toBeGreaterThanOrEqual(4);
    expect(cards[0].placement.kind).toBe("inside");
    expect(cards[1].placement.kind).toBe("bridge");
  });

  it("every bridge starts from a bubble topic and the nearest bridges come first", async () => {
    const cards = await feedFor(DEMO_BUBBLE);
    const hops: number[] = [];
    for (const c of cards) {
      if (c.placement.kind !== "bridge") continue;
      expect(DEMO_BUBBLE).toContain(c.placement.from);
      expect(c.placement.to).toBe(c.topicId);
      hops.push(c.placement.hops);
    }
    expect(hops).toEqual([...hops].sort((a, b) => a - b));
  });

  it("adding a topic to the bubble moves its stories inside", async () => {
    const before = await feedFor(DEMO_BUBBLE);
    expect(before.find((c) => c.topicId === "water")?.placement.kind).toBe("bridge");
    const after = await feedFor([...DEMO_BUBBLE, "water"]);
    expect(after.find((c) => c.topicId === "water")?.placement.kind).toBe("inside");
  });

  it("out-of-reach topics get no path", () => {
    const lay = layout(MODEL, DEMO_BUBBLE, 0.75);
    const out = Object.values(lay.nodes).find((n) => n.ring === Infinity)!;
    expect(reachablePath(lay, out.id)).toBeNull();
  });
});
