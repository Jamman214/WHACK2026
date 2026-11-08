import { describe, expect, it } from "vitest";
import { DEFAULT_STRENGTH, MODEL } from "../data/model";
import { DEMO_BUBBLE, TOPIC_BY_ID } from "../data/taxonomy";
import { layout, nearbyTopics, reachablePath } from "../lib/layout";
import { MOCK_ITEMS } from "./mock";
import { mockProvider } from "./providers";
import { DISTANCES, EDITION_SIZE, pickEdition, rankFeed, ringOf, type Mix } from "./rank";
import { edgeReason } from "../data/reasons";
import { LINKS } from "../data/taxonomy";

/** Same wiring as screens/Home.tsx. */
async function feedFor(bubble: string[], mix?: Mix) {
  const lay = layout(MODEL, bubble, DEFAULT_STRENGTH);
  const items = await mockProvider.fetch(nearbyTopics(lay, lay.rings), 2);
  return rankFeed(items, new Set(bubble), (id) => reachablePath(lay, id), mix);
}
const bridgeHops = (cards: Awaited<ReturnType<typeof feedFor>>) =>
  cards.flatMap((c) => (c.placement.kind === "bridge" ? [c.placement.hops] : []));

describe("distance mix", () => {
  it("Nearby puts every 1-hop story before any further one", async () => {
    const hops = bridgeHops(await feedFor(DEMO_BUBBLE, DISTANCES[0].mix));
    expect(hops.slice(0, hops.filter((h) => h === 1).length).every((h) => h === 1)).toBe(true);
  });

  it("Wider is ~60/30/10 and Far ~30/40/30 over the first ten bridges", async () => {
    const share = (hops: number[]) => [1, 2, 3].map((k) => hops.slice(0, 10).filter((h) => Math.min(h, 3) === k).length);
    expect(share(bridgeHops(await feedFor(DEMO_BUBBLE, DISTANCES[1].mix)))).toEqual([6, 3, 1]);
    expect(share(bridgeHops(await feedFor(DEMO_BUBBLE, DISTANCES[2].mix)))).toEqual([3, 4, 3]);
  });

  it("reorders but never filters", async () => {
    const ids = async (m: Mix) => (await feedFor(DEMO_BUBBLE, m)).map((c) => c.id).sort();
    const near = await ids(DISTANCES[0].mix);
    expect(await ids(DISTANCES[1].mix)).toEqual(near);
    expect(await ids(DISTANCES[2].mix)).toEqual(near);
  });
});

describe("today's edition", () => {
  it("caps the day, prefers one story per topic, and keeps the ranked order", async () => {
    const all = await feedFor(DEMO_BUBBLE, DISTANCES[1].mix);
    const ed = pickEdition(all, 6);
    expect(ed).toHaveLength(6);
    expect(new Set(ed.map((c) => c.topicId)).size).toBe(6);
    const order = ed.map((c) => all.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(pickEdition(all).length).toBeLessThanOrEqual(EDITION_SIZE);
  });

  it("the slider changes which stories make the cut, not just their order", async () => {
    const far = (m: Mix) => feedFor(DEMO_BUBBLE, m).then((c) => pickEdition(c).filter((x) => ringOf(x) >= 2).length);
    expect(await far(DISTANCES[2].mix)).toBeGreaterThan(await far(DISTANCES[0].mix));
  });
});

describe("how you're linked", () => {
  it("every graph edge has a one-sentence reason, readable in both directions", () => {
    for (const l of LINKS) {
      expect(edgeReason(l.a, l.b), `${l.a}|${l.b}`).toMatch(/^[A-Z].+\.$/);
      expect(edgeReason(l.b, l.a)).toBe(edgeReason(l.a, l.b));
    }
  });

  it("bridge cards carry the full path from the bubble, with a reason for each hop", async () => {
    for (const c of await feedFor(DEMO_BUBBLE, DISTANCES[2].mix)) {
      if (c.placement.kind !== "bridge") continue;
      const { path, hops } = c.placement;
      expect(DEMO_BUBBLE).toContain(path[0]);
      expect(path.at(-1)).toBe(c.topicId);
      expect(path).toHaveLength(hops + 1);
      path.slice(1).forEach((id, i) => expect(edgeReason(path[i], id)).toBeDefined());
    }
  });
});

describe("feed data", () => {
  it("mock items use real taxonomy ids, demo labels and Guardian search links", () => {
    for (const it of MOCK_ITEMS) {
      expect(TOPIC_BY_ID[it.topicId], it.id).toBeDefined();
      expect(it.source).toBe("Demo summary");
      expect(it.url.startsWith("https://www.theguardian.com/search?q=")).toBe(true);
    }
    expect(new Set(MOCK_ITEMS.map((i) => i.id)).size).toBe(MOCK_ITEMS.length);
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
