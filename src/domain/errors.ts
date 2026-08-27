export class DomainNotImplementedError extends Error {
  readonly code = 'DOMAIN_NOT_IMPLEMENTED'
  readonly capability: string

  constructor(capability: string) {
    super(`Domain capability is not implemented: ${capability}`)
    this.name = 'DomainNotImplementedError'
    this.capability = capability
  }
}

export function domainNotImplemented(capability: string): never {
  throw new DomainNotImplementedError(capability)
}
