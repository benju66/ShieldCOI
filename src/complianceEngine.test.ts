import { describe, it, expect } from "vitest";
import { verifyCompliance, normalizeEntity, isNamedAdditionalInsured, matchEntityNames } from "./complianceEngine";
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
  professional_liability: 0,
  pollution_liability: 0,
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
// Umbrella (project baseline, raised by trade rules)
// ---------------------------------------------------------------------------

describe("verifyCompliance — umbrella", () => {
  it("checks against the project baseline when the trade has no rule", () => {
    const project = makeProject({ requirements: { umbrella_limit: 2_000_000 } });
    const under = verifyCompliance(project, makeCoi({ umbrella_limit: 1_000_000 }), "Electrical", NOW);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(project, makeCoi({ umbrella_limit: 2_000_000 }), "Electrical", NOW);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });

  it("raises the umbrella requirement for a trade with a rule", () => {
    const rules = { Electrical: { umbrella: 5_000_000 } };
    const under = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 1_000_000 }), "Electrical", NOW, rules);
    expect(hasError(under.errors, "Umbrella")).toBe(true);

    const ok = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 5_000_000 }), "Electrical", NOW, rules);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });

  it("only applies a trade rule to that trade", () => {
    const rules = { Elevators: { umbrella: 10_000_000 } };
    // A different trade with no rule still uses the baseline ($1M).
    const ok = verifyCompliance(makeProject(), makeCoi({ umbrella_limit: 1_000_000 }), "Drywall", NOW, rules);
    expect(hasError(ok.errors, "Umbrella")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Professional & pollution liability (baseline + trade rules)
// ---------------------------------------------------------------------------

describe("verifyCompliance — professional liability", () => {
  it("is not required by default (no baseline, no rule)", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ professional_liability: 0 }), "Electrical", NOW);
    expect(hasError(result.errors, "Professional Liability")).toBe(false);
  });

  it("is required for everyone when the project sets a baseline", () => {
    const project = makeProject({ requirements: { professional_liability: 2_000_000 } });
    const under = verifyCompliance(project, makeCoi({ professional_liability: 1_000_000 }), "Other Trades", NOW);
    expect(hasError(under.errors, "Professional Liability")).toBe(true);

    const ok = verifyCompliance(project, makeCoi({ professional_liability: 2_000_000 }), "Other Trades", NOW);
    expect(hasError(ok.errors, "Professional Liability")).toBe(false);
  });

  it("can be required for a single trade via a rule (e.g. a design-build trade)", () => {
    const rules = { "Electrical - Design Build": { professionalLiability: 2_000_000 } };
    // Plain Electrical: no rule, no baseline → not required.
    expect(
      hasError(verifyCompliance(makeProject(), makeCoi({ professional_liability: 0 }), "Electrical", NOW, rules).errors, "Professional Liability")
    ).toBe(false);
    // Design-build variant: rule requires it.
    expect(
      hasError(verifyCompliance(makeProject(), makeCoi({ professional_liability: 0 }), "Electrical - Design Build", NOW, rules).errors, "Professional Liability")
    ).toBe(true);
  });
});

