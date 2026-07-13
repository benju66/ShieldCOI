import { describe, it, expect } from "vitest";
import { vendorKey, buildVendorSummaries, statusSeverity } from "./vendors";
import { Project, Subcontractor, CoiRecord } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(id: string, number: string, name: string): Project {
  return {
    id,
    name,
    number,
    target_completion_date: "2027-12-31",
    createdAt: "2026-01-01T00:00:00.000Z",
    requirements: {
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
    },
  };
}

let subCounter = 0;
function makeSub(overrides: Partial<Subcontractor> & { project_id: string; company_name: string }): Subcontractor {
  subCounter += 1;
  return {
    id: `sub${subCounter}`,
    trade: "Electrical",
    contract_value: 100_000,
    compliance_status: "Compliant",
    manual_override: false,
    override_notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    vendor_type: "Subcontractor",
    ...overrides,
  };
}

function coiFor(subId: string, expiration: string): CoiRecord {
  return {
    id: `coi-${subId}`,
    subcontractor_id: subId,
    project_id: "p",
    uploaded_at: "2026-01-01T00:00:00.000Z",
    file_name: "coi.pdf",
    insured_extracted_name: "x",
    gl_occurrence_extracted: 0,
    gl_aggregate_extracted: 0,
    auto_combined_single_limit_extracted: 0,
    workers_comp_statutory_extracted: true,
    policy_expiration_date_extracted: expiration,
    gl_products_completed_extracted: 0,
    umbrella_limit_extracted: 0,
    employers_liability_accident_extracted: 0,
    employers_liability_disease_person_extracted: 0,
    employers_liability_disease_limit_extracted: 0,
    professional_liability_extracted: 0,
    pollution_liability_extracted: 0,
    validation_errors: [],
  };
}

// ---------------------------------------------------------------------------
// vendorKey
// ---------------------------------------------------------------------------

describe("vendorKey", () => {
  it("collapses case, punctuation, and corporate suffixes", () => {
    expect(vendorKey("ACME Electrical Solutions LLC")).toBe("acme electrical solutions");
    expect(vendorKey("ACME Electrical Solutions, Inc.")).toBe("acme electrical solutions");
    expect(vendorKey("acme electrical solutions")).toBe("acme electrical solutions");
  });

  it("keeps genuinely different companies distinct", () => {
    expect(vendorKey("Acme Electrical")).not.toBe(vendorKey("Acme Plumbing"));
  });

  it("returns empty string for blank input", () => {
    expect(vendorKey("")).toBe("");
    expect(vendorKey("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// statusSeverity
// ---------------------------------------------------------------------------

describe("statusSeverity", () => {
  it("ranks statuses from most to least attention-worthy", () => {
    expect(statusSeverity("Expired")).toBeGreaterThan(statusSeverity("Insufficient Coverage"));
    expect(statusSeverity("Insufficient Coverage")).toBeGreaterThan(statusSeverity("Pending Upload"));
    expect(statusSeverity("Pending Upload")).toBeGreaterThan(statusSeverity("Approved Exception"));
    expect(statusSeverity("Approved Exception")).toBeGreaterThan(statusSeverity("Compliant"));
  });
});

// ---------------------------------------------------------------------------
// buildVendorSummaries
// ---------------------------------------------------------------------------

describe("buildVendorSummaries", () => {
  const p1 = makeProject("p1", "P-01", "Aurora");
  const p2 = makeProject("p2", "P-02", "Evergreen");
  const p3 = makeProject("p3", "P-03", "Summit");
  const projects = [p1, p2, p3];

  it("groups the same company across projects despite suffix differences", () => {
    const subs = [
      makeSub({ id: "a1", project_id: "p1", company_name: "ACME Electrical Solutions LLC", contract_value: 100_000 }),
      makeSub({ id: "a2", project_id: "p2", company_name: "ACME Electrical Solutions, Inc.", contract_value: 200_000 }),
      makeSub({ id: "b1", project_id: "p1", company_name: "Apex Plumbing", contract_value: 50_000 }),
    ];
    const summaries = buildVendorSummaries(subs, projects, {});
    expect(summaries).toHaveLength(2);
    const acme = summaries.find((v) => v.key === vendorKey("ACME Electrical Solutions LLC"))!;
    expect(acme.projectCount).toBe(2);
    expect(acme.totalContractValue).toBe(300_000);
    // Canonical name is the longest spelling.
    expect(acme.name).toBe("ACME Electrical Solutions, Inc.");
  });

  it("rolls up to the most attention-worthy status across projects", () => {
    const subs = [
      makeSub({ id: "a1", project_id: "p1", company_name: "Acme", compliance_status: "Compliant" }),
      makeSub({ id: "a2", project_id: "p2", company_name: "Acme", compliance_status: "Pending Upload" }),
      makeSub({ id: "a3", project_id: "p3", company_name: "Acme", compliance_status: "Expired" }),
    ];
    const [acme] = buildVendorSummaries(subs, projects, {});
    expect(acme.worstStatus).toBe("Expired");
    expect(acme.projectCount).toBe(3);
  });

  it("reports the earliest COI expiration across projects", () => {
    const subs = [
      makeSub({ id: "a1", project_id: "p1", company_name: "Acme" }),
      makeSub({ id: "a2", project_id: "p2", company_name: "Acme" }),
    ];
    const coiMap = { a1: coiFor("a1", "2027-05-01"), a2: coiFor("a2", "2026-09-15") };
    const [acme] = buildVendorSummaries(subs, projects, coiMap);
    expect(acme.earliestExpiration).toBe("2026-09-15");
  });

  it("leaves earliestExpiration null when no COI is on file", () => {
    const subs = [makeSub({ id: "a1", project_id: "p1", company_name: "Acme", compliance_status: "Pending Upload" })];
    const [acme] = buildVendorSummaries(subs, projects, {});
    expect(acme.earliestExpiration).toBeNull();
  });

  it("orders vendors by worst status, then project count", () => {
    const subs = [
      makeSub({ id: "c1", project_id: "p1", company_name: "Clean Co", compliance_status: "Compliant" }),
      makeSub({ id: "d1", project_id: "p1", company_name: "Danger Co", compliance_status: "Expired" }),
    ];
    const summaries = buildVendorSummaries(subs, projects, {});
    expect(summaries[0].name).toBe("Danger Co");
  });

  it("skips subcontractors with a blank company name", () => {
    const subs = [makeSub({ id: "a1", project_id: "p1", company_name: "   " })];
    expect(buildVendorSummaries(subs, projects, {})).toHaveLength(0);
  });
});
