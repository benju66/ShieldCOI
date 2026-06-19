import { Project, Subcontractor, CoiRecord, Notification } from "./types";
import { verifyCompliance } from "./complianceEngine";

/**
 * Local-only data layer. All ShieldCOI records are persisted to the browser's
 * localStorage, so the app runs with no backend or login. Each visitor keeps
 * their own copy of the data. This mirrors the previous Firestore service's
 * public API exactly, so the rest of the app is unchanged.
 *
 * When migrating to Supabase later, only this file needs to be swapped out.
 */

// Storage keys
const KEY_PROJECTS = "shieldcoi_projects";
const KEY_SUBS = "shieldcoi_subcontractors";
const KEY_COIS = "shieldcoi_cois";
const KEY_NOTIFS = "shieldcoi_notifications";

// --- Persistence helpers ---
function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch (err) {
    console.error(`Failed to read "${key}" from localStorage:`, err);
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to write "${key}" to localStorage:`, err);
  }
}

function genId(prefix: string): string {
  return `${prefix}_` + Math.random().toString(36).substring(2, 9);
}

// =====================================================================
// Projects
// =====================================================================

/**
 * Fetch all projects (newest first)
 */
export async function getProjects(): Promise<Project[]> {
  const projects = read<Project>(KEY_PROJECTS);
  return projects.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/**
 * Fetch a single project
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const projects = read<Project>(KEY_PROJECTS);
  return projects.find((p) => p.id === projectId) || null;
}

/**
 * Create a new project
 */
export async function createProject(project: Omit<Project, "id" | "createdAt">): Promise<Project> {
  const id = genId("proj");
  const now = new Date().toISOString();
  const newProject: Project = { ...project, id, createdAt: now };

  const projects = read<Project>(KEY_PROJECTS);
  projects.push(newProject);
  write(KEY_PROJECTS, projects);
  return newProject;
}

/**
 * Update top-level project specifications
 */
export async function updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
  const projects = read<Project>(KEY_PROJECTS);
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) {
    throw new Error(`Project matching ID ${projectId} was not found.`);
  }
  projects[idx] = { ...projects[idx], ...updates };
  write(KEY_PROJECTS, projects);
}

/**
 * Cascading project deletion (removes nested subcontractors and COIs)
 */
export async function deleteProject(projectId: string): Promise<void> {
  write(KEY_PROJECTS, read<Project>(KEY_PROJECTS).filter((p) => p.id !== projectId));
  write(KEY_SUBS, read<Subcontractor>(KEY_SUBS).filter((s) => s.project_id !== projectId));
  write(KEY_COIS, read<CoiRecord>(KEY_COIS).filter((c) => c.project_id !== projectId));
}

// =====================================================================
// Subcontractors
// =====================================================================

/**
 * Fetch all subcontractors for a project (oldest first)
 */
export async function getSubcontractors(projectId: string): Promise<Subcontractor[]> {
  return read<Subcontractor>(KEY_SUBS)
    .filter((s) => s.project_id === projectId)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

/**
 * Create/Add a subcontractor to a project
 */
export async function createSubcontractor(
  projectId: string,
  sub: Omit<Subcontractor, "id" | "project_id" | "compliance_status" | "manual_override" | "override_notes" | "createdAt" | "vendor_type"> & { vendor_type?: "Subcontractor" | "Supplier" }
): Promise<Subcontractor> {
  const id = genId("sub");
  const now = new Date().toISOString();
  const newSub: Subcontractor = {
    ...sub,
    id,
    project_id: projectId,
    compliance_status: "Pending Upload",
    manual_override: false,
    override_notes: "",
    createdAt: now,
    vendor_type: sub.vendor_type || "Subcontractor",
  };

  const subs = read<Subcontractor>(KEY_SUBS);
  subs.push(newSub);
  write(KEY_SUBS, subs);
  return newSub;
}

/**
 * Update subcontractor override & compliance status
 */
export async function updateSubcontractor(
  projectId: string,
  subId: string,
  updates: Partial<Subcontractor>
): Promise<void> {
  const subs = read<Subcontractor>(KEY_SUBS);
  const idx = subs.findIndex((s) => s.id === subId && s.project_id === projectId);

  let finalUpdates = { ...updates };
  const currentSub = idx !== -1 ? subs[idx] : null;

  const isOverrideActive =
    finalUpdates.manual_override !== undefined
      ? finalUpdates.manual_override
      : currentSub?.manual_override;

  if (isOverrideActive) {
    finalUpdates.compliance_status = "Approved Exception";
  }

  if (idx !== -1) {
    subs[idx] = { ...subs[idx], ...finalUpdates };
    write(KEY_SUBS, subs);
  }

  if (finalUpdates.compliance_status === "Compliant") {
    const companyName = currentSub?.company_name || "Subcontractor";
    resolveNotificationsFor(projectId, companyName);
  }
}

/**
 * Safely remove a subcontractor and all nested COIs
 */
export async function deleteSubcontractor(projectId: string, subId: string): Promise<void> {
  write(
    KEY_COIS,
    read<CoiRecord>(KEY_COIS).filter((c) => !(c.project_id === projectId && c.subcontractor_id === subId))
  );
  write(
    KEY_SUBS,
    read<Subcontractor>(KEY_SUBS).filter((s) => !(s.id === subId && s.project_id === projectId))
  );
}

// =====================================================================
// COI Records
// =====================================================================

/**
 * Get all COIs for a subcontractor (newest first)
 */
export async function getCoiRecords(projectId: string, subcontractorId: string): Promise<CoiRecord[]> {
  return read<CoiRecord>(KEY_COIS)
    .filter((c) => c.project_id === projectId && c.subcontractor_id === subcontractorId)
    .sort((a, b) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));
}

/**
 * Add a COI record and automatically re-evaluate compliance
 */
export async function submitCoiRecord(
  projectId: string,
  subcontractorId: string,
  coiData: Omit<CoiRecord, "id" | "project_id" | "subcontractor_id" | "uploaded_at" | "validation_errors">
): Promise<CoiRecord> {
  const id = genId("coi");
  const now = new Date().toISOString();

  // 1. Fetch parent project and subcontractor
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project matching ID ${projectId} was not found.`);
  }

  const subs = read<Subcontractor>(KEY_SUBS);
  const subIdx = subs.findIndex((s) => s.id === subcontractorId && s.project_id === projectId);
  if (subIdx === -1) {
    throw new Error(`Subcontractor matching ID ${subcontractorId} was not found.`);
  }
  const subcontractor = subs[subIdx];
  const trade = subcontractor.trade || "Other Trades";

  // 2. Perform compliance checks
  const evaluation = verifyCompliance(
    project,
    {
      insured_name: coiData.insured_extracted_name,
      gl_each_occurrence: coiData.gl_occurrence_extracted,
      gl_general_aggregate: coiData.gl_aggregate_extracted,
      auto_combined_single_limit: coiData.auto_combined_single_limit_extracted,
      workers_comp_statutory: coiData.workers_comp_statutory_extracted,
      policy_expiration_date: coiData.policy_expiration_date_extracted,
      gl_products_completed: coiData.gl_products_completed_extracted,
      umbrella_limit: coiData.umbrella_limit_extracted,
      employers_liability_accident: coiData.employers_liability_accident_extracted,
      employers_liability_disease_person: coiData.employers_liability_disease_person_extracted,
      employers_liability_disease_limit: coiData.employers_liability_disease_limit_extracted,
      professional_liability: coiData.professional_liability_extracted,
      pollution_liability: coiData.pollution_liability_extracted,
    },
    trade
  );

  const newCoi: CoiRecord = {
    ...coiData,
    id,
    project_id: projectId,
    subcontractor_id: subcontractorId,
    uploaded_at: now,
    validation_errors: evaluation.errors,
  };

  // 3. Write the COI record
  const cois = read<CoiRecord>(KEY_COIS);
  cois.push(newCoi);
  write(KEY_COIS, cois);

  // 4. Update subcontractor status (honoring active manual overrides / waivers)
  let targetStatus: Subcontractor["compliance_status"] = evaluation.status;
  let manualOverride = subcontractor.manual_override;
  let overrideNotes = subcontractor.override_notes || "";
  let waiverReasonType = subcontractor.waiver_reason_type || null;
  let waiverAuthorizedBy = subcontractor.waiver_authorized_by || null;
  let waiverExpirationDate = subcontractor.waiver_expiration_date || null;

  if (manualOverride) {
    if (evaluation.status === "Compliant") {
      manualOverride = false;
      targetStatus = "Compliant";
      overrideNotes = "";
      waiverReasonType = null;
      waiverAuthorizedBy = null;
      waiverExpirationDate = null;
    } else {
      const currentDateStr = "2026-06-11";
      const today = new Date(currentDateStr);
      let isWaiverExpired = false;

      if (waiverExpirationDate) {
        const expDate = new Date(waiverExpirationDate);
        if (expDate <= today) {
          isWaiverExpired = true;
        }
      }

      if (isWaiverExpired) {
        manualOverride = false;
        targetStatus = "Expired";
        overrideNotes = "";
        waiverReasonType = null;
        waiverAuthorizedBy = null;
        waiverExpirationDate = null;
      } else {
        targetStatus = "Approved Exception";
      }
    }
  }

  subs[subIdx] = {
    ...subs[subIdx],
    compliance_status: targetStatus,
    manual_override: manualOverride,
    override_notes: overrideNotes,
    waiver_reason_type: waiverReasonType,
    waiver_authorized_by: waiverAuthorizedBy,
    waiver_expiration_date: waiverExpirationDate,
  };
  write(KEY_SUBS, subs);

  if (targetStatus === "Compliant") {
    resolveNotificationsFor(projectId, subcontractor.company_name || "Subcontractor");
  }

  // 5. Create notifications for errors or status locks
  if (evaluation.errors.length > 0) {
    const subName = subcontractor.company_name || "Subcontractor";

    let alertType: "danger" | "warning" | "info" = "warning";
    if (evaluation.status === "Expired") alertType = "danger";
    else if (evaluation.status === "Insufficient Coverage") alertType = "warning";

    await createNotification({
      project_id: projectId,
      project_name: project.name,
      subcontractor_name: subName,
      type: alertType,
      message: "Draft email message ready. Click to view and copy.",
    });
  }

  return newCoi;
}

