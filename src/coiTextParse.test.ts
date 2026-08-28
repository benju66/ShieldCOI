import { describe, it, expect } from "vitest";
import {
  parseMoney,
  textLayerValues,
  crossCheckFields,
  CROSS_CHECKED_FIELDS,
  TextLayerField,
} from "./coiTextParse";

const field = (name: string, value: number | null, text = ""): TextLayerField => ({
  field: name,
  page: 1,
  box_2d: [0, 0, 10, 10],
  text,
  value,
});

describe("parseMoney", () => {
  it("reads the shapes that appear on a certificate", () => {
    expect(parseMoney("$1,000,000")).toBe(1_000_000);
    expect(parseMoney("2,000,000")).toBe(2_000_000);
    expect(parseMoney("$ 1,000,000")).toBe(1_000_000);
    expect(parseMoney("1000000")).toBe(1_000_000);
    expect(parseMoney("0")).toBe(0);
  });

  it("returns null rather than guessing at anything ambiguous", () => {
    // A wrong second opinion is worse than no second opinion: if this guessed,
    // it would manufacture disagreements against a correct AI reading.
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("N/A")).toBeNull();
    expect(parseMoney("INCLUDED")).toBeNull();
    expect(parseMoney("1,00,000")).toBeNull();
    expect(parseMoney("06/11/2027")).toBeNull();
    expect(parseMoney("$1,000,000 CSL")).toBeNull();
  });
});

describe("textLayerValues", () => {
  it("keeps only fields that parsed to a number", () => {
    const values = textLayerValues([
      field("gl_each_occurrence", 1_000_000),
      field("insured_name", null),
      field("policy_expiration_date", null),
    ]);
    expect(values).toEqual({ gl_each_occurrence: 1_000_000 });
  });

  it("keeps the first reading when a label repeats across pages", () => {
    const values = textLayerValues([
      field("gl_each_occurrence", 1_000_000),
      field("gl_each_occurrence", 5_000_000),
    ]);
    expect(values.gl_each_occurrence).toBe(1_000_000);
  });
});

describe("crossCheckFields", () => {
  it("confirms a field both sources read the same", () => {
    const result = crossCheckFields({ gl_each_occurrence: 1_000_000 }, { gl_each_occurrence: 1_000_000 });
    expect(result.agreed).toContain("gl_each_occurrence");
    expect(result.disputed).toEqual([]);
  });

  it("disputes a field the two sources read differently", () => {
    // The case that matters: the AI misread a digit and nothing else would catch it.
    const result = crossCheckFields({ gl_each_occurrence: 100_000 }, { gl_each_occurrence: 1_000_000 });
    expect(result.disputed).toContain("gl_each_occurrence");
    expect(result.agreed).toEqual([]);
  });

  it("does not claim confirmation when only one source read the field", () => {
    const result = crossCheckFields({ umbrella_limit: 5_000_000 }, { gl_each_occurrence: 1_000_000 });
    expect(result.unverified).toContain("umbrella_limit");
    expect(result.agreed).not.toContain("umbrella_limit");
    expect(result.disputed).not.toContain("umbrella_limit");
  });

  it("treats a null AI reading as unverified, never as agreement", () => {
    const result = crossCheckFields({ gl_each_occurrence: null }, { gl_each_occurrence: 1_000_000 });
    expect(result.unverified).toContain("gl_each_occurrence");
  });

  it("reports no text layer for a photo or scan", () => {
    // Photos, scans, and faxes carry no text layer at all. The UI depends on
    // this flag to say "single source" instead of implying a confirmation.
    const result = crossCheckFields({ gl_each_occurrence: 1_000_000 }, {});
    expect(result.hadTextLayer).toBe(false);
    expect(result.agreed).toEqual([]);
    expect(result.unverified).toContain("gl_each_occurrence");
  });

  it("reports a text layer when one was read", () => {
    const result = crossCheckFields({}, { gl_each_occurrence: 1_000_000 });
    expect(result.hadTextLayer).toBe(true);
  });

  it("treats a genuine zero as a real reading, not a missing one", () => {
    const agree = crossCheckFields({ umbrella_limit: 0 }, { umbrella_limit: 0 });
    expect(agree.agreed).toContain("umbrella_limit");
    const clash = crossCheckFields({ umbrella_limit: 0 }, { umbrella_limit: 5_000_000 });
    expect(clash.disputed).toContain("umbrella_limit");
  });

  it("accounts for every field it was asked about, exactly once", () => {
    const result = crossCheckFields({ gl_each_occurrence: 1 }, { gl_each_occurrence: 2 });
    const seen = [...result.agreed, ...result.disputed, ...result.unverified];
    expect(seen.slice().sort()).toEqual([...CROSS_CHECKED_FIELDS].sort());
  });

  it("never cross-checks names or dates", () => {
    // Neither is a number, so neither can meaningfully agree or disagree.
    expect(CROSS_CHECKED_FIELDS).not.toContain("insured_name" as never);
    expect(CROSS_CHECKED_FIELDS).not.toContain("policy_expiration_date" as never);
  });
});
