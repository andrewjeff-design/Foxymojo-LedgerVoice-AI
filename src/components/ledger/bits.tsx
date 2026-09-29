"use client";

import { csvOf } from "@/lib/ledger/format";

export type Check = { ok: boolean; warn?: boolean; label: string };

export function CheckStrip({ items }: { items: Check[] }) {
  return <div className="checks">{items.map((c) => <span key={c.label} className={"badge " + (c.ok ? "ok" : c.warn ? "warn" : "stop")}>{c.label}</span>)}</div>;
}

/* A titled report card with its integrity checks along the bottom. */
export function ReportCard({ title, sub, checks, children, after }: { title: string; sub: string; checks?: Check[]; children: React.ReactNode; after?: React.ReactNode }) {
  return (
    <section className="report">
      <header><h2>{title}</h2><p>{sub}</p></header>
      <div className="rep-body">{children}</div>
      {checks ? <CheckStrip items={checks} /> : null}
      {after}
    </section>
  );
}

export function RepTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="rt">
      <thead><tr>{head.map((h, i) => <th key={i} className={i >= head.length - 2 && h ? "n" : undefined}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function download(filename: string, data: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadCsv = (filename: string, rows: unknown[][]) => download(filename, csvOf(rows));
