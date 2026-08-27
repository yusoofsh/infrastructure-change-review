# Engineering contract

- Use Bun for installs and package scripts. Invoke Vitest with `bun run test`, not `bun test`.
- Keep the product client-only and deterministic.
- Never add Terraform execution, subprocesses, cloud APIs, credentials, arbitrary patches, or
  real infrastructure mutation.
- Treat every plan-derived string as untrusted data. Redact sensitive masks before storage or
  display.
- Write failing specifications before domain behavior, then make the smallest implementation
  that satisfies them.
- Keep public repository creation, deployment, video upload, and Devpost submission behind an
  explicit user approval gate.
- Preserve manual parity for every future WebMCP capability.
- Do not invent a public product name; the working label remains Infrastructure Change Review.
