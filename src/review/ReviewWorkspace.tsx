import { useMemo, useState } from 'react'
import type { MitigationOption } from '../domain/recommendations/catalog'
import type { Finding } from '../domain/risks/types'
import type { NormalizedResourceChange } from '../domain/terraform/normalize'
import {
  createEmptySession,
  type LoadedReviewSession,
  loadBundledReview,
  type ReviewSession,
  selectFinding,
  selectResource,
} from './session'

function formatValue(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function selectedResource(session: LoadedReviewSession): NormalizedResourceChange | undefined {
  return session.snapshot.plan.resources.find(
    (resource) => resource.address === session.selectedResourceAddress,
  )
}

function selectedFinding(session: LoadedReviewSession): Finding | undefined {
  return session.snapshot.findings.find((finding) => finding.id === session.selectedFindingId)
}

function optionsForFinding(
  session: LoadedReviewSession,
  finding: Finding | undefined,
): MitigationOption[] {
  if (!finding) {
    return []
  }
  return session.snapshot.options.filter((option) => option.findingId === finding.id)
}

export function ReviewWorkspace() {
  const [session, setSession] = useState<ReviewSession>(createEmptySession)

  if (session.status === 'empty') {
    return (
      <section className="empty-state" aria-labelledby="empty-title">
        <div role="status" aria-label="Empty review">
          <h2 id="empty-title">No plan is loaded</h2>
          <p>
            Load the bundled synthetic Terraform plan to inspect counts, findings, dependencies, and
            recommended mitigations. This is a simulation. Nothing is applied.
          </p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => setSession(loadBundledReview())}
        >
          Load synthetic plan
        </button>
      </section>
    )
  }

  return <LoadedReview session={session} onSessionChange={setSession} />
}

function LoadedReview({
  session,
  onSessionChange,
}: {
  session: LoadedReviewSession
  onSessionChange: (session: LoadedReviewSession) => void
}) {
  const resource = selectedResource(session)
  const finding = selectedFinding(session)
  const queued = optionsForFinding(session, finding)
  const counts = session.snapshot.plan.counts
  const graphItems = useMemo(
    () =>
      [...session.snapshot.edges].sort((left, right) =>
        `${left.dependency}->${left.dependent}`.localeCompare(
          `${right.dependency}->${right.dependent}`,
        ),
      ),
    [session.snapshot.edges],
  )

  return (
    <div className="review-layout">
      <section className="review-panel" aria-labelledby="summary-title">
        <h2 id="summary-title">Review summary</h2>
        <p>
          Terraform {session.snapshot.plan.terraformVersion} format{' '}
          {session.snapshot.plan.formatVersion}
        </p>
        <ul className="count-list">
          <li>{counts.update} updates</li>
          <li>{counts.replace} replacements</li>
          <li>{counts.noOp} no-ops</li>
          <li>{counts.create} creates</li>
          <li>{counts.delete} deletes</li>
          <li>{counts.read} reads</li>
        </ul>
      </section>

      <section className="review-panel" aria-labelledby="findings-title">
        <h2 id="findings-title">Findings</h2>
        <ul className="finding-list">
          {session.snapshot.findings.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === session.selectedFindingId ? 'selected' : undefined}
                aria-pressed={item.id === session.selectedFindingId}
                onClick={() => onSessionChange(selectFinding(session, item.id))}
              >
                <span className={`severity-chip severity-${item.severity}`}>{item.severity}</span>
                {item.ruleId}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="review-panel" aria-labelledby="graph-title">
        <h2 id="graph-title">Dependency graph</h2>
        <ol className="graph-visual">
          {graphItems.map((edge) => (
            <li key={`${edge.dependency}->${edge.dependent}`}>
              {edge.dependency} → {edge.dependent}
            </li>
          ))}
        </ol>
        <table className="graph-table">
          <caption>Configuration dependencies</caption>
          <thead>
            <tr>
              <th scope="col">Dependency</th>
              <th scope="col">Dependent</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {graphItems.map((edge) => (
              <tr key={`${edge.dependency}->${edge.dependent}`}>
                <td>{edge.dependency}</td>
                <td>{edge.dependent}</td>
                <td>{edge.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="review-panel" aria-labelledby="inspector-title">
        <h2 id="inspector-title">Resource inspector</h2>
        <ul className="resource-list">
          {session.snapshot.plan.resources.map((item) => (
            <li key={item.address}>
              <button
                type="button"
                className={
                  item.address === session.selectedResourceAddress ? 'selected' : undefined
                }
                aria-pressed={item.address === session.selectedResourceAddress}
                onClick={() => onSessionChange(selectResource(session, item.address))}
              >
                {item.address}
              </button>
            </li>
          ))}
        </ul>
        {resource ? (
          <div>
            <p>
              {resource.address} ({resource.kind}
              {resource.destructive ? ', destructive' : ''})
            </p>
            <h3>Before</h3>
            <pre>{formatValue(resource.before)}</pre>
            <h3>After</h3>
            <pre>{formatValue(resource.after)}</pre>
          </div>
        ) : (
          <p>Select a resource to inspect its redacted before and after values.</p>
        )}
      </section>

      <section className="review-panel" aria-labelledby="queue-title">
        <h2 id="queue-title">Approval queue</h2>
        <p>Awaiting human decision. Recommended options are listed. None are applied.</p>
        <ul className="queue-list">
          {queued.map((option) => (
            <li key={option.id}>
              <p className="queue-id">{option.id}</p>
              <p>{option.title}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
