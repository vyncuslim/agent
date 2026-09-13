export default function HomePage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ opacity: 0.65, letterSpacing: "0.12em", textTransform: "uppercase" }}>Vynalth AI</p>
      <h1 style={{ fontSize: "clamp(2.5rem, 7vw, 5.5rem)", margin: "10px 0 18px", lineHeight: 0.95 }}>
        MCP Gateway v2
      </h1>
      <p style={{ maxWidth: 700, fontSize: 20, lineHeight: 1.6, opacity: 0.82 }}>
        Secure Streamable HTTP tools for Vynalth AI Search and approved Supabase data access.
      </p>
      <div style={{ display: "grid", gap: 14, marginTop: 36 }}>
        <code style={{ padding: 18, border: "1px solid #2a3140", borderRadius: 12 }}>/api/mcp</code>
        <code style={{ padding: 18, border: "1px solid #2a3140", borderRadius: 12 }}>/api/health</code>
        <code style={{ padding: 18, border: "1px solid #2a3140", borderRadius: 12 }}>/.well-known/mcp.json</code>
      </div>
    </main>
  );
}
