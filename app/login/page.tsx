"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setError("Falsches Passwort.");
        setLoading(false);
        return;
      }

      // Erfolgreich: zurück auf Startseite
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Login fehlgeschlagen.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="mb-4 text-xl font-semibold">MedSafe-UDI Login</h1>
        <p className="mb-4 text-sm text-slate-400">
          Zugriff nur für autorisierte Personen.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Passwort</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Wird geprüft..." : "Anmelden"}
          </button>
        </form>
      </div>
    </main>
  );
}
