"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "rruiz/lib/supabase";

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

  // joins
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

export default function MovementsPage() {
  const [ym, setYm] = useState(currentYM());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [filterAccountId, setFilterAccountId] = useState<string>("ALL");

  // form
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(""); // YYYY-MM-DD opcional

  async function loadBase() {
    const [{ data: acc, error: accErr }, { data: cat, error: catErr }] = await Promise.all([
      supabase.from("accounts").select("id,name,current_balance").order("created_at"),
      supabase.from("categories").select("id,name,direction,bucket").order("created_at"),
    ]);

    if (accErr) alert(accErr.message);
    if (catErr) alert(catErr.message);

    setAccounts((acc as Account[]) || []);
    setCategories((cat as Category[]) || []);

    // defaults selects
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

    // fecha opcional: si viene, debe ser YYYY-MM-DD
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
      alert("Este movimiento es parte de una transferencia. Se gestionará en Fase 4.");
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
      const dir = t.categories?.direction;
      if (dir === "INCOME") income += Number(t.amount);
      else if (dir === "EXPENSE") expense += Number(t.amount);
    }
    return { income, expense };
  }, [txs]);

  return (
    <main style={{ maxWidth: 1050, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Movimientos</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mes (YYYY-MM)</div>
          <input value={ym} onChange={(e) => setYm(e.target.value)} placeholder="2026-01" />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Filtrar cuenta</div>
          <select value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)}>
            <option value="ALL">Todas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <a href="/dashboard" style={{ marginLeft: "auto" }}>← Volver</a>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 12 }}>
        <h3>Añadir movimiento</h3>

        {accounts.length === 0 ? (
          <p>
            No tienes cuentas. Crea primero en <a href="/accounts">Cuentas</a>.
          </p>
        ) : categories.length === 0 ? (
          <p>
            No tienes categorías. Crea primero en <a href="/categories">Categorías</a>.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 10 }}>
              <input
                placeholder="Descripción (Ej: Alquiler, Nómina, Super...)"
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
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.direction}/{c.bucket})
                  </option>
                ))}
              </select>

              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                placeholder="Fecha (opcional)"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />

              <button onClick={createTx}>Añadir</button>
            </div>

            <p style={{ marginTop: 10, opacity: 0.7 }}>
              Nota: transferencias entre cuentas se harán en Fase 4 con un formulario específico.
            </p>
          </>
        )}
      </section>

      <hr style={{ margin: "18px 0" }} />

      <section>
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>Listado ({txs.length})</h3>
          <div style={{ opacity: 0.75 }}>
            Ingresos: <strong>{totals.income.toFixed(2)}€</strong> · Gastos:{" "}
            <strong>{totals.expense.toFixed(2)}€</strong>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Categoría</th>
                <th>Cuenta</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const catName = t.categories?.name ?? "¿Categoría?";
                const accName = t.accounts?.name ?? "¿Cuenta?";
                const isTransfer = !!t.transfer_group_id;

                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>{t.tx_date ?? ""}</td>
                    <td>
                      {t.description}{" "}
                      {isTransfer && <span style={{ opacity: 0.6 }}>(transfer)</span>}
                    </td>
                    <td>{catName}</td>
                    <td>{accName}</td>
                    <td style={{ textAlign: "right" }}>{Number(t.amount).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button onClick={() => deleteTx(t.id, isTransfer)}>Borrar</button>
                    </td>
                  </tr>
                );
              })}

              {txs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 16, opacity: 0.7 }}>
                    No hay movimientos para este mes/filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
