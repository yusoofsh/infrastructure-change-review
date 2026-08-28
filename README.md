# Infrastructure Change Review

Turn a synthetic Terraform plan into a shared, inspectable review session where an agent
gathers evidence and proposes safer changes while the engineer controls every decision.

This is the decisions-and-report checkpoint for The WebMCP Challenge. The working label is
intentional; the final public name is deferred until submission preparation.

## Safety boundary

- Bundled synthetic Terraform JSON only.
- Client-only application with no backend.
- No Terraform binary, shell, cloud API, credential, or infrastructure mutation path.
- Cost and blast radius are deterministic review heuristics, not provider guarantees.
- The future simulation can conclude only that a change is ready for a new plan, never ready
  to apply.

## Decisions and report checkpoint

The app shell, fixture contract, domain engine, and manual review workspace are green. Loading
the bundled synthetic plan shows exclusive change counts, seven findings, a dependency graph with
an accessible table, a redacted resource inspector, and an approval queue that waits for a human
decision.

The same session backs a focused native WebMCP catalog. Browsers without `document.modelContext`
or `navigator.modelContext` show a visible fallback and keep the manual workflow. Agent tool
calls append audit events; they do not apply infrastructure.

Engineers accept, reject, or defer recommended mitigations. The overlay replays accepted
operations on a copy of the plan and can conclude that a change is ready for a new plan. It
cannot apply infrastructure. Reset requires confirmation. The JSON report is a download, not an
apply path. CI runs `bun run test` and Playwright after the production build.

Enable `chrome://flags/#enable-webmcp-testing` to register native tools. Without that flag,
the manual panels remain the review path.

```bash
bun install --frozen-lockfile
bunx playwright install --with-deps chromium
bun run check:foundation  # expected to pass
bun run test:red          # expected to pass
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
