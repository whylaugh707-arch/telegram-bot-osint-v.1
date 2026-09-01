/**
 * OSINT Nexus - Entity Resolution & Correlation Engine (Phase 2 Refactor)
 * Clusters evidences logically, avoids forced merging, and generates explicit relationships and contradictions.
 */

import { Evidence, EntityCandidate, TargetInput, EntityAttribute, Relationship, Contradiction } from '../models/types';
import { Normalizer } from '../normalization';

export class EntityResolver {

  /**
   * Resolve Entities, Relationships, and Contradictions from normalized target and collected evidence
   */
  public static resolve(target: TargetInput, evidences: Evidence[]): { 
    entities: EntityCandidate[], 
    relationships: Relationship[], 
    contradictions: Contradiction[] 
  } {
    let entities: EntityCandidate[] = [];
    const relationships: Relationship[] = [];
    const contradictions: Contradiction[] = [];
    let candidateCounter = 1;

    // 1. Create Initial Candidates from Evidence
    for (const ev of evidences) {
      if (ev.status === 'OBSERVED' || ev.status === 'SUPPORTED' || ev.status === 'CORROBORATED' || ev.status === 'VERIFIED') {
        
        let candidate: EntityCandidate | null = null;

        if (ev.type === 'account' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          if (val.handle || val.platform) {
            candidate = this.createCandidate(candidateCounter++, 'DigitalIdentity', `${val.platform || 'Platform'} User: ${val.handle || target.raw}`, ev);
            if (val.handle) this.addAttribute(candidate, 'username', val.handle, ev.id, ev.confidence);
            if (ev.metadata?.name) this.addAttribute(candidate, 'name', String(ev.metadata.name), ev.id, ev.confidence);
            if (ev.metadata?.email) this.addAttribute(candidate, 'email', String(ev.metadata.email), ev.id, ev.confidence);
            if (ev.metadata?.company) this.addAttribute(candidate, 'organization', String(ev.metadata.company), ev.id, ev.confidence);
            if (ev.metadata?.location) this.addAttribute(candidate, 'location', String(ev.metadata.location), ev.id, ev.confidence);
            
            if (Array.isArray(ev.metadata?.extractedEmails)) {
              ev.metadata.extractedEmails.forEach(e => this.addAttribute(candidate!, 'email', String(e), ev.id, ev.confidence - 10));
            }
            if (Array.isArray(ev.metadata?.extractedWhatsApp)) {
              ev.metadata.extractedWhatsApp.forEach(p => this.addAttribute(candidate!, 'phone', String(p), ev.id, ev.confidence - 10));
            }
            if (Array.isArray(ev.metadata?.extractedPhones)) {
              ev.metadata.extractedPhones.forEach(p => this.addAttribute(candidate!, 'phone', String(p), ev.id, ev.confidence - 10));
            }
            if (Array.isArray(ev.metadata?.extractedLocations)) {
              ev.metadata.extractedLocations.forEach(l => this.addAttribute(candidate!, 'location', String(l), ev.id, ev.confidence - 10));
            }
            if (Array.isArray(ev.metadata?.extractedEducation)) {
              ev.metadata.extractedEducation.forEach(e => this.addAttribute(candidate!, 'organization', String(e), ev.id, ev.confidence - 10));
            }
          }
        } 
        else if (ev.type === 'email_hash' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          candidate = this.createCandidate(candidateCounter++, 'DigitalIdentity', `Gravatar Profile: ${val.email}`, ev);
          this.addAttribute(candidate, 'email', val.email, ev.id, ev.confidence);
          if (val.displayName) this.addAttribute(candidate, 'name', val.displayName, ev.id, ev.confidence);
          if (val.currentLocation) this.addAttribute(candidate, 'location', val.currentLocation, ev.id, ev.confidence);
        }
        else if (ev.type === 'academic_pub' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          const name = val.matchedAuthor || val.name || target.raw;
          candidate = this.createCandidate(candidateCounter++, 'Person', `Scholar: ${name}`, ev);
          this.addAttribute(candidate, 'name', name, ev.id, ev.confidence);
          if (val.affiliation || val.institution) this.addAttribute(candidate, 'organization', val.affiliation || val.institution, ev.id, ev.confidence);
        }
        else if (ev.type === 'phone_ref' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          if (val.value) {
            candidate = this.createCandidate(candidateCounter++, 'DigitalIdentity', `Phone Entity: ${val.value}`, ev);
            this.addAttribute(candidate, 'phone', val.value, ev.id, ev.confidence);
          }
        }
        else if (ev.type === 'contact_vector' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          if (val.value) {
            candidate = this.createCandidate(candidateCounter++, 'DigitalIdentity', `Contact: ${val.value}`, ev);
            if (val.type === 'EMAIL') this.addAttribute(candidate, 'email', val.value, ev.id, ev.confidence);
          }
        }
        else if (ev.type === 'dns_record' && typeof ev.normalizedValue === 'object' && ev.normalizedValue !== null) {
          const val = ev.normalizedValue as any;
          if (val.domain) {
            candidate = this.createCandidate(candidateCounter++, 'DomainInfrastructure', `Domain: ${val.domain}`, ev);
            this.addAttribute(candidate, 'domain', val.domain, ev.id, ev.confidence);
          }
        }

        if (candidate && candidate.attributes.length > 0) {
          entities.push(candidate);
        }
      }
    }

    // 2. Safe Merging (Identity Resolution)
    // We merge candidates if they share a STRONG cryptographic anchor (email/phone),
    // OR if they share a unique identifier (username),
    // OR if they share an exact name and have NO conflicting attributes (org/location).
    let mergedEntities: EntityCandidate[] = [];
    for (const entity of entities) {
      let merged = false;
      const emails = entity.attributes.filter(a => a.type === 'email').map(a => a.normalized);
      const phones = entity.attributes.filter(a => a.type === 'phone').map(a => a.normalized);
      const usernames = entity.attributes.filter(a => a.type === 'username').map(a => a.normalized);
      const names = entity.attributes.filter(a => a.type === 'name').map(a => a.normalized);
      const organizations = entity.attributes.filter(a => a.type === 'organization').map(a => a.normalized);
      const locations = entity.attributes.filter(a => a.type === 'location').map(a => a.normalized);

      for (const existing of mergedEntities) {
        const existingEmails = existing.attributes.filter(a => a.type === 'email').map(a => a.normalized);
        const existingPhones = existing.attributes.filter(a => a.type === 'phone').map(a => a.normalized);
        const existingUsernames = existing.attributes.filter(a => a.type === 'username').map(a => a.normalized);
        const existingNames = existing.attributes.filter(a => a.type === 'name').map(a => a.normalized);
        const existingOrganizations = existing.attributes.filter(a => a.type === 'organization').map(a => a.normalized);
        const existingLocations = existing.attributes.filter(a => a.type === 'location').map(a => a.normalized);

        const sharesEmail = emails.length > 0 && emails.some(e => existingEmails.includes(e));
        const sharesPhone = phones.length > 0 && phones.some(p => existingPhones.includes(p));
        const sharesUsername = usernames.length > 0 && usernames.some(u => existingUsernames.includes(u));
        const sharesName = names.length > 0 && names.some(n => existingNames.includes(n));
        
        const hasOrgConflict = organizations.length > 0 && existingOrganizations.length > 0 && !organizations.some(o => existingOrganizations.includes(o));
        const hasLocConflict = locations.length > 0 && existingLocations.length > 0 && !locations.some(l => existingLocations.includes(l));

        if (sharesEmail || sharesPhone || sharesUsername || (sharesName && !hasOrgConflict && !hasLocConflict)) {
          this.mergeCandidates(existing, entity);
          
          if (sharesUsername && target.classification === 'username') {
             existing.label = `Correlated Footprint: ${usernames[0]}`;
          } else if (sharesName && target.classification === 'person_name') {
             existing.label = `Correlated Identity: ${names[0]}`;
          }

          merged = true;
          break;
        }
      }
      if (!merged) {
        mergedEntities.push(entity);
      }
    }

    // 3. Contradiction Detection
    for (const entity of mergedEntities) {
      const orgs = entity.attributes.filter(a => a.type === 'organization');
      if (orgs.length > 1) {
        const uniqueOrgs = Array.from(new Set(orgs.map(o => o.normalized)));
        if (uniqueOrgs.length > 1) {
          contradictions.push({
            id: `contra_org_${entity.id}`,
            attribute: 'organization',
            evidenceA: orgs[0].evidenceIds[0],
            evidenceB: orgs[1].evidenceIds[0],
            severity: 'LOW',
            explanation: `Multiple distinct organizations associated with the same entity: ${uniqueOrgs.join(' vs ')}. This may be a temporal change (job history) or different people.`,
            isTemporalResolution: true
          });
        }
      }

      const locations = entity.attributes.filter(a => a.type === 'location');
      if (locations.length > 1) {
        const uniqueLocs = Array.from(new Set(locations.map(o => o.normalized)));
        if (uniqueLocs.length > 1) {
          contradictions.push({
            id: `contra_loc_${entity.id}`,
            attribute: 'location',
            evidenceA: locations[0].evidenceIds[0],
            evidenceB: locations[1].evidenceIds[0],
            severity: 'LOW',
            explanation: `Multiple distinct locations detected: ${uniqueLocs.join(' vs ')}`,
            isTemporalResolution: true
          });
        }
      }
    }

    // 4. Generate Target Relationships
    for (const entity of mergedEntities) {
      let relType: Relationship['type'] | null = null;
      let matchedEvidenceIds: string[] = [];

      if (target.classification === 'username') {
        const usernames = entity.attributes.filter(a => a.type === 'username' && a.normalized === Normalizer.normalizeUsername(target.raw).normalized.canonicalKey);
        if (usernames.length > 0) {
          relType = 'USES_USERNAME';
          matchedEvidenceIds = usernames.map(u => u.evidenceIds).flat();
        }
      } else if (target.classification === 'email') {
        const emails = entity.attributes.filter(a => a.type === 'email' && a.normalized === Normalizer.normalizeEmail(target.raw).normalized.address);
        if (emails.length > 0) {
          relType = 'HAS_EMAIL';
          matchedEvidenceIds = emails.map(u => u.evidenceIds).flat();
        }
      } else if (target.classification === 'person_name') {
        const names = entity.attributes.filter(a => a.type === 'name' && a.normalized === Normalizer.normalizeName(target.raw).normalized.standard);
        if (names.length > 0) {
          relType = 'AFFILIATED_WITH'; 
          matchedEvidenceIds = names.map(u => u.evidenceIds).flat();
        }
      } else if (target.classification === 'domain') {
        const domains = entity.attributes.filter(a => a.type === 'domain' && a.normalized === Normalizer.normalizeDomain(target.raw).normalized);
        if (domains.length > 0) {
          relType = 'OWNS_DOMAIN';
          matchedEvidenceIds = domains.map(u => u.evidenceIds).flat();
        }
      }

      if (relType && matchedEvidenceIds.length > 0) {
        relationships.push({
          id: `rel_target_${entity.id}`,
          fromEntity: 'TARGET',
          toEntity: entity.id,
          type: relType,
          confidence: Math.min(...matchedEvidenceIds.map(id => evidences.find(e => e.id === id)?.confidence || 50)),
          evidenceIds: matchedEvidenceIds,
          status: 'SUPPORTED',
          description: `Entity is associated with target via ${relType}`
        });
      }
    }

    // Determine Entity Status
    for (const entity of mergedEntities) {
      const uniqueSources = new Set(entity.supportingEvidence.map(id => evidences.find(e => e.id === id)?.independenceGroup).filter(Boolean));
      if (uniqueSources.size >= 3) {
        entity.status = 'STRONG';
      } else if (uniqueSources.size >= 2) {
        entity.status = 'PROBABLE';
      } else if (entity.attributes.length > 2) {
        entity.status = 'POSSIBLE';
      } else {
        entity.status = 'UNRESOLVED';
      }
    }

    return { entities: mergedEntities, relationships, contradictions };
  }

