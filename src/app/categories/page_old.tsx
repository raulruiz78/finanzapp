"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "rruiz/lib/supabase";

type Direction = "INCOME" | "EXPENSE";
type Bucket = "FIXED" | "VARIABLE" | "TRANSFER" | "OTHER";

type Category = {
  id: string;
  name: string;
  direction: Direction;
  bucket: Bucket;
  created_at: string;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);

  // create form
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<Direction>("EXPENSE");
  const [bucket, setBucket] = useState<Bucket>("OTHER");

  // edit
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
    // Inserta defaults si no existen (por nombre)
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
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Categorías (Tipos)</h1>

      <p style={{ opacity: 0.75 }}>
        Define tus tipos: ingresos/gastos y si son fijos, variables o transferencias.
      </p>

      <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 12 }}>
        <h3>Nueva categoría</h3>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10 }}>
          <input
            placeholder="Nombre (Ej: Alquiler, Netflix, Supermercado...)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
            <option value="INCOME">INCOME</option>
            <option value="EXPENSE">EXPENSE</option>
          </select>

          <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            <option value="FIXED">FIXED</option>
            <option value="VARIABLE">VARIABLE</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="OTHER">OTHER</option>
          </select>

          <button onClick={create}>Crear</button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button onClick={seedDefaults}>+ Añadir defaults</button>
          <a href="/dashboard" style={{ alignSelf: "center" }}>← Volver</a>
        </div>
      </section>

      <hr style={{ margin: "20px 0" }} />

      {editingId && (
        <section style={{ padding: 16, border: "1px solid #eee", borderRadius: 12, marginBottom: 20 }}>
          <h3>Editar categoría</h3>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 10 }}>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} />

            <select value={editDirection} onChange={(e) => setEditDirection(e.target.value as Direction)}>
              <option value="INCOME">INCOME</option>
              <option value="EXPENSE">EXPENSE</option>
            </select>

            <select value={editBucket} onChange={(e) => setEditBucket(e.target.value as Bucket)}>
              <option value="FIXED">FIXED</option>
              <option value="VARIABLE">VARIABLE</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="OTHER">OTHER</option>
            </select>

            <button onClick={saveEdit}>Guardar</button>
            <button onClick={cancelEdit}>Cancelar</button>
          </div>
        </section>
      )}

      <section>
        <h3>Mis categorías</h3>

        {categories.length === 0 ? (
          <p>No tienes categorías todavía. Crea alguna o pulsa “Añadir defaults”.</p>
        ) : (
          grouped.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <h4 style={{ marginBottom: 8 }}>{group}</h4>
              <ul style={{ marginTop: 0 }}>
                {items.map((c) => (
                  <li key={c.id} style={{ marginBottom: 8 }}>
                    <strong>{c.name}</strong>
                    <button style={{ marginLeft: 10 }} onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button style={{ marginLeft: 8 }} onClick={() => remove(c.id)}>
                      Borrar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
