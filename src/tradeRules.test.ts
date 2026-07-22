import { describe, it, expect } from "vitest";
import { resolveRequiredCoverage, isNonEmptyRule, matchCanonicalTrade } from "./tradeRules";

const TRADES = [
  "Concrete (Precast)",
  "Concrete (with Crane)",
  "Concrete (Standard)",
  "Rough Carpentry (with Crane)",
  "Fire Sprinkler",
  "HVAC",
  "Other Trades",
];

const baseReq = { umbrella_limit: 1_000_000, professional_liability: 0, pollution_liability: 0 };

describe("resolveRequiredCoverage", () => {
  it("uses the project baseline when the trade has no rule", () => {
    const req = { umbrella_limit: 2_000_000, professional_liability: 1_000_000, pollution_liability: 0 };
    const result = resolveRequiredCoverage(req, "Electrical", {});
    expect(result).toEqual({ umbrella: 2_000_000, professionalLiability: 1_000_000, pollutionLiability: 0 });
  });

  it("raises a requirement above the baseline via a trade rule", () => {
    const rules = { Electrical: { umbrella: 5_000_000, professionalLiability: 2_000_000 } };
    const result = resolveRequiredCoverage(baseReq, "Electrical", rules);
    expect(result.umbrella).toBe(5_000_000);
    expect(result.professionalLiability).toBe(2_000_000);
    expect(result.pollutionLiability).toBe(0);
  });

  it("never lowers a requirement below the project baseline (takes the higher)", () => {
    const req = { umbrella_limit: 8_000_000, professional_liability: 0, pollution_liability: 0 };
    const rules = { Electrical: { umbrella: 5_000_000 } };
    // Trade rule ($5M) is below the project baseline ($8M) → baseline wins.
    expect(resolveRequiredCoverage(req, "Electrical", rules).umbrella).toBe(8_000_000);
  });

  it("applies a trade rule only to that trade", () => {
    const rules = { "Electrical - Design Build": { professionalLiability: 2_000_000 } };
    expect(resolveRequiredCoverage(baseReq, "Electrical", rules).professionalLiability).toBe(0);
    expect(resolveRequiredCoverage(baseReq, "Electrical - Design Build", rules).professionalLiability).toBe(2_000_000);
  });

  it("treats missing baseline fields as not required", () => {
    const result = resolveRequiredCoverage({ umbrella_limit: 1_000_000 }, "Roofing", {});
    expect(result.professionalLiability).toBe(0);
    expect(result.pollutionLiability).toBe(0);
  });
});

describe("isNonEmptyRule", () => {
  it("is false for undefined or all-zero rules", () => {
    expect(isNonEmptyRule(undefined)).toBe(false);
    expect(isNonEmptyRule({})).toBe(false);
    expect(isNonEmptyRule({ umbrella: 0, professionalLiability: 0, pollutionLiability: 0 })).toBe(false);
  });

  it("is true when any field is set", () => {
    expect(isNonEmptyRule({ umbrella: 5_000_000 })).toBe(true);
    expect(isNonEmptyRule({ pollutionLiability: 2_000_000 })).toBe(true);
  });
});

describe("matchCanonicalTrade", () => {
  it("matches an exact canonical name", () => {
    expect(matchCanonicalTrade("HVAC", TRADES)).toBe("HVAC");
  });

  it("ignores case, spacing, and punctuation differences", () => {
    expect(matchCanonicalTrade("fire sprinkler", TRADES)).toBe("Fire Sprinkler");
    expect(matchCanonicalTrade("Concrete(with Crane)", TRADES)).toBe("Concrete (with Crane)");
    expect(matchCanonicalTrade("  concrete (precast) ", TRADES)).toBe("Concrete (Precast)");
  });

  it("returns null (drops) an unrecognized label rather than mis-assigning", () => {
    // "Concrete" alone is ambiguous across three variants → no confident match.
    expect(matchCanonicalTrade("Concrete", TRADES)).toBeNull();
    expect(matchCanonicalTrade("Landscaping", TRADES)).toBeNull();
    expect(matchCanonicalTrade("", TRADES)).toBeNull();
  });
});
