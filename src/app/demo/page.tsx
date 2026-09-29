import LedgerApp from "@/components/ledger/LedgerApp";

export const metadata = { title: "Demo company · Ledger VoiceAI" };

/* The seeded demo books run entirely in the browser: no account, no server, no model. */
export default function DemoPage() {
  return <LedgerApp mode="demo" title="Ledger VoiceAI" planLabel="demo" person="" />;
}
