"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { WelcomeCosmos } from "@/components/welcome-cosmos";

type AuthMode = "login" | "signup";

export function WelcomePage({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  function chooseMode(nextMode: AuthMode) {
    setMode(nextMode);
    setShowPassword(false);
    router.replace(nextMode === "signup" ? "/?mode=signup" : "/?mode=login", { scroll: false });
  }

  function continueToPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/workspace");
  }

  return (
    <main className="welcome-page">
      <div className="welcome-atmosphere" aria-hidden="true">
        <WelcomeCosmos />
      </div>

      <div className="welcome-layout">
        <section className="welcome-story" aria-labelledby="welcome-title">
          <div className="welcome-brand-lockup">
            <Logo size="lg" withWordmark={false} />
            <p className="welcome-brand">KIROKU</p>
          </div>
          <h1 id="welcome-title">Make room for<br /><span>what matters.</span></h1>
        </section>

        <section className="welcome-auth-card" aria-labelledby="welcome-form-title">
          <h2 id="welcome-form-title">{mode === "login" ? "Pick up where you left off." : "Start with a little space."}</h2>
          <p className="welcome-card-description">{mode === "login" ? "Sign in to open your personal planner." : "Create your account and make this space yours."}</p>

          <div className="welcome-auth-switch" role="tablist" aria-label="Choose sign in or sign up">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => chooseMode("login")}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => chooseMode("signup")}>Sign up</button>
          </div>

          <form className="welcome-form" onSubmit={continueToPlanner}>
            {mode === "signup" && (
              <label className="welcome-field">
                <span>Your name</span>
                <input name="name" type="text" autoComplete="name" placeholder="How should we call you?" required />
              </label>
            )}
            <label className="welcome-field">
              <span>Email address</span>
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label className="welcome-field">
              <span>Password</span>
              <span className="welcome-password-wrap">
                <input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} minLength={mode === "signup" ? 8 : 1} required />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
            <button type="submit" className="welcome-submit-button">
              <span>{mode === "login" ? "Log in to Kiroku" : "Create account"}</span>
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="welcome-preview-note"><span className="welcome-preview-dot" /><p><strong>Preview mode</strong> · Login and sign up are UI only for now. Either one opens the planner.</p></div>
        </section>
      </div>

    </main>
  );
}
