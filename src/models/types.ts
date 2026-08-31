/**
 * OSINT Nexus - Evidence-Driven Data Models & Type Definitions
 * Strict typing for Evidence, Entity Resolution, Provenance, and Correlation.
 */

export type TargetClassification = 
  | 'ipv4' 
  | 'ipv6' 
  | 'domain' 
  | 'hostname' 
  | 'email' 
  | 'username' 
  | 'person_name' 
  | 'phone' 
  | 'unknown';

export type IPAddressType = 
  | 'PUBLIC' 
  | 'PRIVATE' 
  | 'LOOPBACK' 
  | 'LINK_LOCAL' 
  | 'RESERVED' 
  | 'DOCUMENTATION';

export type SourceStatus = 
  | 'FOUND' 
  | 'NOT_FOUND' 
  | 'TIMEOUT' 
  | 'RATE_LIMITED' 
  | 'BLOCKED' 
  | 'ERROR' 
  | 'UNSUPPORTED';

export type EvidenceTier = 
  | 'DIRECT_VERIFICATION'   // Cryptographic hash, verified API auth, direct lookup
  | 'OBSERVED_PROFILE'     // Public account with matching handle and content
  | 'REGISTRY_RECORD'       // Academic, corporate, or WHOIS record
  | 'DISCOVERY_SNIPPET'     // Web search snippet or text extraction (Needs cross-validation)
  | 'HEURISTIC_CANDIDATE';  // Generated permutation or fuzzy candidate

export type ConfidenceLevel = 'WEAK' | 'POSSIBLE' | 'PROBABLE' | 'STRONG';

export interface NormalizedValue<T = string> {
  raw: string;
  normalized: T;
  method: string;
}

export interface TargetInput {
  raw: string;
  classification: TargetClassification;
  normalized: string;
  details?: Record<string, unknown>;
}

export interface Provenance {
  collector: string;
  source: string;
  sourceUrl?: string;
  httpStatus?: number;
  retrievedAt: string;
  durationMs: number;
  requestFingerprint?: string;
  method: string;
}

export interface Evidence {
  id: string;
  tier: EvidenceTier;
  type: 'account' | 'dns_record' | 'ip_geo' | 'mx_server' | 'email_hash' | 'phone_ref' | 'academic_pub' | 'web_snippet' | 'bio_contact';
  key: string;
  value: unknown;
  rawExcerpt?: string;
  confidenceScore: number; // 0 - 100 individual weight
  verified: boolean;
  provenance: Provenance;
  metadata?: Record<string, unknown>;
}

export interface EntityProperty {
  type: 'name' | 'username' | 'email' | 'phone' | 'website' | 'domain' | 'location' | 'organization' | 'avatar' | 'bio';
  value: string;
  normalizedValue: string;
  confidence: number;
  evidenceIds: string[];
}

export interface Entity {
  id: string;
  primaryType: 'Person' | 'DigitalIdentity' | 'DomainInfrastructure' | 'NetworkHost' | 'Organization';
  label: string;
  properties: EntityProperty[];
  confidence: {
    score: number;
    level: ConfidenceLevel;
    reasons: string[];
  };
  observedOn: string[]; // Platform list
}

export interface EntityRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relation: 
    | 'USES_USERNAME' 
    | 'HAS_EMAIL' 
    | 'OWNS_DOMAIN' 
    | 'HOSTED_ON_IP' 
    | 'AFFILIATED_WITH' 
    | 'PROFILE_ON' 
    | 'ASSOCIATED_PHONE' 
    | 'AUTHORED_PUB' 
    | 'RESOLVES_TO';
  confidence: number;
  evidenceIds: string[];
  description: string;
}

export interface CollectorLog {
  collectorName: string;
  sourceName: string;
  query: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: SourceStatus;
  httpStatus?: number;
  resultCount: number;
  error?: string;
}

export interface EvidenceGraphNode {
  id: string;
  label: string;
  type: 'target' | 'entity' | 'evidence' | 'platform' | 'infrastructure';
  group: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface EvidenceGraphLink {
  source: string;
  target: string;
  relation: string;
  weight: number;
  evidenceIds?: string[];
}

export interface EvidenceGraph {
  nodes: EvidenceGraphNode[];
  links: EvidenceGraphLink[];
}

export interface InvestigationLimitation {
  scope: string;
  reason: string;
  impact: string;
  recommendation: string;
}

export interface InvestigationReport {
  target: TargetInput;
  timing: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  entities: Entity[];
  relationships: EntityRelationship[];
  evidences: Evidence[];
  logs: CollectorLog[];
  graph: EvidenceGraph;
  confidence: {
    score: number;
    level: ConfidenceLevel;
    reasons: string[];
    riskScore: number;
  };
  summary: {
    totalSourcesQueried: number;
    sourcesFound: number;
    sourcesFailed: number;
    highConfidenceEvidences: number;
    directContactsFound: number;
  };
  limitations: InvestigationLimitation[];
  dorkMatrix: { title: string; url: string; category?: string; query?: string }[];
}