  private static createCandidate(idNum: number, primaryType: EntityCandidate['primaryType'], label: string, ev: Evidence): EntityCandidate {
    return {
      id: `cand_${idNum}_${Date.now()}`,
      primaryType,
      label,
      attributes: [],
      supportingEvidence: [ev.id],
      conflictingEvidence: [],
      confidence: ev.confidence,
      status: 'UNRESOLVED',
      observedOn: [ev.source]
    };
  }

  private static addAttribute(candidate: EntityCandidate, type: EntityAttribute['type'], raw: string, evidenceId: string, confidence: number) {
    if (!raw || raw.trim() === '') return;
    
    let normalized = raw.trim().toLowerCase();
    if (type === 'username') normalized = Normalizer.normalizeUsername(raw).normalized.canonicalKey;
    if (type === 'email') normalized = Normalizer.normalizeEmail(raw).normalized.address;
    if (type === 'name') normalized = Normalizer.normalizeName(raw).normalized.standard;

    const existing = candidate.attributes.find(a => a.type === type && a.normalized === normalized);
    if (existing) {
      if (!existing.evidenceIds.includes(evidenceId)) {
        existing.evidenceIds.push(evidenceId);
      }
      existing.confidence = Math.max(existing.confidence, confidence);
    } else {
      candidate.attributes.push({
        type,
        raw,
        normalized,
        evidenceIds: [evidenceId],
        confidence
      });
    }
  }

  private static mergeCandidates(target: EntityCandidate, source: EntityCandidate) {
    for (const attr of source.attributes) {
      for (const evId of attr.evidenceIds) {
        this.addAttribute(target, attr.type, attr.raw, evId, attr.confidence);
      }
    }
    target.supportingEvidence = Array.from(new Set([...target.supportingEvidence, ...source.supportingEvidence]));
    target.observedOn = Array.from(new Set([...target.observedOn, ...source.observedOn]));
    target.confidence = Math.min(99, target.confidence + (source.confidence * 0.2)); 
  }
}
