"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";

function parseHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const type = params.get("type");
  return { access_token, refresh_token, type };
}

export default function ResetClient() {
  const configured = useRequireSupabaseConfigured("/");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");

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
        // 1) PKCE flow: /auth/reset?code=...
        if (code) {
          const { error } = await supabase!.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash) {
          // 2) Token-hash flow: /auth/reset?token_hash=...&type=recovery
          const type = (typeParam || "recovery") as any;
          const { error } = await supabase!.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
        } else {
          // 3) Implicit flow: /auth/reset#access_token=...&refresh_token=...
          const { access_token, refresh_token } = parseHashParams(window.location.hash);
          if (access_token && refresh_token) {
            const { error } = await supabase!.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          } else {
            setStatus("error");
            setMessage(
              "El enlace de recuperación no trae credenciales (code/token_hash/access_token). Pide un nuevo email de recuperación e inténtalo de nuevo."
            );
            return;
          }
        }

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
  }, [hasSupabase, code, token_hash, typeParam]);

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
