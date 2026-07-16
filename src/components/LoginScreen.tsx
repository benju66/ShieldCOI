import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "../AuthContext";
import { supabaseConfigured } from "../supabaseClient";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password);
        if (error) setError(error);
      } else {
        const { error, needsConfirmation } = await signUp(email.trim(), password);
        if (error) setError(error);
        else if (needsConfirmation) setCheckEmail(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Brand */}
        <div className="p-5 border-b border-slate-100 flex items-center space-x-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 font-display tracking-tight">
              <span className="text-blue-600 font-black tracking-wider uppercase">Shield</span>{" "}
              <span className="text-slate-800 uppercase tracking-wide">COI</span>
            </h1>
            <p className="text-[10px] text-slate-500">Certificate of insurance compliance</p>
          </div>
        </div>

        {checkEmail ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm font-bold text-slate-800">Check your email</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              We sent a confirmation link to <span className="font-semibold">{email}</span>. Confirm it,
              then sign in.
            </p>
            <button
              type="button"
              onClick={() => {
                setCheckEmail(false);
                setMode("signin");
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-[11px] font-bold text-slate-700 mb-1">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-[11px] font-bold text-slate-700 mb-1">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-none rounded p-2 text-slate-800"
              />
            </div>

            {error && (
              <p id="login-error" className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </p>
            )}
            {!supabaseConfigured && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Supabase isn't configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              id="login-submit"
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-xs uppercase tracking-wide cursor-pointer transition-all disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>

            <p className="text-[11px] text-slate-500 text-center pt-1">
              {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {mode === "signin" ? "Create one" : "Sign in"}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
