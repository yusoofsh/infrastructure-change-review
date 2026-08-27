# Infrastructure Change Review

Turn a synthetic Terraform plan into a shared, inspectable review session where an agent
gathers evidence and proposes safer changes while the engineer controls every decision.

This is the local foundation checkpoint for The WebMCP Challenge. The working label is
intentional; the final public name is deferred until submission preparation.

## Safety boundary

- Bundled synthetic Terraform JSON only.
- Client-only application with no backend.
- No Terraform binary, shell, cloud API, credential, or infrastructure mutation path.
- Cost and blast radius are deterministic review heuristics, not provider guarantees.
- The future simulation can conclude only that a change is ready for a new plan, never ready
  to apply.

## Foundation checkpoint

The app shell and fixture contract are green. Domain specifications are intentionally red and
fail only at typed `DOMAIN_NOT_IMPLEMENTED` boundaries. That is the expected tests-first state
before the domain-engine checkpoint. CI asserts those exact typed boundaries without treating
the intentionally red suite as a release failure.

```bash
bun install --frozen-lockfile
bun run check:foundation  # expected to pass
bun run test:red          # expected to fail in this checkpoint
bun run dev
```

Use `bun run test`, not `bun test`; the latter selects Bun's test runner instead of the
configured Vitest suite.

## Locked fixture summary

| Classification | Count |
| --- | ---: |
| Create | 0 |
| Update | 7 |
| Replace | 2 |
| Delete | 0 |
| No-op | 3 |

The separate review policy supplies synthetic organization context such as critical resource
addresses, minimum capacity, private application CIDR, and relative compute weights.

## License

[MIT](LICENSE)
