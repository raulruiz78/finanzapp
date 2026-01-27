"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!supabase) return;
    // si ya estás logado, te manda al dashboard
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/dashboard";
    });
  }, []);

  async function onRegister() {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert("Usuario creado. Ahora haz login.");
  }

  async function onLogin() {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    window.location.href = "/dashboard";
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

        <button onClick={onLogin} style={{ padding: 10, borderRadius: 10 }}>
          Login
        </button>
        <button onClick={onRegister} style={{ padding: 10, borderRadius: 10 }}>
          Crear cuenta
        </button>
      </div>
    </main>
  );
}
