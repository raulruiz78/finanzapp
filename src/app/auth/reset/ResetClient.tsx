"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";

export default function ResetClient() {
  const configured = useRequireSupabaseConfigured("/");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [password, setPassword] = useState<string>("");
  const [password2, setPassword2] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "done">("loading");
  const [message, setMessage] = useState<string>("");

  const hasSupabase = useMemo(() => Boolean(configured && supabaseConfigured && supabase), [configured]);

  useEffect(() => {
    if (!hasSupabase) return;
    let cancelled = false;

    (async () => {
      try {
        if (!code) {
          setStatus("error");
          setMessage("Falta el código de recuperación en la URL.");
          return;
        }

        const { error } = await supabase!.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const { data } = await supabase!.auth.getSession();
        if (!data.session) {
          setStatus("error");
          setMessage("No hay sesión activa. Vuelve a abrir el enlace de recuperación.");
          return;
        }

        if (cancelled) return;
        setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e?.message ?? "Error preparando el reseteo de contraseña.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSupabase, code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSupabase) return;

    const p1 = password.trim();
    const p2 = password2.trim();
    if (p1.length < 8) {
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase!.auth.updateUser({ password: p1 });
      if (error) throw error;
      setStatus("done");
      router.replace("/dashboard");
    } catch (e: any) {
      setMessage(e?.message ?? "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 720, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Recuperar contraseña</h1>

      {status === "loading" ? (
        <p style={{ opacity: 0.75 }}>Preparando…</p>
      ) : status === "error" ? (
        <>
          <p style={{ color: "crimson" }}>{message}</p>
          <a href="/">Volver</a>
        </>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Nueva contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Repite la contraseña</span>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {message ? <p style={{ color: "crimson", margin: 0 }}>{message}</p> : null}

          <button type="submit" disabled={busy || status !== "ready"}>
            {busy ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      )}
    </main>
  );
}
