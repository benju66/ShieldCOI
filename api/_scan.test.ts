import { describe, it, expect } from "vitest";
import { normalizeReadability, READABILITY_TRACKED_FIELDS } from "./_scan";

/**
 * normalizeReadability decides which certificates land in front of a human, so
 * its two fail-safe rules are worth pinning down: a field that came back with a
 * value is readable no matter what the model claims, and a field the app does
 * not display is not actionable.
 */
describe("normalizeReadability", () => {
  it("keeps fields that are genuinely unreadable", () => {
    const out = normalizeReadability({
      gl_each_occurrence: null,
      umbrella_limit: null,
      unreadable_fields: ["gl_each_occurrence", "umbrella_limit"],
    });
    expect(out.unreadable_fields).toEqual(["gl_each_occurrence", "umbrella_limit"]);
  });

  it("drops a field the model both read and called unreadable", () => {
    // Otherwise one contradictory name sends a perfectly legible certificate to
    // manual review.
    const out = normalizeReadability({
      gl_each_occurrence: 1000000,
      unreadable_fields: ["gl_each_occurrence"],
    });
    expect(out.unreadable_fields).toEqual([]);
  });

  it("treats a stated zero as read, not as missing", () => {
    const out = normalizeReadability({
      umbrella_limit: 0,
      unreadable_fields: ["umbrella_limit"],
    });
    expect(out.unreadable_fields).toEqual([]);
  });

  it("treats a blank string as unread", () => {
    const out = normalizeReadability({
      insured_name: "   ",
      unreadable_fields: ["insured_name"],
    });
    expect(out.unreadable_fields).toEqual(["insured_name"]);
  });

  it("discards field names the app does not track", () => {
    const out = normalizeReadability({
      gl_each_occurrence: null,
      unreadable_fields: ["gl_each_occurrence", "some_invented_field", "notes"],
    });
    expect(out.unreadable_fields).toEqual(["gl_each_occurrence"]);
  });

  it("de-duplicates repeated names", () => {
    const out = normalizeReadability({
      umbrella_limit: null,
      unreadable_fields: ["umbrella_limit", "umbrella_limit"],
    });
    expect(out.unreadable_fields).toEqual(["umbrella_limit"]);
  });

  it("normalizes a missing or malformed list to an empty array", () => {
    expect(normalizeReadability({ gl_each_occurrence: null }).unreadable_fields).toEqual([]);
    expect(normalizeReadability({ unreadable_fields: "nope" }).unreadable_fields).toEqual([]);
    expect(normalizeReadability({ unreadable_fields: [42, null] }).unreadable_fields).toEqual([]);
  });

  it("leaves every other extracted value untouched", () => {
    const input = {
      insured_name: "Titan Steel LLC",
      gl_each_occurrence: 1000000,
      endorsement_facts: { waiver_of_subrogation: true },
      unreadable_fields: [],
    };
    const out = normalizeReadability(input);
    expect(out.insured_name).toBe("Titan Steel LLC");
    expect(out.gl_each_occurrence).toBe(1000000);
    expect(out.endorsement_facts).toEqual({ waiver_of_subrogation: true });
  });

  it("passes through non-object input unchanged", () => {
    expect(normalizeReadability(null)).toBeNull();
    expect(normalizeReadability("x" as any)).toBe("x");
  });

  it("tracks every field the reviewer can act on", () => {
    // Guards against a field being added to the prompt but not to the tracked
    // set, which would silently discard its unreadable flag.
    expect(READABILITY_TRACKED_FIELDS).toContain("policy_expiration_date");
    expect(READABILITY_TRACKED_FIELDS).toContain("insured_name");
    expect(new Set(READABILITY_TRACKED_FIELDS).size).toBe(READABILITY_TRACKED_FIELDS.length);
  });
});
