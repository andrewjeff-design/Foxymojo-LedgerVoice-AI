import Link from "next/link";
import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/"><span>LV</span> LedgerVoice AI</Link>
        <p className="eyebrow">SECURE WORKSPACE</p><h1>Sign in or create your account.</h1>
        <p>New accounts receive a private workspace. The 14-day trial starts only after Stripe Checkout confirms a card.</p>
        {query.error && <div className="notice error">{query.error}</div>}
        {query.message && <div className="notice success">{query.message}</div>}
        <form className="auth-form">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          <button className="button primary" formAction={signIn}>Sign in</button>
          <button className="button ghost" formAction={signUp}>Create account</button>
        </form>
        <small>Use test data until Stripe and your production security review are complete.</small>
      </section>
    </main>
  );
}
