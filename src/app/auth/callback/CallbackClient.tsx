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
  return { access_token, refresh_token };
}

export default function CallbackClient() {
  const configured = useRequireSupabaseConfigured("/");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  const hasSupabase = useMemo(() => Boolean(configured && supabaseConfigured && supabase), [configured]);

  useEffect(() => {
    if (!hasSupabase) return;

    let cancelled = false;
    (async () => {
      try {
        // Preferred flow (PKCE): ?code=...
        if (code) {
          const { error } = await supabase!.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (cancelled) return;
          setStatus("ok");
          router.replace("/dashboard");
          return;
        }

        // Fallback (implicit hash): #access_token=...&refresh_token=...
        const { access_token, refresh_token } = parseHashParams(window.location.hash);
        if (access_token && refresh_token) {
          const { error } = await supabase!.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          if (cancelled) return;
          setStatus("ok");
          router.replace("/dashboard");
          return;
        }

        if (cancelled) return;
        setStatus("error");
        setMessage("No se encontró código de autenticación en la URL.");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e?.message ?? "Error procesando la autenticación.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSupabase, code, router]);

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 720, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Confirmando…</h1>
      {status === "loading" ? (
        <p style={{ opacity: 0.75 }}>Procesando enlace de Supabase…</p>
      ) : status === "ok" ? (
        <p style={{ opacity: 0.75 }}>Listo. Redirigiendo…</p>
      ) : (
        <>
          <p style={{ color: "crimson" }}>{message}</p>
          <a href="/">Volver</a>
        </>
      )}
    </main>
  );
}
