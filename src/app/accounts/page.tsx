"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Account = {
  id: string;
  name: string;
  current_balance: number;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState<number>(0);

  async function loadAccounts() {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at");

    if (error) alert(error.message);
    else setAccounts(data || []);
  }

  async function createAccount() {
    if (!name.trim()) return alert("Nombre requerido");

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

    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) alert(error.message);
    else loadAccounts();
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const totalBalance = accounts.reduce((sum, a) => sum + a.current_balance, 0);

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
            {accounts.map((a) => (
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
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Saldo</p>
                  <p style={{ fontSize: "1.5rem", fontWeight: "700", color: a.current_balance >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {a.current_balance.toFixed(2)} €
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
