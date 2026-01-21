"use client";

import { useEffect, useState } from "react";
import { supabase } from "rruiz/lib/supabase";

export default function Dashboard() {
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/";
      else setEmail(data.session.user.email ?? "");
    });
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3rem" }}>
        <div>
          <h1>💰 FinanzApp</h1>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>Gestiona tus finanzas personales</p>
        </div>
        <button onClick={logout} style={{ background: "var(--danger)", color: "white" }}>
          🚪 Cerrar sesión
        </button>
      </div>

      <section style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--info) 100%)", color: "white", marginBottom: "3rem" }}>
        <div style={{ padding: "2.5rem" }}>
          <p style={{ fontSize: "0.95rem", opacity: 0.9, marginBottom: "0.5rem" }}>Sesión activa</p>
          <h2 style={{ color: "white", background: "none", WebkitTextFillColor: "white" }}>{email}</h2>
        </div>
      </section>

      <div style={{ marginBottom: "3rem" }}>
        <h2 style={{ marginBottom: "1.5rem" }}>📊 Gestiona tu dinero</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          <a href="/accounts" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏦</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Cuentas</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Gestiona tus cuentas bancarias y efectivo</p>
              <div style={{ marginTop: "1.5rem", color: "var(--primary)", fontWeight: "600" }}>→ Ir a Cuentas</div>
            </div>
          </a>

          <a href="/categories" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--success)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏷️</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Categorías</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Define tipos de ingresos y gastos</p>
              <div style={{ marginTop: "1.5rem", color: "var(--success)", fontWeight: "600" }}>→ Ir a Categorías</div>
            </div>
          </a>

          <a href="/movements" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--info)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📝</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Movimientos</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Registra ingresos y gastos</p>
              <div style={{ marginTop: "1.5rem", color: "var(--info)", fontWeight: "600" }}>→ Ir a Movimientos</div>
            </div>
          </a>

          <a href="/transfers" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              borderRadius: "1rem",
              padding: "2rem",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "var(--shadow)",
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-8px)";
              e.currentTarget.style.boxShadow = "var(--shadow-lg)";
              e.currentTarget.style.borderColor = "var(--warning)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "var(--shadow)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💸</div>
              <h3 style={{ marginBottom: "0.5rem" }}>Transferencias</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Transferencias entre cuentas</p>
              <div style={{ marginTop: "1.5rem", color: "var(--warning)", fontWeight: "600" }}>→ Ir a Transferencias</div>
            </div>
          </a>
        </div>
      </div>

      <section style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
        <h3>ℹ️ Próximas mejoras</h3>
        <ul style={{ paddingLeft: "1.5rem", color: "var(--text-secondary)" }}>
          <li>📈 Dashboard con gráficos de ingresos y gastos</li>
          <li>🎯 Presupuestos y alertas</li>
          <li>📊 Reportes detallados por período</li>
          <li>🔄 Importar transacciones desde CSV</li>
        </ul>
      </section>
    </main>
  );
}
