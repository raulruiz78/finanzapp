"use client";

import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import styles from "./page.module.css";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "login" | "register" | "reset">("");

  function getAppBaseUrl() {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const base = fromEnv && fromEnv.length > 0 ? fromEnv : window.location.origin;
    return base.replace(/\/+$/, "");
  }

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
    const emailRedirectTo = `${getAppBaseUrl()}/auth/callback`;
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
    const redirectTo = `${getAppBaseUrl()}/auth/reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy("");
    if (error) return alert(error.message);
    alert("Te he enviado un email para recuperar la contraseña. Abre el enlace desde el móvil/PC.");
  }

  if (!supabaseConfigured) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.hero}>
            <div className={styles.brand}>
              <div className={styles.logo} aria-hidden />
              <div>
                <h1 className={styles.title}>FinanzApp</h1>
                <p className={styles.subtitle}>Tu gestor simple de finanzas</p>
              </div>
            </div>

            <p className={styles.subtitle}>
              Falta configurar Supabase para poder usar el login.
            </p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.title} style={{ fontSize: 18 }}>
              Configuración requerida
            </h2>
            <pre className={styles.code}>
{`Crea un archivo .env.local en finanzapp/ con:

NEXT_PUBLIC_SUPABASE_URL=... 
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Opcional (recomendado si abres el email fuera de tu máquina):
# NEXT_PUBLIC_APP_URL=https://tu-dominio-o-ngrok`}
            </pre>
            <p className={styles.note}>Luego reinicia el dev server.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.brand}>
            <div className={styles.logo} aria-hidden />
            <div>
              <h1 className={styles.title}>FinanzApp</h1>
              <p className={styles.subtitle}>Tus finanzas claras, en 1 minuto al día</p>
            </div>
          </div>

          <ul className={styles.bullets}>
            <li>Visualiza tu saldo real por cuenta</li>
            <li>Registra ingresos, gastos y transferencias</li>
            <li>Resumen mensual para ver en qué se va el dinero</li>
            <li>Categorías limpias y rápidas de gestionar</li>
          </ul>
        </div>

        <div className={styles.card}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Entrar
          </h2>
          <p className={styles.subtitle}>Email + contraseña (Supabase)</p>

          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={styles.input}
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className={styles.input}
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className={styles.actions}>
              <button
                onClick={onLogin}
                className={`${styles.button} ${styles.primary}`}
                disabled={busy === "login"}
              >
                {busy === "login" ? "Entrando…" : "Login"}
              </button>

              <button
                onClick={onRegister}
                className={`${styles.button} ${styles.secondary}`}
                disabled={busy === "register"}
              >
                {busy === "register" ? "Creando cuenta…" : "Crear cuenta"}
              </button>

              <button
                onClick={onForgotPassword}
                className={`${styles.button} ${styles.ghost}`}
                disabled={busy === "reset"}
              >
                {busy === "reset" ? "Enviando email…" : "He olvidado mi contraseña"}
              </button>
            </div>

            <p className={styles.note}>
              Si usas emails de confirmación de Supabase, revisa que tus Redirect URLs apunten a tu dominio.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
