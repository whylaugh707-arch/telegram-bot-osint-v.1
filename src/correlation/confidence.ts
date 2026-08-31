/**
 * OSINT Nexus - Confidence Scoring Engine
 * Computes heuristic confidence, risk exposure, and generates evidence-driven audit reasons.
 */

import { ConfidenceLevel, Entity, Evidence, InvestigationLimitation, TargetInput } from '../models/types';

export class ConfidenceScorer {

  public static calculate(
    target: TargetInput,
    evidences: Evidence[],
    entities: Entity[]
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

    const verifiedEvidences = evidences.filter(e => e.verified);
    const discoveryEvidences = evidences.filter(e => !e.verified);

    // 1. Direct Cryptographic & Authoritative Matches
    const directMatches = verifiedEvidences.filter(e => e.tier === 'DIRECT_VERIFICATION');
    if (directMatches.length > 0) {
      scoreAccumulator += Math.min(40, directMatches.length * 15);
      reasons.push(`Direct authoritative/cryptographic validation passed (${directMatches.length} source[s])`);
    }

    // 2. Verified Multi-Platform Footprints (OBSERVED_PROFILE)
    const observedProfiles = verifiedEvidences.filter(e => e.tier === 'OBSERVED_PROFILE');
    if (observedProfiles.length > 0) {
      const added = Math.min(35, observedProfiles.length * 7);
      scoreAccumulator += added;
      reasons.push(`Verified public account signatures confirmed on ${observedProfiles.length} platform(s)`);
    } else if (target.classification === 'username') {
      limitations.push({
        scope: 'Platform Footprint',
        reason: 'Zero exact active public profiles matching target handle with high certainty',
        impact: 'Correlation is limited to search index discovery and passive records',
        recommendation: 'Expand search with alternative aliases or Google Dorking matrix'
      });
    }

    // 3. Academic & Official Registries
    const registryRecords = verifiedEvidences.filter(e => e.tier === 'REGISTRY_RECORD');
    if (registryRecords.length > 0) {
      scoreAccumulator += Math.min(25, registryRecords.length * 10);
      reasons.push(`Corroborated by ${registryRecords.length} official scholarly / institutional registry record(s)`);
    }

    // 4. Cross-Vector Identity Consistency
    const primary = entities[0];
    if (primary) {
      const emailProps = primary.properties.filter(p => p.type === 'email');
      const phoneProps = primary.properties.filter(p => p.type === 'phone');
      const nameProps = primary.properties.filter(p => p.type === 'name');

      if (emailProps.length > 0 && nameProps.length > 0) {
        scoreAccumulator += 15;
        reasons.push('Cross-source correlation: Name and verified Email anchor match');
      }
      if (phoneProps.length > 0) {
        scoreAccumulator += 10;
        reasons.push('Direct telecommunication vector (Phone/WhatsApp) discovered in public text records');
      }
    }

    // 5. Discovery Snippets (Web Search) - Capped at low contribution
    if (discoveryEvidences.length > 0) {
      scoreAccumulator += Math.min(10, discoveryEvidences.length * 2);
      reasons.push(`Supplementary web index discovery records identified (${discoveryEvidences.length} snippet[s])`);
    }

    // Heuristic Score normalization (0 - 100)
    const finalScore = Math.min(98, Math.max(10, Math.round(scoreAccumulator)));

    let level: ConfidenceLevel = 'WEAK';
    if (finalScore >= 80) level = 'STRONG';
    else if (finalScore >= 60) level = 'PROBABLE';
    else if (finalScore >= 30) level = 'POSSIBLE';
    else level = 'WEAK';

    // Risk exposure computation based on digital footprint surface
    const totalIdentifiableProperties = primary ? primary.properties.length : 0;
    const riskScore = Math.min(95, Math.max(15, (observedProfiles.length * 8) + (totalIdentifiableProperties * 6) + 10));

    return {
      score: finalScore,
      level,
      reasons: reasons.length > 0 ? reasons : ['Baseline heuristic analysis from initial target query'],
      riskScore,
      limitations
    };
  }
}
