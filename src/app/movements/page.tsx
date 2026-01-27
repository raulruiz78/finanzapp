"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import {
  VARIABLE_EXPENSE_NAME,
  VARIABLE_INCOME_NAME,
  isInternalVariableCategoryName,
} from "@/lib/internalCategories";
import { formatEUR } from "@/lib/format";
import type { Account, Category, CategoryJoin, AccountJoin, OneOrMany, Direction } from "@/lib/types";

type VariableDirection = Direction;

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

function currentISODate() {
  // YYYY-MM-DD in local time
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidYM(ym: string) {
  return /^\d{4}-\d{2}$/.test(ym);
}

function sanitizeAmountInput(raw: string) {
  // allow digits + one decimal separator (.) ; no negatives
  let s = raw.replace(/,/g, ".");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

function parseAmount(raw: string) {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}


export default function MovementsPage() {
  const configured = useRequireSupabaseConfigured("/");
  const [ym, setYm] = useState(currentYM());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [filterAccountId, setFilterAccountId] = useState<string>("ALL");
  const [accountId, setAccountId] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [direction, setDirection] = useState<VariableDirection>("EXPENSE");
  const [description, setDescription] = useState<string>("");
  const [headerDate, setHeaderDate] = useState<string>(currentISODate());


  async function loadBase() {
    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return;

    const [{ data: acc, error: accErr }, { data: cat, error: catErr }] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,current_balance")
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("categories")
        .select("id,name,direction,amount")
        .eq("user_id", userId)
        .order("created_at"),
    ]);

    if (accErr) alert(accErr.message);
    if (catErr) alert(catErr.message);

    const accs = (acc as Account[]) || [];
    const cats = (cat as Category[]) || [];

    setAccounts(accs);
    setCategories(cats);

    if (!accountId && accs[0]?.id) setAccountId(accs[0].id);
  }

  async function ensureVariableCategoryId(dir: "INCOME" | "EXPENSE") {
    if (!supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return null;

    const name = dir === "INCOME" ? VARIABLE_INCOME_NAME : VARIABLE_EXPENSE_NAME;
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,direction,amount")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();

    if (error) return null;
    if ((data as any)?.id) return (data as any).id as string;

    // categories.amount has a >0 constraint, so use a tiny placeholder.
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

  async function quickAddFixed(template: Category) {
    if (!isValidYM(ym)) return alert("Mes inválido. Usa YYYY-MM (ej: 2026-01).");
    if (!accountId) return alert("Selecciona cuenta");
    if (!supabase) return;
    const amt = Number(template.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) return alert("Esta plantilla no tiene importe válido");
    if (headerDate && !/^\d{4}-\d{2}-\d{2}$/.test(headerDate)) {
      return alert("Fecha inválida. Usa YYYY-MM-DD.");
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const { error } = await supabase.from("transactions").insert({
      ym,
      tx_date: headerDate || null,
      description: template.name,
      amount: amt,
      account_id: accountId,
      category_id: template.id,
      transfer_group_id: null,
      user_id: session.session.user.id,
    });

    if (error) return alert(error.message);
    await loadTx();
  }

  async function loadTx() {
    if (!isValidYM(ym)) return;
    if (!supabase) return;

    let q = supabase
      .from("transactions")
      .select(`
        id, ym, tx_date, description, amount, account_id, category_id, transfer_group_id, created_at,
        accounts:accounts(name),
        categories:categories(name, direction, amount)
      `)
      .eq("ym", ym)
      .order("tx_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (filterAccountId !== "ALL") q = q.eq("account_id", filterAccountId);

    const { data, error } = await q;

    if (error) alert(humanizeSupabaseSchemaError(error.message) ?? error.message);
    else setTxs((data as TxRow[]) || []);
  }

  async function createTx() {
    if (!isValidYM(ym)) return alert("Mes inválido. Usa YYYY-MM (ej: 2026-01).");
    if (!accountId) return alert("Selecciona cuenta");
    if (!description.trim()) return alert("Descripción requerida");
    const amount = parseAmount(amountStr);
    if (!amount) return alert("Cantidad debe ser > 0");

    if (!supabase) return;

    if (headerDate && !/^\d{4}-\d{2}-\d{2}$/.test(headerDate)) {
      return alert("Fecha inválida. Usa YYYY-MM-DD.");
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const variableCategoryId = await ensureVariableCategoryId(direction);
    if (!variableCategoryId) return alert("No se pudo preparar la categoría de movimiento variable.");

    const { error } = await supabase.from("transactions").insert({
      ym,
      tx_date: headerDate || null,
      description: description.trim(),
      amount,
      account_id: accountId,
      category_id: variableCategoryId,
      transfer_group_id: null,
      user_id: session.session.user.id,
    });

    if (error) return alert(error.message);

    setDescription("");
    setAmountStr("");
    await loadTx();
  }

  async function deleteTx(id: string, isTransfer: boolean) {
    if (isTransfer) {
      alert("Este movimiento es parte de una transferencia. Se gestiona en Transferencias.");
      return;
    }
    if (!confirm("¿Borrar movimiento?")) return;

    if (!supabase) return;

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
      const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
      const dir = cat?.direction;
      if (dir === "INCOME") income += Number(t.amount);
      else if (dir === "EXPENSE") expense += Number(t.amount);
    }
    return { income, expense };
  }, [txs]);

  const fixedTemplates = useMemo(() => {
    const list = categories
      .filter((c) => Number(c.amount ?? 0) > 0 && c.name !== VARIABLE_EXPENSE_NAME && c.name !== VARIABLE_INCOME_NAME)
      .slice();
    list.sort((a, b) => a.direction.localeCompare(b.direction) || a.name.localeCompare(b.name));
    return list;
  }, [categories]);

  if (!configured || !supabaseConfigured) return null;

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

        {accounts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>Fecha</label>
              <input
                type="date"
                value={headerDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setHeaderDate(next);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setYm(next.slice(0, 7));
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>Cuenta</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">-- Cuenta --</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
          <div style={{ padding: "1.25rem", borderRadius: "0.75rem", background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
            <h4 style={{ marginBottom: "0.75rem" }}>⚡ Fijos (rápido)</h4>
            {fixedTemplates.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                No hay plantillas fijas. Crea categorías con importe en <a href="/categories">Categorías</a>.
              </p>
            ) : (
              <>
                <p style={{ marginTop: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Pulsa para añadir un movimiento fijo a la cuenta seleccionada.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {fixedTemplates.map((t) => {
                    const isIncome = t.direction === "INCOME";
                    return (
                      <button
                        key={t.id}
                        onClick={() => quickAddFixed(t)}
                        style={{
                          padding: "0.6rem 0.9rem",
                          borderRadius: "9999px",
                          background: isIncome ? "var(--success)" : "var(--danger)",
                          color: "white",
                        }}
                        title="Añadir movimiento"
                      >
                        {isIncome ? "📥" : "📤"} {t.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ padding: "1.25rem", borderRadius: "0.75rem", background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
            <h4 style={{ marginBottom: "0.75rem" }}>✍️ Variable (configurable)</h4>
            {accounts.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Necesitas una cuenta para crear movimientos.
              </p>
            ) : categories.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Necesitas categorías para crear movimientos.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "1rem" }}>
                <input
                  placeholder="Descripción (Supermercado, Cena, Extra...)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <select value={direction} onChange={(e) => setDirection(e.target.value as any)} title="Gasto o ingreso">
                  <option value="EXPENSE">📤 Gasto</option>
                  <option value="INCOME">📥 Ingreso</option>
                </select>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Cantidad"
                  value={amountStr}
                  onChange={(e) => setAmountStr(sanitizeAmountInput(e.target.value))}
                />

                <button
                  onClick={createTx}
                  style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--info) 100%)", color: "white" }}
                >
                  ✅ Añadir
                </button>
              </div>
            )}
          </div>
        </div>

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
        ) : null}
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
                const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
                const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts;
                const rawCatName = cat?.name ?? "—";
                const catName = isInternalVariableCategoryName(rawCatName) ? "Variable" : rawCatName;
                const accName = acc?.name ?? "?";
                const isTransfer = Boolean(t.transfer_group_id);
                const isIncome = cat?.direction === "INCOME";
                const amt = Number(t.amount) || 0;
                const isFixed =
                  !isTransfer &&
                  cat?.name &&
                  t.description &&
                  String(t.description).trim() === String(cat.name).trim() &&
                  Number(cat.amount ?? NaN) === amt;
                const chipLabel = isTransfer ? "Transferencia" : isFixed ? catName : catName === "Variable" ? "Variable" : `${catName} (var)`;

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
                        {chipLabel}
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
