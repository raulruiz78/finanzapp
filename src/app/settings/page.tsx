"use client";

import { useEffect, useMemo, useState } from "react";
import { AppTopBar } from "@/app/ui/AppTopBar";
import { formatEUR } from "@/lib/format";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";
import styles from "./page.module.css";

type TxForBalance = {
  account_id: string;
  amount: number;
  categories?: OneOrMany<CategoryJoin> | null;
};

type Profile = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  plan_needs_pct?: number | null;
  plan_wants_pct?: number | null;
  plan_savings_pct?: number | null;
};

function displayNameFromEmail(email: string) {
  const part = String(email || "").split("@")[0] || "";
  return part ? part.replace(/[._-]+/g, " ") : "";
}

export default function SettingsPage() {
  const configured = useRequireSupabaseConfigured("/");

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");

  const [password, setPassword] = useState<string>("");
  const [password2, setPassword2] = useState<string>("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string>("");

  const [planNeedsPct, setPlanNeedsPct] = useState(50);
  const [planWantsPct, setPlanWantsPct] = useState(30);
  const [planSavingsPct, setPlanSavingsPct] = useState(20);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState<string>("");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deltasAll, setDeltasAll] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/";
        return;
      }

      const userId = data.session.user.id;
      const sessionEmail = data.session.user.email ?? "";
      if (!cancelled) setEmail(sessionEmail);

      const meta = (data.session.user.user_metadata ?? {}) as Record<string, unknown>;
      const metaFirst = typeof meta.first_name === "string" ? meta.first_name : "";
      const metaFull = typeof meta.full_name === "string" ? meta.full_name : "";
      const fallbackName = metaFirst || metaFull || displayNameFromEmail(sessionEmail);
      if (!cancelled) setName(fallbackName);

      const [
        { data: profile, error: profileErr },
        { data: acc, error: accErr },
        { data: tx, error: txErr },
      ] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("first_name,last_name,full_name,plan_needs_pct,plan_wants_pct,plan_savings_pct")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("accounts")
            .select("id,name,account_type,current_balance")
            .eq("user_id", userId)
            .order("created_at"),
          supabase
            .from("transactions")
            .select("account_id,amount,categories:categories(direction)")
            .eq("user_id", userId),
        ]);

      if (profileErr && profileErr.code !== "PGRST116") {
        setPlanMessage(profileErr.message);
      }
      if (accErr) alert(accErr.message);
      if (txErr) alert(humanizeSupabaseSchemaError(txErr.message) ?? txErr.message);

      const p = (profile as Profile | null) ?? null;
      const profileName =
        (p?.first_name && String(p.first_name).trim()) ||
        (p?.full_name && String(p.full_name).trim()) ||
        fallbackName;
      if (!cancelled) setName(profileName);

      if (!cancelled) {
        const needs = Number(p?.plan_needs_pct);
        const wants = Number(p?.plan_wants_pct);
        const sav = Number(p?.plan_savings_pct);
        const ok = [needs, wants, sav].every((n) => Number.isFinite(n)) && needs + wants + sav === 100;
        if (ok) {
          setPlanNeedsPct(needs);
          setPlanWantsPct(wants);
          setPlanSavingsPct(sav);
        }
      }

      const deltas: Record<string, number> = {};
      for (const t of (((tx as unknown) as TxForBalance[]) || [])) {
        const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
        const dir = cat?.direction;
        const amt = Number(t.amount) || 0;
        const delta = dir === "INCOME" ? amt : dir === "EXPENSE" ? -amt : 0;
        deltas[t.account_id] = (deltas[t.account_id] || 0) + delta;
      }

      if (!cancelled) {
        setAccounts((acc as Account[]) || []);
        setDeltasAll(deltas);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const accountsLiveCotidiana = useMemo(() => {
    const cotidianaIds = new Set<string>();
    for (const a of accounts) {
      const t = (a as any)?.account_type as string | undefined;
      if (!t || t === "COTIDIANA") cotidianaIds.add(a.id);
    }

    return accounts
      .filter((a) => cotidianaIds.has(a.id))
      .map((a) => {
        const delta = deltasAll[a.id] || 0;
        const live = Number(a.current_balance || 0) + delta;
        return { ...a, live_balance: live } as any;
      });
  }, [accounts, deltasAll]);

  const totalBalanceCotidiana = useMemo(() => {
    return accountsLiveCotidiana.reduce((sum: number, a: any) => sum + Number(a.live_balance || 0), 0);
  }, [accountsLiveCotidiana]);

  const planIsValid = useMemo(() => {
    const values = [planNeedsPct, planWantsPct, planSavingsPct];
    if (!values.every((n) => Number.isFinite(n))) return false;
    if (!values.every((n) => n >= 0 && n <= 100)) return false;
    return planNeedsPct + planWantsPct + planSavingsPct === 100;
  }, [planNeedsPct, planWantsPct, planSavingsPct]);

  const planAmounts = useMemo(() => {
    const base = Number(totalBalanceCotidiana || 0);
    return {
      needs: (base * planNeedsPct) / 100,
      wants: (base * planWantsPct) / 100,
      savings: (base * planSavingsPct) / 100,
    };
  }, [totalBalanceCotidiana, planNeedsPct, planWantsPct, planSavingsPct]);

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function changePassword() {
    if (!supabase) return;

    setPasswordMessage("");
    const p1 = password.trim();
    const p2 = password2.trim();

    if (p1.length < 8) {
      setPasswordMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setPasswordMessage("Las contraseñas no coinciden.");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      setPassword("");
      setPassword2("");
      setPasswordMessage("Contraseña actualizada.");
    } catch (e: any) {
      setPasswordMessage(e?.message ?? "No se pudo actualizar la contraseña.");
    } finally {
      setChangingPassword(false);
    }
  }

  function getAppBaseUrl() {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const base = fromEnv && fromEnv.length > 0 ? fromEnv : window.location.origin;
    return base.replace(/\/+$/, "");
  }

  async function sendResetEmail() {
    if (!supabase) return;
    if (!email.trim()) return;

    setPasswordMessage("");
    setChangingPassword(true);
    try {
      const redirectTo = `${getAppBaseUrl()}/auth/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setPasswordMessage("Te he enviado un email para recuperar la contraseña.");
    } catch (e: any) {
      setPasswordMessage(e?.message ?? "No se pudo enviar el email de recuperación.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function saveBudgetPlan() {
    if (!supabase) return;
    setPlanMessage("");

    if (!planIsValid) {
      setPlanMessage("El plan debe sumar 100% (ej: 50/30/20).");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) {
      setPlanMessage("No autenticado");
      return;
    }

    setSavingPlan(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      plan_needs_pct: planNeedsPct,
      plan_wants_pct: planWantsPct,
      plan_savings_pct: planSavingsPct,
    });
    setSavingPlan(false);

    if (error) setPlanMessage(error.message);
    else setPlanMessage("Plan guardado.");
  }

  if (!configured || !supabaseConfigured) return null;

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <AppTopBar title="Ajustes" icon="⚙️" iconLabel="Ajustes" subtitle={loading ? "Cargando…" : undefined} backHref="/dashboard" />
        <button className={`${styles.topButton} ${styles.topDanger}`} onClick={logout} type="button">
          Cerrar sesión
        </button>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Cuenta</h2>
          <p className={styles.cardSub}>Ajustes típicos de tu usuario</p>

          <div className={styles.form}>
            <div className={styles.field}>
              <span className={styles.label}>Email</span>
              <input className={styles.input} value={email} readOnly />
              <p className={styles.help}>Este email es el que usas para entrar.</p>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new_password">
                  Nueva contraseña
                </label>
                <input
                  id="new_password"
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new_password2">
                  Repite la contraseña
                </label>
                <input
                  id="new_password2"
                  className={styles.input}
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.primary}`} onClick={changePassword} disabled={changingPassword} type="button">
                {changingPassword ? "Guardando…" : "Cambiar contraseña"}
              </button>

              <button className={`${styles.button} ${styles.ghost}`} onClick={sendResetEmail} disabled={changingPassword || !email} type="button">
                Enviar email de recuperación
              </button>
            </div>

            {passwordMessage ? (
              <p className={passwordMessage.includes("actualizada") || passwordMessage.includes("enviado") ? styles.success : styles.error}>
                {passwordMessage}
              </p>
            ) : null}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Plan de ahorro</h2>
          <p className={styles.cardSub}>Configura 50/30/20 (o tu propia proporción) sobre el saldo de Cotidiana.</p>

          <div className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Necesidades (gastos fijos) %</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={planNeedsPct}
                  onChange={(e) => setPlanNeedsPct(Number(e.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ocio / disfrute (variable) %</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={planWantsPct}
                  onChange={(e) => setPlanWantsPct(Number(e.target.value))}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Ahorro (transferencias) %</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                step={1}
                value={planSavingsPct}
                onChange={(e) => setPlanSavingsPct(Number(e.target.value))}
              />
              <p className={styles.help}>Debe sumar 100%.</p>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.button}
                type="button"
                onClick={() => {
                  setPlanNeedsPct(50);
                  setPlanWantsPct(30);
                  setPlanSavingsPct(20);
                }}
              >
                Aplicar 50/30/20
              </button>

              <button
                className={`${styles.button} ${styles.primary}`}
                type="button"
                disabled={!planIsValid || savingPlan}
                onClick={saveBudgetPlan}
              >
                {savingPlan ? "Guardando…" : "Guardar"}
              </button>
            </div>

            {!planIsValid ? <p className={styles.error}>Los porcentajes deben estar entre 0 y 100 y sumar 100.</p> : null}
            {planMessage ? (
              <p className={planMessage === "Plan guardado." ? styles.success : styles.error}>{planMessage}</p>
            ) : null}

            <div>
              <p className={styles.help} style={{ marginTop: 10 }}>
                Saldo Cotidiana (actual): <strong>{loading ? "…" : formatEUR(totalBalanceCotidiana)}</strong>
              </p>
              <div className={styles.chips}>
                <span className={styles.chip}>Necesidades: {loading ? "…" : formatEUR(planAmounts.needs)}</span>
                <span className={styles.chip}>Ocio: {loading ? "…" : formatEUR(planAmounts.wants)}</span>
                <span className={styles.chip}>Ahorro: {loading ? "…" : formatEUR(planAmounts.savings)}</span>
              </div>
              <p className={styles.help} style={{ marginTop: 10 }}>
                Si quieres, crea una cuenta tipo <strong>Ahorro</strong> y haz transferencias mensuales.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Accesos rápidos</h2>
          <p className={styles.cardSub}>Atajos útiles</p>
          <div className={styles.form}>
            <a className={styles.link} href="/accounts">
              → Gestionar cuentas
            </a>
            <a className={styles.link} href="/categories">
              → Gestionar categorías
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
