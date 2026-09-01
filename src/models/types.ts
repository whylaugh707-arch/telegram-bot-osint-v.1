/**
 * OSINT Nexus - Evidence-Driven Data Models & Type Definitions (Phase 2 Refactor)
 * Strict typing for Evidence, Entity Candidates, Provenance, Independence, and Contradictions.
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
  | 'DOCUMENTATION'
  | 'MULTICAST'
  | 'INVALID';

export type SourceStatus = 
  | 'FOUND' 
  | 'NOT_FOUND' 
  | 'TIMEOUT' 
  | 'RATE_LIMITED' 
  | 'BLOCKED' 
  | 'ERROR' 
  | 'AMBIGUOUS'
  | 'UNSUPPORTED';

/**
 * Level of evidentiary certainty for an observation
 */
export type EvidenceStatus = 
  | 'OBSERVED'       // Raw data observed in public source without external validation
  | 'SUPPORTED'      // Data supported by secondary context/attribute in the same source
  | 'CORROBORATED'   // Data confirmed by two or more independent source groups
  | 'VERIFIED';      // Cryptographically or authoritatively proven (DNSSEC, Auth API, Hash match)

/**
 * Explicit scope of verification to prevent over-attribution
 */
export type VerificationScope = 
  | 'PAGE_RETRIEVED'       // HTTP 200 / Page content fetched successfully
  | 'ACCOUNT_EXISTENCE'    // The username/profile exists on the platform
  | 'ATTRIBUTE_OBSERVED'   // A specific text property (name, bio, affiliation) was seen
  | 'ENTITY_ASSOCIATION'   // Two attributes appear to be linked
  | 'OWNERSHIP'            // Domain / account ownership confirmed
  | 'IDENTITY';            // Full real-world person identity confirmed (Highest threshold)

export type ConfidenceLevel = 'WEAK' | 'POSSIBLE' | 'PROBABLE' | 'STRONG';

export interface NormalizedValue<T = string> {
  raw: string;
  normalized: T;
  normalizationMethod: string;
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
  sourceType: 'API' | 'AUTHORITATIVE_REGISTRY' | 'WEB_CRAWL' | 'DNS' | 'AGGREGATOR';
  sourceUrl?: string;
  httpStatus?: number;
  retrievedAt: string;
  observedAt?: string;
  durationMs: number;
  method: string;
}

export interface SourceReliability {
  source: string;
  reliability: number; // 0.0 to 1.0 heuristic score
  supportsVerification: boolean;
  notes: string;
}

export interface Evidence {
  id: string;
  source: string;
  sourceType: 'API' | 'AUTHORITATIVE_REGISTRY' | 'WEB_CRAWL' | 'DNS' | 'AGGREGATOR';
  sourceUrl?: string;
  independenceGroup: string; // Used to cluster non-independent sources (e.g. Google->GitHub and Bing->GitHub share "github")
  method: string;
  observedAt: string;
  retrievedAt: string;
  validFrom?: string;  // Temporal start (e.g. 2020)
  validUntil?: string; // Temporal end (e.g. 2024 or 'current')
  type: 
    | 'account' 
    | 'dns_record' 
    | 'ip_geo' 
    | 'mx_server' 
    | 'email_hash' 
    | 'phone_ref' 
    | 'academic_pub' 
    | 'web_snippet' 
    | 'contact_vector'
    | 'bogon_check';
  rawValue?: unknown;
  normalizedValue?: unknown;
  context?: string;
  rawExcerpt?: string;
  status: EvidenceStatus;
  verificationScope: VerificationScope;
  confidence: number;   // 0 - 100 individual weight
  reliability: number;  // 0.0 - 1.0 heuristic source weight
  metadata?: Record<string, unknown>;
}

export interface EntityAttribute {
  type: 'name' | 'username' | 'email' | 'phone' | 'website' | 'domain' | 'location' | 'organization' | 'avatar' | 'bio';
  raw: string;
  normalized: string;
  context?: string;
  evidenceIds: string[];
  confidence: number;
  validFrom?: string;
  validUntil?: string;
}

export interface EntityCandidate {
  id: string;
  primaryType: 'Person' | 'DigitalIdentity' | 'DomainInfrastructure' | 'NetworkHost' | 'Organization';
  label: string;
  attributes: EntityAttribute[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  confidence: number;
  status: 'UNRESOLVED' | 'POSSIBLE' | 'PROBABLE' | 'STRONG' | 'SEPARATE';
  observedOn: string[];
}

export interface Relationship {
  id: string;
  fromEntity: string;
  toEntity: string;
  type: 
    | 'USES_USERNAME' 
    | 'HAS_EMAIL' 
    | 'OWNS_DOMAIN' 
    | 'HOSTED_ON_IP' 
    | 'AFFILIATED_WITH' 
    | 'PROFILE_ON' 
    | 'ASSOCIATED_PHONE' 
    | 'AUTHORED_PUB' 
    | 'RESOLVES_TO'
    | 'CO_OCCURRED_IN_DOCUMENT';
  confidence: number;
  evidenceIds: string[];
  status: 'CANDIDATE' | 'SUPPORTED' | 'CORROBORATED' | 'VERIFIED';
  description: string;
}

export interface Contradiction {
  id: string;
  attribute: string;
  evidenceA: string;
  evidenceB: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  isTemporalResolution?: boolean;
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
  status?: string;
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

export interface InvestigationAssessment {
  score: number;
  level: ConfidenceLevel;
  positiveFactors: string[];
  negativeFactors: string[];
  independentSources: number;
  contradictions: number;
  reasons: string[];
  limitations: InvestigationLimitation[];
}

export interface InvestigationReport {
  target: TargetInput;
  timing: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  entities: EntityCandidate[];
  observations: Evidence[];
  relationships: Relationship[];
  evidence: Evidence[]; // Alias for backward compatibility
  contradictions: Contradiction[];
  sources: CollectorLog[];
  logs: CollectorLog[]; // Alias for backward compatibility
  graph: EvidenceGraph;
  assessment: InvestigationAssessment;
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
    independentSourceGroups: number;
    contradictionsCount: number;
  };
  limitations: InvestigationLimitation[];
  dorkMatrix: { title: string; url: string; category?: string; query?: string }[];
}
