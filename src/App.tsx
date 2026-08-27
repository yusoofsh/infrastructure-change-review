import './App.css'
import { ReviewWorkspace } from './review/ReviewWorkspace'

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
          <h2 id="safety-title">Simulation only. No infrastructure execution.</h2>
          <p>
            This project uses bundled synthetic data. It has no Terraform, shell, cloud API,
            credential, or real infrastructure mutation path.
          </p>
        </div>
      </section>

      <ReviewWorkspace />
    </main>
  )
}

export default App
