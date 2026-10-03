"use client";

/** Last-resort fallback when the root layout itself fails. Deliberately dependency-free. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f1f3f5", color: "#0d1b2a" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "64px 20px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Raksha could not load</h1>
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>If you are in danger, call emergency services directly.</p>
          <a href="tel:112" style={{ display: "block", marginTop: 24, padding: "18px 20px", borderRadius: 14, background: "#d91f2c", color: "#fff", fontWeight: 800, textAlign: "center", textDecoration: "none", fontSize: 18 }}>
            Call 112
          </a>
          <button onClick={reset} style={{ marginTop: 12, width: "100%", padding: "16px 20px", borderRadius: 14, border: "1px solid #c3cbd5", background: "#fff", fontWeight: 700, fontSize: 16 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
