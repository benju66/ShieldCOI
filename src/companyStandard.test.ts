import { describe, it, expect } from "vitest";
import {
  COMPANY_STANDARD_REQUIREMENTS,
  buildCompanyStandardTradeRules,
  buildCompanyStandardTrades,
  DESIGN_BUILD_TRADES,
  DESIGN_BUILD_SUFFIX,
} from "./companyStandard";
import { resolveRequiredCoverage } from "./tradeRules";
import { DEFAULT_TRADES } from "./settingsService";

/**
 * The exhibit's "Scopes Required to Provide Additional Coverage" table,
 * transcribed straight from the PDF. Kept here rather than imported so the
 * preset is checked against the DOCUMENT, not against itself — if someone edits
 * the preset without the exhibit changing, these fail.
 */
const EXHIBIT_EXCESS: [string, number][] = [
  ["Environmental", 5_000_000],
  ["Surveying", 1_000_000],
  ["Earthwork", 5_000_000],
  ["Concrete (Precast)", 10_000_000],
  ["Concrete (with Crane)", 10_000_000],
  ["Concrete (Standard)", 5_000_000],
  ["Masonry", 5_000_000],
  ["Rough Carpentry (with Crane)", 10_000_000],
  ["Rough Carpentry (Standard)", 5_000_000],
  ["Siding", 5_000_000],
  ["Roofing", 5_000_000],
  ["Windows", 5_000_000],
  ["Drywall", 5_000_000],
  ["Pool", 1_000_000],
  ["Elevators", 10_000_000],
  ["Fire Sprinkler", 5_000_000],
  ["Plumbing", 5_000_000],
  ["HVAC", 5_000_000],
  ["Electrical", 5_000_000],
  ["Other Trades", 1_000_000],
];

const rules = buildCompanyStandardTradeRules();
const effective = (trade: string) =>
  resolveRequiredCoverage(COMPANY_STANDARD_REQUIREMENTS, trade, rules);

describe("company standard — baseline coverages (Exhibit D section B)", () => {
  it("matches the standard coverage table", () => {
    expect(COMPANY_STANDARD_REQUIREMENTS.gl_occurrence).toBe(1_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.gl_aggregate).toBe(2_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.gl_products_completed).toBe(2_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.auto_limit).toBe(1_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.workers_comp).toBe(true);
    expect(COMPANY_STANDARD_REQUIREMENTS.employers_liability_accident).toBe(1_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.employers_liability_disease_person).toBe(1_000_000);
    expect(COMPANY_STANDARD_REQUIREMENTS.employers_liability_disease_limit).toBe(1_000_000);
  });

  it("does not demand professional or pollution cover from everyone", () => {
    // The exhibit makes both conditional on scope. As a baseline they would
    // flag every surveyor and elevator installer on the job.
    expect(COMPANY_STANDARD_REQUIREMENTS.professional_liability).toBe(0);
    expect(COMPANY_STANDARD_REQUIREMENTS.pollution_liability).toBe(0);
  });
});

describe("company standard — excess limits per trade", () => {
  it.each(EXHIBIT_EXCESS)("requires the exhibit's excess limit for %s", (trade, expected) => {
    expect(effective(trade).umbrella).toBe(expected);
  });

  it("covers unlisted trades by the $1M baseline rather than a rule per trade", () => {
    expect(effective("Some Trade That Does Not Exist").umbrella).toBe(1_000_000);
  });
});

describe("company standard — professional liability is design/build only", () => {
  it.each([...DESIGN_BUILD_TRADES])("requires $2M professional for %s design/build", (base) => {
    expect(effective(`${base}${DESIGN_BUILD_SUFFIX}`).professionalLiability).toBe(2_000_000);
  });

  it.each([...DESIGN_BUILD_TRADES])("requires none for plain %s", (base) => {
    // The exhibit's column is headed "(Design/Build)" — a plain electrical sub
    // owes no professional liability, and flagging one would be wrong.
    expect(effective(base).professionalLiability).toBe(0);
  });

  it("keeps the base trade's excess and pollution on the design/build variant", () => {
    const plain = effective("Plumbing");
    const db = effective(`Plumbing${DESIGN_BUILD_SUFFIX}`);
    expect(db.umbrella).toBe(plain.umbrella);
    expect(db.pollutionLiability).toBe(plain.pollutionLiability);
  });
});

describe("company standard — pollution liability by scope (Exhibit D section B.5)", () => {
  const REQUIRED = [
    "Environmental",
    "Concrete (Precast)",
    "Concrete (with Crane)",
    "Concrete (Standard)",
    "Masonry",
    "Siding",
    "Roofing",
    "Windows",
    "Drywall",
    "Plumbing",
    "HVAC",
  ];
  // Earthwork and Fire Sprinkler are the two the exhibit does not name either
  // way. Both were put to the contractor and confirmed excluded — pinned here
  // so the decision is not quietly reversed later.
  const NOT_REQUIRED = [
    "Surveying",
    "Earthwork",
    "Rough Carpentry (Standard)",
    "Pool",
    "Elevators",
    "Fire Sprinkler",
    "Electrical",
  ];

  it.each(REQUIRED)("requires $2M pollution for %s", (trade) => {
    expect(effective(trade).pollutionLiability).toBe(2_000_000);
  });

  it.each(NOT_REQUIRED)("requires none for %s", (trade) => {
    expect(effective(trade).pollutionLiability).toBe(0);
  });
});

describe("company standard — trade list", () => {
  it("adds a design/build variant for each trade that needs one", () => {
    const trades = buildCompanyStandardTrades(DEFAULT_TRADES);
    for (const base of DESIGN_BUILD_TRADES) {
      expect(trades).toContain(`${base}${DESIGN_BUILD_SUFFIX}`);
    }
  });

  it("keeps every existing trade and adds no duplicates", () => {
    const trades = buildCompanyStandardTrades(DEFAULT_TRADES);
    for (const t of DEFAULT_TRADES) expect(trades).toContain(t);
    expect(new Set(trades).size).toBe(trades.length);
  });

  it("is idempotent — loading the standard twice does not duplicate trades", () => {
    const once = buildCompanyStandardTrades(DEFAULT_TRADES);
    expect(buildCompanyStandardTrades(once)).toEqual(once);
  });

  it("names every trade its rules reference", () => {
    // A rule keyed to a trade nobody can select is silently dead.
    const trades = new Set(buildCompanyStandardTrades(DEFAULT_TRADES));
    for (const trade of Object.keys(buildCompanyStandardTradeRules())) {
      expect(trades.has(trade), `${trade} has a rule but is not selectable`).toBe(true);
    }
  });
});
