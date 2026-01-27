"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import { formatEUR } from "@/lib/format";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";

type Tx = {
  account_id: string;
  amount: number;
  ym: string;
  description?: string | null;
  transfer_group_id?: string | null;
  categories?: OneOrMany<CategoryJoin> | null;
};

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function Card({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: `2px solid ${accent ?? "var(--border)"}`,
        borderRadius: "1rem",
        padding: "1.5rem",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ marginBottom: "0.25rem" }}>{title}</h3>
          {subtitle ? <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const configured = useRequireSupabaseConfigured("/");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [ym] = useState(currentYM());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deltasAll, setDeltasAll] = useState<Record<string, number>>({});
  const [monthTxs, setMonthTxs] = useState<Tx[]>([]);

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
      if (!cancelled) setEmail(data.session.user.email ?? "");

      const [{ data: acc, error: accErr }, { data: allTx, error: allTxErr }, { data: mTx, error: mTxErr }] =
        await Promise.all([
          supabase.from("accounts").select("id,name,current_balance").order("created_at"),
          supabase
            .from("transactions")
            .select("account_id,amount,categories:categories(direction)")
            .eq("user_id", userId),
          supabase
            .from("transactions")
            .select("account_id,amount,ym,description,transfer_group_id,categories:categories(name,direction,amount)")
            .eq("user_id", userId)
            .eq("ym", ym),
        ]);

      if (accErr) alert(accErr.message);
      if (allTxErr) alert(humanizeSupabaseSchemaError(allTxErr.message) ?? allTxErr.message);
      if (mTxErr) alert(humanizeSupabaseSchemaError(mTxErr.message) ?? mTxErr.message);

      if (!cancelled) setAccounts((acc as Account[]) || []);

      const deltas: Record<string, number> = {};
      for (const t of (((allTx as unknown) as Tx[]) || [])) {
        const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
        const dir = cat?.direction;
        const amt = Number(t.amount) || 0;
        const delta = dir === "INCOME" ? amt : dir === "EXPENSE" ? -amt : 0;
        deltas[t.account_id] = (deltas[t.account_id] || 0) + delta;
      }

      if (!cancelled) {
        setDeltasAll(deltas);
        setMonthTxs((mTx as Tx[]) || []);
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

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3rem" }}>
        <div>
          <h1>💰 FinanzApp</h1>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>Gestiona tus finanzas personales</p>
        </div>
        <button onClick={logout} style={{ background: "var(--danger)", color: "white" }}>
          🚪 Cerrar sesión
        </button>
      </div>

      <div
        style={{
          background: "linear-gradient(135deg, var(--primary) 0%, var(--info) 100%)",
          color: "white",
          borderRadius: "1rem",
          padding: "1.75rem",
          marginBottom: "2rem",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "1.5rem" }}>
          <div>
            <p style={{ fontSize: "0.95rem", opacity: 0.9, marginBottom: "0.4rem" }}>Sesión activa</p>
            <h2 style={{ color: "white", background: "none", WebkitTextFillColor: "white", marginBottom: 0 }}>{email}</h2>
            <p style={{ marginTop: "0.5rem", opacity: 0.9 }}>Mes actual: <strong>{ym}</strong></p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "0.95rem", opacity: 0.9, marginBottom: "0.4rem" }}>Saldo total (actual)</p>
            <div style={{ fontSize: "2.25rem", fontWeight: 800, lineHeight: 1.1 }}>
              {loading ? "…" : formatEUR(totalBalance)}
            </div>
            <p style={{ marginTop: "0.5rem", opacity: 0.9 }}>
              Ahorro del mes: <strong>{loading ? "…" : formatEUR(monthStats.savings)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "2.5rem" }}>
        <Card title="🏦 Tus cuentas" subtitle="Saldo actual por cuenta" accent="var(--primary)">
          {loading ? (
            <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>
          ) : accountsLive.length === 0 ? (
            <div>
              <p style={{ color: "var(--text-secondary)", marginBottom: "0.75rem" }}>Aún no tienes cuentas.</p>
              <a href="/accounts" style={{ color: "var(--primary)", fontWeight: 700 }}>→ Crear mi primera cuenta</a>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {accountsLive.slice(0, 6).map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.75rem", borderRadius: "0.75rem", background: "var(--surface-hover)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Inicial: {formatEUR(Number(a.current_balance || 0))} · Mov: {a.delta >= 0 ? "+" : ""}{formatEUR(a.delta)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: a.live_balance >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {formatEUR(a.live_balance)}
                  </div>
                </div>
              ))}
              <a href="/accounts" style={{ color: "var(--primary)", fontWeight: 700, marginTop: "0.25rem" }}>→ Ver todas</a>
            </div>
          )}
        </Card>

        <Card title="📅 Resumen del mes" subtitle="Ingresos, gastos y ahorro (sin transferencias)" accent="var(--success)">
          {loading ? (
            <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem" }}>
                <div style={{ color: "var(--text-secondary)" }}>Ingresos</div>
                <div style={{ fontWeight: 800, color: "var(--success)" }}>+{formatEUR(monthStats.income)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem" }}>
                <div style={{ color: "var(--text-secondary)" }}>Gasto fijo</div>
                <div style={{ fontWeight: 800, color: "var(--danger)" }}>-{formatEUR(monthStats.fixedOut)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem" }}>
                <div style={{ color: "var(--text-secondary)" }}>Variable</div>
                <div style={{ fontWeight: 800, color: "var(--danger)" }}>-{formatEUR(monthStats.variableOut)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem" }}>
                <div style={{ color: "var(--text-secondary)" }}>Otros</div>
                <div style={{ fontWeight: 800, color: "var(--danger)" }}>-{formatEUR(monthStats.otherOut)}</div>
              </div>
              <div style={{ height: 1, background: "var(--border)", margin: "0.25rem 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem" }}>
                <div style={{ fontWeight: 800 }}>Ahorro del mes</div>
                <div style={{ fontWeight: 900, color: monthStats.savings >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {formatEUR(monthStats.savings)}
                </div>
              </div>

              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Transferencias no cuentan como gasto/ingreso: salida {formatEUR(monthStats.transferOut)} · entrada {formatEUR(monthStats.transferIn)}
              </div>
              <a href="/monthly" style={{ color: "var(--primary)", fontWeight: 700 }}>→ Ver detalle mensual</a>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: "3rem" }}>
        <h2 style={{ marginBottom: "1.5rem" }}>📊 Gestiona tu dinero</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          <a href="/accounts" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏦</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Cuentas</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Gestiona tus cuentas bancarias y efectivo</p>
              <div style={{ marginTop: "1.5rem", color: "var(--primary)", fontWeight: "600" }}>→ Ir a Cuentas</div>
            </div>
          </a>

          <a href="/categories" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--success)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏷️</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Categorías</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Define tipos de ingresos y gastos</p>
              <div style={{ marginTop: "1.5rem", color: "var(--success)", fontWeight: "600" }}>→ Ir a Categorías</div>
            </div>
          </a>

          <a href="/movements" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--info)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📝</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Movimientos</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Registra ingresos y gastos</p>
              <div style={{ marginTop: "1.5rem", color: "var(--info)", fontWeight: "600" }}>→ Ir a Movimientos</div>
            </div>
          </a>

          <a href="/transfers" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--warning)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💸</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Transferencias</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Transferencias entre cuentas</p>
              <div style={{ marginTop: "1.5rem", color: "var(--warning)", fontWeight: "600" }}>→ Ir a Transferencias</div>
            </div>
          </a>
        </div>
      </div>

      <section style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
        <h3>ℹ️ Próximas mejoras</h3>
        <ul style={{ paddingLeft: "1.5rem", color: "var(--text-secondary)" }}>
          <li>📈 Dashboard con gráficos de ingresos y gastos</li>
          <li>🎯 Presupuestos y alertas</li>
          <li>📊 Reportes detallados por período</li>
          <li>🔄 Importar transacciones desde CSV</li>
        </ul>
      </section>
    </main>
  );
}
