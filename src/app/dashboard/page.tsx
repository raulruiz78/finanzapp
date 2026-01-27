"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import { formatEUR } from "@/lib/format";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";
import styles from "./page.module.css";

type Tx = {
  account_id: string;
  amount: number;
  ym: string;
  tx_date?: string | null;
  created_at?: string | null;
  description?: string | null;
  transfer_group_id?: string | null;
  categories?: OneOrMany<CategoryJoin> | null;
};

type Profile = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function minusOneMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 1);
  return d;
}

function safeDateLabel(txDate?: string | null, createdAt?: string | null) {
  const d = txDate ? new Date(txDate) : createdAt ? new Date(createdAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function displayNameFromEmail(email: string) {
  const part = String(email || "").split("@")[0] || "";
  return part ? part.replace(/[._-]+/g, " ") : "";
}

export default function Dashboard() {
  const configured = useRequireSupabaseConfigured("/");
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [ym] = useState(currentYM());
  const [savingsFrom, setSavingsFrom] = useState(() => isoDate(minusOneMonth(new Date())));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deltasAll, setDeltasAll] = useState<Record<string, number>>({});
  const [monthTxs, setMonthTxs] = useState<Tx[]>([]);
  const [allTxs, setAllTxs] = useState<Tx[]>([]);

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
        { data: acc, error: accErr },
        { data: allTx, error: allTxErr },
        { data: mTx, error: mTxErr },
        { data: profile, error: profileErr },
      ] =
        await Promise.all([
          supabase
            .from("accounts")
            .select("id,name,current_balance")
            .eq("user_id", userId)
            .order("created_at"),
          supabase
            .from("transactions")
            .select("account_id,amount,ym,tx_date,created_at,transfer_group_id,categories:categories(direction)")
            .eq("user_id", userId),
          supabase
            .from("transactions")
            .select(
              "account_id,amount,ym,tx_date,created_at,description,transfer_group_id,categories:categories(name,direction,amount)"
            )
            .eq("user_id", userId)
            .eq("ym", ym),
          supabase.from("profiles").select("first_name,last_name,full_name").eq("user_id", userId).maybeSingle(),
        ]);

      if (accErr) alert(accErr.message);
      if (allTxErr) alert(humanizeSupabaseSchemaError(allTxErr.message) ?? allTxErr.message);
      if (mTxErr) alert(humanizeSupabaseSchemaError(mTxErr.message) ?? mTxErr.message);
      if (profileErr && profileErr.code !== "PGRST116") {
        // PGRST116 = No rows found; ok when profiles isn't created yet.
        // We'll fallback to auth.user_metadata / email.
      }

      if (!cancelled) setAccounts((acc as Account[]) || []);

      const p = (profile as Profile | null) ?? null;
      const profileName =
        (p?.first_name && String(p.first_name).trim()) ||
        (p?.full_name && String(p.full_name).trim()) ||
        fallbackName;
      if (!cancelled) setName(profileName);

      const all = (((allTx as unknown) as Tx[]) || []);
      const deltas: Record<string, number> = {};
      for (const t of all) {
        const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
        const dir = cat?.direction;
        const amt = Number(t.amount) || 0;
        const delta = dir === "INCOME" ? amt : dir === "EXPENSE" ? -amt : 0;
        deltas[t.account_id] = (deltas[t.account_id] || 0) + delta;
      }

      if (!cancelled) {
        setDeltasAll(deltas);
        setMonthTxs((mTx as Tx[]) || []);
        setAllTxs(all);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ym]);

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const accountsLive = useMemo(() => {
    return accounts
      .map((a) => {
        const delta = deltasAll[a.id] || 0;
        const live = Number(a.current_balance || 0) + delta;
        return { ...a, live_balance: live, delta };
      })
      .sort((a, b) => b.live_balance - a.live_balance);
  }, [accounts, deltasAll]);

  const totalBalance = useMemo(() => {
    return accountsLive.reduce((sum, a) => sum + a.live_balance, 0);
  }, [accountsLive]);

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) map[a.id] = a.name;
    return map;
  }, [accounts]);

  const monthStats = useMemo(() => {
    let income = 0;
    let fixedOut = 0;
    let variableOut = 0;
    let otherOut = 0;
    let transferOut = 0;
    let transferIn = 0;

    for (const t of monthTxs) {
      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      const amt = Number(t.amount) || 0;
      const isTransfer = Boolean(t.transfer_group_id);
      const isFixed =
        !isTransfer &&
        cat?.name &&
        t.description &&
        String(t.description).trim() === String(cat.name).trim() &&
        Number(cat.amount ?? NaN) === amt;

      if (dir === "INCOME") {
        if (isTransfer) transferIn += amt;
        else income += amt;
      } else if (dir === "EXPENSE") {
        if (isTransfer) transferOut += amt;
        else if (isFixed) fixedOut += amt;
        else variableOut += amt;
      } else {
        otherOut += 0;
      }
    }

    const expensesNoTransfer = fixedOut + variableOut + otherOut;
    const savings = income - expensesNoTransfer;

    return {
      income,
      fixedOut,
      variableOut,
      otherOut,
      transferOut,
      transferIn,
      expensesNoTransfer,
      savings,
    };
  }, [monthTxs]);

  const rangeStats = useMemo(() => {
    const from = new Date(`${savingsFrom}T00:00:00`);
    const to = new Date();

    let income = 0;
    let expenses = 0;

    for (const t of allTxs) {
      const d = t.tx_date ? new Date(t.tx_date) : t.created_at ? new Date(t.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      if (d < from || d > to) continue;

      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      const amt = Number(t.amount) || 0;
      const isTransfer = Boolean(t.transfer_group_id);
      if (isTransfer) continue;

      if (dir === "INCOME") income += amt;
      else if (dir === "EXPENSE") expenses += amt;
    }

    return {
      income,
      expenses,
      savings: income - expenses,
      toLabel: isoDate(to),
    };
  }, [allTxs, savingsFrom]);

  const savingsRate = useMemo(() => {
    if (!monthStats.income) return 0;
    return Math.max(0, Math.min(1, monthStats.savings / monthStats.income));
  }, [monthStats.income, monthStats.savings]);

  const recentTxs = useMemo(() => {
    const items = [...monthTxs];
    items.sort((a, b) => {
      const da = a.tx_date ? new Date(a.tx_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.tx_date ? new Date(b.tx_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
    return items.slice(0, 8);
  }, [monthTxs]);

  if (!configured || !supabaseConfigured) return null;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true" />
          <div className={styles.brandText}>
            <h1 className={styles.appName}>FinanzApp</h1>
            <p className={styles.kicker}>Mes {ym} · {email}</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <button onClick={logout} className={styles.logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <h2 className={styles.heroHello}>Hola{loading ? "" : name ? `, ${name}` : ""}.</h2>
            <p className={styles.heroSub}>
              Un vistazo rápido a tu dinero: saldo total, resumen del mes y movimientos recientes.
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <p className={styles.heroMetricLabel}>Saldo total (actual)</p>
            <div className={styles.heroMetricValue}>{loading ? "…" : formatEUR(totalBalance)}</div>
            <p className={styles.heroSub}>
              Ahorro del mes: <strong>{loading ? "…" : formatEUR(monthStats.savings)}</strong>
            </p>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Ingresos (mes)</p>
            <div className={`${styles.kpiValue} ${styles.kpiValuePositive}`}>{loading ? "…" : `+${formatEUR(monthStats.income)}`}</div>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Gastos fijos</p>
            <div className={`${styles.kpiValue} ${styles.kpiValueNegative}`}>{loading ? "…" : `-${formatEUR(monthStats.fixedOut)}`}</div>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Gastos variables</p>
            <div className={`${styles.kpiValue} ${styles.kpiValueNegative}`}>{loading ? "…" : `-${formatEUR(monthStats.variableOut)}`}</div>
          </div>
          <div className={styles.kpi}>
            <p className={styles.kpiLabel}>Tasa de ahorro</p>
            <div className={styles.kpiValue}>{loading ? "…" : `${Math.round(savingsRate * 100)}%`}</div>
            <div className={styles.meter} aria-hidden="true">
              <div className={styles.meterFill} style={{ width: `${Math.round((1 - savingsRate) * 100)}%` }} />
            </div>
          </div>
        </div>

        <div className={styles.rangeRow}>
          <div>
            <p className={styles.rangeLabel}>Ahorro desde</p>
            <div className={styles.rangeControls}>
              <input
                className={styles.dateInput}
                type="date"
                value={savingsFrom}
                max={isoDate(new Date())}
                onChange={(e) => setSavingsFrom(e.target.value)}
              />
              <span className={styles.rangeHint}>hasta {loading ? "…" : rangeStats.toLabel}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className={styles.rangeLabel}>Ahorro (rango)</p>
            <div className={styles.rangeValue}>{loading ? "…" : formatEUR(rangeStats.savings)}</div>
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Cuentas</h3>
          <p className={styles.cardSub}>Saldo actual por cuenta (saldo inicial + movimientos)</p>

          {loading ? (
            <p style={{ marginTop: 12 }}>Cargando…</p>
          ) : accountsLive.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <p>Aún no tienes cuentas.</p>
              <a className={styles.smallLink} href="/accounts">→ Crear mi primera cuenta</a>
            </div>
          ) : (
            <div className={styles.list}>
              {accountsLive.slice(0, 6).map((a) => (
                <div key={a.id} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <p className={styles.listTitle}>{a.name}</p>
                    <p className={styles.listMeta}>
                      Inicial {formatEUR(Number(a.current_balance || 0))} · Mov {a.delta >= 0 ? "+" : ""}{formatEUR(a.delta)}
                    </p>
                  </div>
                  <div
                    className={`${styles.amount} ${a.live_balance >= 0 ? styles.amountIn : styles.amountOut}`}
                  >
                    {formatEUR(a.live_balance)}
                  </div>
                </div>
              ))}

              <a className={styles.smallLink} href="/accounts">→ Ver todas</a>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Acciones rápidas</h3>
          <p className={styles.cardSub}>Lo que más vas a usar día a día</p>

          <div className={styles.actions}>
            <div className={styles.actionRow}>
              <a className={styles.action} href="/movements">
                <p className={styles.actionTitle}>📝 Nuevo movimiento</p>
                <p className={styles.actionDesc}>Registrar ingreso o gasto</p>
              </a>
              <a className={styles.action} href="/transfers">
                <p className={styles.actionTitle}>💸 Transferencia</p>
                <p className={styles.actionDesc}>Mover dinero entre cuentas</p>
              </a>
            </div>
            <div className={styles.actionRow}>
              <a className={styles.action} href="/categories">
                <p className={styles.actionTitle}>🏷️ Categorías</p>
                <p className={styles.actionDesc}>Crear y ajustar categorías</p>
              </a>
              <a className={styles.action} href="/monthly">
                <p className={styles.actionTitle}>📅 Mensual</p>
                <p className={styles.actionDesc}>Detalle y cierre del mes</p>
              </a>
            </div>
          </div>
        </section>
      </div>

      <section className={styles.card} style={{ marginTop: 16 }}>
        <h3 className={styles.cardTitle}>Últimos movimientos</h3>
        <p className={styles.cardSub}>Los más recientes de este mes</p>

        {loading ? (
          <p style={{ marginTop: 12 }}>Cargando…</p>
        ) : recentTxs.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <p>Aún no hay movimientos este mes.</p>
            <a className={styles.smallLink} href="/movements">→ Añadir el primero</a>
          </div>
        ) : (
          <div className={styles.list}>
            {recentTxs.map((t, idx) => {
              const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
              const dir = cat?.direction;
              const amt = Number(t.amount) || 0;
              const isTransfer = Boolean(t.transfer_group_id);

              const sign = dir === "INCOME" ? "+" : dir === "EXPENSE" ? "-" : "";
              const amountClass = dir === "INCOME" ? styles.amountIn : styles.amountOut;

              const title = (t.description && String(t.description).trim()) || (cat?.name ? String(cat.name) : "Movimiento");
              const meta = [
                safeDateLabel(t.tx_date, t.created_at),
                accountNameById[t.account_id] ? `· ${accountNameById[t.account_id]}` : "",
                isTransfer ? "· Transferencia" : cat?.name ? `· ${cat.name}` : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div key={`${t.account_id}-${t.ym}-${idx}`} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <p className={styles.listTitle}>{title}</p>
                    <p className={styles.listMeta}>{meta}</p>
                  </div>
                  <div className={`${styles.amount} ${amountClass}`}>{sign}{formatEUR(amt)}</div>
                </div>
              );
            })}

            <a className={styles.smallLink} href="/movements">→ Ver movimientos</a>
          </div>
        )}

        {!loading ? (
          <p style={{ marginTop: 10, fontSize: "0.85rem" }}>
            Nota: transferencias no cuentan como gasto/ingreso (salida {formatEUR(monthStats.transferOut)} · entrada {formatEUR(monthStats.transferIn)}).
          </p>
        ) : null}
      </section>
    </main>
  );
}
