"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Account = { id: string; name: string; current_balance: number };
type Category = { id: string; name: string; direction: "INCOME" | "EXPENSE"; bucket: "FIXED" | "VARIABLE" | "TRANSFER" | "OTHER" };

type TxRow = {
  id: string;
  ym: string;
  tx_date: string | null;
  description: string;
  amount: number;
  account_id: string;
  category_id: string;
  transfer_group_id: string | null;
  created_at: string;
  accounts?: { name: string }[] | null;
  categories?: { name: string; direction: string; bucket: string }[] | null;
};

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function isValidYM(ym: string) {
  return /^\d{4}-\d{2}$/.test(ym);
}

export default function MovementsPage() {
  const [ym, setYm] = useState(currentYM());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [filterAccountId, setFilterAccountId] = useState<string>("ALL");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [txDate, setTxDate] = useState<string>("");

  async function loadBase() {
    const [{ data: acc, error: accErr }, { data: cat, error: catErr }] = await Promise.all([
      supabase.from("accounts").select("id,name,current_balance").order("created_at"),
      supabase.from("categories").select("id,name,direction,bucket").order("created_at"),
    ]);

    if (accErr) alert(accErr.message);
    if (catErr) alert(catErr.message);

    setAccounts((acc as Account[]) || []);
    setCategories((cat as Category[]) || []);

    if (!accountId && acc && acc[0]?.id) setAccountId(acc[0].id);
    if (!categoryId && cat && cat[0]?.id) setCategoryId(cat[0].id);
  }

  async function loadTx() {
    if (!isValidYM(ym)) return;

    let q = supabase
      .from("transactions")
      .select(`
        id, ym, tx_date, description, amount, account_id, category_id, transfer_group_id, created_at,
        accounts:accounts(name),
        categories:categories(name, direction, bucket)
      `)
      .eq("ym", ym)
      .order("tx_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (filterAccountId !== "ALL") q = q.eq("account_id", filterAccountId);

    const { data, error } = await q;

    if (error) alert(error.message);
    else setTxs((data as TxRow[]) || []);
  }

  async function createTx() {
    if (!isValidYM(ym)) return alert("Mes inválido. Usa YYYY-MM (ej: 2026-01).");
    if (!accountId) return alert("Selecciona cuenta");
    if (!categoryId) return alert("Selecciona categoría");
    if (!description.trim()) return alert("Descripción requerida");
    if (!Number.isFinite(amount) || amount <= 0) return alert("Cantidad debe ser > 0");

    if (txDate && !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
      return alert("Fecha inválida. Usa YYYY-MM-DD o déjala vacía.");
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const { error } = await supabase.from("transactions").insert({
      ym,
      tx_date: txDate || null,
      description: description.trim(),
      amount,
      account_id: accountId,
      category_id: categoryId,
      transfer_group_id: null,
      user_id: session.session.user.id,
    });

    if (error) return alert(error.message);

    setDescription("");
    setAmount(0);
    setTxDate("");
    await loadTx();
  }

  async function deleteTx(id: string, isTransfer: boolean) {
    if (isTransfer) {
      alert("Este movimiento es parte de una transferencia. Se gestiona en Transferencias.");
      return;
    }
    if (!confirm("¿Borrar movimiento?")) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) alert(error.message);
    else loadTx();
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, filterAccountId]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of txs) {
      const dir = t.categories?.[0]?.direction;
      if (dir === "INCOME") income += Number(t.amount);
      else if (dir === "EXPENSE") expense += Number(t.amount);
    }
    return { income, expense };
  }, [txs]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>📝 Movimientos</h1>
        <a href="/dashboard" style={{ color: "var(--primary)", fontWeight: "600" }}>← Volver</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ background: "linear-gradient(135deg, var(--success) 0%, #34d399 100%)", color: "white", padding: "1.5rem", borderRadius: "0.75rem", boxShadow: "var(--shadow-md)" }}>
          <p style={{ opacity: 0.9, marginBottom: "0.25rem" }}>Ingresos</p>
          <h3 style={{ color: "white", background: "none", WebkitTextFillColor: "white", margin: 0 }}>+{totals.income.toFixed(2)}€</h3>
        </div>
        <div style={{ background: "linear-gradient(135deg, var(--danger) 0%, #f87171 100%)", color: "white", padding: "1.5rem", borderRadius: "0.75rem", boxShadow: "var(--shadow-md)" }}>
          <p style={{ opacity: 0.9, marginBottom: "0.25rem" }}>Gastos</p>
          <h3 style={{ color: "white", background: "none", WebkitTextFillColor: "white", margin: 0 }}>-{totals.expense.toFixed(2)}€</h3>
        </div>
      </div>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>🕐 Filtros y Período</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Mes y Año</label>
            <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Filtrar cuenta</label>
            <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)}>
              <option value="ALL">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>➕ Nuevo Movimiento</h3>

        {accounts.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: "0.5rem" }}>No tienes cuentas. Crea primero en</p>
            <a href="/accounts" style={{ fontSize: "1.1rem", fontWeight: "700" }}>🏦 Ir a Cuentas</a>
          </div>
        ) : categories.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: "0.5rem" }}>No tienes categorías. Crea primero en</p>
            <a href="/categories" style={{ fontSize: "1.1rem", fontWeight: "700" }}>🏷️ Ir a Categorías</a>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.2fr 1.2fr auto", gap: "1rem", marginBottom: "1rem" }}>
              <input
                placeholder="Descripción (Alquiler, Nómina, Supermercado...)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <input
                type="number"
                step="0.01"
                placeholder="Cantidad"
                value={amount || 0}
                onChange={(e) => setAmount(Number(e.target.value))}
              />

              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">-- Categoría --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">-- Cuenta --</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                placeholder="Fecha (opcional)"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />

              <button onClick={createTx} style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--info) 100%)", color: "white" }}>
                ✅ Añadir
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: "1.5rem" }}>📊 Listado de Movimientos ({txs.length})</h3>

        {txs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📭</p>
            <p>No hay movimientos para este período/filtro</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Cuenta</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th style={{ textAlign: "center" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const catName = t.categories?.[0]?.name ?? "?";
                const accName = t.accounts?.[0]?.name ?? "?";
                const isTransfer = !!t.transfer_group_id;
                const isIncome = t.categories?.[0]?.direction === "INCOME";

                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: "500", color: "var(--foreground)" }}>{t.tx_date || "—"}</td>
                    <td>
                      {t.description}
                      {isTransfer && <span style={{ opacity: 0.6, fontSize: "0.9rem" }}> 🔄</span>}
                    </td>
                    <td>
                      <span style={{
                        fontSize: "0.85rem",
                        padding: "0.25rem 0.75rem",
                        background: isIncome ? "var(--success)" : "var(--danger)",
                        color: "white",
                        borderRadius: "9999px",
                      }}>
                        {catName}
                      </span>
                    </td>
                    <td style={{ fontWeight: "500" }}>{accName}</td>
                    <td style={{ textAlign: "right", fontWeight: "700", color: isIncome ? "var(--success)" : "var(--danger)" }}>
                      {isIncome ? "+" : "-"}{Number(t.amount).toFixed(2)}€
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => deleteTx(t.id, isTransfer)} style={{ background: "var(--danger)", color: "white", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
