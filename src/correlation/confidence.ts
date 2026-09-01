/**
 * OSINT Nexus - Confidence Scoring Engine (Phase 2 Refactor)
 * Computes heuristic confidence, risk exposure, and generates evidence-driven audit reasons,
 * strictly enforcing source independence and tracking contradictions.
 */

import { ConfidenceLevel, EntityCandidate, Evidence, InvestigationLimitation, TargetInput, Contradiction, Relationship } from '../models/types';

export class ConfidenceScorer {

  public static calculate(
    target: TargetInput,
    evidences: Evidence[],
    candidates: EntityCandidate[],
    contradictions: Contradiction[],
    relationships: Relationship[]
  ): {
    score: number;
    level: ConfidenceLevel;
    reasons: string[];
    riskScore: number;
    limitations: InvestigationLimitation[];
  } {
    let scoreAccumulator = 0;
    const reasons: string[] = [];
    const limitations: InvestigationLimitation[] = [];

    // 1. Enforce Source Independence
    // We group verified/corroborated evidence by their `independenceGroup`
    const highConfidenceEvidences = evidences.filter(e => e.status === 'VERIFIED' || e.status === 'CORROBORATED');
    const independentSources = new Set(highConfidenceEvidences.map(e => e.independenceGroup).filter(Boolean));

    if (independentSources.size > 0) {
      scoreAccumulator += Math.min(50, independentSources.size * 15);
      reasons.push(`Corroborated by ${independentSources.size} independent highly reliable source groups.`);
    } else {
      limitations.push({
        scope: 'Source Independence',
        reason: 'Zero mathematically independent authoritative sources confirmed this target.',
        impact: 'Confidence score is strictly capped. Findings rely on unverified observations.',
        recommendation: 'Seek direct cryptographic or authoritative registry validation.'
      });
    }

    // 2. Identity Ambiguity (Candidate Analysis)
    const strongCandidates = candidates.filter(c => c.status === 'STRONG' || c.status === 'PROBABLE');
    if (strongCandidates.length === 1) {
      scoreAccumulator += 20;
      reasons.push(`Single cohesive identity profile resolved without major entity fragmentation.`);
    } else if (strongCandidates.length > 1) {
      scoreAccumulator -= 15;
      reasons.push(`Identity ambiguity detected: ${strongCandidates.length} distinct strong candidate entities found. Resolution is split.`);
      limitations.push({
        scope: 'Entity Resolution',
        reason: `Multiple distinct candidates (${strongCandidates.length}) found for target.`,
        impact: 'High risk of false positives. Data might belong to namesakes or disconnected accounts.',
        recommendation: 'Filter search with additional anchors (e.g. location, organization) to isolate the correct entity.'
      });
    }

    // 3. Contradiction Penalties
    if (contradictions.length > 0) {
      const highSevContradictions = contradictions.filter(c => c.severity === 'HIGH');
      if (highSevContradictions.length > 0) {
        scoreAccumulator -= 20;
        reasons.push(`Critical contradictions found (${highSevContradictions.length}) undermining correlation.`);
      } else {
        scoreAccumulator -= 5;
        reasons.push(`Minor temporal or contextual contradictions noted.`);
      }
    }

    // 4. Discovery / Observation (Low confidence padding)
    const observedEvidences = evidences.filter(e => e.status === 'OBSERVED');
    if (observedEvidences.length > 0) {
      scoreAccumulator += Math.min(10, observedEvidences.length * 2);
      reasons.push(`Supplementary observational records identified (${observedEvidences.length} distinct signals).`);
    }

    // Heuristic Score normalization (0 - 100)
    const finalScore = Math.min(98, Math.max(10, Math.round(scoreAccumulator)));

    let level: ConfidenceLevel = 'WEAK';
    if (finalScore >= 80) level = 'STRONG';
    else if (finalScore >= 60) level = 'PROBABLE';
    else if (finalScore >= 30) level = 'POSSIBLE';
    else level = 'WEAK';

    // Risk exposure computation based on digital footprint surface
    const totalAttributes = candidates.reduce((sum, c) => sum + c.attributes.length, 0);
    const riskScore = Math.min(95, Math.max(15, (highConfidenceEvidences.length * 8) + (totalAttributes * 4) + 10));

    return {
      score: finalScore,
      level,
      reasons: reasons.length > 0 ? reasons : ['Baseline heuristic analysis from initial target query'],
      riskScore,
      limitations
    };
  }
}
