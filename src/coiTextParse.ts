/**
 * Second, independent reading of a certificate.
 *
 * The AI extraction in api/_scan.ts is one source. For a true digital PDF we
 * also have the text layer, which can be read deterministically: ACORD 25 is a
 * standardized form, so the coverage labels ("EACH OCCURRENCE", ...) are fixed
 * text and each value sits on the same row in the LIMITS column. Anchoring on
 * those labels gives an exact per-certificate reading with no model involved.
 *
 * Two independent readings that agree is real evidence. Two that disagree is a
 * question for a human. IMPORTANT: only true digital PDFs have a text layer —
 * photos, scans, and faxed certificates yield nothing here, and the UI must say
 * "single source" rather than implying a confirmation that never happened.
 */

// A bounding box for one extracted field, so the matrix can be tied back to the
// document. Coordinates follow Gemini's convention: [ymin, xmin, ymax, xmax]
// normalized to 0-1000, relative to the given (1-based) page.
export interface FieldLocation {
  field: string;
  page?: number;
  box_2d: number[]; // [ymin, xmin, ymax, xmax]
}

/** A field located in the text layer, with the literal text that was read. */
export interface TextLayerField extends FieldLocation {
  page: number;
  /** The raw token as it appears on the certificate, e.g. "$1,000,000". */
  text: string;
  /** Parsed dollar amount, or null when the token is not a money value. */
  value: number | null;
}

/**
 * Parse a money token off a certificate. Deliberately strict: anything that is
 * not unambiguously a dollar figure returns null rather than a guess, because a
 * wrong second opinion is worse than no second opinion.
 */
