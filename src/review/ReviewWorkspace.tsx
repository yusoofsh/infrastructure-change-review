import { useMemo } from 'react'
import type { MitigationOption } from '../domain/recommendations/catalog'
import type { Finding } from '../domain/risks/types'
import type { NormalizedResourceChange } from '../domain/terraform/normalize'
import type { OverlayOutcome } from './overlay'
import { simulateOverlay } from './overlay'
import { downloadReviewReport } from './report'
import {
  beginReset,
  cancelReset,
  confirmReset,
  type DecisionStatus,
  type LoadedReviewSession,
  loadBundledReview,
  type ReviewSession,
  recordDecision,
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

const outcomeLabels: Record<OverlayOutcome, string> = {
  blocked: 'Blocked',
  needs_review: 'Needs review',
  ready_for_new_plan: 'Ready for a new plan',
}

export function ReviewWorkspace({
  session,
  onSessionChange,
}: {
  session: ReviewSession
  onSessionChange: (session: ReviewSession) => void
}) {
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
          onClick={() => onSessionChange(loadBundledReview())}
        >
          Load synthetic plan
        </button>
      </section>
    )
  }

  return <LoadedReview session={session} onSessionChange={onSessionChange} />
}

function LoadedReview({
  session,
  onSessionChange,
}: {
  session: LoadedReviewSession
  onSessionChange: (session: ReviewSession) => void
}) {
  const resource = selectedResource(session)
  const finding = selectedFinding(session)
  const queued = optionsForFinding(session, finding)
  const counts = session.snapshot.plan.counts
  const overlay = useMemo(() => simulateOverlay(session), [session])
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
          {queued.map((option) => {
            const status = session.decisions[option.id] ?? 'pending'
            return (
              <li key={option.id}>
                <p className="queue-id">{option.id}</p>
                <p>{option.title}</p>
                <div className="decision-actions">
                  {(['accepted', 'rejected', 'deferred'] as const).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={status === decision ? 'selected' : undefined}
                      aria-pressed={status === decision}
                      onClick={() => onSessionChange(recordDecision(session, option.id, decision))}
                    >
                      {decisionLabel(decision)}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="review-panel" aria-labelledby="overlay-title">
        <h2 id="overlay-title">Simulation overlay</h2>
        <p>
          This overlay is a simulation. It can conclude that a change is ready for a new plan. It
          cannot apply infrastructure. Nothing is applied.
        </p>
        <p className={`overlay-outcome overlay-outcome-${overlay.outcome}`}>
          {outcomeLabels[overlay.outcome]}
        </p>
        {overlay.remainingFindings.length === 0 ? (
          <p>No remaining findings.</p>
        ) : (
          <ul className="queue-list">
            {overlay.remainingFindings.map((item) => (
              <li key={item.id}>{item.ruleId}</li>
            ))}
          </ul>
        )}
        <div className="decision-actions overlay-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => downloadReviewReport(session)}
          >
            Download review report
          </button>
          {session.resetPending ? (
            <>
              <p>
                Reset this review? Loaded plan and decisions will be cleared. This does not change
                infrastructure.
              </p>
              <button type="button" onClick={() => onSessionChange(confirmReset(session))}>
                Confirm reset
              </button>
              <button type="button" onClick={() => onSessionChange(cancelReset(session))}>
                Cancel reset
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onSessionChange(beginReset(session))}>
              Reset review
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function decisionLabel(status: Exclude<DecisionStatus, 'pending'>): string {
  if (status === 'accepted') {
    return 'Accept'
  }
  if (status === 'rejected') {
    return 'Reject'
  }
  return 'Defer'
}
