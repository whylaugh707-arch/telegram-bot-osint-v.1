/**
 * OSINT Nexus - Entity Resolution & Correlation Engine
 * Clusters evidences across platforms, emails, and networks into structured entities and relationships.
 */

import { Entity, EntityProperty, EntityRelationship, Evidence, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';

export class EntityResolver {

  /**
   * Resolve Entities and Relationships from normalized target and collected evidence
   */
  public static resolve(target: TargetInput, evidences: Evidence[]): { entities: Entity[]; relationships: EntityRelationship[] } {
    const entities: Entity[] = [];
    const relationships: EntityRelationship[] = [];

    // Primary Target Entity
    const primaryEntityId = `entity_target_${target.classification}_${target.normalized.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const primaryType = 
      target.classification === 'person_name' ? 'Person' :
      target.classification === 'username' || target.classification === 'email' ? 'DigitalIdentity' :
      target.classification === 'domain' ? 'DomainInfrastructure' :
      target.classification === 'ipv4' || target.classification === 'ipv6' ? 'NetworkHost' : 'DigitalIdentity';

    const primaryProperties: EntityProperty[] = [];
    const observedPlatforms = new Set<string>();

    // Add initial target vector property
    if (target.classification === 'username') {
      primaryProperties.push({
        type: 'username',
        value: target.raw,
        normalizedValue: target.normalized,
        confidence: 100,
        evidenceIds: ['target_input']
      });
    } else if (target.classification === 'email') {
      primaryProperties.push({
        type: 'email',
        value: target.raw,
        normalizedValue: target.normalized,
        confidence: 100,
        evidenceIds: ['target_input']
      });
    } else if (target.classification === 'person_name') {
      primaryProperties.push({
        type: 'name',
        value: target.raw,
        normalizedValue: target.normalized,
        confidence: 100,
        evidenceIds: ['target_input']
      });
    }

    // Process all evidences
    for (const ev of evidences) {
      // 1. Account Presences
      if (ev.type === 'account' && typeof ev.value === 'object' && ev.value !== null) {
        const val = ev.value as any;
        if (val.platform) observedPlatforms.add(val.platform);

        if (val.handle) {
          primaryProperties.push({
            type: 'username',
            value: val.handle,
            normalizedValue: Normalizer.normalizeUsername(val.handle).normalized.canonicalKey,
            confidence: ev.confidenceScore,
            evidenceIds: [ev.id]
          });
        }
        if (ev.metadata?.name) {
          primaryProperties.push({
            type: 'name',
            value: String(ev.metadata.name),
            normalizedValue: Normalizer.normalizeName(String(ev.metadata.name)).normalized.standard,
            confidence: 85,
            evidenceIds: [ev.id]
          });
        }
        if (ev.metadata?.email) {
          primaryProperties.push({
            type: 'email',
            value: String(ev.metadata.email),
            normalizedValue: Normalizer.normalizeEmail(String(ev.metadata.email)).normalized.address,
            confidence: 90,
            evidenceIds: [ev.id]
          });
        }
      }

      // 2. Gravatar Profile
      if (ev.type === 'email_hash' && typeof ev.value === 'object' && ev.value !== null) {
        const val = ev.value as any;
        if (val.displayName) {
          primaryProperties.push({
            type: 'name',
            value: val.displayName,
            normalizedValue: Normalizer.normalizeName(val.displayName).normalized.standard,
            confidence: 90,
            evidenceIds: [ev.id]
          });
        }
        if (val.currentLocation) {
          primaryProperties.push({
            type: 'location',
            value: val.currentLocation,
            normalizedValue: val.currentLocation.toLowerCase(),
            confidence: 85,
            evidenceIds: [ev.id]
          });
        }
      }

      // 3. Phone Discovery
      if (ev.type === 'phone_ref' && typeof ev.value === 'object' && ev.value !== null) {
        const val = ev.value as any;
        if (val.phone) {
          primaryProperties.push({
            type: 'phone',
            value: val.phone,
            normalizedValue: val.phone,
            confidence: ev.confidenceScore,
            evidenceIds: [ev.id]
          });
        }
      }

      // 4. Academic Publication & Affiliations
      if (ev.type === 'academic_pub' && typeof ev.value === 'object' && ev.value !== null) {
        const val = ev.value as any;
        if (val.institution) {
          primaryProperties.push({
            type: 'organization',
            value: val.institution,
            normalizedValue: val.institution.toLowerCase(),
            confidence: 80,
            evidenceIds: [ev.id]
          });
        }
      }

      // 5. DNS / Infrastructure
      if (ev.type === 'dns_record' && ev.key === 'DNS_ADDRESS_RECORDS' && typeof ev.value === 'object' && ev.value !== null) {
        const val = ev.value as any;
        if (val.ipv4 && Array.isArray(val.ipv4)) {
          val.ipv4.forEach((ip: string) => {
            const ipEntityId = `entity_ip_${ip.replace(/\./g, '_')}`;
            // Add relation
            relationships.push({
              id: `rel_${primaryEntityId}_hosted_${ipEntityId}`,
              sourceEntityId: primaryEntityId,
              targetEntityId: ipEntityId,
              relation: 'HOSTED_ON_IP',
              confidence: 95,
              evidenceIds: [ev.id],
              description: `Domain resolved to IPv4 address ${ip}`
            });
          });
        }
      }
    }

    // Deduplicate properties on primary entity
    const dedupedProps: EntityProperty[] = [];
    const seen = new Set<string>();
    for (const p of primaryProperties) {
      const key = `${p.type}:${p.normalizedValue.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedProps.push(p);
      }
    }

    const primaryEntity: Entity = {
      id: primaryEntityId,
      primaryType,
      label: target.raw,
      properties: dedupedProps,
      confidence: {
        score: 0, // Will be computed by confidence scorer
        level: 'POSSIBLE',
        reasons: []
      },
      observedOn: Array.from(observedPlatforms)
    };

    entities.push(primaryEntity);

    return { entities, relationships };
  }
}
