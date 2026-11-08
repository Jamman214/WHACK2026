import { describe, expect, it } from "vitest";
import { bestTier, norm, tierOf } from "./searchRank";

describe("search ranking", () => {
  it("ranks prefix before word start before substring", () => {
    expect(tierOf("artificial intelligence", "art")).toBe(0);
    expect(tierOf("rail and ai", "ai")).toBe(1);
    expect(tierOf("rail infrastructure", "xyz")).toBe(3);
    expect(tierOf("rail infrastructure", "fra")).toBe(2);
  });
  it("does not substring-match 1-2 character queries", () => {
    expect(tierOf(norm("Rail & infrastructure"), "ai")).toBe(3);
    expect(tierOf("a", "a")).toBe(0);
  });
  it("still allows prefix and word-start for short queries", () => {
    expect(tierOf("ai research", "ai")).toBe(0);
    expect(tierOf("deep ai", "ai")).toBe(1);
  });
  it("applies the same rule across aliases and category names", () => {
    expect(bestTier(["rail infrastructure", "transport", "mainline"], "ai")).toBe(3);
    expect(bestTier(["rail infrastructure", "transport", "ai"], "ai")).toBe(0);
    expect(bestTier(["x", "technology", "machine"], "chi")).toBe(2);
  });
});
