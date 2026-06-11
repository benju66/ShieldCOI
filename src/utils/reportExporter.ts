import { Subcontractor } from "../types";

/**
 * Escapes characters for CSV format (wraps in double quotes and doubles existing double quotes).
 */
function sanitizeCSVField(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) {
    return '""';
  }
  const str = String(val);
  // Double any double quotes inside the string, and wrap the whole thing in quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Compiles active subcontractor array into a comma-separated CSV text string
 * and triggers an instant browser download.
 */
export function exportToCSV(
  projectName: string,
  projectNumber: string,
  subcontractors: Subcontractor[]
): void {
  // Define CSV headers
  const headers = [
    "Project Number",
    "Project Name",
    "Subcontractor Company",
    "Trade Scope",
    "Contract Value",
    "Compliance Status",
    "Manual Override Active",
    "Override Reason Notes"
  ];

  // Map subcontractors to rows
  const rows = subcontractors.map((sub) => [
    sanitizeCSVField(projectNumber),
    sanitizeCSVField(projectName),
    sanitizeCSVField(sub.company_name),
    sanitizeCSVField(sub.trade),
    sanitizeCSVField(sub.contract_value),
    sanitizeCSVField(sub.compliance_status),
    sanitizeCSVField(sub.manual_override ? "Yes" : "No"),
    sanitizeCSVField(sub.override_notes || "")
  ]);

  // Join headers and rows with newlines
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(","))
  ].join("\n");

  // Create standard octet-stream BLOB
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  
  // Create download link element
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  // Format filename: [ProjectNumber]_Insurance_Compliance_Report.csv
  const sanitizedProjNum = projectNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  link.setAttribute("href", url);
  link.setAttribute("download", `${sanitizedProjNum}_Insurance_Compliance_Report.csv`);
  link.style.visibility = "hidden";
  
  // Append to document, trigger, and cleanup
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
