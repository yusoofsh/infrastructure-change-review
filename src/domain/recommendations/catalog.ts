import type { Finding } from '../risks/types'

export type PatchOperation =
  | {
      kind: 'set_attribute'
      address: string
      path: string[]
      value: unknown
    }
  | {
      kind: 'cancel_change'
      address: string
    }
  | {
      kind: 'add_review_control'
      controlId: string
      description: string
    }

export interface MitigationOption {
  id: string
  findingId: string
  title: string
  operations: PatchOperation[]
}

interface MitigationDefinition {
  id: string
  title: string
  operations: (resourceAddresses: readonly string[]) => PatchOperation[]
}

const publicAccessBlockAttributes = [
  'block_public_acls',
  'block_public_policy',
  'ignore_public_acls',
  'restrict_public_buckets',
] as const

function firstAddress(resourceAddresses: readonly string[], fallback: string): string {
  return resourceAddresses[0] ?? fallback
}

const mitigationRegistry: Readonly<Record<string, readonly MitigationDefinition[]>> = {
  TF001_STATEFUL_REPLACEMENT: [
    {
      id: 'cancel-rds-replacement-and-stage-migration',
      title: 'Cancel replacement and stage a database migration',
      operations: (addresses) => [
        {
          kind: 'cancel_change',
          address: firstAddress(addresses, 'aws_db_instance.orders'),
        },
      ],
    },
  ],
  TF002_UNSAFE_DB_DELETION: [
    {
      id: 'enable-rds-deletion-safeguards',
      title: 'Enable database deletion safeguards',
      operations: (addresses) => {
        const address = firstAddress(addresses, 'aws_db_instance.orders')
        return [
          {
            kind: 'set_attribute',
            address,
            path: ['deletion_protection'],
            value: true,
          },
          {
            kind: 'set_attribute',
            address,
            path: ['skip_final_snapshot'],
            value: false,
          },
        ]
      },
    },
  ],
  AWS001_PUBLIC_DATABASE_PORT: [
    {
      id: 'restrict-database-to-application-cidr',
      title: 'Restrict database ingress to the application network',
      operations: (addresses) => [
        {
          kind: 'set_attribute',
          address: firstAddress(addresses, 'aws_security_group_rule.database_ingress'),
          path: ['cidr_blocks'],
          value: ['10.42.16.0/20'],
        },
      ],
    },
  ],
  AWS002_PUBLIC_S3_ACCESS: [
    {
      id: 'restore-s3-public-access-controls',
      title: 'Restore S3 public access controls',
      operations: (addresses) => {
        const accessBlockAddress =
          addresses.find((candidate) =>
            candidate.startsWith('aws_s3_bucket_public_access_block.'),
          ) ?? 'aws_s3_bucket_public_access_block.assets'
        const policyAddress =
          addresses.find((candidate) => candidate.startsWith('aws_s3_bucket_policy.')) ??
          'aws_s3_bucket_policy.assets'
        return [
          ...publicAccessBlockAttributes.map(
            (attribute): PatchOperation => ({
              kind: 'set_attribute',
              address: accessBlockAddress,
              path: [attribute],
              value: true,
            }),
          ),
          {
            kind: 'cancel_change',
            address: policyAddress,
          },
        ]
      },
    },
  ],
  REL001_CAPACITY_REDUCTION: [
    {
      id: 'preserve-api-minimum-capacity',
      title: 'Preserve minimum service capacity',
      operations: (addresses) => [
        {
          kind: 'set_attribute',
          address: firstAddress(addresses, 'aws_ecs_service.api'),
          path: ['desired_count'],
          value: 2,
        },
      ],
    },
  ],
  COST001_SIZE_CLASS_JUMP: [
    {
      id: 'use-approved-worker-size',
      title: 'Use the approved worker size',
      operations: (addresses) => [
        {
          kind: 'set_attribute',
          address: firstAddress(addresses, 'aws_instance.worker'),
          path: ['instance_type'],
          value: 'm7g.large',
        },
      ],
    },
  ],
  BLAST001_CRITICAL_TRANSITIVE_IMPACT: [
    {
      id: 'remove-destructive-blast-radius-root',
      title: 'Remove the destructive blast-radius source',
      operations: (addresses) => [
        {
          kind: 'cancel_change',
          address: firstAddress(addresses, 'aws_db_instance.orders'),
        },
      ],
    },
  ],
}

function materializeOption(
  definition: MitigationDefinition,
  findingId: string,
  resourceAddresses: readonly string[],
): MitigationOption {
  return {
    id: definition.id,
    findingId,
    title: definition.title,
    operations: definition.operations(resourceAddresses),
  }
}

export function listMitigationOptions(findings: readonly Finding[]): MitigationOption[] {
  return findings.flatMap((finding) =>
    (mitigationRegistry[finding.ruleId] ?? []).map((definition) =>
      materializeOption(definition, finding.id, finding.resourceAddresses),
    ),
  )
}

export function resolveMitigationOption(findingId: string, optionId: string): MitigationOption {
  const ruleId = findingId.startsWith('finding-') ? findingId.slice('finding-'.length) : ''
  const definition = (mitigationRegistry[ruleId] ?? []).find(({ id }) => id === optionId)
  if (!definition) {
    throw new Error('Unknown mitigation option for finding')
  }
  return materializeOption(definition, findingId, [])
}
