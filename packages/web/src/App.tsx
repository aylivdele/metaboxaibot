export function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>AI Box</h1>
        <p className="subtitle">Web application — coming soon</p>
      </header>
      <main className="main">
        <div className="card">
          <p>The web interface is under development.</p>
          <p className="muted">
            API: <code>{import.meta.env.VITE_API_BASE_URL || "/api"}</code>
          </p>
        </div>
      </main>
    </div>
  );
}