// =====================================================================
// Notifications
// =====================================================================

/**
 * Mark unresolved notifications matching a project/subcontractor as resolved.
 */
function resolveNotificationsFor(projectId: string, subcontractorName: string): void {
  const notifs = read<Notification>(KEY_NOTIFS);
  let changed = false;
  for (const n of notifs) {
    if (
      (n.resolved === false || n.resolved === undefined) &&
      (n.project_id === projectId || n.subcontractor_name === subcontractorName)
    ) {
      n.resolved = true;
      changed = true;
    }
  }
  if (changed) write(KEY_NOTIFS, notifs);
}

/**
 * Notifications timeline (newest first)
 */
export async function getNotifications(): Promise<Notification[]> {
  return read<Notification>(KEY_NOTIFS).sort((a, b) =>
    (b.timestamp || "").localeCompare(a.timestamp || "")
  );
}

export async function createNotification(
  notif: Omit<Notification, "id" | "timestamp" | "resolved"> & { resolved?: boolean }
): Promise<Notification> {
  const id = genId("notif");
  const now = new Date().toISOString();
  const newNotif: Notification = {
    ...notif,
    id,
    timestamp: now,
    resolved: notif.resolved ?? false,
  };

  const notifs = read<Notification>(KEY_NOTIFS);
  notifs.push(newNotif);
  write(KEY_NOTIFS, notifs);
  return newNotif;
}

