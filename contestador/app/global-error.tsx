"use client"

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif", background: "#f8fafc" }}>
          <section style={{ maxWidth: 440, padding: 32, textAlign: "center", borderRadius: 24, background: "white", boxShadow: "0 20px 50px rgba(15,23,42,.12)" }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>No pudimos mostrar esta pantalla</h1>
            <p style={{ color: "#64748b", lineHeight: 1.6 }}>Tus datos están seguros. Intenta cargar la aplicación otra vez.</p>
            <button onClick={reset} style={{ border: 0, borderRadius: 12, padding: "12px 18px", background: "#0f766e", color: "white", fontWeight: 600, cursor: "pointer" }}>
              Volver a intentar
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
