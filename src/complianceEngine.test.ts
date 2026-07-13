import { describe, it, expect } from "vitest";
import { verifyCompliance, normalizeEntity, isNamedAdditionalInsured } from "./complianceEngine";
import { Project, ProjectRequirements } from "./types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Fixed evaluation date used across expiration tests. */
const NOW = "2026-06-11";

const DEFAULT_REQS: ProjectRequirements = {
  gl_occurrence: 2_000_000,
  gl_aggregate: 4_000_000,
  auto_limit: 1_000_000,
  workers_comp: true,
  warn_days_out: 60,
  gl_products_completed: 2_000_000,
  umbrella_limit: 1_000_000,
  employers_liability_accident: 1_000_000,
  employers_liability_disease_person: 1_000_000,
  employers_liability_disease_limit: 1_000_000,
};

function makeProject(
  overrides: Partial<Omit<Project, "requirements">> & { requirements?: Partial<ProjectRequirements> } = {}
): Project {
  const { requirements, ...rest } = overrides;
  return {
    id: "p1",
    name: "Test Project",
    number: "P-TEST",
    target_completion_date: "2027-12-31",
    createdAt: "2026-01-01T00:00:00.000Z",
    requirements: { ...DEFAULT_REQS, ...requirements },
    ...rest,
  };
}

type CoiInput = Parameters<typeof verifyCompliance>[1];

/** A COI that passes every baseline check (trade "Other Trades", far-future expiry). */
function makeCoi(overrides: Partial<CoiInput> = {}): CoiInput {
  return {
    insured_name: "Acme Electrical LLC",
    gl_each_occurrence: 2_000_000,
    gl_general_aggregate: 4_000_000,
    auto_combined_single_limit: 1_000_000,
    workers_comp_statutory: true,
    policy_expiration_date: "2027-06-11",
    gl_products_completed: 2_000_000,
    umbrella_limit: 1_000_000,
    employers_liability_accident: 1_000_000,
    employers_liability_disease_person: 1_000_000,
    employers_liability_disease_limit: 1_000_000,
    professional_liability: 2_000_000,
    pollution_liability: 2_000_000,
    ...overrides,
  };
}

const hasError = (errors: string[], substr: string) => errors.some((e) => e.includes(substr));

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

describe("verifyCompliance — baseline", () => {
  it("passes a fully-compliant certificate with no errors", () => {
    const result = verifyCompliance(makeProject(), makeCoi(), "Other Trades", NOW);
    expect(result.status).toBe("Compliant");
    expect(result.errors).toEqual([]);
  });

  it("defaults the trade to 'Other Trades' when omitted (no professional/pollution required)", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ professional_liability: 0, pollution_liability: 0 }),
      undefined,
      NOW
    );
    expect(result.status).toBe("Compliant");
  });
});

// ---------------------------------------------------------------------------
// Core limit checks
// ---------------------------------------------------------------------------

describe("verifyCompliance — general liability & auto", () => {
  it("flags GL each-occurrence below the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_each_occurrence: 1_000_000 }), "Other Trades", NOW);
    expect(result.status).toBe("Insufficient Coverage");
    expect(hasError(result.errors, "Occurrence limit")).toBe(true);
  });

  it("flags GL general aggregate below the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_general_aggregate: 3_000_000 }), "Other Trades", NOW);
    expect(hasError(result.errors, "General Aggregate limit")).toBe(true);
  });

  it("flags auto combined single limit below the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ auto_combined_single_limit: 500_000 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Combined Single Limit")).toBe(true);
  });

  it("flags GL products-completed below the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_products_completed: 1_000_000 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Products-Completed")).toBe(true);
  });

  it("treats a missing products-completed value as 0 (fails the 2M requirement)", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_products_completed: undefined }), "Other Trades", NOW);
    expect(hasError(result.errors, "Products-Completed")).toBe(true);
  });

  it("accepts coverage exactly equal to the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_each_occurrence: 2_000_000 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Occurrence limit")).toBe(false);
  });
});

describe("verifyCompliance — workers' compensation", () => {
  it("flags missing statutory WC when the project requires it", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ workers_comp_statutory: false }), "Other Trades", NOW);
    expect(hasError(result.errors, "Workers' Compensation")).toBe(true);
  });

  it("does not require WC when the project has it disabled", () => {
    const project = makeProject({ requirements: { workers_comp: false } });
    const result = verifyCompliance(project, makeCoi({ workers_comp_statutory: false }), "Other Trades", NOW);
    expect(hasError(result.errors, "Workers' Compensation")).toBe(false);
  });
});

describe("verifyCompliance — employers' liability", () => {
  it("flags EL accident below the requirement", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ employers_liability_accident: 500_000 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Accident limit")).toBe(true);
  });

  it("flags EL disease (per person) below the requirement", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ employers_liability_disease_person: 500_000 }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Disease (Per Person)")).toBe(true);
  });

  it("flags EL disease (policy limit) below the requirement", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ employers_liability_disease_limit: 500_000 }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Disease (Policy Limit)")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trade-based umbrella matrix
