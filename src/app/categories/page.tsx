"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useRequireSupabaseConfigured } from "@/lib/useRequireSupabaseConfigured";
import { isInternalCategoryName } from "@/lib/internalCategories";
import type { BudgetBucket, Category, Direction } from "@/lib/types";
import { AppTopBar } from "@/app/ui/AppTopBar";

const directionLabels: Record<Direction, string> = {
  INCOME: "📥 Ingreso",
  EXPENSE: "📤 Gasto",
};

export default function CategoriesPage() {
  const configured = useRequireSupabaseConfigured("/");
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("EXPENSE");
  const [budgetBucket, setBudgetBucket] = useState<BudgetBucket>("NEEDS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editDirection, setEditDirection] = useState<Direction>("EXPENSE");
  const [editBudgetBucket, setEditBudgetBucket] = useState<BudgetBucket>("NEEDS");

  function normalizeName(raw: string) {
    return raw
      .trim()
        <AppTopBar title="Categorías" icon="🏷️" iconLabel="Categorías" backHref="/dashboard" />
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }


  function categoryIcon(categoryName: string) {
    const n = normalizeName(categoryName);
    if (!n) return "💰";

    // Streaming / subscriptions
    if (n.includes("netflix")) return "🎬";
    if (n.includes("prime video") || n.includes("amazon prime") || n === "prime") return "📦";
    if (n.includes("disney")) return "🏰";
    if (n.includes("hbo") || n.includes("max")) return "📺";
    if (n.includes("spotify")) return "🎵";

    // Home & utilities
    if (n.includes("alquiler") || n.includes("renta") || n.includes("hipoteca")) return "🏠";
    if (n.includes("luz") || n.includes("electric") || n.includes("energia")) return "⚡";
    if (n.includes("agua")) return "💧";
    if (n.includes("gas")) return "🔥";
    if (n.includes("internet") || n.includes("fibra") || n.includes("movil") || n.includes("telefono")) return "📶";

    return "💰";
  }

  function sanitizeAmountInput(raw: string) {
    // allow digits + decimal separators, disallow negatives
    let v = raw.replace(/[^0-9.,]/g, "");
    // keep only the first separator
    const firstSep = v.search(/[.,]/);
    if (firstSep !== -1) {
      const head = v.slice(0, firstSep + 1);
      const tail = v.slice(firstSep + 1).replace(/[.,]/g, "");
      v = head + tail;
    }
    return v;
  }

  function parseAmount(value: string) {
    const normalized = value.replace(",", ".").trim();
    const num = Number.parseFloat(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  async function load() {
    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");

    if (error) alert(error.message);
    else setCategories((data as Category[]) || []);
  }

  async function create() {
    if (!name.trim()) return alert("Nombre requerido");
    if (isInternalCategoryName(name)) return alert("Nombre reservado (interno del sistema).");
    const amt = parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) return alert("Importe requerido (debe ser > 0)");
    if (direction === "EXPENSE" && !budgetBucket) return alert("Selecciona si es Necesidades u Ocio.");

    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const payload: any = {
      name: name.trim(),
      direction,
      amount: amt,
      budget_bucket: direction === "EXPENSE" ? budgetBucket : null,
      user_id: session.session.user.id,
    };

    const { error } = await supabase.from("categories").insert(payload);

    if (error) return alert(error.message);

    setName("");
    setAmount("");
    setDirection("EXPENSE");
    setBudgetBucket("NEEDS");
    await load();
  }

  function startEdit(c: Category) {
    if (isInternalCategoryName(c.name)) return;
    setEditingId(c.id);
    setEditName(c.name);
    setEditAmount(String(Number(c.amount ?? 0)));
    setEditDirection(c.direction);
    const bucket = (c as any)?.budget_bucket as BudgetBucket | null | undefined;
    setEditBudgetBucket(c.direction === "EXPENSE" ? (bucket ?? "WANTS") : "NEEDS");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditAmount("");
    setEditDirection("EXPENSE");
    setEditBudgetBucket("NEEDS");
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editName.trim()) return alert("Nombre requerido");
    if (isInternalCategoryName(editName)) return alert("Nombre reservado (interno del sistema).");
    const amt = parseAmount(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) return alert("Importe requerido (debe ser > 0)");

    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return alert("No autenticado");

    const payload: any = {
      name: editName.trim(),
      direction: editDirection,
      amount: amt,
      budget_bucket: editDirection === "EXPENSE" ? editBudgetBucket : null,
    };

    const { error } = await supabase
      .from("categories")
      .update(payload)
      .eq("user_id", userId)
      .eq("id", editingId);

    if (error) return alert(error.message);

    cancelEdit();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar esta plantilla?")) return;

    if (!supabase) return;

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return alert("No autenticado");

    const { count, error: countErr } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("category_id", id);

    if (countErr) return alert(countErr.message);

    const txCount = count ?? 0;
    if (txCount > 0) {
      const answer = prompt(
        `No se puede borrar: hay ${txCount} movimiento(s) usando esta categoría.\n\n` +
          `Opciones:\n` +
          `- Escribe el NOMBRE de la categoría destino para reasignar esos movimientos\n\n` +
          `Deja vacío para cancelar:`
      );

      if (!answer?.trim()) return;

      const dest = visibleCategories.find((c) => c.id !== id && c.name.trim().toLowerCase() === answer.trim().toLowerCase());

      if (!dest) {
        return alert("Categoría destino no encontrada. Revisa el nombre exacto o créala primero.");
      }

      const ok = confirm(
        `Se reasignarán ${txCount} movimiento(s) a \"${dest.name}\" y luego se borrará la categoría. ¿Continuar?`
      );
      if (!ok) return;

      const { error: updErr } = await supabase
        .from("transactions")
        .update({ category_id: dest.id })
        .eq("user_id", userId)
        .eq("category_id", id);

      if (updErr) return alert(updErr.message);
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);

    if (error) alert(error.message);
    else load();
  }

  useEffect(() => {
    load();
  }, []);

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => !isInternalCategoryName(c.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const grouped = useMemo(() => {
    const map = new Map<Direction, Category[]>();
    for (const c of visibleCategories) {
      if (!map.has(c.direction)) map.set(c.direction, []);
      map.get(c.direction)!.push(c);
    }
    const entries: Array<[string, Category[]]> = Array.from(map.entries()).map(([k, v]) => [k, v]);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, list] of entries) list.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }, [visibleCategories]);

  if (!configured || !supabaseConfigured) return null;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "3rem 2rem" }}>
      <AppTopBar title="Categorías" backHref="/dashboard" />

      <p style={{ marginBottom: "2rem", color: "var(--text-secondary)" }}>
        Define plantillas (importe + dirección) para añadir movimientos con 1 click desde Movimientos.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>➕ Nuevo tipo</h3>

        {editingId && (
          <div style={{ background: "var(--surface-hover)", padding: "1.5rem", borderRadius: "0.75rem", marginBottom: "1.5rem", border: "2px solid var(--warning)" }}>
            <h4 style={{ marginBottom: "1rem" }}>✏️ Editando categoría</h4>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto auto", gap: "1rem" }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
              <select
                value={editDirection}
                onChange={(e) => {
                  const next = e.target.value as Direction;
                  setEditDirection(next);
                  if (next === "EXPENSE") setEditBudgetBucket((v) => v || "NEEDS");
                }}
              >
                <option value="INCOME">📥 Ingreso</option>
                <option value="EXPENSE">📤 Gasto</option>
              </select>
              <select
                value={editBudgetBucket}
                disabled={editDirection !== "EXPENSE"}
                onChange={(e) => setEditBudgetBucket(e.target.value as BudgetBucket)}
                title="Solo aplica a gastos"
              >
                <option value="NEEDS">Necesidades</option>
                <option value="WANTS">Ocio</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={editAmount}
                onChange={(e) => setEditAmount(sanitizeAmountInput(e.target.value))}
                placeholder="Importe"
                title="Importe de la plantilla"
              />
              <button onClick={saveEdit} style={{ background: "var(--success)", color: "white" }}>✅ Guardar</button>
              <button onClick={cancelEdit} style={{ background: "var(--text-secondary)", color: "white" }}>❌ Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "1rem" }}>
          <input
            placeholder="Nombre (Nómina, Netflix, Alquiler...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            value={direction}
            onChange={(e) => {
              const next = e.target.value as Direction;
              setDirection(next);
              if (next === "EXPENSE") setBudgetBucket((v) => v || "NEEDS");
            }}
          >
            <option value="INCOME">📥 Ingreso</option>
            <option value="EXPENSE">📤 Gasto</option>
          </select>
          <select
            value={budgetBucket}
            disabled={direction !== "EXPENSE"}
            onChange={(e) => setBudgetBucket(e.target.value as BudgetBucket)}
            title="Solo aplica a gastos"
          >
            <option value="NEEDS">Necesidades</option>
            <option value="WANTS">Ocio</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
            placeholder="Importe"
            title="Importe de la plantilla"
          />
          <button onClick={create} style={{ background: "linear-gradient(135deg, var(--success) 0%, #34d399 100%)", color: "white" }}>
            ➕ Crear
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: "1.5rem" }}>📚 Mis Categorías ({visibleCategories.length})</h3>

        {visibleCategories.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📭</p>
            <p>No tienes plantillas todavía. Crea una arriba.</p>
          </div>
        ) : (
          grouped.map(([group, items]) => {
            return (
              <div key={group} style={{ marginBottom: "2.5rem" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                  paddingBottom: "0.75rem",
                  borderBottom: "2px solid var(--border)"
                }}>
                  <div style={{ fontSize: "1.5rem" }}>
                    {group === "INCOME" ? "📥" : "📤"}
                  </div>
                  <h4 style={{ margin: 0 }}>{group === "INCOME" ? "Ingresos" : "Gastos"}</h4>
                  <div style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    {items.length} categoría{items.length !== 1 ? "s" : ""}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
                  {items.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        background: "var(--surface)",
                        border: "2px solid var(--border)",
                        borderRadius: "0.75rem",
                        padding: "1rem",
                        boxShadow: "var(--shadow)",
                        transition: "all 0.3s ease"
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
                      <h5 style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>
                        {categoryIcon(c.name)} {c.name}
                      </h5>
                      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.75rem",
                          background: c.direction === "INCOME" ? "var(--success)" : "var(--danger)",
                          color: "white",
                          borderRadius: "9999px",
                          fontWeight: "600"
                        }}>
                          {Number(c.amount || 0).toFixed(2)}€
                        </span>
                        {c.direction === "EXPENSE" && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.25rem 0.75rem",
                              background: (c as any)?.budget_bucket === "NEEDS" ? "var(--warning)" : "var(--info)",
                              color: "white",
                              borderRadius: "9999px",
                              fontWeight: "700",
                            }}
                          >
                            {(c as any)?.budget_bucket === "NEEDS" ? "Necesidades" : "Ocio"}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <button onClick={() => startEdit(c)} style={{ background: "var(--info)", color: "white", fontSize: "0.9rem", padding: "0.5rem" }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => remove(c.id)} style={{ background: "var(--danger)", color: "white", fontSize: "0.9rem", padding: "0.5rem" }}>
                          🗑️ Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
