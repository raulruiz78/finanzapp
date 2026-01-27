"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import { VARIABLE_EXPENSE_NAME, VARIABLE_INCOME_NAME } from "@/lib/internalCategories";
import type { AccountLite, Category, CategoryJoin, AccountJoin, OneOrMany, Direction } from "@/lib/types";

type Account = AccountLite;

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
  accounts?: OneOrMany<AccountJoin> | null;
  categories?: OneOrMany<CategoryJoin> | null;
};

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function isValidYM(ym: string) {
  return /^\d{4}-\d{2}$/.test(ym);
}

function newUUID() {
  const c: any = crypto as any;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function TransfersPage() {
  const configured = useRequireSupabaseConfigured("/");
  const [ym, setYm] = useState(currentYM());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [txDate, setTxDate] = useState<string>("");
  const [note, setNote] = useState<string>("");

  async function ensureVariableCategoryId(userId: string, dir: "INCOME" | "EXPENSE") {
    if (!supabase) return null;
    const name = dir === "INCOME" ? VARIABLE_INCOME_NAME : VARIABLE_EXPENSE_NAME;

    const { data, error } = await supabase
      .from("categories")
      .select("id,name,direction,amount")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();

    if (error) return null;
    if ((data as any)?.id) return (data as any).id as string;

    // categories.amount has a >0 constraint in your schema, so we use a tiny amount.
    const ins = await supabase.from("categories").insert({
      user_id: userId,
      name,
      direction: dir,
      amount: 0.01,
    });
    if (ins.error) return null;

    const reread = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();
    if (reread.error) return null;
    return (reread.data as any)?.id ?? null;
  }

  async function loadBase() {
    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return;

    const [{ data: acc, error: accErr }, { data: cat, error: catErr }] = await Promise.all([
      supabase.from("accounts").select("id,name").eq("user_id", userId).order("created_at"),
      supabase.from("categories").select("id,name,direction,amount").eq("user_id", userId).order("created_at"),
    ]);

    if (accErr) alert(accErr.message);
    if (catErr) alert(catErr.message);

    const accs = (acc as Account[]) || [];
    setAccounts(accs);
    setCategories((cat as Category[]) || []);

    if (!fromAccountId && accs[0]?.id) setFromAccountId(accs[0].id);
    if (!toAccountId && accs[1]?.id) setToAccountId(accs[1].id);
  }

  function pickVariableCategoryId(dir: "INCOME" | "EXPENSE") {
    const preferredName = dir === "INCOME" ? VARIABLE_INCOME_NAME : VARIABLE_EXPENSE_NAME;
    return categories.find((c) => c.direction === dir && c.name === preferredName)?.id ?? null;
  }

  async function loadTransfers() {
    if (!isValidYM(ym)) return;
    if (!supabase) return;

    const { data, error } = await supabase
      .from("transactions")
      .select(`
        id, ym, tx_date, description, amount, account_id, category_id, transfer_group_id, created_at,
        accounts:accounts(name),
        categories:categories(name, direction)
      `)
      .eq("ym", ym)
      .not("transfer_group_id", "is", null)
      .order("tx_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      alert(humanizeSupabaseSchemaError(error.message) ?? error.message);
      return;
    }

    setTxs((data as TxRow[]) || []);
  }

  async function createTransfer() {
    if (!isValidYM(ym)) return alert("Mes inválido. Usa YYYY-MM (ej: 2026-01).");
    if (!fromAccountId || !toAccountId) return alert("Selecciona cuentas origen y destino");
    if (fromAccountId === toAccountId) return alert("La cuenta origen y destino no pueden ser la misma");
    if (!Number.isFinite(amount) || amount <= 0) return alert("Cantidad debe ser > 0");
    if (txDate && !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return alert("Fecha inválida. Usa YYYY-MM-DD o déjala vacía.");

    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const fromName = accounts.find((a) => a.id === fromAccountId)?.name ?? "origen";
    const toName = accounts.find((a) => a.id === toAccountId)?.name ?? "destino";

    // We keep transfers "as variable" by using the dedicated variable categories.
    // The DB schema requires category_id NOT NULL.
    const userId = session.session.user.id;
    const outId = (await ensureVariableCategoryId(userId, "EXPENSE")) ?? pickVariableCategoryId("EXPENSE");
    const inId = (await ensureVariableCategoryId(userId, "INCOME")) ?? pickVariableCategoryId("INCOME");
    if (!outId || !inId) return alert("No se pudieron preparar las categorías de movimiento variable.");

    const groupId = newUUID();
    const baseDesc = note.trim() ? `Transferencia: ${note.trim()}` : "Transferencia";

    const outTx = {
      ym,
      tx_date: txDate || null,
      description: `${baseDesc} → ${toName}`,
      amount,
      account_id: fromAccountId,
      category_id: outId,
      transfer_group_id: groupId,
      user_id: userId,
    };

    const inTx = {
      ym,
      tx_date: txDate || null,
      description: `${baseDesc} ← ${fromName}`,
      amount,
      account_id: toAccountId,
      category_id: inId,
      transfer_group_id: groupId,
      user_id: userId,
    };

    const { error } = await supabase.from("transactions").insert([outTx, inTx]);
    if (error) return alert(error.message);

    setAmount(0);
    setTxDate("");
    setNote("");
    await loadBase();
    await loadTransfers();
  }

  async function deleteTransfer(groupId: string) {
    if (!confirm("¿Borrar esta transferencia? (se borran los 2 asientos)")) return;

    if (!supabase) return;

    const { error } = await supabase.from("transactions").delete().eq("transfer_group_id", groupId);
    if (error) alert(error.message);
    else loadTransfers();
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const transfers = useMemo(() => {
    const map = new Map<string, TxRow[]>();
    for (const t of txs) {
      if (!t.transfer_group_id) continue;
      if (!map.has(t.transfer_group_id)) map.set(t.transfer_group_id, []);
      map.get(t.transfer_group_id)!.push(t);
    }

    const rows = Array.from(map.entries()).map(([groupId, items]) => {
      const out = items.find((x) => {
        const cat = Array.isArray(x.categories) ? x.categories[0] : x.categories;
        return cat?.direction === "EXPENSE";
      });
      const inn = items.find((x) => {
        const cat = Array.isArray(x.categories) ? x.categories[0] : x.categories;
        return cat?.direction === "INCOME";
      });

      const outAcc = Array.isArray(out?.accounts) ? out?.accounts[0] : out?.accounts;
      const inAcc = Array.isArray(inn?.accounts) ? inn?.accounts[0] : inn?.accounts;

      const from = outAcc?.name ?? "¿origen?";
      const to = inAcc?.name ?? "¿destino?";
      const amount = Number(out?.amount ?? inn?.amount ?? 0);
      const date = out?.tx_date ?? inn?.tx_date ?? "";
      const desc = out?.description ?? inn?.description ?? "Transferencia";

      return { groupId, from, to, amount, date, desc, itemsCount: items.length };
    });

    rows.sort((a, b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") || a.desc.localeCompare(b.desc));
    return rows;
  }, [txs]);

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>💸 Transferencias</h1>
        <a href="/dashboard" style={{ color: "var(--primary)", fontWeight: "600" }}>← Volver</a>
      </div>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>🕐 Período</h3>
        <div style={{ maxWidth: "300px" }}>
          <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Mes y Año</label>
          <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
        </div>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>✨ Nueva Transferencia</h3>

        {accounts.length < 2 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: "0.5rem" }}>Necesitas al menos 2 cuentas para transferir</p>
            <a href="/accounts" style={{ fontSize: "1.1rem", fontWeight: "700" }}>🏦 Ir a Cuentas</a>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr 2fr auto", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Desde</label>
                <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Hacia</label>
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Cantidad</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount || 0}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Fecha</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: "600", marginBottom: "0.5rem" }}>Nota (opcional)</label>
                <input
                  placeholder="Ahorro, recibos..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <button onClick={createTransfer} style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--info) 100%)", color: "white", alignSelf: "flex-end" }}>
                ✅ Transferir
              </button>
            </div>

            <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              💡 Esto crea 2 asientos: salida en origen e entrada en destino
            </p>
          </>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: "1.5rem" }}>📋 Transferencias del Mes ({transfers.length})</h3>

        {transfers.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📭</p>
            <p>No hay transferencias en este período</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Desde</th>
                <th>Hacia</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th style={{ textAlign: "center" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.groupId}>
                  <td style={{ fontWeight: "500" }}>{t.date || "—"}</td>
                  <td>
                    {t.desc}
                    {t.itemsCount !== 2 && <span style={{ opacity: 0.6 }}> ⚠️ ({t.itemsCount})</span>}
                  </td>
                  <td>
                    <span style={{ background: "var(--danger)", color: "white", padding: "0.25rem 0.75rem", borderRadius: "9999px", fontSize: "0.85rem" }}>
                      {t.from}
                    </span>
                  </td>
                  <td>
                    <span style={{ background: "var(--success)", color: "white", padding: "0.25rem 0.75rem", borderRadius: "9999px", fontSize: "0.85rem" }}>
                      {t.to}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: "700", color: "var(--primary)" }}>
                    {t.amount.toFixed(2)}€
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => deleteTransfer(t.groupId)} style={{ background: "var(--danger)", color: "white", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
