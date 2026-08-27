export type Severity = 'blocker' | 'high' | 'medium' | 'low'
export type RiskCategory = 'destructive' | 'security' | 'reliability' | 'cost' | 'blast_radius'

export interface Finding {
  id: string
  ruleId: string
  category: RiskCategory
  severity: Severity
  title: string
  resourceAddresses: string[]
  mitigationOptionIds: string[]
}
