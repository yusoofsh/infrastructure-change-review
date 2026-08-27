import './App.css'

function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">WebMCP-native infrastructure review</p>
      <h1>Infrastructure Change Review</h1>
      <p className="lede">
        Turn a synthetic Terraform plan into a shared, inspectable review session where an agent
        gathers evidence and the engineer controls every decision.
      </p>

      <section className="safety-card" aria-labelledby="safety-title">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2 id="safety-title">Simulation only—no infrastructure execution</h2>
          <p>
            This project uses bundled synthetic data. It has no Terraform, shell, cloud API,
            credential, or real infrastructure mutation path.
          </p>
        </div>
      </section>

      <section className="checkpoint-card" aria-labelledby="checkpoint-title">
        <p className="checkpoint-label">Foundation checkpoint</p>
        <h2 id="checkpoint-title">Fixture contract is ready for the domain engine</h2>
        <p>
          The interactive review workflow arrives in the next checkpoints. The current build proves
          the client-only shell and synthetic-input safety boundary.
        </p>
      </section>
    </main>
  )
}

export default App
