"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { humanizeSupabaseSchemaError } from "@/lib/supabaseErrorMessage";
import type { Account, CategoryJoin, OneOrMany } from "@/lib/types";

type Tx = {
  id: string;
  ym: string;
  account_id: string;
  category_id: string;
  amount: number;
  description?: string | null;
  transfer_group_id?: string | null;
  categories?: OneOrMany<CategoryJoin> | null;
};

type MonthBalance = {
  id: string;
  account_id: string;
  ym: string;
  opening_balance: number;
  closing_balance: number | null;
  locked: boolean;
};

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}
function isValidYM(ym: string) {
  return /^\d{4}-\d{2}$/.test(ym);
}
function prevYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}
function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function MonthlyPage() {
  const configured = useRequireSupabaseConfigured("/");
  const [ym, setYm] = useState(currentYM());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [balances, setBalances] = useState<MonthBalance[]>([]);
  const [prevBalances, setPrevBalances] = useState<MonthBalance[]>([]);

  async function loadBase() {
    if (!supabase) return;
    const { data: acc, error: accErr } = await supabase
      .from("accounts")
      .select("id,name,current_balance")
      .order("created_at");
    if (accErr) alert(accErr.message);

    setAccounts((acc as Account[]) || []);
  }

  async function loadMonth() {
    if (!isValidYM(ym)) return;
    if (!supabase) return;

    const p = prevYM(ym);

    const [{ data: t, error: txErr }, { data: b, error: bErr }, { data: pb, error: pbErr }] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id,ym,account_id,category_id,amount,description,transfer_group_id,categories:categories(name,direction,amount)")
          .eq("ym", ym),
        supabase.from("month_balances").select("id,account_id,ym,opening_balance,closing_balance,locked").eq("ym", ym),
        supabase.from("month_balances").select("id,account_id,ym,opening_balance,closing_balance,locked").eq("ym", p),
      ]);

    if (txErr) alert(humanizeSupabaseSchemaError(txErr.message) ?? txErr.message);
    if (bErr) alert(bErr.message);
    if (pbErr) alert(pbErr.message);

    setTxs((t as Tx[]) || []);
    setBalances((b as MonthBalance[]) || []);
    setPrevBalances((pb as MonthBalance[]) || []);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (!configured || !supabaseConfigured) return;
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const balanceByAccount = useMemo(() => {
    const m = new Map<string, MonthBalance>();
    for (const b of balances) m.set(b.account_id, b);
    return m;
  }, [balances]);

  const prevClosingByAccount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of prevBalances) {
      if (b.closing_balance !== null && b.closing_balance !== undefined) {
        m.set(b.account_id, Number(b.closing_balance));
      }
    }
    return m;
  }, [prevBalances]);

  const summary = useMemo(() => {
    return accounts.map((acc) => {
      const mb = balanceByAccount.get(acc.id);
      const locked = mb?.locked ?? false;

      // opening: prefer explicit opening_balance; otherwise previous month's closing; else 0
      const opening =
        mb?.opening_balance !== undefined
          ? Number(mb.opening_balance)
          : prevClosingByAccount.get(acc.id) ?? 0;

      let income = 0;
      let fixedOut = 0;
      let variableOut = 0;
      let transferOut = 0;
      let transferIn = 0;
      let otherOut = 0;

      for (const t of txs) {
        if (t.account_id !== acc.id) continue;
        const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
        const amt = Number(t.amount);
        const dir = cat?.direction;
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

      const estimated = opening + income - fixedOut - transferOut - otherOut + transferIn;
      const fin = estimated - variableOut;

      return {
        accountId: acc.id,
        cuenta: acc.name,
        locked,
        opening: round2(opening),
        estimated: round2(estimated),
        fin: round2(fin),
        income: round2(income),
        fixedOut: round2(fixedOut),
        transferOut: round2(transferOut),
        transferIn: round2(transferIn),
        variableOut: round2(variableOut),
        otherOut: round2(otherOut),
      };
    });
  }, [accounts, balanceByAccount, prevClosingByAccount, txs]);

  async function upsertOpening(accountId: string, opening: number) {
    if (!isValidYM(ym)) return alert("Mes inválido");
    if (!supabase) return;
    const current = balanceByAccount.get(accountId);

    if (current?.locked) {
      alert("Mes cerrado (locked). Desbloquéalo para cambiar el inicial.");
      return;
    }

    const payload = {
      ym,
      account_id: accountId,
      opening_balance: opening,
      // no tocamos closing_balance aquí
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("month_balances")
      .upsert(payload, { onConflict: "user_id,account_id,ym" });

    // Nota: Supabase requiere que el UNIQUE incluya user_id; lo tenemos.
    // Pero en upsert onConflict debes referirte a columnas de unique.
    // Si te falla aquí, te doy el ajuste inmediato.

    if (error) {
      // fallback: update/insert manual si el upsert no permite onConflict como esperábamos
      // (en algunos setups, onConflict se referencia sin user_id)
      const { data: existing } = await supabase
        .from("month_balances")
        .select("id,locked")
        .eq("ym", ym)
        .eq("account_id", accountId)
        .maybeSingle();

      if (existing?.locked) return alert("Mes cerrado (locked).");

      if (existing?.id) {
        const u = await supabase.from("month_balances").update({ opening_balance: opening }).eq("id", existing.id);
        if (u.error) return alert(u.error.message);
      } else {
        const i = await supabase.from("month_balances").insert({ ym, account_id: accountId, opening_balance: opening });
        if (i.error) return alert(i.error.message);
      }
    }

    await loadMonth();
  }

  async function autofillFromPrev(accountId: string) {
    if (!supabase) return;
    const prev = prevClosingByAccount.get(accountId);
    if (prev === undefined) return alert("No hay cierre del mes anterior para esta cuenta.");
    await upsertOpening(accountId, prev);
  }

  async function closeMonth(accountId: string) {
    if (!supabase) return;
    const row = summary.find((s) => s.accountId === accountId);
    if (!row) return;

    if (!confirm(`¿Cerrar mes ${ym} para "${row.cuenta}" con cierre = ${row.fin.toFixed(2)}€?`)) return;

    // asegura que exista registro y escribe closing + locked
    const existing = balanceByAccount.get(accountId);

    if (existing?.locked) {
      alert("Ya está cerrado.");
      return;
    }

    // si no hay opening guardado, guardamos el calculado actual como opening explícito
    const openingToSave = row.opening;

    // update/insert
    const { data: mb } = await supabase
      .from("month_balances")
      .select("id")
      .eq("ym", ym)
      .eq("account_id", accountId)
      .maybeSingle();

    if (mb?.id) {
      const { error } = await supabase
        .from("month_balances")
        .update({
          opening_balance: openingToSave,
          closing_balance: row.fin,
          locked: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mb.id);

      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("month_balances").insert({
        ym,
        account_id: accountId,
        opening_balance: openingToSave,
        closing_balance: row.fin,
        locked: true,
      });

      if (error) return alert(error.message);
    }

    await loadMonth();
  }

  async function unlockMonth(accountId: string) {
    if (!supabase) return;
    const mb = balanceByAccount.get(accountId);
    if (!mb) return alert("No hay registro del mes. (Cierra el mes o define un inicial primero).");
    if (!confirm(`¿Desbloquear mes ${ym} para esta cuenta?`)) return;

    const { error } = await supabase
      .from("month_balances")
      .update({ locked: false })
      .eq("id", mb.id);

    if (error) alert(error.message);
    else loadMonth();
  }

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Resumen mensual</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mes (YYYY-MM)</div>
          <input value={ym} onChange={(e) => setYm(e.target.value)} placeholder="2026-01" />
        </label>

        <a href="/dashboard" style={{ marginLeft: "auto" }}>← Volver</a>
      </div>

      <p style={{ opacity: 0.75, marginTop: 10 }}>
        Inicial se puede definir manualmente o se arrastra del cierre del mes anterior. “Cerrar mes” guarda el cierre y bloquea.
      </p>

      {!isValidYM(ym) && (
        <p style={{ color: "crimson" }}>Mes inválido. Usa YYYY-MM (ej: 2026-01).</p>
      )}

      <hr style={{ margin: "18px 0" }} />

      {accounts.length === 0 ? (
        <p>No tienes cuentas. Crea primero en <a href="/accounts">Cuentas</a>.</p>
      ) : (
        <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Cuenta</th>
              <th style={{ textAlign: "right" }}>Inicial</th>
              <th style={{ textAlign: "right" }}>Estimado</th>
              <th style={{ textAlign: "right" }}>Fin</th>
              <th style={{ textAlign: "right" }}>Ingresos</th>
              <th style={{ textAlign: "right" }}>Fijos</th>
              <th style={{ textAlign: "right" }}>Transfer -</th>
              <th style={{ textAlign: "right" }}>Transfer +</th>
              <th style={{ textAlign: "right" }}>Variable</th>
              <th style={{ textAlign: "right" }}>Otros</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.accountId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>
                  <strong>{r.cuenta}</strong>{" "}
                  {r.locked ? <span style={{ opacity: 0.7 }}>(🔒 cerrado)</span> : null}
                </td>

                <td style={{ textAlign: "right" }}>
                  <input
                    type="number"
                    step="0.01"
                    value={r.opening}
                    disabled={r.locked}
                    style={{ width: 110, textAlign: "right" }}
                    onChange={(e) => upsertOpening(r.accountId, Number(e.target.value))}
                  />
                  <div style={{ marginTop: 6 }}>
                    <button disabled={r.locked} onClick={() => autofillFromPrev(r.accountId)}>
                      ⇦ del mes anterior
                    </button>
                  </div>
                </td>

                <td style={{ textAlign: "right" }}>{r.estimated.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.fin.toFixed(2)}</td>

                <td style={{ textAlign: "right" }}>{r.income.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.fixedOut.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.transferOut.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.transferIn.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.variableOut.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{r.otherOut.toFixed(2)}</td>

                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => closeMonth(r.accountId)} disabled={r.locked}>
                      Cerrar mes
                    </button>
                    <button onClick={() => unlockMonth(r.accountId)} disabled={!r.locked}>
                      Desbloquear
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {summary.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: 16, opacity: 0.7 }}>
                  No hay datos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <hr style={{ margin: "18px 0" }} />

      <div style={{ opacity: 0.75 }}>
        <strong>Regla:</strong>{" "}
        Estimado = Inicial + Ingresos − Fijos − Transfer(−) − Otros + Transfer(+) · Fin = Estimado − Variable
      </div>
    </main>
  );
}
