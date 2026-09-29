/* Where the books live. The demo keeps them in this browser; a signed-in company keeps them
   on the server, which re-runs the rule engine before anything is stored. The screens talk to
   either through the same interface. */

import { DEMO_ENTITIES, DEMO_TODAY, FX_RATES } from "@/lib/ledger/catalog";
import { entryFromInvoice, entryFromTx, nextInvoiceNo, withPostedTurnover } from "@/lib/ledger/entries";
import { closeStatus } from "@/lib/ledger/modules";
import { propose, proposeInvoice } from "@/lib/ledger/rules";
import { buildSeed } from "@/lib/ledger/seed";
import type { CloseState, Entity, Entry, InvoiceInput, RuleContext, TxInput } from "@/lib/ledger/types";

export type Snapshot = { entities: Entity[]; entries: Entry[]; close: CloseState; today: string };

export type PostRequest =
  | { kind: "tx"; entityId: string; input: TxInput; utterance: string; approver: string; decision: "posted" | "rejected" }
  | { kind: "invoice"; entityId: string; input: InvoiceInput; utterance: string; approver: string; decision: "posted" | "rejected" };

export type CloseRequest =
  | { action: "tick" | "untick"; entityId: string; month: string; item: string }
  | { action: "signoff"; entityId: string; month: string; name: string }
  | { action: "reopen"; entityId: string; month: string };

export type AiClient = {
  extract: (mode: "tx" | "invoice", text: string, entityId: string) => Promise<TxInput | InvoiceInput>;
  ask: (question: string, entityId: string) => Promise<string>;
  commentary: (entityId: string, from: string | null, to: string, label: string) => Promise<string>;
  transcribe: (audio: Blob, lang: string) => Promise<string>;
};

export interface LedgerStore {
  kind: "demo" | "live";
  load(): Promise<Snapshot>;
  post(req: PostRequest): Promise<void>;
  decide(entryId: string, approver: string, decision: "posted" | "rejected"): Promise<void>;
  draftBank(entityId: string, rows: TxInput[], utterances: string[]): Promise<number>;
  close(req: CloseRequest): Promise<void>;
  reset?(): Promise<void>;
  ai: AiClient | null;
}

/* The rule context the screens preview with: the same one the server builds. */
export function previewContext(snap: Snapshot, entityId: string, floor = 0): RuleContext {
  const base = withPostedTurnover({ entityId, entities: snap.entities, fx: FX_RATES, today: snap.today }, snap.entries);
  return { ...base, nextInvoiceNo: () => nextInvoiceNo(snap.entries, entityId, floor) };
}

/* ---------------------------------------------------------------- demo */

const DEMO_KEY = "ledger-voiceai:demo:v1";
type DemoState = { entries: Entry[]; close: CloseState };

const seedState = (): DemoState => ({
  entries: buildSeed({ entityId: "acme", entities: DEMO_ENTITIES, fx: FX_RATES, today: DEMO_TODAY }),
  close: { ticks: {}, signoffs: {} }
});

function readDemo(): DemoState {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (Array.isArray(parsed.entries) && parsed.close) return parsed;
    }
  } catch { /* storage blocked or corrupt: start again from the seed */ }
  return seedState();
}

