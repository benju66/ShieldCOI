import { RefreshCw } from "lucide-react";
import { useAuth } from "./AuthContext";
import { SettingsProvider } from "./SettingsContext";
import LoginScreen from "./components/LoginScreen";
import App from "./App";

/**
 * Top-level gate: waits for the auth session, shows the login screen when signed
 * out, and the app (with settings loaded) when signed in.
 */
export default function Root() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-4" />
        <span className="text-xs text-slate-500">Loading…</span>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}
