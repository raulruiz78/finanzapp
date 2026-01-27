"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import styles from "../page.module.css";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "ok" | null>(null);

  function getAppBaseUrl() {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const base = fromEnv && fromEnv.length > 0 ? fromEnv : window.location.origin;
    return base.replace(/\/+$/, "");
  }

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!email.trim()) return false;
    if (!firstName.trim()) return false;
    if (!lastName.trim()) return false;
    if (password.trim().length < 8) return false;
    if (password.trim() !== password2.trim()) return false;
    return true;
  }, [busy, email, firstName, lastName, password, password2]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/dashboard";
    });
  }, []);

  async function onSubmit() {
    if (!supabase) return;

    setMessage(null);
    setMessageType(null);

    const e = email.trim();
    const fn = firstName.trim();
    const ln = lastName.trim();
    const p1 = password.trim();
    const p2 = password2.trim();

    if (!e) {
      setMessageType("error");
      setMessage("Escribe tu email.");
      return;
    }
    if (!fn || !ln) {
      setMessageType("error");
      setMessage("Escribe tu nombre y apellidos.");
      return;
    }
    if (p1.length < 8) {
      setMessageType("error");
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setMessageType("error");
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      const emailRedirectTo = `${getAppBaseUrl()}/auth/callback`;
      const { error } = await supabase.auth.signUp({
        email: e,
        password: p1,
        options: {
          emailRedirectTo,
          data: {
            first_name: fn,
            last_name: ln,
            full_name: `${fn} ${ln}`.trim(),
          },
        },
      });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
        return;
      }

      setMessageType("ok");
      setMessage("Cuenta creada. Revisa tu email para confirmar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseConfigured) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.hero}>
            <div className={styles.brand}>
              <div className={styles.logo} aria-hidden>
                <img
                  className={styles.logoImg}
                  src="/icono.png"
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = "/icon-192.png";
                  }}
                />
              </div>
              <div>
                <h1 className={styles.title}>FinanzApp</h1>
                <p className={styles.subtitle}>Crea tu cuenta</p>
              </div>
            </div>
            <p className={styles.subtitle}>Ahora mismo no se puede crear la cuenta.</p>
          </div>

          <div className={styles.card}>
            <h2 className={styles.title} style={{ fontSize: 18 }}>
              Servicio no disponible
            </h2>
            <p className={styles.subtitle}>Estamos teniendo un problema técnico. Prueba de nuevo más tarde.</p>
            <a
              href="/"
              className={`${styles.button} ${styles.ghost}`}
              style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
            >
              Volver
            </a>
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
            <div className={styles.logo} aria-hidden>
              <img
                className={styles.logoImg}
                src="/icono.png"
                alt=""
                onError={(e) => {
                  e.currentTarget.src = "/icon-192.png";
                }}
              />
            </div>
            <div>
              <h1 className={styles.title}>Crear cuenta</h1>
              <p className={styles.subtitle}>Empieza a ordenar tus finanzas</p>
            </div>
          </div>

          <ul className={styles.bullets}>
            <li>Nombre y apellidos para personalizar tu perfil</li>
            <li>Tus datos son privados (cada usuario ve lo suyo)</li>
            <li>Podrás confirmar el email si es necesario</li>
          </ul>

          <a
            href="/"
            className={`${styles.button} ${styles.ghost}`}
            style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
          >
            Ya tengo cuenta
          </a>
        </div>

        <div className={styles.card}>
          <h2 className={styles.title} style={{ fontSize: 18 }}>
            Registro
          </h2>
          <p className={styles.subtitle}>Completa tus datos para crear la cuenta</p>

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
              <label className={styles.label} htmlFor="firstName">
                Nombre
              </label>
              <input
                id="firstName"
                className={styles.input}
                placeholder="Tu nombre"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="lastName">
                Apellidos
              </label>
              <input
                id="lastName"
                className={styles.input}
                placeholder="Tus apellidos"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className={styles.input}
                placeholder="Mínimo 8 caracteres"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password2">
                Confirmar contraseña
              </label>
              <input
                id="password2"
                className={styles.input}
                placeholder="Repite la contraseña"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {message ? (
              <p
                className={styles.note}
                style={{
                  marginTop: 2,
                  opacity: 1,
                  color: messageType === "error" ? "#fca5a5" : "#86efac",
                }}
              >
                {message}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                onClick={onSubmit}
                className={`${styles.button} ${styles.primary}`}
                disabled={!canSubmit}
              >
                {busy ? "Creando cuenta…" : "Crear cuenta"}
              </button>

              <a
                href="/"
                className={`${styles.button} ${styles.secondary}`}
                style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
              >
                Volver al login
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
