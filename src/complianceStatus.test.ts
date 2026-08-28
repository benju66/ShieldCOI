import { describe, it, expect } from "vitest";
import { ComplianceStatus } from "./types";
import {
  STATUS_SEVERITY,
  STATUS_BADGE_CLASS,
  COUNTS_AS_COMPLIANT,
  COUNTS_AS_BREACH,
  NEEDS_ATTENTION,
  countsAsCompliant,
  countsAsBreach,
  needsAttention,
  statusSeverity,
} from "./complianceStatus";

// Every status the app can hold. Kept as a literal list on purpose: if a status
// is added to the union without being added here, the `satisfies` check fails
// to compile, so this list cannot silently drift from the type.
const ALL_STATUSES = [
  "Compliant",
  "Insufficient Coverage",
  "Needs Review",
  "Expired",
  "Pending Upload",
  "Approved Exception",
] as const satisfies readonly ComplianceStatus[];

describe("compliance status tables", () => {
  it("defines every behaviour for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_SEVERITY[status], `severity for ${status}`).toBeTypeOf("number");
      expect(STATUS_BADGE_CLASS[status], `badge for ${status}`).toBeTruthy();
      expect(COUNTS_AS_COMPLIANT[status], `compliant flag for ${status}`).toBeTypeOf("boolean");
      expect(COUNTS_AS_BREACH[status], `breach flag for ${status}`).toBeTypeOf("boolean");
      expect(NEEDS_ATTENTION[status], `attention flag for ${status}`).toBeTypeOf("boolean");
    }
  });

  it("never lets an unreadable certificate pass as compliant", () => {
    expect(countsAsCompliant("Needs Review")).toBe(false);
  });

  it("treats Needs Review as an unknown, not a confirmed breach", () => {
    expect(countsAsBreach("Needs Review")).toBe(false);
    expect(countsAsBreach("Insufficient Coverage")).toBe(true);
    expect(countsAsBreach("Expired")).toBe(true);
  });

  it("still surfaces Needs Review to a human", () => {
    expect(needsAttention("Needs Review")).toBe(true);
  });

  it("shows every non-passing status somewhere a reviewer will look", () => {
    // The guard against the real failure mode: a status that counts as neither
    // compliant nor attention-worthy would vanish from the dashboard entirely.
    for (const status of ALL_STATUSES) {
      expect(
        countsAsCompliant(status) || needsAttention(status),
        `${status} appears in neither the compliant count nor the attention list`
      ).toBe(true);
    }
  });

  it("ranks confirmed problems above unknowns, and unknowns above passing", () => {
    expect(statusSeverity("Expired")).toBeGreaterThan(statusSeverity("Insufficient Coverage"));
    expect(statusSeverity("Insufficient Coverage")).toBeGreaterThan(statusSeverity("Needs Review"));
    expect(statusSeverity("Needs Review")).toBeGreaterThan(statusSeverity("Compliant"));
  });

  it("keeps a breach implying attention", () => {
    for (const status of ALL_STATUSES) {
      if (countsAsBreach(status)) expect(needsAttention(status)).toBe(true);
    }
  });
});
