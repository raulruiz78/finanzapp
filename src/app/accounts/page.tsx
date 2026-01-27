"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";

type TxForBalance = {
  account_id: string;
  amount: number;
  categories?: OneOrMany<CategoryJoin> | null;
};

export default function AccountsPage() {
  const configured = useRequireSupabaseConfigured("/");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deltaByAccount, setDeltaByAccount] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [balance, setBalance] = useState<number>(0);

  async function loadAccounts() {
    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return;

    const [{ data: acc, error: accErr }, { data: tx, error: txErr }] = await Promise.all([
      supabase.from("accounts").select("id,name,current_balance").order("created_at"),
      supabase
        .from("transactions")
        .select("account_id,amount,categories:categories(direction)")
        .eq("user_id", userId),
    ]);

    if (accErr) alert(accErr.message);
    if (txErr) alert(txErr.message);

    setAccounts((acc as Account[]) || []);

    const deltas: Record<string, number> = {};
    for (const t of (((tx as unknown) as TxForBalance[]) || [])) {
      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction ?? null;
      const amt = Number(t.amount) || 0;
      const delta = dir === "INCOME" ? amt : dir === "EXPENSE" ? -amt : 0;
      deltas[t.account_id] = (deltas[t.account_id] || 0) + delta;
    }
    setDeltaByAccount(deltas);
  }

  async function createAccount() {
    if (!name.trim()) return alert("Nombre requerido");

    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const { error } = await supabase.from("accounts").insert({
      name,
      current_balance: balance,
      user_id: session.session.user.id,
    });

    if (error) return alert(error.message);

    setName("");
    setBalance(0);
    loadAccounts();
  }

  async function deleteAccount(id: string) {
    if (!confirm("¿Borrar esta cuenta? Se perderán sus movimientos.")) return;

    if (!supabase) return;

    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) alert(error.message);
    else loadAccounts();
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const accountsWithLive = useMemo(() => {
    return accounts.map((a) => {
      const delta = deltaByAccount[a.id] || 0;
      const live = Number(a.current_balance || 0) + delta;
      return { ...a, live_balance: live, delta };
    });
  }, [accounts, deltaByAccount]);

  const totalBalance = useMemo(() => {
    return accountsWithLive.reduce((sum, a) => sum + a.live_balance, 0);
  }, [accountsWithLive]);

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>🏦 Mis Cuentas</h1>
        <a href="/dashboard" style={{ color: "var(--primary)", fontWeight: "600" }}>← Volver</a>
      </div>

      <section style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)", color: "white", marginBottom: "2rem" }}>
        <div style={{ padding: "2rem" }}>
          <p style={{ opacity: 0.9, fontSize: "0.95rem", marginBottom: "0.5rem" }}>Saldo Total</p>
          <h2 style={{ color: "white", background: "none", WebkitTextFillColor: "white", fontSize: "2.5rem" }}>
            {totalBalance.toFixed(2)} €
          </h2>
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>➕ Nueva Cuenta</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "1rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem", color: "var(--foreground)" }}>
              Nombre
            </label>
            <input
              placeholder="BBVA, Caixa, Efectivo..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem", color: "var(--foreground)" }}>
              Saldo Inicial
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={balance || 0}
              onChange={(e) => setBalance(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <button onClick={createAccount} style={{ background: "linear-gradient(135deg, var(--success) 0%, #34d399 100%)", color: "white" }}>
            ✅ Crear
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: "1.5rem" }}>📋 Lista de Cuentas</h3>

        {accounts.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "3rem", marginBottom: "1rem" }}>💤</p>
            <p>No tienes cuentas todavía. Crea la primera arriba.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1.5rem" }}>
            {accountsWithLive.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "var(--surface)",
                  border: "2px solid var(--border)",
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  boxShadow: "var(--shadow)",
                  transition: "all 0.3s ease",
                  cursor: "pointer"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "var(--shadow-md)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "var(--shadow)";
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏦</div>
                <h4 style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}>{a.name}</h4>
                <div style={{ marginBottom: "1rem" }}>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Saldo actual</p>
                  <p style={{ fontSize: "1.5rem", fontWeight: "700", color: a.live_balance >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {a.live_balance.toFixed(2)} €
                  </p>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                    Inicial: {Number(a.current_balance || 0).toFixed(2)} € · Movimientos: {a.delta >= 0 ? "+" : ""}{a.delta.toFixed(2)} €
                  </p>
                </div>
                <button
                  onClick={() => deleteAccount(a.id)}
                  style={{ width: "100%", background: "var(--danger)", color: "white", marginTop: "1rem" }}
                >
                  🗑️ Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
