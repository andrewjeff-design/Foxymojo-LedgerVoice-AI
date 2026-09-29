/* eslint-disable @next/next/no-img-element -- small static logos, served as-is */
import Link from "next/link";
import { LandingPricing } from "@/components/Plans";

const FEATURES: [string, string, string][] = [
  ["Capture", "Speak, don't type", "Voice or text in three languages. The model only fills in fields — it never decides your tax."],
  ["Rules", "Malaysian rule engine", "MPERS sections 17, 20, 23, 30 and 33, service tax at 8% and 6%, imported services self-accounted, thresholds watched."],
  ["Billing", "Invoices by voice", "Say who to bill and for what. You get a numbered invoice with tax, terms and the journal behind it, MyInvois-ready."],
  ["Reports", "Statements that tie", "Trial balance, P&L, balance sheet and cash flow footed from the journals, each showing its own integrity check."],
  ["Control", "Approvals and audit trail", "Every entry keeps the words spoken, the rules applied, the version that decided and the name that approved."],
  ["Group", "Multi-entity and FX", "Mirror entries between companies, elimination tags, translation to your reporting currency, Bursa diligence flags."]
];

export default function Home() {
  return (
    <main>
      <div className="wrap">
        <nav className="topnav">
          <img className="logo-wide" alt="Foxymojo" src="/foxymojo-wide.png" />
          <div className="navlinks"><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#trust">How it works</a></div>
          <div className="spacer" />
          <Link className="btn small ghost" href="/login">Sign in</Link>
          <Link className="btn small primary" href="/login?mode=signup">Start free trial</Link>
        </nav>

        <header className="lead">
          <p className="eyebrow">Ledger VoiceAI · a Foxymojo product</p>
          <h1>Say it once. It posts correctly.</h1>
          <p className="sub">Malaysian bookkeeping you can talk to. Speak a transaction or an invoice in English, Bahasa Melayu or 中文 — the agent fills the fields, a Malaysian rule engine decides the accounting and the tax, and nothing posts until someone named approves it.</p>
          <div className="cta-row">
            <Link className="btn primary" href="/login?mode=signup">Start the 14-day trial</Link>
            <Link className="btn ghost" href="/demo">Explore with demo data</Link>
          </div>
          <p className="trust"><span>MPERS · SST · MyInvois</span><span>Multi-entity with FX</span><span>Audit trail on every entry</span><span>No card to start</span></p>
        </header>

        <div className="band" id="features">
          <h2>What it does</h2>
          <p className="sub">Six things a Malaysian SME actually needs, and nothing it doesn&apos;t.</p>
          <div className="grid3">
            {FEATURES.map(([tag, title, body]) => (
              <div className="fcard" key={title}><span className="tagline">{tag}</span><h3>{title}</h3><p>{body}</p></div>
            ))}
          </div>
        </div>

        <div className="band" id="trust">
          <h2>How it works</h2>
          <div className="steps3">
            <div><strong>Say it</strong><p>&ldquo;Invoice Klinik Mawar RM8,000 for the September retainer, 30 days.&rdquo;</p></div>
            <div><strong>Check it</strong><p>The agent shows the journal, the tax, the rules it used and anything it is unsure about.</p></div>
            <div><strong>Approve it</strong><p>You put your name to it. It posts, the reports move, the audit trail keeps the evidence.</p></div>
          </div>
        </div>

        <div className="band" id="pricing">
          <h2>Pricing</h2>
          <p className="sub">Per company, billed in ringgit. Fourteen days free, no card. Prices exclude 8% service tax.</p>
          <LandingPricing />
          <p className="note" style={{ marginTop: 10 }}>Voice capture, the Malaysian rule pack, reports and the audit trail are in every plan. Usage above the included documents is billed at the add-on rate, or upgrade whenever it makes sense.</p>
        </div>

        <footer className="foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <img className="logo-mark" alt="Foxymojo" src="/foxymojo-mark.png" />
            <span className="note">Ledger VoiceAI is a Foxymojo product. Foxymojo PLT, Malaysia.</span>
          </div>
          <p>Accounts are protected by row-level security, payments are handled by Stripe, and every posted entry is immutable. MyInvois submission needs your own LHDN credentials and is not switched on yet.</p>
          <p>Rules as at 24 Sep 2026. Not tax advice: confirm every treatment with your tax agent.</p>
        </footer>
      </div>
    </main>
  );
}