// ---------------------------------------------------------------------------

describe("verifyCompliance — umbrella matrix by trade", () => {
  it("requires $10M for high-hazard trades (Elevators)", () => {
    const under = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 5_000_000 }), "Elevators", NOW);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 10_000_000 }), "Elevators", NOW);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });

  it("requires $5M for mid-tier trades (Electrical)", () => {
    const under = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 1_000_000 }), "Electrical", NOW);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 5_000_000 }), "Electrical", NOW);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });

  it("requires $1M for low-tier trades (Other Trades)", () => {
    const under = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 500_000 }), "Other Trades", NOW);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 1_000_000 }), "Other Trades", NOW);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });

  it("falls back to the project's umbrella requirement for an unrecognized trade", () => {
    const project = makeProject({ requirements: { umbrella_limit: 3_000_000 } });
    const under = verifyCompliance(project, makeCoi({ umbrella_limit: 2_000_000 }), "Glazing", NOW);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(project, makeCoi({ umbrella_limit: 3_000_000 }), "Glazing", NOW);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trade-based professional & pollution liability
// ---------------------------------------------------------------------------

describe("verifyCompliance — professional liability by trade", () => {
  it("requires $2M professional liability for professional trades (Plumbing)", () => {
    const under = verifyCompliance(
      makeProject(),
      makeCoi({ professional_liability: 0, umbrella_limit: 5_000_000 }),
      "Plumbing",
      NOW
    );
    expect(hasError(under.errors, "Professional Liability")).toBe(true);

    const ok = verifyCompliance(
      makeProject(),
      makeCoi({ professional_liability: 2_000_000, umbrella_limit: 5_000_000 }),
      "Plumbing",
      NOW
    );
    expect(hasError(ok.errors, "Professional Liability")).toBe(false);
  });

  it("does not require professional liability for non-professional trades", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ professional_liability: 0 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Professional Liability")).toBe(false);
  });

  it("treats a missing professional value as 0 for a professional trade", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ professional_liability: undefined, umbrella_limit: 5_000_000 }),
      "Plumbing",
      NOW
    );
    expect(hasError(result.errors, "Professional Liability")).toBe(true);
  });
});

