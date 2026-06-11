import { Project, CoiRecord } from "./types";

/**
 * Calculates compliance status and list of errors for a subcontractor's COI record
 * against the parent project's requirements.
 */
export function verifyCompliance(
  project: Project,
  coi: {
    insured_name: string;
    gl_each_occurrence: number;
    gl_general_aggregate: number;
    auto_combined_single_limit: number;
    workers_comp_statutory: boolean;
    policy_expiration_date: string; // YYYY-MM-DD
  },
  currentDateStr: string = "2026-06-11"
): { status: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload"; errors: string[] } {
  const errors: string[] = [];
  const req = project.requirements;

  // 1. General Liability - Each Occurrence Limit ($)
  if (coi.gl_each_occurrence < req.gl_occurrence) {
    errors.push(
      `General Liability: Occurrence limit ($${coi.gl_each_occurrence.toLocaleString()}) is less than the required $${req.gl_occurrence.toLocaleString()}.`
    );
  }

  // 2. General Liability - General Aggregate Limit ($)
  if (coi.gl_general_aggregate < req.gl_aggregate) {
    errors.push(
      `General Liability: General Aggregate limit ($${coi.gl_general_aggregate.toLocaleString()}) is less than the required $${req.gl_aggregate.toLocaleString()}.`
    );
  }

  // 3. Automobile Liability - Combined Single Limit ($)
  if (coi.auto_combined_single_limit < req.auto_limit) {
    errors.push(
      `Automobile Liability: Combined Single Limit ($${coi.auto_combined_single_limit.toLocaleString()}) is less than the required $${req.auto_limit.toLocaleString()}.`
    );
  }

  // 4. Workers' Compensation - Statutory Limits Toggle
  if (req.workers_comp && !coi.workers_comp_statutory) {
    errors.push(`Workers' Compensation: Statutory limits are mandated but not verified on this certificate.`);
  }

  // 5. Expiration Check
  const expiration = new Date(coi.policy_expiration_date);
  const current = new Date(currentDateStr);

  const isExpired = expiration <= current;
  if (isExpired) {
    errors.push(`Policy expired on ${coi.policy_expiration_date} (Current project evaluation date: ${currentDateStr}).`);
  } else {
    // Check warning threshold limit
    const diffTime = expiration.getTime() - current.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= req.warn_days_out) {
      errors.push(
        `Policy expires on ${coi.policy_expiration_date} (In ${diffDays} days). This is within the project's ${req.warn_days_out}-day risk grace threshold.`
      );
    }
  }

  let finalStatus: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload" = "Compliant";
  if (isExpired) {
    finalStatus = "Expired";
  } else if (errors.some((err) => !err.includes("risk grace threshold"))) {
    // If we have actual limit shortfalls, or missing WC
    finalStatus = "Insufficient Coverage";
  } else {
    finalStatus = "Compliant";
  }

  return {
    status: finalStatus,
    errors,
  };
}
