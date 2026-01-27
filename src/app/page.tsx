"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "login" | "register" | "reset">("");

  useEffect(() => {
    if (!supabase) return;
    // si ya estás logado, te manda al dashboard
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/dashboard";
    });
  }, []);

  async function onRegister() {
    if (!supabase) return;
    setBusy("register");
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    setBusy("");
    if (error) return alert(error.message);
    alert("Usuario creado. Revisa tu email para confirmar la cuenta.");
  }

  async function onLogin() {
    if (!supabase) return;
    setBusy("login");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy("");
    if (error) return alert(error.message);
    window.location.href = "/dashboard";
  }

  async function onForgotPassword() {
    if (!supabase) return;
    if (!email.trim()) return alert("Escribe tu email primero.");

    setBusy("reset");
    const redirectTo = `${window.location.origin}/auth/reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy("");
    if (error) return alert(error.message);
    alert("Te he enviado un email para recuperar la contraseña. Abre el enlace desde el móvil/PC.");
  }

  if (!supabaseConfigured) {
    return (
      <main style={{ maxWidth: 680, margin: "60px auto", fontFamily: "system-ui" }}>
        <h1>FinanzApp</h1>
        <p style={{ opacity: 0.8 }}>
          Falta configurar Supabase para poder usar el login.
        </p>
        <pre
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            background: "#0b1020",
            color: "#e5e7eb",
            overflowX: "auto",
          }}
        >
{`Crea un archivo .env.local en finanzapp/ con:

NEXT_PUBLIC_SUPABASE_URL=... 
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}
        </pre>
        <p style={{ opacity: 0.7, marginTop: 12 }}>
          Luego reinicia el dev server.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>FinanzApp</h1>
      <p style={{ opacity: 0.7 }}>Login con email + password (Supabase)</p>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <button onClick={onLogin} style={{ padding: 10, borderRadius: 10 }} disabled={busy === "login"}>
          {busy === "login" ? "Entrando…" : "Login"}
        </button>

        <button onClick={onRegister} style={{ padding: 10, borderRadius: 10 }} disabled={busy === "register"}>
          {busy === "register" ? "Creando…" : "Crear cuenta"}
        </button>

        <button
          onClick={onForgotPassword}
          style={{ padding: 10, borderRadius: 10, background: "transparent", border: "1px solid #ddd" }}
          disabled={busy === "reset"}
        >
          {busy === "reset" ? "Enviando email…" : "He olvidado mi contraseña"}
        </button>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
        Nota: en Supabase debes añadir <code>/auth/callback</code> y <code>/auth/reset</code> a tus Redirect URLs.
      </p>
    </main>
  );
}
