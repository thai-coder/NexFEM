import { fromDisplay, toDisplay, unitLabel, type Quantity, type UnitSystem } from "@nexfem/model-core";
import { useEffect, useId, useState, type ReactNode } from "react";

/** Định dạng số gọn: bỏ số 0 thừa, tối đa `digits` chữ số có nghĩa. */
export function fmtNum(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-4) return v.toExponential(4).replace(/\.?0+e/, "e");
  return String(Number(v.toPrecision(digits)));
}

export interface NumberFieldProps {
  /** Giá trị theo đơn vị nội bộ (kN, m). */
  value: number;
  onChange(v: number): void;
  quantity?: Quantity;
  units?: UnitSystem;
  min?: number;
  disabled?: boolean;
  label?: string;
  width?: number | string;
  testId?: string;
}

/**
 * Ô nhập số có đơn vị: hiển thị theo đơn vị người dùng, trả về giá trị nội bộ.
 * Chấp nhận dấu phẩy thập phân. Giá trị sai thì viền đỏ và không gửi đi.
 */
export function NumberField({ value, onChange, quantity, units, min, disabled, label, width, testId }: NumberFieldProps) {
  const show = (v: number) => fmtNum(quantity && units ? toDisplay(v, quantity, units) : v);
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
  }, [value, focused, units?.force, units?.length]);
  const parsed = Number(text.trim().replace(",", "."));
  const internal = quantity && units ? fromDisplay(parsed, quantity, units) : parsed;
  const invalid = text.trim() === "" || !Number.isFinite(parsed) || (min !== undefined && internal < min);
  const unit = quantity && units ? unitLabel(quantity, units) : "";
  return (
    <span className={`num-field${invalid ? " invalid" : ""}`} style={width !== undefined ? { width } : undefined}>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid}
        data-testid={testId}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (!invalid) setText(show(internal));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const p = Number(e.target.value.trim().replace(",", "."));
          const v = quantity && units ? fromDisplay(p, quantity, units) : p;
          if (e.target.value.trim() !== "" && Number.isFinite(p) && (min === undefined || v >= min)) onChange(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </span>
  );
}

/** Một dòng nhãn + ô nhập trong form. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="form-row">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <div className="form-control" id={id}>
        {children}
        {hint && <div className="form-hint">{hint}</div>}
      </div>
    </div>
  );
}
