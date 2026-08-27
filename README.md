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

## Cloudflare Pages

The production target is a static Cloudflare Pages Direct Upload project named
`infrastructure-change-review`. No Functions, bindings, runtime secrets, backend, or
application network access are required.

```bash
bun run validate:cloudflare  # verify Pages config, build output, limits, and headers
bun run cloudflare:create     # one-time project creation after Wrangler authentication
bun run deploy:cloudflare    # run all gates, then deploy the main branch
```

Authenticate Wrangler before the first deployment with `wrangler login`. Direct Upload is
intentional for the P0 release; the public GitHub repository remains the source of record.

### GitHub Actions deployment

GitHub Actions verifies every push. A separate production workflow deploys `main` after both
repository secrets exist:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — a narrowly scoped token with **Account → Cloudflare Pages → Edit**

Create the Direct Upload project once with `bun run cloudflare:create`, then push to `main` or
run **Deploy Cloudflare Pages** manually. The serialized production workflow reruns the full
foundation gate, verifies the named project exists in the configured account, and deploys the
validated `dist` artifact. Missing credentials or a missing project fail visibly. Credentials
are read only from GitHub Actions secrets and are never stored in the repository.

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