describe("verifyCompliance — pollution liability by trade", () => {
  it("requires $2M pollution liability for pollution trades (Roofing)", () => {
    const under = verifyCompliance(
      makeProject(),
      makeCoi({ pollution_liability: 0, umbrella_limit: 5_000_000 }),
      "Roofing",
      NOW
    );
    expect(hasError(under.errors, "Pollution Liability")).toBe(true);

    const ok = verifyCompliance(
      makeProject(),
      makeCoi({ pollution_liability: 2_000_000, umbrella_limit: 5_000_000 }),
      "Roofing",
      NOW
    );
    expect(hasError(ok.errors, "Pollution Liability")).toBe(false);
  });

  it("does not require pollution liability for non-pollution trades", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ pollution_liability: 0 }), "Other Trades", NOW);
    expect(hasError(result.errors, "Pollution Liability")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Expiration & warning grace
// ---------------------------------------------------------------------------

describe("verifyCompliance — expiration", () => {
  it("marks a certificate expired before the evaluation date", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: "2026-05-01" }), "Other Trades", NOW);
    expect(result.status).toBe("Expired");
    expect(hasError(result.errors, "expired")).toBe(true);
  });

  it("treats an expiry equal to the evaluation date as expired", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: NOW }), "Other Trades", NOW);
    expect(result.status).toBe("Expired");
  });

  it("warns (but stays Compliant) when expiry is within the grace window", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: "2026-07-01" }), "Other Trades", NOW);
    expect(result.status).toBe("Compliant");
    expect(hasError(result.errors, "risk grace threshold")).toBe(true);
  });

  it("does not warn when expiry is beyond the grace window", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: "2027-06-11" }), "Other Trades", NOW);
    expect(hasError(result.errors, "risk grace threshold")).toBe(false);
  });

  it("prioritizes Expired over other coverage shortfalls", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ policy_expiration_date: "2026-05-01", gl_each_occurrence: 1 }),
      "Other Trades",
      NOW
    );
    expect(result.status).toBe("Expired");
    expect(hasError(result.errors, "Occurrence limit")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Custom requirements
// ---------------------------------------------------------------------------

describe("verifyCompliance — custom requirements", () => {
  const project = makeProject({
    custom_requirements: [{ id: "c1", label: "Rigging Liability", limit: 1_000_000 }],
  });

  it("flags a custom requirement with no extracted value as not found", () => {
    const result = verifyCompliance(project, makeCoi({ custom_extractions: undefined }), "Other Trades", NOW);
    expect(result.status).toBe("Insufficient Coverage");
    expect(hasError(result.errors, "was not found")).toBe(true);
  });

  it("treats an explicit null extraction as not found", () => {
    const result = verifyCompliance(
      project,
      makeCoi({ custom_extractions: { "Rigging Liability": null } }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "was not found")).toBe(true);
  });

  it("flags a custom requirement below its limit", () => {
    const result = verifyCompliance(
      project,
      makeCoi({ custom_extractions: { "Rigging Liability": 500_000 } }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Custom Requirement")).toBe(true);
    expect(result.status).toBe("Insufficient Coverage");
  });

  it("passes a custom requirement met exactly", () => {
    const result = verifyCompliance(
      project,
      makeCoi({ custom_extractions: { "Rigging Liability": 1_000_000 } }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Custom Requirement")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("ignores custom requirements with a zero limit", () => {
    const zeroReq = makeProject({ custom_requirements: [{ id: "c2", label: "Optional", limit: 0 }] });
    const result = verifyCompliance(zeroReq, makeCoi({ custom_extractions: undefined }), "Other Trades", NOW);
    expect(hasError(result.errors, "Optional")).toBe(false);
    expect(result.status).toBe("Compliant");
  });
});

// ---------------------------------------------------------------------------
// Additional insured
// ---------------------------------------------------------------------------

describe("verifyCompliance — additional insured", () => {
  it("skips the check entirely for legacy projects (flag undefined)", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ additional_insured_named: [] }), "Other Trades", NOW);
    expect(hasError(result.errors, "Additional Insured")).toBe(false);
  });

  it("passes when a required entity is named (fuzzy match on suffixes/punctuation)", () => {
    const project = makeProject({
      additional_insured_required: true,
      additional_insured_names: ["Evergreen Development LLC"],
    });
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: ["Evergreen Development, Inc."] }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Additional Insured")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("emits a conditional-pass advisory when relying on accepted blanket language", () => {
    const project = makeProject({
      additional_insured_required: true,
      additional_insured_names: ["Evergreen Development LLC"],
      accept_blanket_ai: true,
    });
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: [], additional_insured_blanket: true }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Verify the endorsement")).toBe(true);
    // Advisory only — does not fail the certificate.
    expect(result.status).toBe("Compliant");
  });

  it("hard-fails on blanket language when the project rejects blanket AI", () => {
    const project = makeProject({
      additional_insured_required: true,
      additional_insured_names: ["Evergreen Development LLC"],
      accept_blanket_ai: false,
    });
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: [], additional_insured_blanket: true }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "not listed as an additional insured")).toBe(true);
    expect(result.status).toBe("Insufficient Coverage");
  });

  it("hard-fails when a required entity is neither named nor covered by blanket", () => {
    const project = makeProject({
      additional_insured_required: true,
      additional_insured_names: ["Evergreen Development LLC"],
    });
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: [], additional_insured_blanket: false }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "not listed as an additional insured")).toBe(true);
    expect(result.status).toBe("Insufficient Coverage");
  });

  it("fails when AI is required, no entities configured, and no AI status of any kind is present", () => {
    const project = makeProject({ additional_insured_required: true, additional_insured_names: [] });
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: [], additional_insured_blanket: false, gl_addl_insd: false }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "no additional insured status was found")).toBe(true);
    expect(result.status).toBe("Insufficient Coverage");
  });
});

// ---------------------------------------------------------------------------
// Helpers: entity normalization & fuzzy matching
// ---------------------------------------------------------------------------

describe("normalizeEntity", () => {
  it("drops punctuation and common corporate suffixes", () => {
    expect(normalizeEntity("ABC Corp.")).toBe("abc");
    expect(normalizeEntity("The ABC Company, LLC")).toBe("abc");
  });

  it("drops filler words used in additional-insured phrasing", () => {
    expect(normalizeEntity("Evergreen Development LLC, its officers and agents")).toBe("evergreen development");
  });

  it("handles empty/nullish input", () => {
    expect(normalizeEntity("")).toBe("");
    expect(normalizeEntity(undefined as unknown as string)).toBe("");
  });
});

describe("isNamedAdditionalInsured", () => {
  it("matches across differing suffixes and punctuation", () => {
    expect(isNamedAdditionalInsured("Evergreen Development LLC", ["Evergreen Development, Inc."])).toBe(true);
  });

  it("matches when the required entity is a substring of a listed name", () => {
    expect(isNamedAdditionalInsured("Acme", ["Acme Corp and its affiliates"])).toBe(true);
  });

  it("returns false when no listed name matches", () => {
    expect(isNamedAdditionalInsured("Evergreen Development", ["Summit Builders LLC"])).toBe(false);
  });

  it("returns false for an empty required name", () => {
    expect(isNamedAdditionalInsured("", ["Evergreen Development LLC"])).toBe(false);
  });
});
