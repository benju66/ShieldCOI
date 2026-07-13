import React, { useRef } from "react";
import { formatUSD } from "../utils/currency";

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Current numeric value. `null`/`undefined` renders as an empty field. */
  value: number | null | undefined;
  /** Receives the parsed numeric value (or `blankValue` when the field is cleared). */
  onChange: (value: number | null) => void;
  /**
   * The value emitted when the field is cleared, and the value that renders as
   * an empty field (so placeholders can show). Defaults to 0; pass `null` for
   * fields that distinguish "not entered" from "$0".
   */
  blankValue?: number | null;
}

/**
 * A dollar-value text box: shows the value formatted as US currency
 * ("$1,250,000") while still behaving like a plain editable field. Users type
 * digits; grouping separators and the "$" are applied live, and the caret is
 * preserved across reformatting.
 */
export default function CurrencyInput({
  value,
  onChange,
  blankValue = 0,
  inputMode = "numeric",
  ...rest
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const isBlank = value === null || value === undefined || value === blankValue;
  const display = isBlank ? "" : formatUSD(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;

    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      onChange(blankValue);
    } else {
      onChange(parseInt(digits, 10));
    }

    // The controlled value is re-derived and reformatted on the next render, which
    // would drop the caret to the end. Restore it after that commit by counting
    // digits rather than raw character offsets.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const formatted = el.value;
      let seen = 0;
      let pos = formatted.length;
      if (digitsBeforeCaret === 0) {
        pos = 0;
      } else {
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            seen++;
            if (seen === digitsBeforeCaret) {
              pos = i + 1;
              break;
            }
          }
        }
      }
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      value={display}
      onChange={handleChange}
      {...rest}
    />
  );
}
