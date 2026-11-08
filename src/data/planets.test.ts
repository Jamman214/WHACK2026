import { describe, expect, it } from "vitest";
import { PLANET_INFO, planetInfo } from "./planets";
import { CATEGORIES } from "./taxonomy";

describe("planet info", () => {
  it("has a tagline (max 8 words) and a blurb for every category, and nothing else", () => {
    expect(Object.keys(PLANET_INFO).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
    for (const c of CATEGORIES) {
      const { tagline, blurb } = planetInfo(c.id);
      expect(tagline.trim(), c.id).not.toBe("");
      expect(blurb.trim(), c.id).not.toBe("");
      expect(tagline.trim().split(/\s+/).length, c.id).toBeLessThanOrEqual(8);
      expect(blurb.match(/[.!?](\s|$)/g)?.length ?? 0, c.id).toBeGreaterThanOrEqual(2);
    }
  });
});
