import Link from "next/link";

const features = [
  ["Voice to draft", "Speak an invoice or expense. AI structures it without posting anything automatically."],
  ["Review and approve", "Confirm the customer, amount, dates and business purpose before the record is saved."],
  ["Private business records", "Every workspace is isolated by PostgreSQL row-level security."],
  ["Tax-review preparation", "Prepare evidence and planning estimates for MY, SG, AU and ID; filing stays with a qualified professional."]
];

export default function Home() {
  return (
    <main>
      <header className="nav wrap">
        <Link className="brand" href="/"><span>LV</span> LedgerVoice AI</Link>
        <nav><a href="#features">Features</a><a href="#security">Security</a><a href="#pricing">Pricing</a></nav>
        <Link className="button ghost" href="/login">Sign in</Link>
      </header>

      <section className="hero wrap">
        <div>
          <p className="eyebrow">FINANCE ADMIN, SPOKEN INTO ORDER</p>
          <h1>Your business numbers,<br /><em>without the admin pile-up.</em></h1>
          <p className="lead">Create invoices, capture expenses, monitor income and prepare tax-review working papers from a controlled voice workflow.</p>
          <div className="actions"><Link className="button primary" href="/login">Start 14-day trial</Link><a className="button ghost" href="#features">See how it works</a></div>
          <p className="fine">Card required · RM79/month after trial · Cancel anytime</p>
        </div>
        <div className="hero-card">
          <div className="voice-demo"><b>●</b><span>“Create an invoice for Northstar Advisory...”</span></div>
          <div className="metric-grid"><article><small>INCOME</small><strong>RM18,600</strong></article><article><small>EXPENSES</small><strong>RM7,120</strong></article><article><small>PROFIT</small><strong>RM11,480</strong></article></div>
          <div className="draft-demo"><small>DRAFT — REVIEW REQUIRED</small><b>Cyber risk workshop</b><span>Northstar Advisory · RM4,800</span><button>Approve and save</button></div>
        </div>
      </section>

      <section className="section wrap" id="features">
        <p className="eyebrow">ONE CONTROLLED WORKFLOW</p><h2>AI prepares. You approve.</h2>
        <div className="feature-grid">{features.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="security-band" id="security"><div className="wrap security-grid"><div><p className="eyebrow">SECURITY BY DEFAULT</p><h2>Subscriber data stays separated.</h2><p>Authentication, server-side authorization, encrypted transport, signed payment webhooks, audit logs and database row-level security are included in the deployment package.</p></div><ul><li>No financial record is saved from voice without approval.</li><li>Stripe stores payment details; LedgerVoice does not.</li><li>Secret keys stay on the server and outside source control.</li><li>Tax outputs remain reviewable planning estimates.</li></ul></div></section>

      <section className="section wrap pricing" id="pricing"><div><p className="eyebrow">FOUNDING PLAN</p><h2>Simple launch pricing.</h2><p>Full finance workspace for solo operators and small teams.</p></div><article><div><small>RM</small><strong>79</strong><span>/month</span></div><p>14-day trial with card required.</p><ul><li>Voice invoice and expense drafts</li><li>Monthly and yearly reporting</li><li>Four-country tax review workspaces</li><li>CSV-ready data structure</li></ul><Link className="button primary" href="/login">Start free trial</Link></article></section>

      <footer className="footer wrap"><b>LedgerVoice AI</b><span>Planning estimates only. Not tax, legal or accounting advice.</span><small>© 2026 LedgerVoice AI</small></footer>
    </main>
  );
}
