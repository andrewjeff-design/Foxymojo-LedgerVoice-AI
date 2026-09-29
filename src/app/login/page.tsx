/* eslint-disable @next/next/no-img-element -- small static logo */
import Link from "next/link";
import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; mode?: string }> }) {
  const query = await searchParams;
  const signup = query.mode === "signup";
  return (
    <main>
      <div className="wrap">
        <nav className="topnav"><Link href="/"><img className="logo-wide" alt="Foxymojo" src="/foxymojo-wide.png" /></Link><div className="spacer" /><Link className="btn small ghost" href="/">Back</Link></nav>
        <div className="auth-wrap">
          <form className="panel">
            <div className="tabs" role="tablist" aria-label="Account">
              <Link role="tab" aria-selected={signup} href="/login?mode=signup">Create account</Link>
              <Link role="tab" aria-selected={!signup} href="/login?mode=signin">Sign in</Link>
            </div>
            <h2>{signup ? "Start your 14-day trial" : "Welcome back"}</h2>
            <p className="note">{signup
              ? "No card. You will set up your company next, and that setup is what teaches the agent your rules."
              : "Sign in with the email and password you signed up with."}</p>
            {signup && <label className="field-l" htmlFor="au-name">Your name<input id="au-name" name="name" type="text" autoComplete="name" placeholder="Jerry Yeoh" required /></label>}
            <label className="field-l" htmlFor="au-email">Work email<input id="au-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com.my" required /></label>
            {signup && <label className="field-l" htmlFor="au-company">Company<input id="au-company" name="company" type="text" placeholder="Acme Trading Sdn Bhd" required /></label>}
            <label className="field-l" htmlFor="au-password">Password<input id="au-password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required /></label>
            {query.error && <p className="notice error" role="alert">{query.error}</p>}
            {query.message && <p className="notice success">{query.message}</p>}
            <button className="btn primary" formAction={signup ? signUp : signIn}>{signup ? "Create account" : "Sign in"}</button>
          </form>
          <p className="note" style={{ textAlign: "center" }}>Just want to look around? <Link className="btn small ghost" href="/demo">Open the demo company</Link></p>
        </div>
      </div>
    </main>
  );
}