describe("verifyCompliance — pollution liability", () => {
  it("is not required by default", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ pollution_liability: 0 }), "Roofing", NOW);
    expect(hasError(result.errors, "Pollution Liability")).toBe(false);
  });

  it("is required when the project sets a baseline, and a trade rule can raise it", () => {
    const project = makeProject({ requirements: { pollution_liability: 1_000_000 } });
    const rules = { Roofing: { pollutionLiability: 2_000_000 } };
    // Baseline applies to a trade with no rule.
    expect(
      hasError(verifyCompliance(project, makeCoi({ pollution_liability: 500_000 }), "Drywall", NOW).errors, "Pollution Liability")
    ).toBe(true);
    // Roofing rule raises it to $2M.
    expect(
      hasError(verifyCompliance(project, makeCoi({ pollution_liability: 1_500_000 }), "Roofing", NOW, rules).errors, "Pollution Liability")
    ).toBe(true);
    expect(
      hasError(verifyCompliance(project, makeCoi({ pollution_liability: 2_000_000 }), "Roofing", NOW, rules).errors, "Pollution Liability")
    ).toBe(false);
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
// GL coverage form (occurrence vs claims-made)
// ---------------------------------------------------------------------------

describe("verifyCompliance — GL coverage form", () => {
  it("fails a claims-made GL policy", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_form: "Claims-Made" }), "Other Trades", NOW);
    expect(result.status).toBe("Insufficient Coverage");
    expect(hasError(result.errors, "CLAIMS-MADE")).toBe(true);
  });

  it("passes an occurrence-based GL policy", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ gl_form: "Occurrence" }), "Other Trades", NOW);
    expect(hasError(result.errors, "CLAIMS-MADE")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("does not penalize an unknown or absent coverage form (legacy records)", () => {
    expect(hasError(verifyCompliance(makeProject(), makeCoi({ gl_form: "Unknown" }), "Other Trades", NOW).errors, "CLAIMS-MADE")).toBe(false);
    expect(hasError(verifyCompliance(makeProject(), makeCoi({ gl_form: undefined }), "Other Trades", NOW).errors, "CLAIMS-MADE")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endorsement verification (opt-in advisories)
// ---------------------------------------------------------------------------

describe("verifyCompliance — endorsement advisories", () => {
  it("is skipped entirely when the project opts out (no endorsement_requirements)", () => {
    const result = verifyCompliance(makeProject(), makeCoi(), "Other Trades", NOW);
    expect(hasError(result.errors, "endorsement")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("advises to verify when a required endorsement is indicated on the certificate", () => {
    const project = makeProject({ endorsement_requirements: { waiver_of_subrogation: true } });
    const result = verifyCompliance(
      project,
      makeCoi({ endorsement_facts: { waiver_of_subrogation: true } }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Waiver of Subrogation is required — the certificate indicates it")).toBe(true);
    // Advisory only — does not fail status.
    expect(result.status).toBe("Compliant");
  });

  it("advises to request when a required endorsement is absent — still without failing status", () => {
    const project = makeProject({
      endorsement_requirements: { primary_noncontributory: true, completed_ops_ai: true },
    });
    const result = verifyCompliance(project, makeCoi({ endorsement_facts: {} }), "Other Trades", NOW);
    expect(hasError(result.errors, "Primary & Non-Contributory coverage is required by the project but none was found")).toBe(true);
    expect(hasError(result.errors, "Completed-Operations Additional Insured is required by the project but none was found")).toBe(true);
    expect(result.status).toBe("Compliant");
  });

  it("only advises on the endorsements the project actually requires", () => {
    const project = makeProject({ endorsement_requirements: { project_aggregate: true } });
    const result = verifyCompliance(project, makeCoi({ endorsement_facts: {} }), "Other Trades", NOW);
    expect(hasError(result.errors, "Per-Project Aggregate")).toBe(true);
    expect(hasError(result.errors, "Waiver of Subrogation")).toBe(false);
    expect(hasError(result.errors, "Primary & Non-Contributory")).toBe(false);
  });

  it("still fails on a real coverage shortfall alongside endorsement advisories", () => {
    const project = makeProject({ endorsement_requirements: { waiver_of_subrogation: true } });
    const result = verifyCompliance(
      project,
      makeCoi({ gl_each_occurrence: 1, endorsement_facts: {} }),
      "Other Trades",
      NOW
    );
    expect(result.status).toBe("Insufficient Coverage");
    expect(hasError(result.errors, "request the endorsement")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Insured-name identity (advisory)
// ---------------------------------------------------------------------------

describe("verifyCompliance — insured name identity", () => {
  it("does not flag when the certificate name fuzzy-matches the enrolled vendor", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ insured_name: "Acme Electrical, Inc." }),
      "Other Trades",
      NOW,
      {},
      "Acme Electrical LLC"
    );
    expect(hasError(result.errors, "does not match the enrolled vendor")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("emits a verify advisory (without failing status) when the names differ", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ insured_name: "Totally Different Roofing LLC" }),
      "Other Trades",
      NOW,
      {},
      "Acme Electrical LLC"
    );
    expect(hasError(result.errors, "does not match the enrolled vendor")).toBe(true);
    // Advisory only — a name mismatch alone does not fail the certificate.
    expect(result.status).toBe("Compliant");
  });

  it("still reports a real coverage shortfall even when the name matches", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ insured_name: "Acme Electrical LLC", gl_each_occurrence: 1 }),
      "Other Trades",
      NOW,
      {},
      "Acme Electrical LLC"
    );
    expect(result.status).toBe("Insufficient Coverage");
  });

  it("skips the check when the vendor name is not provided (legacy call)", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ insured_name: "Anything LLC" }), "Other Trades", NOW);
    expect(hasError(result.errors, "does not match the enrolled vendor")).toBe(false);
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

// ---------------------------------------------------------------------------
// Token-based entity matching (wave 1 hardening)
// ---------------------------------------------------------------------------

describe("matchEntityNames", () => {
  it("matches identical names after suffix/punctuation normalization", () => {
    expect(matchEntityNames("ABC Corp.", "The ABC Company, LLC")).toBe("match");
    expect(matchEntityNames("Evergreen Development LLC", "Evergreen Development, Inc.")).toBe("match");
  });

  it("matches a multi-word subset regardless of extra words", () => {
    expect(matchEntityNames("Evergreen Development", "Evergreen Development Group Holdings")).toBe("match");
  });

  it("never matches across word boundaries (raw-substring regression)", () => {
    // Old substring logic: "art electric" IS a substring of "smart electrical…" — a false pass.
    expect(matchEntityNames("Art Electric", "Smart Electrical Contractors")).toBe("none");
  });

  it("returns partial when only a single word is shared as a subset", () => {
    expect(matchEntityNames("ABC Corp", "ABC Roofing")).toBe("partial");
  });

  it("returns none for disjoint names", () => {
    expect(matchEntityNames("Evergreen Development", "Summit Builders")).toBe("none");
  });

  it("returns none when either side is empty or suffix-only", () => {
    expect(matchEntityNames("", "Evergreen Development")).toBe("none");
    expect(matchEntityNames("The LLC", "Evergreen Development")).toBe("none");
  });
});

describe("isNamedAdditionalInsured — token matching", () => {
  it("no longer passes cross-boundary substrings", () => {
    expect(isNamedAdditionalInsured("Art Electric", ["Smart Electrical Contractors"])).toBe(false);
  });

  it("does not treat a single shared word as a confident match", () => {
    expect(isNamedAdditionalInsured("ABC Corp", ["ABC Roofing"])).toBe(false);
  });

  it("still passes a confident multi-word subset", () => {
    expect(isNamedAdditionalInsured("Evergreen Development", ["Evergreen Development Group"])).toBe(true);
  });
});

describe("verifyCompliance — similar-name additional insured advisory", () => {
  const project = makeProject({
    additional_insured_required: true,
    additional_insured_names: ["ABC Corp"],
  });

  it("emits a non-failing verify advisory when only a similar name appears", () => {
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: ["ABC Roofing"], additional_insured_blanket: false }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "verify it refers to the same entity")).toBe(true);
    expect(hasError(result.errors, "not listed as an additional insured")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("prefers the similar-name advisory over the blanket advisory", () => {
    const result = verifyCompliance(
      project,
      makeCoi({ additional_insured_named: ["ABC Roofing"], additional_insured_blanket: true }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "verify it refers to the same entity")).toBe(true);
    expect(hasError(result.errors, "relying on blanket")).toBe(false);
  });

  it("a confident multi-word match still passes silently", () => {
    const multiWord = makeProject({
      additional_insured_required: true,
      additional_insured_names: ["Evergreen Development"],
    });
    const result = verifyCompliance(
      multiWord,
      makeCoi({ additional_insured_named: ["Evergreen Development Group Holdings"] }),
      "Other Trades",
      NOW
    );
    expect(hasError(result.errors, "Additional Insured")).toBe(false);
    expect(result.status).toBe("Compliant");
  });

  it("flags a single-shared-word insured name for verification (advisory only)", () => {
    const result = verifyCompliance(
      makeProject(),
      makeCoi({ insured_name: "ABC" }),
      "Other Trades",
      NOW,
      {},
      "ABC Roofing LLC"
    );
    expect(hasError(result.errors, "does not match the enrolled vendor")).toBe(true);
    expect(result.status).toBe("Compliant");
  });
});

// ---------------------------------------------------------------------------
// Unreadable expiration dates (wave 1 hardening — fail closed)
// ---------------------------------------------------------------------------

describe("verifyCompliance — unreadable expiration date fails closed", () => {
  const expectFailsClosed = (badDate: string) => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: badDate }), "Other Trades", NOW);
    expect(hasError(result.errors, "could not be read as a valid date")).toBe(true);
    expect(result.status).toBe("Insufficient Coverage");
  };

  it("fails a missing (empty) expiration date", () => {
    expectFailsClosed("");
  });

  it("fails a garbled expiration date", () => {
    expectFailsClosed("not-a-date");
  });

  it("fails a non-ISO date format rather than guessing", () => {
    expectFailsClosed("06/11/2027");
  });

  it("fails an impossible calendar date", () => {
    expectFailsClosed("2026-13-45");
  });

  it("does not mislabel an unreadable date as Expired", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: "" }), "Other Trades", NOW);
    expect(result.status).not.toBe("Expired");
    expect(hasError(result.errors, "Policy expired on")).toBe(false);
  });

  it("still accepts a valid future ISO date", () => {
    const result = verifyCompliance(makeProject(), makeCoi({ policy_expiration_date: "2027-06-11" }), "Other Trades", NOW);
    expect(hasError(result.errors, "could not be read")).toBe(false);
    expect(result.status).toBe("Compliant");
  });
});