function writeDemo(state: DemoState) {
  try { window.localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch { /* private mode: the session still works */ }
}

export function createDemoStore(): LedgerStore {
  let state: DemoState | null = null;
  const get = () => (state ||= readDemo());
  const save = (s: DemoState) => { state = s; writeDemo(s); };
  const snap = (): Snapshot => ({ entities: DEMO_ENTITIES, entries: get().entries, close: get().close, today: DEMO_TODAY });
  const stamp = () => new Date().toISOString().slice(0, 19);

  return {
    kind: "demo",
    ai: null,
    async load() { return snap(); },
    async post(req) {
      const s = snap();
      /* the demo company's invoices continue from its seeded numbering */
      const ctx = previewContext(s, req.entityId, req.entityId === "acme" ? 240 : 0);
      const common = { id: "e" + Date.now(), at: stamp(), today: DEMO_TODAY, entityId: req.entityId, approver: req.approver, status: req.decision, utterance: req.utterance };
      let entry: Entry;
      if (req.kind === "tx") {
        const res = propose({ ...req.input, entity_id: req.entityId }, ctx);
        if (req.decision === "posted" && res.approval.blocked) throw new Error("The rule engine blocked this entry.");
        entry = entryFromTx(res, req.input, common);
      } else {
        const res = proposeInvoice({ ...req.input, entity_id: req.entityId }, ctx);
        if (req.decision === "posted" && res.approval.blocked) throw new Error("The rule engine blocked this invoice.");
        entry = entryFromInvoice(res, req.input, common);
      }
      save({ ...get(), entries: [entry, ...get().entries] });
    },
    async decide(entryId, approver, decision) {
      save({ ...get(), entries: get().entries.map((e) => (e.id === entryId && e.status === "draft" ? { ...e, status: decision, approver, lines: decision === "posted" ? e.lines : [] } : e)) });
    },
    async draftBank(entityId, rows, utterances) {
      const ctx = previewContext(snap(), entityId);
      const made: Entry[] = [];
      rows.forEach((tx, i) => {
        const res = propose({ ...tx, entity_id: entityId }, ctx);
        if (!res.balanced || res.approval.blocked) return;
        const e = entryFromTx(res, tx, { id: "bank-" + Date.now() + "-" + i, at: stamp(), today: DEMO_TODAY, entityId, approver: "", status: "draft",
          utterance: "Imported from the bank statement: \"" + (utterances[i] || "") + "\"" });
        e.badges = res.flags.map((f) => f.text).slice(0, 2);
        made.push(e);
      });
      save({ ...get(), entries: [...get().entries, ...made] });
      return made.length;
    },
    async close(req) {
      const s = get();
      const ticks = { ...(s.close.ticks[req.entityId] || {}) };
      const signoffs = { ...(s.close.signoffs[req.entityId] || {}) };
      if (req.action === "tick") ticks[req.month + ":" + req.item] = true;
      if (req.action === "untick") delete ticks[req.month + ":" + req.item];
      if (req.action === "reopen") delete signoffs[req.month];
      if (req.action === "signoff") {
        const entity = DEMO_ENTITIES.find((e) => e.id === req.entityId);
        const cs = closeStatus(s.entries.filter((e) => e.entityId === req.entityId), req.month, { ticks, sstRegistered: entity?.sstRegistered });
        if (!cs.ready) throw new Error("Items are still open.");
        signoffs[req.month] = { by: req.name, on: DEMO_TODAY };
      }
      save({ ...s, close: { ticks: { ...s.close.ticks, [req.entityId]: ticks }, signoffs: { ...s.close.signoffs, [req.entityId]: signoffs } } });
    },
    async reset() { save(seedState()); }
  };
}

/* ---------------------------------------------------------------- live */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Request failed (" + res.status + ")") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(data) });

export function createApiStore(): LedgerStore {
  return {
    kind: "live",
    async load() { return call<Snapshot>("/api/ledger"); },
    async post(req) { await call("/api/ledger/entries", json(req)); },
    async decide(entryId, approver, decision) { await call("/api/ledger/entries/" + encodeURIComponent(entryId), json({ approver, decision })); },
    async draftBank(entityId, rows, utterances) { return (await call<{ made: number }>("/api/ledger/drafts", json({ entityId, rows, utterances }))).made; },
    async close(req) { await call("/api/ledger/close", json(req)); },
    ai: {
      async extract(mode, text, entityId) { return (await call<{ fields: TxInput | InvoiceInput }>("/api/ai/extract", json({ mode, text, entityId }))).fields; },
      async ask(question, entityId) { return (await call<{ text: string }>("/api/ai/ask", json({ question, entityId }))).text; },
      async commentary(entityId, from, to, label) { return (await call<{ text: string }>("/api/ai/commentary", json({ entityId, from, to, label }))).text; },
      async transcribe(audio, lang) {
        const form = new FormData();
        form.append("audio", audio, "voice.webm");
        form.append("lang", lang);
        return (await call<{ transcript: string }>("/api/voice/transcribe", { method: "POST", body: form })).transcript;
      }
    }
  };
}
