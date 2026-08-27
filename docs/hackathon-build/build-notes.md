# Build notes

## 2026-08-27 — Canonical plan handoff

- Working label locked to **Infrastructure Change Review** and repository slug locked to
  `infrastructure-change-review`.
- Scope is a focused, client-only WebMCP-native review experience using synthetic fixtures.
- Implementation is autonomous until an external write; public actions remain approval-gated.
- Code Mode MCP remains excluded from the submission baseline.
- Checkpoint one is tests-first: fixture and boot gates pass while downstream domain
  specifications fail at explicit typed boundaries.
- Required CI remains green by asserting each red boundary as a positive contract; the full
  domain specification suite stays available through `bun run test:red` until implementation.

### Format corrections accepted during foundation review

- Recognize Terraform's `read` action; fail closed on `forget`, `create+forget`, deposed
  instances, and unknown action combinations in the P0 contract.
- Treat Terraform addresses as opaque exact identifiers rather than rewriting module/index
  syntax.
- Read configuration dependencies from expression references and explicit `depends_on`, while
  continuing to describe blast radius as a configuration-derived approximation.
- A future review reset must be a manual human action or a pending UI confirmation, not an
  agent-confirmed destructive tool call.
- The worker size jump uses `m7g` rather than the draft's `m7i`, preserving ARM architecture so
  the deterministic finding remains a cost heuristic instead of silently introducing an
  unmodeled architecture-compatibility failure.

### Foundation verification

- Frozen Bun 1.4.0 installation is reproducible from the text lockfile.
- Fixture validation locks 12 resources, 7 updates, 2 replacements, 3 no-ops, all raw
  dependency evidence, six expected graph edges, seven finding seeds, policy identity, and
  sensitive-value masks.
- The positive foundation gate passes validation, safety-boundary scanning, TypeScript, Biome,
  14 contract tests, the production build, and an HTTP preview smoke test.
- The diagnostic domain suite fails exactly seven tests at seven distinct typed
  `DOMAIN_NOT_IMPLEMENTED` boundaries. This is the intentional handoff to the domain-engine
  checkpoint, not a CI failure.
- CI action dependencies are pinned to immutable commit SHAs and job permissions are read-only.
- Two adversarial checkpoint reviews found no unresolved blocker or high-impact issue in the
  implemented foundation. UI text escaping, report escaping, WebMCP untrusted annotations, and
  decision-state injection tests remain explicit gates for the later surfaces they exercise.

## 2026-08-27 — Publication and deployment preparation

- The user approved creating the public GitHub repository and deploying the static application
  to Cloudflare.
- Cloudflare Pages Direct Upload is the P0 target, with the public GitHub repository remaining
  the source of record. The project has no Functions, bindings, runtime secrets, or backend.
- Wrangler 4.127.0 is pinned in the lockfile. `wrangler.jsonc`, one-time project creation, gated
  deployment, artifact-limit checks, and production-header validation are reproducible scripts.
- The artifact validator rejects both Pages Functions and a Pages Worker so deployment cannot
  silently cross the locked client-only boundary.
- The full offline foundation gate remains green after adding deployment configuration.
- A separate, serialized GitHub Actions production workflow performs Pages Direct Uploads from
  `main` only after the full foundation gate passes. It fails visibly rather than provisioning
  a missing project or silently skipping deployment when credentials are absent.

## 2026-08-27 — Domain engine checkpoint

- Terraform changes now normalize with exclusive counts and recursive sensitive-value redaction.
- Configuration references drive deterministic blast-radius scoring and seven ordered risk rules.
- Mitigation options are registry-backed, and the domain specification is a foundation and CI gate.
