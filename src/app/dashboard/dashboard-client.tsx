"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Country = "MY" | "SG" | "AU" | "ID";
type Currency = "MYR" | "SGD" | "AUD" | "IDR";
type Draft = {
  kind: "invoice" | "expense";
  party: string;
  description: string;
  amount: number;
  currency: Currency;
  transactionDate: string | null;
  dueDate: string | null;
  category: string;
  businessUsePercent: number;
  confidence: number;
  warnings: string[];
};
type RecordItem = { id: string; kind: string; party: string; description: string; amount: number; currency: string; date: string; status: string };
type Summary = { income: number; expenses: number; profit: number };

const today = () => new Date().toISOString().slice(0, 10);

export default function DashboardClient({ country, currency }: { country: Country; currency: Currency }) {
  const [transcript, setTranscript] = useState("Create an invoice for ABC Trading for RM1,500 for consulting services, due 25 August 2026.");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expenses: 0, profit: 0 });
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refresh = useCallback(async () => {
    const [recordResponse, summaryResponse] = await Promise.all([fetch("/api/records"), fetch("/api/reports/summary")]);
    if (recordResponse.ok) setRecords((await recordResponse.json()).records || []);
    if (summaryResponse.ok) setSummary(await summaryResponse.json());
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  async function parseTranscript() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, country }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not prepare the draft");
      setDraft(payload.draft);
      setNotice("Draft prepared. Review every field before saving.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare the draft"); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true); setNotice("");
    const common = { kind: draft.kind, party: draft.party, description: draft.description, amount: Number(draft.amount), currency: draft.currency, country, sourceTranscript: transcript };
    const body = draft.kind === "invoice"
      ? { ...common, issueDate: draft.transactionDate || today(), dueDate: draft.dueDate }
      : { ...common, expenseDate: draft.transactionDate || today(), category: draft.category || "General business", businessUsePercent: Number(draft.businessUsePercent), deductionReview: "review" };
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the record");
      setDraft(null);
      setNotice("Approved record saved with an audit entry.");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the record"); }
    finally { setBusy(false); }
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setBusy(true); setNotice("Transcribing audio...");
        const audio = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const form = new FormData(); form.append("audio", audio, "voice.webm");
        try {
          const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Transcription failed");
          setTranscript(payload.transcript); setNotice("Transcript ready. Check it before preparing a draft.");
        } catch (error) { setNotice(error instanceof Error ? error.message : "Transcription failed"); }
        finally { setBusy(false); }
      };
      recorder.current = mediaRecorder; mediaRecorder.start(); setRecording(true); setNotice("Listening... select Stop when finished.");
    } catch { setNotice("Microphone access was not available. You can type the command instead."); }
  }

  return (
    <div className="dashboard-content">
      <section className="dashboard-head"><div><p className="eyebrow">{country} WORKSPACE</p><h1>Finance control room</h1><p>Speak or type. LedgerVoice always creates a reviewable draft first.</p></div><form action="/api/stripe/portal" method="post"><button className="button ghost">Manage billing</button></form></section>

      <section className="metric-grid dashboard-metrics"><article><small>INCOME</small><strong>{currency} {summary.income.toLocaleString()}</strong></article><article><small>EXPENSES</small><strong>{currency} {summary.expenses.toLocaleString()}</strong></article><article><small>PROFIT</small><strong>{currency} {summary.profit.toLocaleString()}</strong></article></section>

      <section className="voice-workflow">
        <article className="composer panel"><p className="eyebrow">1 · CAPTURE</p><h2>What should I record?</h2><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={4000} aria-label="Voice command transcript" />
          <div className="actions"><button className={`button ghost ${recording ? "recording" : ""}`} onClick={toggleRecording} type="button">{recording ? "Stop recording" : "Use microphone"}</button><button className="button primary" onClick={parseTranscript} disabled={busy || transcript.trim().length < 3} type="button">{busy ? "Working..." : "Prepare draft"}</button></div>
          <small>Audio is sent only when you stop recording. Do not include payment-card numbers or highly sensitive personal data.</small>
        </article>

        <article className="review panel"><p className="eyebrow">2 · REVIEW</p>{draft ? <><h2>{draft.kind === "invoice" ? "Invoice" : "Expense"} draft</h2>
          <div className="form-grid"><label>Customer / merchant<input value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} /></label><label>Amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></label><label className="full">Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>Date<input type="date" value={draft.transactionDate || today()} onChange={(e) => setDraft({ ...draft, transactionDate: e.target.value })} /></label>{draft.kind === "invoice" ? <label>Due date<input type="date" value={draft.dueDate || ""} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} /></label> : <label>Category<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>}</div>
          {draft.warnings.length > 0 && <div className="notice warning">{draft.warnings.join(" ")}</div>}
          <div className="approval"><button className="button ghost" onClick={() => setDraft(null)} type="button">Discard</button><button className="button primary" onClick={saveDraft} disabled={busy} type="button">Approve and save</button></div></> : <div className="empty"><b>No draft yet</b><p>Your structured draft will appear here. Nothing is saved automatically.</p></div>}</article>
      </section>

      {notice && <div className="notice info">{notice}</div>}

      <section className="panel records"><div><p className="eyebrow">APPROVED RECORDS</p><h2>Recent activity</h2></div>{records.length ? <div className="record-table">{records.map((record) => <div className="record-row" key={`${record.kind}-${record.id}`}><span className={`record-kind ${record.kind}`}>{record.kind === "invoice" ? "INV" : "EXP"}</span><div><b>{record.party}</b><small>{record.description}</small></div><span>{record.date}</span><strong>{record.currency} {Number(record.amount).toLocaleString()}</strong><em>{record.status}</em></div>)}</div> : <div className="empty"><b>No approved records</b><p>Save your first reviewed invoice or expense to begin reporting.</p></div>}</section>

      <section className="tax-warning"><b>Tax module boundary</b><p>LedgerVoice can organize transactions, surface evidence gaps and calculate a planning estimate only after a jurisdiction-specific rule set is validated. It does not file returns or replace a licensed tax adviser.</p></section>
    </div>
  );
}