export function parseMoney(raw: string): number | null {
  const s = (raw || "").trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (!s) return null;
  const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
  const plain = /^\d+(\.\d+)?$/.test(s);
  if (!grouped && !plain) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function boxOf(it: any, vp: { width: number; height: number }): number[] {
  const e = it.transform[4];
  const f = it.transform[5];
  const w = it.width || 0;
  const h = it.height || Math.hypot(it.transform[2] || 0, it.transform[3] || 0) || 8;
  return [
    ((vp.height - (f + h)) / vp.height) * 1000, // ymin (top)
    (e / vp.width) * 1000, // xmin
    ((vp.height - f) / vp.height) * 1000, // ymax (bottom)
    ((e + w) / vp.width) * 1000, // xmax
  ];
}

const padBox = (b: number[], dy: number, dx: number): number[] => [
  Math.max(0, b[0] - dy),
  Math.max(0, b[1] - dx),
  Math.min(1000, b[2] + dy),
  Math.min(1000, b[3] + dx),
];

/**
 * Locate the ACORD 25 fields in one page's text layer, returning both where each
 * value sits (for the highlight overlay) and what it says (for the cross-check).
 * `items` are pdf.js text items; `vp` is the scale-1 viewport.
 */
export function deriveFieldsFromText(
  items: any[],
  vp: { width: number; height: number },
  page: number
): TextLayerField[] {
  const norm = items
    .filter((it) => it && Array.isArray(it.transform) && (it.str || "").trim())
    .map((it) => ({
      str: (it.str as string).trim(),
      x: (it.transform[4] / vp.width) * 1000,
      y: ((vp.height - it.transform[5]) / vp.height) * 1000,
      box: boxOf(it, vp),
    }));
  const isMoney = (s: string) => /^\$?\s*\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
  const money = norm.filter((o) => isMoney(o.str));
  const labels = (re: RegExp) => norm.filter((o) => re.test(o.str)).sort((a, b) => a.y - b.y);
  const valueRightOf = (lab: { x: number; y: number }, tol = 12) =>
    money.filter((m) => Math.abs(m.y - lab.y) < tol && m.x > lab.x).sort((a, b) => a.x - b.x)[0];

  const out: TextLayerField[] = [];
  const push = (field: string, hit?: { str: string; box: number[] }) => {
    if (!hit) return;
    out.push({ field, page, box_2d: padBox(hit.box, 3, 4), text: hit.str, value: parseMoney(hit.str) });
  };

  // "EACH OCCURRENCE" appears twice: GL (upper) and Umbrella (lower).
  const eaOcc = labels(/^each occurrence$/i);
  if (eaOcc[0]) push("gl_each_occurrence", valueRightOf(eaOcc[0]));
  if (eaOcc[1]) push("umbrella_limit", valueRightOf(eaOcc[1]));

  const simple: [string, RegExp][] = [
    ["gl_general_aggregate", /^general aggregate$/i],
    ["gl_products_completed", /products\s*-?\s*comp/i],
    ["auto_combined_single_limit", /combined single limit/i],
    ["employers_liability_accident", /e\.?l\.?\s*each accident/i],
    ["employers_liability_disease_person", /e\.?l\.?\s*disease\s*-?\s*ea employee/i],
    ["employers_liability_disease_limit", /e\.?l\.?\s*disease\s*-?\s*policy limit/i],
  ];
  for (const [field, re] of simple) {
    const lab = labels(re)[0];
    if (lab) push(field, valueRightOf(lab));
  }

  // INSURED name: box the block just below the standalone "INSURED" label (left
  // column). Location only — a name is not a number, so it is never cross-checked.
  const insuredLab = norm.filter((o) => /^insured$/i.test(o.str) && o.x < 250).sort((a, b) => a.y - b.y)[0];
  if (insuredLab) {
    out.push({
      field: "insured_name",
      page,
      box_2d: [insuredLab.y + 8, Math.max(2, insuredLab.x - 4), Math.min(1000, insuredLab.y + 62), 480],
      text: "",
      value: null,
    });
  }

  // Policy expiration: date in the POLICY EXP column on the GL row.
  const polExp = labels(/policy\s*exp/i)[0];
  if (polExp && eaOcc[0]) {
    const glY = eaOcc[0].y;
    const dateItem = norm
      .filter((o) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(o.str) && Math.abs(o.y - glY) < 14 && Math.abs(o.x - polExp.x) < 90)
      .sort((a, b) => Math.abs(a.x - polExp.x) - Math.abs(b.x - polExp.x))[0];
    if (dateItem) {
      out.push({ field: "policy_expiration_date", page, box_2d: padBox(dateItem.box, 3, 4), text: dateItem.str, value: null });
    } else {
      out.push({
        field: "policy_expiration_date",
        page,
        box_2d: [glY - 8, Math.max(0, polExp.x - 6), glY + 12, polExp.x + 84],
        text: "",
        value: null,
      });
    }
  }

  // Additional insured: the DESCRIPTION OF OPERATIONS block.
  const desc = labels(/description of operations\s*\/\s*locations/i)[0];
  if (desc) {
    out.push({
      field: "additional_insured",
      page,
      box_2d: [Math.min(985, desc.y + 14), 20, Math.min(998, desc.y + 120), 980],
      text: "",
      value: null,
    });
  }

  return out;
}

/** Locations only — the highlight overlay does not care what the values say. */
export function deriveLocationsFromText(
  items: any[],
  vp: { width: number; height: number },
  page: number
): FieldLocation[] {
  return deriveFieldsFromText(items, vp, page).map(({ field, page: p, box_2d }) => ({ field, page: p, box_2d }));
}

/** Numeric readings keyed by field name, as read from the text layer. */
export type TextLayerValues = Record<string, number>;

/** Collapse located fields into the numeric readings worth cross-checking. */
export function textLayerValues(fields: TextLayerField[]): TextLayerValues {
  const out: TextLayerValues = {};
  for (const f of fields) {
    // First reading wins: a later page repeating a label is not more authoritative.
    if (f.value !== null && !(f.field in out)) out[f.field] = f.value;
  }
  return out;
}

/** Numeric fields worth a second opinion (names and dates are not comparable). */
export const CROSS_CHECKED_FIELDS = [
  "gl_each_occurrence",
  "gl_general_aggregate",
  "gl_products_completed",
  "auto_combined_single_limit",
  "umbrella_limit",
  "employers_liability_accident",
  "employers_liability_disease_person",
  "employers_liability_disease_limit",
] as const;

export interface CrossCheck {
  /** Both readings agree — the strongest evidence this app can offer. */
  agreed: string[];
  /** The two readings conflict. Not a shortfall; a question for a human. */
  disputed: string[];
  /** Only one source could read it, so nothing was confirmed either way. */
  unverified: string[];
  /** False when there was no text layer at all (photo, scan, fax). */
  hadTextLayer: boolean;
}

/**
 * Compare the AI reading against the text-layer reading, field by field.
 *
 * Only fields BOTH sources produced a number for can agree or disagree. A field
 * only one source read is "unverified" — reported honestly rather than quietly
 * counted as confirmed, which would claim a confidence we never earned.
 */
export function crossCheckFields(
  aiValues: Record<string, number | null | undefined>,
  textValues: TextLayerValues,
  fields: readonly string[] = CROSS_CHECKED_FIELDS
): CrossCheck {
  const hadTextLayer = Object.keys(textValues).length > 0;
  const agreed: string[] = [];
  const disputed: string[] = [];
  const unverified: string[] = [];

  for (const field of fields) {
    const ai = aiValues[field];
    const text = textValues[field];
    const aiRead = typeof ai === "number" && Number.isFinite(ai);
    const textRead = typeof text === "number" && Number.isFinite(text);

    if (!aiRead || !textRead) {
      unverified.push(field);
    } else if (ai === text) {
      agreed.push(field);
    } else {
      disputed.push(field);
    }
  }

  return { agreed, disputed, unverified, hadTextLayer };
}
