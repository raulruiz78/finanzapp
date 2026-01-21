"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "rruiz/lib/supabase";

type Account = { id: string; name: string };
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
  accounts?: { name: string } | null;
  categories?: { name: string; direction: string; bucket: string } | null;
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
  const [ym, setYm] = useState(currentYM());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [txDate, setTxDate] = useState<string>("");
  const [note, setNote] = useState<string>("");

  async function loadBase() {
    const [{ data: acc, error: accErr }, { data: cat, error: catErr }] = await Promise.all([
      supabase.from("accounts").select("id,name").order("created_at"),
      supabase.from("categories").select("id,name,direction,bucket").order("created_at"),
    ]);

    if (accErr) alert(accErr.message);
    if (catErr) alert(catErr.message);

    const accs = (acc as Account[]) || [];
    setAccounts(accs);
    setCategories((cat as Category[]) || []);

    if (!fromAccountId && accs[0]?.id) setFromAccountId(accs[0].id);
    if (!toAccountId && accs[1]?.id) setToAccountId(accs[1].id);
  }

  async function ensureTransferCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,direction,bucket")
      .in("name", ["Transferencia (salida)", "Transferencia (entrada)"]);

    if (error) {
      alert(error.message);
      return { outId: null as string | null, inId: null as string | null };
    }

    const existing = (data as Category[]) || [];
    const out = existing.find((c) => c.name === "Transferencia (salida)");
    const inn = existing.find((c) => c.name === "Transferencia (entrada)");

    const toInsert: Array<Partial<Category> & { name: string; direction: any; bucket: any; user_id?: string }> = [];
    if (!out) toInsert.push({ name: "Transferencia (salida)", direction: "EXPENSE", bucket: "TRANSFER" });
    if (!inn) toInsert.push({ name: "Transferencia (entrada)", direction: "INCOME", bucket: "TRANSFER" });

    if (toInsert.length > 0) {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.id) {
        const userId = session.session.user.id;
        const toInsertWithUser = toInsert.map(item => ({ ...item, user_id: userId }));
        const ins = await supabase.from("categories").insert(toInsertWithUser);
        if (ins.error) {
          // Si ya existen, no importa
        }
      }
    }

    const { data: data2, error: err2 } = await supabase
      .from("categories")
      .select("id,name,direction,bucket")
      .in("name", ["Transferencia (salida)", "Transferencia (entrada)"]);

    if (err2) {
      alert(err2.message);
      return { outId: null, inId: null };
    }

    const final = (data2 as Category[]) || [];
    const out2 = final.find((c) => c.name === "Transferencia (salida)");
    const in2 = final.find((c) => c.name === "Transferencia (entrada)");

    return { outId: out2?.id ?? null, inId: in2?.id ?? null };
  }

  async function loadTransfers() {
    if (!isValidYM(ym)) return;

    const { data, error } = await supabase
      .from("transactions")
      .select(`
        id, ym, tx_date, description, amount, account_id, category_id, transfer_group_id, created_at,
        accounts:accounts(name),
        categories:categories(name, direction, bucket)
      `)
      .eq("ym", ym)
      .not("transfer_group_id", "is", null)
      .order("tx_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) alert(error.message);
    else setTxs((data as TxRow[]) || []);
  }

  async function createTransfer() {
    if (!isValidYM(ym)) return alert("Mes inválido. Usa YYYY-MM (ej: 2026-01).");
    if (!fromAccountId || !toAccountId) return alert("Selecciona cuentas origen y destino");
    if (fromAccountId === toAccountId) return alert("La cuenta origen y destino no pueden ser la misma");
    if (!Number.isFinite(amount) || amount <= 0) return alert("Cantidad debe ser > 0");
    if (txDate && !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) return alert("Fecha inválida. Usa YYYY-MM-DD o déjala vacía.");

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const fromName = accounts.find((a) => a.id === fromAccountId)?.name ?? "origen";
    const toName = accounts.find((a) => a.id === toAccountId)?.name ?? "destino";

    const { outId, inId } = await ensureTransferCategories();
    if (!outId || !inId) return alert("No se pudieron preparar las categorías de transferencia.");

    const groupId = newUUID();
    const baseDesc = note.trim() ? `Transferencia: ${note.trim()}` : "Transferencia";
    const userId = session.session.user.id;

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
      const out = items.find((x) => x.categories?.direction === "EXPENSE");
      const inn = items.find((x) => x.categories?.direction === "INCOME");

      const from = out?.accounts?.name ?? "¿origen?";
      const to = inn?.accounts?.name ?? "¿destino?";
      const amount = Number(out?.amount ?? inn?.amount ?? 0);
      const date = out?.tx_date ?? inn?.tx_date ?? "";
      const desc = out?.description ?? inn?.description ?? "Transferencia";

      return { groupId, from, to, amount, date, desc, itemsCount: items.length };
    });

    rows.sort((a, b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") || a.desc.localeCompare(b.desc));
    return rows;
  }, [txs]);

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
