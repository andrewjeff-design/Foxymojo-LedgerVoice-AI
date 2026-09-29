const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

export const money = (n: number) => "RM " + Number(n || 0).toLocaleString("en-US", two);
export const whole = (n: number) => "RM " + Math.round(Number(n || 0)).toLocaleString("en-US");
/* accountants' negatives: (1,234.00) */
export const signed = (n: number) => (n < 0 ? "(" + Math.abs(n).toLocaleString("en-US", two) + ")" : Number(n).toLocaleString("en-US", two));

export const csvOf = (rows: unknown[][]) => rows.map((r) => r.map((v) => "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\"").join(",")).join("\n");
