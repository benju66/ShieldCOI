import { ProjectRequirements } from "./types";
import { TradeRule } from "./tradeRules";

/**
 * The company's standard subcontractor insurance requirements, as a one-click
 * starting point.
 *
 * Transcribed from Exhibit D — Insurance Requirements (Rev. 2024.07.12 and
 * Rev. 2025.07.16). The two revisions carry an IDENTICAL limits table; the 2025
 * revision only widens who it applies to (vendors and purchase orders, not just
 * subcontracts). So these numbers are the house standard, not a per-project
 * negotiation, which is why they load org-wide and a project can then override
 * them for a job whose owner demands more.
 *
 * Nothing here is enforced — it is a preset the org loads and can then edit.
 */

/** Where these numbers came from, shown to whoever is about to load them. */
export const COMPANY_STANDARD_SOURCE = "Exhibit D — Insurance Requirements (Rev. 2025.07.16)";

/**
 * Section B of the exhibit — the coverages every subcontractor carries.
 *
 * professional_liability and pollution_liability are 0 at the BASELINE on
 * purpose. The exhibit requires neither of them universally: professional
 * liability applies only to design/build scopes (section C), and pollution only
 * to the scopes listed in B.5. Setting them as a baseline would demand
 * pollution cover from a surveyor and flag every one of them.
 */
export const COMPANY_STANDARD_REQUIREMENTS: ProjectRequirements = {
  gl_occurrence: 1_000_000,
  gl_aggregate: 2_000_000,
  gl_products_completed: 2_000_000,
  auto_limit: 1_000_000,
  workers_comp: true,
  employers_liability_accident: 1_000_000,
  employers_liability_disease_person: 1_000_000,
  employers_liability_disease_limit: 1_000_000,
  // "All other trades not listed above — $1,000,000". Trades needing more are
  // raised by the rules below; this covers everyone else.
  umbrella_limit: 1_000_000,
  professional_liability: 0,
  pollution_liability: 0,
  warn_days_out: 60,
};

/** Section C — professional liability, where the exhibit requires it. */
const PROFESSIONAL = 2_000_000;
/** Section B.5 — pollution liability, where the exhibit requires it. */
const POLLUTION = 2_000_000;

/**
 * Design/build variants.
 *
 * The exhibit's professional-liability column is headed "(Design/Build)" — it
 * is a condition on the SCOPE, not on the trade. A plain electrical sub owes no
 * professional liability; the same sub doing design/build work does. The app
 * models that as its own trade (see tradeRules.ts), so whoever enrols the
 * subcontractor picks the variant when the scope includes design.
 */
export const DESIGN_BUILD_SUFFIX = " – Design Build";

/** The trades the exhibit lists a professional-liability limit against. */
export const DESIGN_BUILD_TRADES = [
  "Environmental",
  "Surveying",
  "Earthwork",
  "Pool",
  "Fire Sprinkler",
  "Plumbing",
  "HVAC",
  "Electrical",
] as const;

/**
 * Excess / umbrella limits from the exhibit's "Scopes Required to Provide
 * Additional Coverage" table. Trades listed at $1,000,000 (Surveying, Pool, and
 * everything unlisted) are covered by the baseline above and need no rule —
 * the engine takes the higher of baseline and rule.
 */
const EXCESS_BY_TRADE: Record<string, number> = {
  "Concrete (Precast)": 10_000_000,
  "Concrete (with Crane)": 10_000_000,
  "Rough Carpentry (with Crane)": 10_000_000,
  Elevators: 10_000_000,
  Environmental: 5_000_000,
  Earthwork: 5_000_000,
  "Concrete (Standard)": 5_000_000,
  Masonry: 5_000_000,
  "Rough Carpentry (Standard)": 5_000_000,
  Siding: 5_000_000,
  Roofing: 5_000_000,
  Windows: 5_000_000,
  Drywall: 5_000_000,
  "Fire Sprinkler": 5_000_000,
  Plumbing: 5_000_000,
  HVAC: 5_000_000,
  Electrical: 5_000_000,
};

/**
 * Scopes that trigger pollution liability under section B.5:
 *   (i)   building enclosure systems (roofing/flashing, exterior windows and
 *         doors, curtainwall, plaster, stucco, exterior stone or masonry)
 *   (ii)  plumbing, heating, ventilating or air conditioning systems
 *   (iii) drywall or insulation
 *   (iv)  building foundations including any concrete or masonry work
 *   plus  (a) work involving transport/release of pollutants
 *
 * TWO JUDGMENT CALLS worth checking against how you actually contract:
 *   - Earthwork is excluded. It is not "foundations" in the exhibit's words,
 *     though hauling contaminated soil would fall under (a).
 *   - Fire Sprinkler is excluded. It is arguably a "plumbing system" under (ii).
 * Both are one line to change if you read them the other way.
 */
const POLLUTION_TRADES = [
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

/** Build the full rule set, including the design/build variants. */
export function buildCompanyStandardTradeRules(): Record<string, TradeRule> {
  const rules: Record<string, TradeRule> = {};

  const set = (trade: string, patch: TradeRule) => {
    rules[trade] = { ...rules[trade], ...patch };
  };

  for (const [trade, umbrella] of Object.entries(EXCESS_BY_TRADE)) set(trade, { umbrella });
  for (const trade of POLLUTION_TRADES) set(trade, { pollutionLiability: POLLUTION });

  // A design/build variant inherits its base trade's excess and pollution, and
  // adds the professional-liability requirement the base trade does not carry.
  for (const base of DESIGN_BUILD_TRADES) {
    set(`${base}${DESIGN_BUILD_SUFFIX}`, {
      ...rules[base],
      professionalLiability: PROFESSIONAL,
    });
  }

  return rules;
}

/** Trade list including the design/build variants the rules above reference. */
export function buildCompanyStandardTrades(existing: string[]): string[] {
  const variants = DESIGN_BUILD_TRADES.map((t) => `${t}${DESIGN_BUILD_SUFFIX}`);
  const merged = [...existing];
  for (const v of variants) if (!merged.includes(v)) merged.push(v);
  return merged;
}

/**
 * Endorsements the exhibit requires on every subcontract:
 *   - per-project aggregate (section B: aggregates applied separately to the Project)
 *   - waiver of subrogation (section F)
 *   - primary & non-contributory (section B / D)
 *   - completed-operations additional insured (section D)
 */
export const COMPANY_STANDARD_ENDORSEMENTS = {
  waiver_of_subrogation: true,
  primary_noncontributory: true,
  project_aggregate: true,
  completed_ops_ai: true,
};

/**
 * Section D names the contractor itself. The second bullet — "Additional
 * Insured as listed in Article 3 section 3.1 d." — points into each individual
 * contract, so the owner entities are per-project and cannot be preset here.
 */
export const COMPANY_STANDARD_ADDITIONAL_INSURED = ["Fendler Patterson Construction, Inc"];
