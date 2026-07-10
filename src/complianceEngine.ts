import { Project } from "./types";

/**
 * Normalizes an entity name for fuzzy comparison — drops punctuation, common
 * corporate suffixes, and filler words so "ABC Corp." ≈ "abc corporation".
 */
export function normalizeEntity(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.,&]/g, " ")
    .replace(/\b(llc|inc|incorporated|corp|corporation|company|co|ltd|lp|llp|the|and|its|affiliates|officers|agents|employees)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a required entity appears in the names extracted as Additional
 * Insured on the certificate (fuzzy, suffix/punctuation-insensitive).
 */
export function isNamedAdditionalInsured(reqName: string, namedList: string[] = []): boolean {
  const reqNorm = normalizeEntity(reqName);
  if (!reqNorm) return false;
  return namedList.some((n) => {
    const nNorm = normalizeEntity(n);
    return nNorm.length > 0 && (nNorm.includes(reqNorm) || reqNorm.includes(nNorm));
  });
}

/**
 * Calculates compliance status and list of errors for a subcontractor's COI record
 * against the parent project's requirements, parsing both the project's global baselines
 * AND the subcontractor's selected trade scope with conditional limit requirements.
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
    gl_products_completed?: number;
    umbrella_limit?: number;
    employers_liability_accident?: number;
    employers_liability_disease_person?: number;
    employers_liability_disease_limit?: number;
    professional_liability?: number;
    pollution_liability?: number;
    custom_extractions?: Record<string, number | null>;
    additional_insured_named?: string[];
    additional_insured_blanket?: boolean;
    gl_addl_insd?: boolean;
  },
  subcontractorTrade: string = "Other Trades",
  currentDateStr: string = "2026-06-11"
): { status: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload"; errors: string[] } {
  const errors: string[] = [];
  const req = project.requirements;
  const trade = (subcontractorTrade || "Other Trades").trim();

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

  // 5. General Liability - Products-Completed Aggregate ($)
  const glProductsCompleted = coi.gl_products_completed ?? 0;
  const requiredGlProductsCompleted = req.gl_products_completed ?? 2000000;
  if (glProductsCompleted < requiredGlProductsCompleted) {
    errors.push(
      `General Liability: Products-Completed Aggregate limit ($${glProductsCompleted.toLocaleString()}) is less than the required $${requiredGlProductsCompleted.toLocaleString()}.`
    );
  }

  // 6. Variable Excess/Umbrella Matrix Override
  let requiredUmbrella = req.umbrella_limit ?? 1000000;
  if (["Concrete (Precast)", "Concrete (with Crane)", "Rough Carpentry (with Crane)", "Elevators"].includes(trade)) {
    requiredUmbrella = 10000000;
  } else if ([
    "Environmental", "Earthwork", "Concrete (Standard)", "Masonry", "Rough Carpentry (Standard)",
    "Siding", "Roofing", "Windows", "Drywall", "Fire Sprinkler", "Plumbing", "HVAC", "Electrical"
  ].includes(trade)) {
    requiredUmbrella = 5000000;
  } else if (["Surveying", "Pool", "Other Trades"].includes(trade)) {
    requiredUmbrella = 1000000;
  }

  const umbrellaLimit = coi.umbrella_limit ?? 0;
  if (umbrellaLimit < requiredUmbrella) {
    errors.push(
      `Umbrella / Excess Liability: Limit ($${umbrellaLimit.toLocaleString()}) is less than the required $${requiredUmbrella.toLocaleString()} dictated by trade scope "${trade}".`
    );
  }

  // 7. Employers' Liability - Accident ($)
  const elAccident = coi.employers_liability_accident ?? 0;
  const requiredElAccident = req.employers_liability_accident ?? 1000000;
  if (elAccident < requiredElAccident) {
    errors.push(
      `Employers' Liability: Accident limit ($${elAccident.toLocaleString()}) is less than the required $${requiredElAccident.toLocaleString()}.`
    );
  }

  // 8. Employers' Liability - Disease (Per Person) ($)
  const elDiseasePerson = coi.employers_liability_disease_person ?? 0;
  const requiredElDiseasePerson = req.employers_liability_disease_person ?? 1000000;
  if (elDiseasePerson < requiredElDiseasePerson) {
    errors.push(
      `Employers' Liability: Disease (Per Person) limit ($${elDiseasePerson.toLocaleString()}) is less than the required $${requiredElDiseasePerson.toLocaleString()}.`
    );
  }

  // 9. Employers' Liability - Disease (Policy Limit) ($)
  const elDiseaseLimit = coi.employers_liability_disease_limit ?? 0;
  const requiredElDiseaseLimit = req.employers_liability_disease_limit ?? 1000000;
  if (elDiseaseLimit < requiredElDiseaseLimit) {
    errors.push(
      `Employers' Liability: Disease (Policy Limit) limit ($${elDiseaseLimit.toLocaleString()}) is less than the required $${requiredElDiseaseLimit.toLocaleString()}.`
    );
  }

  // 10. Professional Liability Trade Rule ($2M)
  const professionalTrades = ["Environmental", "Surveying", "Earthwork", "Pool", "Fire Sprinkler", "Plumbing", "HVAC", "Electrical"];
  if (professionalTrades.includes(trade)) {
    const professionalVal = coi.professional_liability ?? 0;
    if (professionalVal < 2000000) {
      errors.push(
        `Professional Liability: Trade scope "${trade}" requires at least $2,000,000, but found $${professionalVal.toLocaleString()}.`
      );
    }
  }

  // 11. Pollution Liability Trade Rule ($2M)
  const pollutionTrades = [
    "Environmental", "Earthwork", "Concrete (Precast)", "Concrete (Standard)", "Masonry",
    "Rough Carpentry (Standard)", "Siding", "Roofing", "Windows", "Drywall", "Plumbing", "HVAC"
  ];
  if (pollutionTrades.includes(trade)) {
    const pollutionVal = coi.pollution_liability ?? 0;
    if (pollutionVal < 2000000) {
      errors.push(
        `Pollution Liability: Trade scope "${trade}" requires at least $2,000,000, but found $${pollutionVal.toLocaleString()}.`
      );
    }
  }

  // 12. Expiration Check
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

  // 13. Dynamic Custom Coverage Requirements Evaluation
  if (project.custom_requirements && Array.isArray(project.custom_requirements)) {
    project.custom_requirements.forEach((customReq) => {
      const label = customReq.label;
      const requiredLimit = customReq.limit;
      if (label && requiredLimit > 0) {
        const extractedValue = coi.custom_extractions ? coi.custom_extractions[label] : undefined;
        if (extractedValue === undefined || extractedValue === null) {
          errors.push(
            `Custom Requirement "${label}": Required limit ($${requiredLimit.toLocaleString()}) but coverage was not found on the certificate.`
          );
        } else if (Number(extractedValue) < requiredLimit) {
          errors.push(
            `Custom Requirement "${label}": Extracted limit ($${Number(extractedValue).toLocaleString()}) is less than the required $${requiredLimit.toLocaleString()}.`
          );
        }
      }
    });
  }

  // 14. Additional Insured verification
  // Skipped entirely on legacy projects (field undefined). "Verify the endorsement"
  // advisories are conditional passes and are deliberately excluded from the
  // status-failing check below (same treatment as the expiration grace threshold).
  if (project.additional_insured_required) {
    const requiredNames = (project.additional_insured_names || [])
      .map((n) => (n || "").trim())
      .filter(Boolean);
    const namedList = coi.additional_insured_named || [];
    const blanketPresent = !!coi.additional_insured_blanket;
    const acceptBlanket = project.accept_blanket_ai !== false; // default: accept blanket "as req'd by written contract"

    if (requiredNames.length > 0) {
      requiredNames.forEach((reqName) => {
        if (isNamedAdditionalInsured(reqName, namedList)) return; // explicitly named — passes
        if (blanketPresent && acceptBlanket) {
          errors.push(
            `Additional Insured: "${reqName}" is not explicitly named — relying on blanket "as required by written contract" language. Verify the endorsement (e.g. CG 20 10 / CG 20 33 / CG 20 38).`
          );
        } else {
          errors.push(
            `Additional Insured: "${reqName}" is not listed as an additional insured on this certificate.`
          );
        }
      });
    } else if (namedList.length === 0 && !blanketPresent && !coi.gl_addl_insd) {
      // Required, no specific entities configured, and no AI status of any kind found.
      errors.push(`Additional Insured: required by project, but no additional insured status was found on this certificate.`);
    } else if (namedList.length === 0 && blanketPresent && acceptBlanket) {
      errors.push(`Additional Insured: only blanket "as required by written contract" language found. Verify the endorsement.`);
    }
  }

  let finalStatus: "Compliant" | "Insufficient Coverage" | "Expired" | "Pending Upload" = "Compliant";
  if (isExpired) {
    finalStatus = "Expired";
  } else if (errors.some((err) => !err.includes("risk grace threshold") && !err.includes("Verify the endorsement"))) {
    // If we have actual limit shortfalls, or missing WC / structural gaps
    finalStatus = "Insufficient Coverage";
  } else {
    finalStatus = "Compliant";
  }

  return {
    status: finalStatus,
    errors,
  };
}
