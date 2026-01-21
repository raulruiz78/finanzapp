"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Direction = "INCOME" | "EXPENSE";
type Bucket = "FIXED" | "VARIABLE" | "TRANSFER" | "OTHER";

type Category = {
  id: string;
  name: string;
  direction: Direction;
  bucket: Bucket;
  created_at: string;
};

const directionLabels: Record<Direction, string> = {
  INCOME: "📥 Ingreso",
  EXPENSE: "📤 Gasto",
};

const bucketLabels: Record<Bucket, string> = {
  FIXED: "Fijo",
  VARIABLE: "Variable",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const bucketColors: Record<Bucket, string> = {
  FIXED: "var(--danger)",
  VARIABLE: "var(--warning)",
  TRANSFER: "var(--info)",
  OTHER: "var(--text-secondary)",
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<Direction>("EXPENSE");
  const [bucket, setBucket] = useState<Bucket>("OTHER");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDirection, setEditDirection] = useState<Direction>("EXPENSE");
  const [editBucket, setEditBucket] = useState<Bucket>("OTHER");

  async function load() {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("created_at");

    if (error) alert(error.message);
    else setCategories((data as Category[]) || []);
  }

  async function create() {
    if (!name.trim()) return alert("Nombre requerido");

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const { error } = await supabase.from("categories").insert({
      name: name.trim(),
      direction,
      bucket,
      user_id: session.session.user.id,
    });

    if (error) return alert(error.message);

    setName("");
    setDirection("EXPENSE");
    setBucket("OTHER");
    await load();
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDirection(c.direction);
    setEditBucket(c.bucket);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDirection("EXPENSE");
    setEditBucket("OTHER");
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editName.trim()) return alert("Nombre requerido");

    const { error } = await supabase
      .from("categories")
      .update({
        name: editName.trim(),
        direction: editDirection,
        bucket: editBucket,
      })
      .eq("id", editingId);

    if (error) return alert(error.message);

    cancelEdit();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar este tipo?")) return;

    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  }

  async function seedDefaults() {
    const defaults: Array<{ name: string; direction: Direction; bucket: Bucket }> = [
      { name: "Nómina", direction: "INCOME", bucket: "OTHER" },
      { name: "Ingreso", direction: "INCOME", bucket: "OTHER" },
      { name: "Domiciliado", direction: "EXPENSE", bucket: "FIXED" },
      { name: "Gasto variable", direction: "EXPENSE", bucket: "VARIABLE" },
      { name: "Transferencia", direction: "EXPENSE", bucket: "TRANSFER" }
    ];

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) return alert("No autenticado");

    const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
    const toInsert = defaults
      .filter((d) => !existingNames.has(d.name.toLowerCase()))
      .map((d) => ({ ...d, user_id: session.session.user.id }));
    
    if (toInsert.length === 0) return;

    const { error } = await supabase.from("categories").insert(toInsert);
    if (error) return alert(error.message);

    await load();
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      const key = `${c.direction} / ${c.bucket}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  }, [categories]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>🏷️ Categorías</h1>
        <a href="/dashboard" style={{ color: "var(--primary)", fontWeight: "600" }}>← Volver</a>
      </div>

      <p style={{ marginBottom: "2rem", color: "var(--text-secondary)" }}>
        Organiza tus ingresos y gastos en categorías para mejor control
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>➕ Nueva Categoría</h3>

        {editingId && (
          <div style={{ background: "var(--surface-hover)", padding: "1.5rem", borderRadius: "0.75rem", marginBottom: "1.5rem", border: "2px solid var(--warning)" }}>
            <h4 style={{ marginBottom: "1rem" }}>✏️ Editando categoría</h4>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: "1rem" }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
              <select value={editDirection} onChange={(e) => setEditDirection(e.target.value as Direction)}>
                <option value="INCOME">📥 Ingreso</option>
                <option value="EXPENSE">📤 Gasto</option>
              </select>
              <select value={editBucket} onChange={(e) => setEditBucket(e.target.value as Bucket)}>
                <option value="FIXED">Fijo</option>
                <option value="VARIABLE">Variable</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="OTHER">Otro</option>
              </select>
              <button onClick={saveEdit} style={{ background: "var(--success)", color: "white" }}>✅ Guardar</button>
              <button onClick={cancelEdit} style={{ background: "var(--text-secondary)", color: "white" }}>❌ Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "1rem" }}>
          <input
            placeholder="Nombre (Alquiler, Netflix, Supermercado...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
            <option value="INCOME">📥 Ingreso</option>
            <option value="EXPENSE">📤 Gasto</option>
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            <option value="FIXED">Fijo</option>
            <option value="VARIABLE">Variable</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </select>
          <button onClick={create} style={{ background: "linear-gradient(135deg, var(--success) 0%, #34d399 100%)", color: "white" }}>
            ➕ Crear
          </button>
        </div>

        <button onClick={seedDefaults} style={{ marginTop: "1rem", background: "var(--primary)", color: "white" }}>
          📋 Cargar categorías por defecto
        </button>
      </section>

      <section>
        <h3 style={{ marginBottom: "1.5rem" }}>📚 Mis Categorías ({categories.length})</h3>

        {categories.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📭</p>
            <p>No tienes categorías. Crea una o pulsa "Cargar categorías por defecto"</p>
          </div>
        ) : (
          grouped.map(([group, items]) => {
            const [direction, bucket] = group.split(" / ");
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
                    {direction === "INCOME" ? "📥" : "📤"}
                  </div>
                  <h4 style={{ margin: 0 }}>{group}</h4>
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
                      <h5 style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>{c.name}</h5>
                      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.75rem",
                          background: bucketColors[c.bucket],
                          color: "white",
                          borderRadius: "9999px",
                          fontWeight: "600"
                        }}>
                          {bucketLabels[c.bucket]}
                        </span>
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
