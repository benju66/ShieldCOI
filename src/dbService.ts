import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { Project, Subcontractor, CoiRecord, Notification } from "./types";
import { verifyCompliance } from "./complianceEngine";

// Collection Paths
const PROJECTS_COL = "projects";
const NOTIFICATIONS_COL = "notifications";

/**
 * Fetch all projects
 */
export async function getProjects(): Promise<Project[]> {
  try {
    const q = query(collection(db, PROJECTS_COL), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as Project);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, PROJECTS_COL);
    return [];
  }
}

/**
 * Fetch a single project
 */
export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const dClient = doc(db, PROJECTS_COL, projectId);
    const snap = await getDoc(dClient);
    return snap.exists() ? (snap.data() as Project) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${PROJECTS_COL}/${projectId}`);
    return null;
  }
}

/**
 * Create a new project
 */
export async function createProject(project: Omit<Project, "id" | "createdAt">): Promise<Project> {
  const id = "proj_" + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const newProject: Project = { ...project, id, createdAt: now };

  try {
    await setDoc(doc(db, PROJECTS_COL, id), newProject);
    return newProject;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${PROJECTS_COL}/${id}`);
    throw err;
  }
}

/**
 * Fetch all subcontractors for a project
 */
export async function getSubcontractors(projectId: string): Promise<Subcontractor[]> {
  const path = `${PROJECTS_COL}/${projectId}/subcontractors`;
  try {
    const q = query(collection(db, db.app.options.projectId ? path : ""), orderBy("createdAt", "asc"));
    const snap = await getDocs(collection(db, PROJECTS_COL, projectId, "subcontractors"));
    return snap.docs.map((doc) => doc.data() as Subcontractor);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

/**
 * Create/Add a subcontractor to a project
 */
export async function createSubcontractor(
  projectId: string,
  sub: Omit<Subcontractor, "id" | "project_id" | "compliance_status" | "manual_override" | "override_notes" | "createdAt">
): Promise<Subcontractor> {
  const id = "sub_" + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const newSub: Subcontractor = {
    ...sub,
    id,
    project_id: projectId,
    compliance_status: "Pending Upload",
    manual_override: false,
    override_notes: "",
    createdAt: now,
  };

  const path = `${PROJECTS_COL}/${projectId}/subcontractors/${id}`;
  try {
    await setDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", id), newSub);
    return newSub;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Update subcontractor override & compliance status
 */
export async function updateSubcontractor(
  projectId: string,
  subId: string,
  updates: Partial<Subcontractor>
): Promise<void> {
  const path = `${PROJECTS_COL}/${projectId}/subcontractors/${subId}`;
  try {
    const dClient = doc(db, PROJECTS_COL, projectId, "subcontractors", subId);
    const snap = await getDoc(dClient);
    let finalUpdates = { ...updates };
    
    if (snap.exists()) {
      const currentSub = snap.data() as Subcontractor;
      const isOverrideActive = finalUpdates.manual_override !== undefined 
        ? finalUpdates.manual_override 
        : currentSub.manual_override;
      
      if (isOverrideActive) {
        finalUpdates.compliance_status = "Approved Exception";
      }
    } else {
      if (finalUpdates.manual_override) {
        finalUpdates.compliance_status = "Approved Exception";
      }
    }
    await updateDoc(dClient, finalUpdates);

    if (finalUpdates.compliance_status === "Compliant") {
      const companyName = (snap.exists() ? (snap.data() as Subcontractor).company_name : "") || "Subcontractor";
      const notifsCol = collection(db, NOTIFICATIONS_COL);
      const snapNotifs = await getDocs(notifsCol);
      for (const d of snapNotifs.docs) {
        const nData = d.data() as Notification;
        if (
          (nData.resolved === false || nData.resolved === undefined) &&
          (nData.project_id === projectId || nData.subcontractor_name === companyName)
        ) {
          await updateDoc(doc(db, NOTIFICATIONS_COL, d.id), { resolved: true });
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Update top-level project specifications
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<void> {
  const path = `${PROJECTS_COL}/${projectId}`;
  try {
    const dClient = doc(db, PROJECTS_COL, projectId);
    await updateDoc(dClient, updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Safely remove a subcontractor and all nested COIs
 */
export async function deleteSubcontractor(
  projectId: string,
  subId: string
): Promise<void> {
  const path = `${PROJECTS_COL}/${projectId}/subcontractors/${subId}`;
  try {
    // 1. Fetch all child COI documents inside subcontractor's subcollection
    const coisColRef = collection(db, PROJECTS_COL, projectId, "subcontractors", subId, "cois");
    const coisSnap = await getDocs(coisColRef);
    
    // 2. Delete each nested COI document
    for (const d of coisSnap.docs) {
      await deleteDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", subId, "cois", d.id));
    }

    // 3. Delete the subcontractor document
    await deleteDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", subId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

/**
 * cascading project deletion
 */
export async function deleteProject(projectId: string): Promise<void> {
  const path = `${PROJECTS_COL}/${projectId}`;
  try {
    // 1. Fetch all subcontractors belonging to the project
    const subsColRef = collection(db, PROJECTS_COL, projectId, "subcontractors");
    const subsSnap = await getDocs(subsColRef);

    // 2. Clear all nested entities under subcontractors
    for (const subDoc of subsSnap.docs) {
      const subId = subDoc.id;
      const coisColRef = collection(db, PROJECTS_COL, projectId, "subcontractors", subId, "cois");
      const coisSnap = await getDocs(coisColRef);
      for (const coiDoc of coisSnap.docs) {
        await deleteDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", subId, "cois", coiDoc.id));
      }
      await deleteDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", subId));
    }

    // 3. Delete parent project document
    await deleteDoc(doc(db, PROJECTS_COL, projectId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

/**
 * Get all COIs for a subcontractor
 */
export async function getCoiRecords(projectId: string, subcontractorId: string): Promise<CoiRecord[]> {
  const path = `${PROJECTS_COL}/${projectId}/subcontractors/${subcontractorId}/cois`;
  try {
    const q = query(collection(db, PROJECTS_COL, projectId, "subcontractors", subcontractorId, "cois"), orderBy("uploaded_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as CoiRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

/**
 * Add a COI record and automatically re-evaluate compliance
 */
export async function submitCoiRecord(
  projectId: string,
  subcontractorId: string,
  coiData: Omit<CoiRecord, "id" | "project_id" | "subcontractor_id" | "uploaded_at" | "validation_errors">
): Promise<CoiRecord> {
  const id = "coi_" + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  // 1. Fetch parent project and subcontractor
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project matching ID ${projectId} was not found.`);
  }

  const subRef = doc(db, PROJECTS_COL, projectId, "subcontractors", subcontractorId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) {
    throw new Error(`Subcontractor matching ID ${subcontractorId} was not found.`);
  }
  const subcontractor = subSnap.data() as Subcontractor;
  const trade = subcontractor.trade || "Other Trades";

  // 2. Perform compliance checks
  const evaluation = verifyCompliance(project, {
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
  }, trade);

  const newCoi: CoiRecord = {
    ...coiData,
    id,
    project_id: projectId,
    subcontractor_id: subcontractorId,
    uploaded_at: now,
    validation_errors: evaluation.errors,
  };

  // 3. Write critical paths
  const coiPath = `${PROJECTS_COL}/${projectId}/subcontractors/${subcontractorId}/cois/${id}`;
  try {
    // Write Coi Record
    await setDoc(doc(db, PROJECTS_COL, projectId, "subcontractors", subcontractorId, "cois", id), newCoi);

    // Update Subcontractor status (only if not manually overridden)
    const subRef = doc(db, PROJECTS_COL, projectId, "subcontractors", subcontractorId);
    const subSnap = await getDoc(subRef);
    if (subSnap.exists()) {
      const sub = subSnap.data() as Subcontractor;
      let targetStatus: Subcontractor["compliance_status"] = evaluation.status;
      let manualOverride = sub.manual_override;
      let overrideNotes = sub.override_notes || "";
      let waiverReasonType = sub.waiver_reason_type || null;
      let waiverAuthorizedBy = sub.waiver_authorized_by || null;
      let waiverExpirationDate = sub.waiver_expiration_date || null;

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

      await updateDoc(subRef, {
        compliance_status: targetStatus,
        manual_override: manualOverride,
        override_notes: overrideNotes,
        waiver_reason_type: waiverReasonType,
        waiver_authorized_by: waiverAuthorizedBy,
        waiver_expiration_date: waiverExpirationDate,
      });

      if (targetStatus === "Compliant") {
        const subName = sub.company_name || (subSnap.exists() ? (subSnap.data() as Subcontractor).company_name : "Subcontractor");
        const notifsCol = collection(db, NOTIFICATIONS_COL);
        const snapNotifs = await getDocs(notifsCol);
        for (const d of snapNotifs.docs) {
          const nData = d.data() as Notification;
          if (
            (nData.resolved === false || nData.resolved === undefined) &&
            (nData.project_id === projectId || nData.subcontractor_name === subName)
          ) {
            await updateDoc(doc(db, NOTIFICATIONS_COL, d.id), { resolved: true });
          }
        }
      }
    }

    // 4. Create Notifications for errors or status locks
    if (evaluation.errors.length > 0) {
      const subName = subSnap.exists() ? (subSnap.data() as Subcontractor).company_name : "Subcontractor";
      
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
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, coiPath);
    throw err;
  }
}

/**
 * Notifications timelines
 */
export async function getNotifications(): Promise<Notification[]> {
  try {
    const q = query(collection(db, NOTIFICATIONS_COL), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as Notification);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, NOTIFICATIONS_COL);
    return [];
  }
}

export async function createNotification(
  notif: Omit<Notification, "id" | "timestamp" | "resolved"> & { resolved?: boolean }
): Promise<Notification> {
  const id = "notif_" + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const newNotif: Notification = {
    ...notif,
    id,
    timestamp: now,
    resolved: false,
  };

  try {
    await setDoc(doc(db, NOTIFICATIONS_COL, id), newNotif);
    return newNotif;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${NOTIFICATIONS_COL}/${id}`);
    throw err;
  }
}

/**
 * Seeding Routine to make dashboard fully responsive & functional on load.
 */
export async function seedInitialData(force = false): Promise<void> {
  try {
    // Check if we already have projects to prevent duplicate seeding
    const currentProjs = await getProjects();
    if (currentProjs.length > 0 && !force) {
      console.log("Database already populated. Skipping DB Seed.");
      return;
    }

    console.log("Database is empty. Populating clean visual sample logs...");

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
    // Create ACME COI Record
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
    // Add sub record with missing limit initially
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
    // Update to show approved override
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

    console.log("Database successfully populated with visually rich interactive sample logs!");
  } catch (err) {
    console.error("Failed to seed initial collections:", err);
  }
}
