/** Formatting helpers used across the calculator UI. */

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const CAD_CENTS = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat("en-CA", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const PERCENT_3 = new Intl.NumberFormat("en-CA", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatMoney(value: number, withCents = false): string {
  if (!Number.isFinite(value)) return "—";
  return withCents ? CAD_CENTS.format(value) : CAD.format(value);
}

export function formatPercent(value: number, precise = false): string {
  if (!Number.isFinite(value)) return "—";
  return precise ? PERCENT_3.format(value) : PERCENT.format(value);
}

export function formatAge(age: number): string {
  if (Number.isInteger(age)) return `${age}`;
  const years = Math.floor(age);
  const months = Math.round((age - years) * 12);
  return months === 0 ? `${years}` : `${years}y ${months}m`;
}

export function formatYearMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

export function exportToCsv(rows: Record<string, string | number>[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
