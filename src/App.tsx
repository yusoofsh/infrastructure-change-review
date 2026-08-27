import { useEffect, useRef, useState } from 'react'
import './App.css'
import { ReviewWorkspace } from './review/ReviewWorkspace'
import { createEmptySession, type ReviewSession } from './review/session'
import { registerReviewTools, type WebMcpRegistration } from './webmcp/register'
import type { AuditEvent, ReviewStore } from './webmcp/store'

function App() {
  const [session, setSession] = useState<ReviewSession>(createEmptySession)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [webmcp, setWebmcp] = useState<WebMcpRegistration>({ status: 'unavailable' })
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    const store: ReviewStore = {
      getSession: () => sessionRef.current,
      setSession: (next) => {
        sessionRef.current = next
        setSession(next)
      },
      recordAudit: (event) => {
        setAuditEvents((previous) => [
          ...previous,
          { ...event, id: `audit-${previous.length + 1}` },
        ])
      },
    }

    let registration: Extract<WebMcpRegistration, { status: 'registered' }> | undefined
    let cancelled = false
    void registerReviewTools(store).then((result) => {
      if (cancelled) {
        if (result.status === 'registered') {
          result.abort()
        }
        return
      }
      if (result.status === 'registered') {
        registration = result
      }
      setWebmcp(result)
    })

    return () => {
      cancelled = true
      registration?.abort()
    }
  }, [])

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

      <section className="safety-card" aria-labelledby="webmcp-title">
        <span
          className={webmcp.status === 'registered' ? 'status-dot' : 'status-dot warning'}
          aria-hidden="true"
        />
        <div>
          <h2 id="webmcp-title">WebMCP</h2>
          <div role="status" aria-label="WebMCP status">
            <p>
              {webmcp.status === 'registered'
                ? 'Agent tools are registered in this browser.'
                : 'This browser does not expose WebMCP. Use the review panels.'}
            </p>
          </div>
        </div>
      </section>

      <ReviewWorkspace
        session={session}
        onSessionChange={(next) => {
          sessionRef.current = next
          setSession(next)
        }}
      />

      <section className="review-panel audit-panel" aria-labelledby="audit-title">
        <h2 id="audit-title">Agent audit</h2>
        {auditEvents.length === 0 ? (
          <p>No agent tool calls yet.</p>
        ) : (
          <ol className="audit-list">
            {auditEvents.map((event) => (
              <li key={event.id}>
                <span className={`audit-outcome audit-outcome-${event.outcome}`}>
                  {event.outcome}
                </span>
                {event.tool}: {event.summary}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}

export default App
