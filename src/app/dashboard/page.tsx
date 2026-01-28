"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import { formatEUR } from "@/lib/format";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";
import { AppTopBar } from "@/app/ui/AppTopBar";
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
  plan_needs_pct?: number | null;
  plan_wants_pct?: number | null;
  plan_savings_pct?: number | null;
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

function plusOneMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deltasAll, setDeltasAll] = useState<Record<string, number>>({});
  const [monthTxs, setMonthTxs] = useState<Tx[]>([]);
  const [allTxs, setAllTxs] = useState<Tx[]>([]);
  const [dashTab, setDashTab] = useState<"balances" | "cotidiana">("cotidiana");
  const [showAmounts, setShowAmounts] = useState(false);
  const [planNeedsPct, setPlanNeedsPct] = useState(50);
  const [planWantsPct, setPlanWantsPct] = useState(30);
  const [planSavingsPct, setPlanSavingsPct] = useState(20);
  const [projectionFrom, setProjectionFrom] = useState(() => isoDate(new Date()));

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
            .select("id,name,account_type,current_balance")
            .eq("user_id", userId)
            .order("created_at"),
          supabase
            .from("transactions")
            .select(
              "account_id,amount,ym,tx_date,created_at,transfer_group_id,categories:categories(name,direction,budget_bucket)"
            )
            .eq("user_id", userId),
          supabase
            .from("transactions")
            .select(
              "account_id,amount,ym,tx_date,created_at,description,transfer_group_id,categories:categories(name,direction,amount,budget_bucket)"
            )
            .eq("user_id", userId)
            .eq("ym", ym),
          supabase
            .from("profiles")
            .select("first_name,last_name,full_name,plan_needs_pct,plan_wants_pct,plan_savings_pct")
            .eq("user_id", userId)
            .maybeSingle(),
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

  const maskedEUR = (value: number) => {
    if (showAmounts) return formatEUR(value);
    return "••••";
  };

  const totalBalance = useMemo(() => {
    return accountsLive.reduce((sum, a) => sum + a.live_balance, 0);
  }, [accountsLive]);

  const cotidianaAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of accounts) {
      const t = (a as any)?.account_type as string | undefined;
      if (!t || t === "COTIDIANA") ids.add(a.id);
    }
    return ids;
  }, [accounts]);

  const accountsLiveCotidiana = useMemo(() => {
    return accountsLive.filter((a) => cotidianaAccountIds.has(a.id));
  }, [accountsLive, cotidianaAccountIds]);

  const monthTxsCotidiana = useMemo(() => {
    return monthTxs.filter((t) => cotidianaAccountIds.has(t.account_id));
  }, [monthTxs, cotidianaAccountIds]);

  const monthStatsCotidiana = useMemo(() => {
    let income = 0;
    let needsOut = 0;
    let wantsOut = 0;
    let otherOut = 0;
    let transferOut = 0;
    let transferIn = 0;

    for (const t of monthTxsCotidiana) {
      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      const amt = Number(t.amount) || 0;
      const isTransfer = Boolean(t.transfer_group_id);

      if (dir === "INCOME") {
        if (isTransfer) transferIn += amt;
        else income += amt;
      } else if (dir === "EXPENSE") {
        if (isTransfer) transferOut += amt;
        else if (cat?.budget_bucket === "NEEDS") needsOut += amt;
        else if (cat?.budget_bucket === "WANTS") wantsOut += amt;
        else wantsOut += amt;
      } else {
        otherOut += 0;
      }
    }

    const expensesNoTransfer = needsOut + wantsOut + otherOut;
    const savings = income - expensesNoTransfer;

    return {
      income,
      needsOut,
      wantsOut,
      otherOut,
      transferOut,
      transferIn,
      expensesNoTransfer,
      savings,
    };
  }, [monthTxsCotidiana]);

  const savingsRateCotidiana = useMemo(() => {
    if (!monthStatsCotidiana.income) return 0;
    return Math.max(0, Math.min(1, monthStatsCotidiana.savings / monthStatsCotidiana.income));
  }, [monthStatsCotidiana.income, monthStatsCotidiana.savings]);

  const totalBalanceCotidiana = useMemo(() => {
    return accountsLiveCotidiana.reduce((sum, a) => sum + a.live_balance, 0);
  }, [accountsLiveCotidiana]);

  const projectionTo = useMemo(() => {
    const from = new Date(`${projectionFrom}T00:00:00`);
    if (Number.isNaN(from.getTime())) return null;
    return plusOneMonth(from);
  }, [projectionFrom]);

  const projectionBaseBalanceCotidiana = useMemo(() => {
    const from = new Date(`${projectionFrom}T00:00:00`);
    if (Number.isNaN(from.getTime())) return 0;

    const deltaBefore: Record<string, number> = {};

    for (const t of allTxs) {
      if (!cotidianaAccountIds.has(t.account_id)) continue;
      const d = t.tx_date ? new Date(`${t.tx_date}T00:00:00`) : t.created_at ? new Date(t.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      if (d >= from) continue;

      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      const amt = Number(t.amount) || 0;

      if (dir === "INCOME") deltaBefore[t.account_id] = (deltaBefore[t.account_id] || 0) + amt;
      else if (dir === "EXPENSE") deltaBefore[t.account_id] = (deltaBefore[t.account_id] || 0) - amt;
    }

    let base = 0;
    for (const a of accounts) {
      if (!cotidianaAccountIds.has(a.id)) continue;
      base += Number(a.current_balance || 0) + (deltaBefore[a.id] || 0);
    }
    return base;
  }, [accounts, allTxs, cotidianaAccountIds, projectionFrom]);

  const projectionStatsCotidiana = useMemo(() => {
    const from = new Date(`${projectionFrom}T00:00:00`);
    const to = projectionTo;
    if (!to || Number.isNaN(from.getTime())) {
      return {
        fromLabel: projectionFrom,
        toLabel: "",
        startBalance: 0,
        income: 0,
        needsOut: 0,
        wantsOut: 0,
        savings: 0,
        plannedNeeds: 0,
        plannedWants: 0,
        plannedSavings: 0,
        needsRatio: 0,
        wantsRatio: 0,
        savingsRatio: 0,
      };
    }

    let income = 0;
    let needsOut = 0;
    let wantsOut = 0;

    for (const t of allTxs) {
      if (!cotidianaAccountIds.has(t.account_id)) continue;
      const d = t.tx_date ? new Date(t.tx_date) : t.created_at ? new Date(t.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      if (d < from || d > to) continue;

      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      const amt = Number(t.amount) || 0;
      const isTransfer = Boolean(t.transfer_group_id);
      if (isTransfer) continue;

      if (dir === "INCOME") income += amt;
      else if (dir === "EXPENSE") {
        if (cat?.budget_bucket === "NEEDS") needsOut += amt;
        else if (cat?.budget_bucket === "WANTS") wantsOut += amt;
        else wantsOut += amt;
      }
    }

    const startBalance = Number(projectionBaseBalanceCotidiana || 0);
    const plannedNeeds = (startBalance * planNeedsPct) / 100;
    const plannedWants = (startBalance * planWantsPct) / 100;
    const plannedSavings = (startBalance * planSavingsPct) / 100;
    const savings = startBalance - (needsOut + wantsOut);

    const needsRatio = plannedNeeds > 0 ? needsOut / plannedNeeds : 0;
    const wantsRatio = plannedWants > 0 ? wantsOut / plannedWants : 0;
    const savingsRatio = plannedSavings > 0 ? savings / plannedSavings : 0;

    return {
      fromLabel: projectionFrom,
      toLabel: isoDate(to),
      startBalance,
      income,
      needsOut,
      wantsOut,
      savings,
      plannedNeeds,
      plannedWants,
      plannedSavings,
      needsRatio,
      wantsRatio,
      savingsRatio,
    };
  }, [allTxs, cotidianaAccountIds, planNeedsPct, planSavingsPct, planWantsPct, projectionBaseBalanceCotidiana, projectionFrom, projectionTo]);

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

  const savingsRate = useMemo(() => {
    if (!monthStats.income) return 0;
    return Math.max(0, Math.min(1, monthStats.savings / monthStats.income));
  }, [monthStats.income, monthStats.savings]);

  function DonutChart(props: {
    needsFill: number;
    wantsFill: number;
    savingsFill: number;
    size?: number;
  }) {
    const size = props.size ?? 176;
    const r = 58;
    const stroke = 18;
    const circ = 2 * Math.PI * r;

    const segments = [
      {
        key: "needs",
        pct: planNeedsPct,
        fill: Math.max(0, Math.min(1, props.needsFill)),
        color: "var(--warning)",
      },
      {
        key: "wants",
        pct: planWantsPct,
        fill: Math.max(0, Math.min(1, props.wantsFill)),
        color: "var(--info)",
      },
      {
        key: "savings",
        pct: planSavingsPct,
        fill: Math.max(0, Math.min(1, props.savingsFill)),
        color: "var(--success)",
      },
    ];

    let startPct = 0;

    const cx = size / 2;
    const cy = size / 2;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <defs>
          <filter id="donutShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(15, 23, 42, 0.28)" />
          </filter>
        </defs>

        <g transform={`translate(${cx} ${cy}) rotate(-90)`} filter="url(#donutShadow)">
          {segments.map((s) => {
            const segLen = (circ * s.pct) / 100;
            const startLen = (circ * startPct) / 100;
            startPct += s.pct;

            const baseDash = `${segLen} ${circ - segLen}`;
            const fillLen = segLen * s.fill;
            const fillDash = `${fillLen} ${circ - fillLen}`;

            return (
              <g key={s.key}>
                <circle
                  r={r}
                  cx={0}
                  cy={0}
                  fill="transparent"
                  stroke={s.color}
                  strokeOpacity={0.22}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={baseDash}
                  strokeDashoffset={-startLen}
                />
                <circle
                  r={r}
                  cx={0}
                  cy={0}
                  fill="transparent"
                  stroke={s.color}
                  strokeOpacity={0.85}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={fillDash}
                  strokeDashoffset={-startLen}
                />
              </g>
            );
          })}
        </g>
        <text x={cx} y={cy - 8} textAnchor="middle" fill="rgba(15, 23, 42, 0.72)" fontSize="11" fontWeight={900}>
          Base
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="rgba(15, 23, 42, 0.92)" fontSize="16" fontWeight={950}>
          {showAmounts ? formatEUR(projectionStatsCotidiana.startBalance) : "••••"}
        </text>
        <text x={cx} y={cy + 34} textAnchor="middle" fill="rgba(15, 23, 42, 0.70)" fontSize="11" fontWeight={800}>
          en la fecha
        </text>
      </svg>
    );
  }

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
      <AppTopBar
        title="Dashboard"
        icon="📊"
        iconLabel="Dashboard"
        showBack={false}
        right={
          <button onClick={logout} className={styles.logout}>
            Cerrar sesión
          </button>
        }
      />

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <h2 className={styles.heroHello}>Hola{loading ? "" : name ? `, ${name}` : ""}.</h2>
            <p className={styles.heroSub}>
              Un vistazo rápido a tu dinero y tu proyección.
            </p>
          </div>
        </div>

        <div className={styles.heroTabsRow}>
          <div className={styles.heroTabs} role="tablist" aria-label="Panel principal">
            <button
              className={`${styles.heroTab} ${dashTab === "cotidiana" ? styles.heroTabActive : ""}`}
              onClick={() => setDashTab("cotidiana")}
              role="tab"
              aria-selected={dashTab === "cotidiana"}
              type="button"
            >
              Cotidiana
            </button>
            <button
              className={`${styles.heroTab} ${dashTab === "balances" ? styles.heroTabActive : ""}`}
              onClick={() => setDashTab("balances")}
              role="tab"
              aria-selected={dashTab === "balances"}
              type="button"
            >
              Saldos
            </button>
          </div>

          <button
            className={styles.heroGhostButton}
            onClick={() => setShowAmounts((v) => !v)}
            aria-pressed={showAmounts}
            title={showAmounts ? "Ocultar importes" : "Mostrar importes"}
          >
            {showAmounts ? "🙈 Ocultar" : "👁 Mostrar"}
          </button>
        </div>

        <div className={styles.heroPanel} role="tabpanel">
          {dashTab === "balances" ? (
            loading ? (
              <p style={{ marginTop: 12 }}>Cargando…</p>
            ) : accountsLive.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: 0, opacity: 0.92 }}>Aún no tienes cuentas.</p>
                <a className={styles.heroLink} href="/accounts">→ Crear mi primera cuenta</a>
              </div>
            ) : (
              <>
                <div className={styles.heroCotidianaHeaderRow}>
                  <div>
                    <p className={styles.heroMetricLabel} style={{ margin: 0 }}>
                      Saldo total (actual)
                    </p>
                    <div className={styles.heroCotidianaBalance}>{showAmounts ? formatEUR(totalBalance) : "••••"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className={styles.heroMetricLabel} style={{ margin: 0 }}>
                      Ahorro del mes
                    </p>
                    <div className={styles.heroCotidianaBalanceSmall}>
                      {showAmounts ? formatEUR(monthStats.savings) : "••••"}
                    </div>
                  </div>
                </div>

                <div className={styles.heroList}>
                {accountsLive.slice(0, 6).map((a) => (
                  <div key={a.id} className={styles.heroListItem}>
                    <div className={styles.heroListMain}>
                      <p className={styles.heroListTitle}>{a.name}</p>
                      <p className={styles.heroListMeta}>
                        Inicial {showAmounts ? formatEUR(Number(a.current_balance || 0)) : "••••"} · Mov {a.delta >= 0 ? "+" : ""}
                        {showAmounts ? formatEUR(a.delta) : "••••"}
                      </p>
                    </div>
                    <div className={styles.heroListAmount}>{showAmounts ? formatEUR(a.live_balance) : "••••"}</div>
                  </div>
                ))}

                <div className={styles.heroListFooter}>
                  <p className={styles.heroListMeta} style={{ margin: 0 }}>
                    Total: <strong>{showAmounts ? formatEUR(totalBalance) : "••••"}</strong>
                  </p>
                  <a className={styles.heroLink} href="/accounts">→ Ver todas</a>
                </div>
              </div>
              </>
            )
          ) : dashTab === "cotidiana" ? (
            loading ? (
              <p style={{ marginTop: 12 }}>Cargando…</p>
            ) : accountsLiveCotidiana.length === 0 ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: 0, opacity: 0.92 }}>
                  No hay cuentas de tipo <strong>Cotidiana</strong>.
                </p>
                <a className={styles.heroLink} href="/accounts">→ Crear/editar cuentas</a>
              </div>
            ) : (
              <>
                <div className={styles.heroCotidianaHeaderRow}>
                  <div>
                    <p className={styles.heroMetricLabel} style={{ margin: 0 }}>
                      Saldo Cotidiana (actual)
                    </p>
                    <div className={styles.heroCotidianaBalance}>{showAmounts ? formatEUR(totalBalanceCotidiana) : "••••"}</div>
                  </div>
                </div>

                <div className={styles.heroConfigSummary}>
                  <p className={styles.heroConfigSummaryTitle}>Proyección (1 mes)</p>
                  <div className={styles.heroConfigActions}>
                    <div className={styles.rangeControls}>
                      <input
                        className={styles.dateInput}
                        type="date"
                        value={projectionFrom}
                        max={isoDate(new Date())}
                        onChange={(e) => setProjectionFrom(e.target.value)}
                      />
                      <span className={styles.rangeHint}>hasta {projectionStatsCotidiana.toLabel || "…"}</span>
                    </div>
                    <a className={styles.heroLink} href="/settings">
                      → Ajustar plan
                    </a>
                  </div>

                  <div className={styles.projectionLayout}>
                    <div className={styles.donutCard}>
                      <DonutChart
                        size={190}
                        needsFill={projectionStatsCotidiana.needsRatio}
                        wantsFill={projectionStatsCotidiana.wantsRatio}
                        savingsFill={projectionStatsCotidiana.savingsRatio}
                      />
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong>Necesidades</strong>
                          <span>
                            {showAmounts
                              ? `${formatEUR(projectionStatsCotidiana.needsOut)} / ${formatEUR(projectionStatsCotidiana.plannedNeeds)}`
                              : "••••"}
                          </span>
                        </div>
                        <div className={styles.heroMeter} aria-hidden="true">
                          <div
                            className={styles.heroMeterFill}
                            style={{
                              width: `${Math.min(100, Math.max(0, Math.round(projectionStatsCotidiana.needsRatio * 100)))}%`,
                              background: "var(--warning)",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong>Ocio</strong>
                          <span>
                            {showAmounts
                              ? `${formatEUR(projectionStatsCotidiana.wantsOut)} / ${formatEUR(projectionStatsCotidiana.plannedWants)}`
                              : "••••"}
                          </span>
                        </div>
                        <div className={styles.heroMeter} aria-hidden="true">
                          <div
                            className={styles.heroMeterFill}
                            style={{
                              width: `${Math.min(100, Math.max(0, Math.round(projectionStatsCotidiana.wantsRatio * 100)))}%`,
                              background: "var(--info)",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong>Ahorro</strong>
                          <span>
                            {showAmounts
                              ? `${formatEUR(projectionStatsCotidiana.savings)} / ${formatEUR(projectionStatsCotidiana.plannedSavings)}`
                              : "••••"}
                          </span>
                        </div>
                        <div className={styles.heroMeter} aria-hidden="true">
                          <div
                            className={styles.heroMeterFill}
                            style={{
                              width: `${Math.min(100, Math.max(0, Math.round(projectionStatsCotidiana.savingsRatio * 100)))}%`,
                              background: "var(--success)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          ) : null}
        </div>
      </section>

      <div className={styles.gridSingle}>
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
              <a className={styles.action} href="/accounts">
                <p className={styles.actionTitle}>🏦 Cuentas</p>
                <p className={styles.actionDesc}>Crear y ajustar cuentas</p>
              </a>
              <a className={styles.action} href="/categories">
                <p className={styles.actionTitle}>🏷️ Categorías</p>
                <p className={styles.actionDesc}>Crear y ajustar plantillas</p>
              </a>
            </div>
            <div className={styles.actionRow}>
              <a className={styles.action} href="/monthly">
                <p className={styles.actionTitle}>📅 Mensual</p>
                <p className={styles.actionDesc}>Detalle y cierre del mes</p>
              </a>
              <a className={styles.action} href="/settings">
                <p className={styles.actionTitle}>⚙️ Ajustes</p>
                <p className={styles.actionDesc}>Plan y contraseña</p>
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
