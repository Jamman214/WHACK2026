import { describe, expect, it } from "vitest";
import { CATEGORIES, TOPICS } from "../data/taxonomy";
import { articlesFor } from "./articles";
import { MOCK_ITEMS } from "./mock";
import { mockProvider } from "./providers";
import type { FeedItem, NewsProvider } from "./types";

const item = (id: string, topicId: string, publishedAt: string): FeedItem => ({
  id, topicId, headline: id, summary: "", source: "Test", url: "https://example.com", publishedAt,
});
const stub = (items: FeedItem[]): NewsProvider => ({ fetch: async () => items });

describe("mock coverage", () => {
  it("every topic has at least one mock item", () => {
    for (const t of TOPICS) expect(MOCK_ITEMS.some((i) => i.topicId === t.id), t.id).toBe(true);
  });

  it("every category has at least three mock items", () => {
    for (const c of CATEGORIES) {
      const ids = new Set(c.topics.map((t) => t.id));
      expect(MOCK_ITEMS.filter((i) => ids.has(i.topicId)).length, c.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("articlesFor", () => {
  it("returns articles for every category's topics via the mock provider", async () => {
    for (const c of CATEGORIES) {
      const ids = c.topics.map((t) => t.id);
      const out = await articlesFor(mockProvider, ids);
      expect(out.length, c.id).toBeGreaterThanOrEqual(3);
      expect(out.every((i) => ids.includes(i.topicId)), c.id).toBe(true);
    }
  });

  it("orders newest first and de-duplicates by id", async () => {
    const out = await articlesFor(
      stub([item("a", "ai", "2026-01-01T00:00:00Z"), item("b", "ai", "2026-03-01T00:00:00Z"), item("a", "chips", "2026-01-01T00:00:00Z"), item("c", "ai", "2026-02-01T00:00:00Z")]),
      ["ai", "chips"],
    );
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("falls back to mock when the provider returns nothing or fails", async () => {
    const expected = (await mockProvider.fetch(["ai", "chips"], 2)).map((i) => i.id).sort();
    const empty = await articlesFor(stub([]), ["ai", "chips"]);
    expect(empty.map((i) => i.id).sort()).toEqual(expected);
    const failing = await articlesFor({ fetch: async () => { throw new Error("offline"); } }, ["ai", "chips"]);
    expect(failing.map((i) => i.id).sort()).toEqual(expected);
  });

  it("uses live results when present and returns [] for no topics", async () => {
    expect((await articlesFor(stub([item("x", "ai", "2026-01-01T00:00:00Z")]), ["ai"])).map((i) => i.id)).toEqual(["x"]);
    expect(await articlesFor(mockProvider, [])).toEqual([]);
  });
});
