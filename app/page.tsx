"use client";

import { useEffect, useMemo, useState } from "react";
import { db, seedDefaults, Account, Type, Tx, OpeningBalance } from "@/lib/db";
import { computeSummary } from "@/lib/calc";

function nowISO() {
  return new Date().toISOString();
}

function currentYM() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

export default function Page() {
  const [ym, setYm] = useState(currentYM());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [openings, setOpenings] = useState<OpeningBalance[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [accountId, setAccountId] = useState<number | undefined>(undefined);
  const [typeId, setTypeId] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    (async () => {
      await seedDefaults();
      await refreshAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  async function refreshAll() {
    const [a, t] = await Promise.all([db.accounts.toArray(), db.types.toArray()]);
    setAccounts(a);
    setTypes(t);

    if (!accountId && a[0]?.id) setAccountId(a[0].id);
    if (!typeId && t[0]?.id) setTypeId(t[0].id);

    await refreshMonth();
  }

  async function refreshMonth() {
    const [o, monthTxs] = await Promise.all([
      db.openings.where("ym").equals(ym).toArray(),
      db.txs.where("ym").equals(ym).toArray(),
    ]);
    setOpenings(o);
    setTxs(monthTxs);
  }

  const summary = useMemo(() => {
    if (!accounts.length) return [];
    return computeSummary({ ym, accounts, types, openings, txs });
  }, [ym, accounts, types, openings, txs]);

  async function setOpening(accId: number, value: number) {
    const existing = await db.openings.where({ ym, accountId: accId }).first();
    if (existing?.id) await db.openings.update(existing.id, { amount: value });
    else await db.openings.add({ ym, accountId: accId, amount: value });
    await refreshMonth();
  }

  async function addTx() {
    if (!accountId || !typeId) return;
    if (!description.trim()) return;

    const tx: Tx = {
      ym,
      date: date || undefined,
      description: description.trim(),
      amount: Number(amount) || 0,
      accountId,
      typeId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    await db.txs.add(tx);
    setDescription("");
    setAmount(0);
    setDate("");
    await refreshMonth();
  }

  async function deleteTx(id?: number) {
    if (!id) return;
    await db.txs.delete(id);
    await refreshMonth();
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 4 }}>FinanzApp — tipo Excel</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Memoria local (IndexedDB). Instalable en iPhone: Safari → Compartir → Añadir a pantalla de inicio.
      </p>

      <section style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mes (YYYY-MM)</div>
          <input value={ym} onChange={(e) => setYm(e.target.value)} placeholder="2026-01" />
        </label>
      </section>

      <hr style={{ margin: "16px 0" }} />

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Movimientos</h2>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8 }}>
            <input
              placeholder="Movimiento"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Cantidad"
              value={Number.isFinite(amount) ? amount : 0}
              onChange={(e) => setAmount(parseFloat(e.target.value))}
            />
            <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input placeholder="Fecha (opcional)" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <button onClick={addTx} style={{ marginTop: 8 }}>
            Añadir
          </button>

          <div style={{ marginTop: 12 }}>
            <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Tipo</th>
                  <th>Cuenta</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {txs
                  .slice()
                  .sort((a, b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31"))
                  .map((tx) => {
                    const t = types.find((x) => x.id === tx.typeId)?.name ?? "¿Tipo?";
                    const a = accounts.find((x) => x.id === tx.accountId)?.name ?? "¿Cuenta?";
                    return (
                      <tr key={tx.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td>{tx.date ?? ""}</td>
                        <td>{tx.description}</td>
                        <td>{t}</td>
                        <td>{a}</td>
                        <td style={{ textAlign: "right" }}>{tx.amount.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button onClick={() => deleteTx(tx.id)}>Borrar</button>
                        </td>
                      </tr>
                    );
                  })}
                {!txs.length && (
                  <tr>
                    <td colSpan={6} style={{ opacity: 0.6, padding: 12 }}>
                      No hay movimientos en este mes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 style={{ marginTop: 0 }}>Resumen por cuenta</h2>

          <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Cuenta</th>
                <th style={{ textAlign: "right" }}>Mes ant.</th>
                <th style={{ textAlign: "right" }}>Inicio</th>
                <th style={{ textAlign: "right" }}>Fin</th>
                <th style={{ textAlign: "right" }}>Ahorro</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.cuenta} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td>{r.cuenta}</td>
                  <td style={{ textAlign: "right" }}>{r.mesAnterior.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{r.inicio.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{r.fin.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{r.ahorroGasto.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Mes anterior (saldo base)</h3>
          <p style={{ marginTop: 0, opacity: 0.7, fontSize: 13 }}>
            Equivale a tu “Mes anterior”. Se guarda por mes y cuenta.
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            {accounts.map((acc) => {
              const cur = openings.find((o) => o.ym === ym && o.accountId === acc.id)?.amount ?? 0;
              return (
                <label key={acc.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <span>{acc.name}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={cur}
                    onChange={(e) => setOpening(acc.id!, parseFloat(e.target.value || "0"))}
                  />
                </label>
              );
            })}
          </div>

          <hr style={{ margin: "16px 0" }} />
          <details>
            <summary>Regla de cálculo</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{`Inicio = MesAnterior + Ingresos - (Fijos + Transferencias)
Fin    = Inicio - GastoVariable
Ahorro = Fin - MesAnterior`}</pre>
          </details>

          <hr style={{ margin: "16px 0" }} />
          <ConfigPanel onChange={refreshAll} />
        </div>
      </section>
    </main>
  );
}

function ConfigPanel({ onChange }: { onChange: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [accName, setAccName] = useState("");
  const [typeName, setTypeName] = useState("");
  const [direction, setDirection] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [bucket, setBucket] = useState<"FIXED" | "VARIABLE" | "TRANSFER" | "OTHER">("OTHER");

  useEffect(() => {
    (async () => {
      setAccounts(await db.accounts.toArray());
      setTypes(await db.types.toArray());
    })();
  }, []);

  async function refresh() {
    setAccounts(await db.accounts.toArray());
    setTypes(await db.types.toArray());
    await onChange();
  }

  async function addAccount() {
    const name = accName.trim();
    if (!name) return;
    await db.accounts.add({ name });
    setAccName("");
    await refresh();
  }

  async function addType() {
    const name = typeName.trim();
    if (!name) return;
    await db.types.add({ name, direction, bucket });
    setTypeName("");
    await refresh();
  }

  return (
    <section>
      <h3 style={{ marginTop: 0 }}>Configuración</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Cuentas</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Nueva cuenta" />
            <button onClick={addAccount}>Crear</button>
          </div>
          <ul>
            {accounts.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Tipos (categorías)</h4>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8 }}>
            <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Nuevo tipo" />
            <select value={direction} onChange={(e) => setDirection(e.target.value as any)}>
              <option value="INCOME">INCOME</option>
              <option value="EXPENSE">EXPENSE</option>
            </select>
            <select value={bucket} onChange={(e) => setBucket(e.target.value as any)}>
              <option value="FIXED">FIXED</option>
              <option value="VARIABLE">VARIABLE</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="OTHER">OTHER</option>
            </select>
            <button onClick={addType}>Crear</button>
          </div>

          <ul>
            {types.map((t) => (
              <li key={t.id}>
                {t.name} — {t.direction}/{t.bucket}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