// =====================================================================
// Seeding
// =====================================================================

/**
 * Seeding routine to make the dashboard fully responsive & functional on load.
 */
export async function seedInitialData(force = false): Promise<void> {
  try {
    // Check if we already have projects to prevent duplicate seeding
    const currentProjs = await getProjects();
    if (currentProjs.length > 0 && !force) {
      console.log("Local store already populated. Skipping seed.");
      return;
    }

    if (force) {
      // Reset all collections for a clean re-seed
      write(KEY_PROJECTS, []);
      write(KEY_SUBS, []);
      write(KEY_COIS, []);
      write(KEY_NOTIFS, []);
    }

    console.log("Local store is empty. Populating clean visual sample logs...");

    // Project 1
    const p1 = await createProject({
      name: "Aurora Luxury Suites",
      number: "P-2026-01",
      target_completion_date: "2026-12-31",
      requirements: {
        gl_occurrence: 2000000,
        gl_aggregate: 4000000,
        auto_limit: 1000000,
        workers_comp: true,
        warn_days_out: 60,
        gl_products_completed: 2000000,
        umbrella_limit: 1000000,
        employers_liability_accident: 1000000,
        employers_liability_disease_person: 1000000,
        employers_liability_disease_limit: 1000000,
      },
    });

    // Sub 1A - Compliant
    const sub1A = await createSubcontractor(p1.id, {
      company_name: "ACME Electrical Solutions LLC",
      trade: "Electrical",
      contract_value: 385000,
    });
    await submitCoiRecord(p1.id, sub1A.id, {
      file_name: "ACORD25_ACME_Electrical.pdf",
      insured_extracted_name: "ACME Electrical Solutions LLC",
      gl_occurrence_extracted: 2000000,
      gl_aggregate_extracted: 4000000,
      auto_combined_single_limit_extracted: 1000000,
      workers_comp_statutory_extracted: true,
      policy_expiration_date_extracted: "2026-09-15", // In 96 days
      gl_products_completed_extracted: 2000000,
      umbrella_limit_extracted: 5000000, // Meets the $5M required override for Electrical trade
      employers_liability_accident_extracted: 1000000,
      employers_liability_disease_person_extracted: 1000000,
      employers_liability_disease_limit_extracted: 1000000,
      professional_liability_extracted: 2000000, // Meets professional liability required for Electrical
      pollution_liability_extracted: 0,
    });

    // Sub 1B - Insufficient Coverage
    const sub1B = await createSubcontractor(p1.id, {
      company_name: "Apex Plumbing & Piping Co.",
      trade: "Plumbing",
      contract_value: 240000,
    });
    await submitCoiRecord(p1.id, sub1B.id, {
      file_name: "Apex_Plumbing_COI_2026.pdf",
      insured_extracted_name: "Apex Plumbing & Piping Co.",
      gl_occurrence_extracted: 1000000, // short of $2M req
      gl_aggregate_extracted: 2000000, // short of $4M req
      auto_combined_single_limit_extracted: 500000, // short of $1M req
      workers_comp_statutory_extracted: false, // missing wc
      policy_expiration_date_extracted: "2026-11-20",
      gl_products_completed_extracted: 2000000,
      umbrella_limit_extracted: 5000000,
      employers_liability_accident_extracted: 1000000,
      employers_liability_disease_person_extracted: 1000000,
      employers_liability_disease_limit_extracted: 1000000,
      professional_liability_extracted: 2000000,
      pollution_liability_extracted: 2000000,
    });

    // Sub 1C - Expired
    const sub1C = await createSubcontractor(p1.id, {
      company_name: "Titan Structural Steel Corp",
      trade: "Other Trades",
      contract_value: 710000,
    });
    await submitCoiRecord(p1.id, sub1C.id, {
      file_name: "titan_steel_insurance_acord.png",
      insured_extracted_name: "Titan Structural Steel Corp",
      gl_occurrence_extracted: 5000000,
      gl_aggregate_extracted: 10000000,
      auto_combined_single_limit_extracted: 2000000,
      workers_comp_statutory_extracted: true,
      policy_expiration_date_extracted: "2026-05-10", // Expired Relative to June 11, 2026
      gl_products_completed_extracted: 2000000,
      umbrella_limit_extracted: 1000000,
      employers_liability_accident_extracted: 1000000,
      employers_liability_disease_person_extracted: 1000000,
      employers_liability_disease_limit_extracted: 1000000,
      professional_liability_extracted: 0,
      pollution_liability_extracted: 0,
    });

    // Project 2
    const p2 = await createProject({
      name: "Evergreen Business Park",
      number: "P-2026-02",
      target_completion_date: "2027-06-15",
      requirements: {
        gl_occurrence: 1000000,
        gl_aggregate: 2000000,
        auto_limit: 1000000,
        workers_comp: true,
        warn_days_out: 30,
        gl_products_completed: 2000000,
        umbrella_limit: 1000000,
        employers_liability_accident: 1000000,
        employers_liability_disease_person: 1000000,
        employers_liability_disease_limit: 1000000,
      },
    });

    // Sub 2A - Compliant
    const sub2A = await createSubcontractor(p2.id, {
      company_name: "Solid Ground Concrete Works",
      trade: "Concrete (Standard)",
      contract_value: 190000,
    });
    await submitCoiRecord(p2.id, sub2A.id, {
      file_name: "solid_ground_concrete_acord25.pdf",
      insured_extracted_name: "Solid Ground Concrete Works",
      gl_occurrence_extracted: 2000000,
      gl_aggregate_extracted: 4000000,
      auto_combined_single_limit_extracted: 1000000,
      workers_comp_statutory_extracted: true,
      policy_expiration_date_extracted: "2027-01-15",
      gl_products_completed_extracted: 2000000,
      umbrella_limit_extracted: 5000000, // Meets concrete trade limit 5M
      employers_liability_accident_extracted: 1000000,
      employers_liability_disease_person_extracted: 1000000,
      employers_liability_disease_limit_extracted: 1000000,
      professional_liability_extracted: 0,
      pollution_liability_extracted: 2000000, // Meets concrete trade pollution limit 2M
    });

    // Sub 2B - Compliant via Exception (Manual Override)
    const sub2B = await createSubcontractor(p2.id, {
      company_name: "Vortex Mechanical Services",
      trade: "HVAC",
      contract_value: 125000,
    });
    await submitCoiRecord(p2.id, sub2B.id, {
      file_name: "vortex_hvac_coi_draft.pdf",
      insured_extracted_name: "Vortex Mechanical LLC",
      gl_occurrence_extracted: 1000000,
      gl_aggregate_extracted: 1500000, // short of $2M req
      auto_combined_single_limit_extracted: 1000000,
      workers_comp_statutory_extracted: true,
      policy_expiration_date_extracted: "2026-11-01",
      gl_products_completed_extracted: 1500000,
      umbrella_limit_extracted: 1000000, // short of trade required umbrella
      employers_liability_accident_extracted: 1000000,
      employers_liability_disease_person_extracted: 1000000,
      employers_liability_disease_limit_extracted: 1000000,
      professional_liability_extracted: 2000000,
      pollution_liability_extracted: 2000000,
    });
    await updateSubcontractor(p2.id, sub2B.id, {
      manual_override: true,
      compliance_status: "Compliant",
      override_notes: "Approved via Exception: Risk Committee reviewed low risk installation height. Exemption granted by Project Manager.",
    });

    // Project 3
    const p3 = await createProject({
      name: "Summit Heights Canopy",
      number: "P-2026-03",
      target_completion_date: "2026-10-01",
      requirements: {
        gl_occurrence: 3000000,
        gl_aggregate: 5000005,
        auto_limit: 2000000,
        workers_comp: true,
        warn_days_out: 90,
        gl_products_completed: 2000000,
        umbrella_limit: 1000000,
        employers_liability_accident: 1000000,
        employers_liability_disease_person: 1000000,
        employers_liability_disease_limit: 1000000,
      },
    });

    // Sub 3A - Pending
    await createSubcontractor(p3.id, {
      company_name: "Summit Roofing Specialists",
      trade: "Roofing",
      contract_value: 145000,
    });

    // Seed introductory notifications explicitly
    await createNotification({
      project_id: p1.id,
      project_name: "Aurora Luxury Suites",
      subcontractor_name: "Titan Structural Steel Corp",
      type: "danger",
      message: "Alert: Titan Structural Steel general liability policy expired on 2026-05-10. Work holds apply.",
    });

    await createNotification({
      project_id: p1.id,
      project_name: "Aurora Luxury Suites",
      subcontractor_name: "Apex Plumbing & Piping Co.",
      type: "warning",
      message: "Warning: Apex Plumbing Insurance Limits ($1M/$500k) do not meet Project threshold requirements.",
    });

    console.log("Local store successfully populated with visually rich interactive sample logs!");
  } catch (err) {
    console.error("Failed to seed initial collections:", err);
  }
}
