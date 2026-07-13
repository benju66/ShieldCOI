import { ProjectRequirements } from "./types";

/**
 * Trade-specific insurance coverage rules.
 *
 * Rules are user-defined and ship BLANK — there are no built-in/hardcoded trade
 * requirements. A trade with no rule is checked only against the project's
 * baseline requirements. A trade rule can RAISE a coverage above the project
 * baseline for that trade (the effective requirement is the higher of the two);
 * it can never lower it below the baseline.
 *
 * Design-build variants are modeled as their own trades (e.g. an "Electrical –
 * Design Build" trade with a professional-liability rule that plain "Electrical"
 * lacks) — no separate mechanism is needed.
 */

export interface TradeRule {
  /** Required umbrella / excess liability minimum for this trade (0 = none). */
  umbrella?: number;
  /** Required professional liability minimum for this trade (0 = none). */
  professionalLiability?: number;
  /** Required pollution liability minimum for this trade (0 = none). */
  pollutionLiability?: number;
}

export interface RequiredCoverage {
  umbrella: number;
  professionalLiability: number;
  pollutionLiability: number;
}

/**
 * The effective required coverage for a subcontractor: the higher of the
 * project baseline and any trade-specific rule, per coverage type. A value of 0
 * means that coverage is not required.
 */
export function resolveRequiredCoverage(
  req: Pick<ProjectRequirements, "umbrella_limit" | "professional_liability" | "pollution_liability">,
  trade: string,
  tradeRules: Record<string, TradeRule>
): RequiredCoverage {
  const rule = tradeRules[trade];
  return {
    umbrella: Math.max(req.umbrella_limit ?? 0, rule?.umbrella ?? 0),
    professionalLiability: Math.max(req.professional_liability ?? 0, rule?.professionalLiability ?? 0),
    pollutionLiability: Math.max(req.pollution_liability ?? 0, rule?.pollutionLiability ?? 0),
  };
}

/** True when the rule sets at least one non-zero coverage requirement. */
export function isNonEmptyRule(rule: TradeRule | undefined): boolean {
  if (!rule) return false;
  return Boolean(rule.umbrella || rule.professionalLiability || rule.pollutionLiability);
}
