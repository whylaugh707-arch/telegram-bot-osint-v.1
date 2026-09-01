/**
 * OSINT Nexus - Email Intelligence & Footprint Collector (Phase 2 Refactor)
 * Extracts Gravatar MD5 cryptographic profiles and determines email provider classification.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';
import crypto from 'crypto';

export class EmailCollector implements Collector {
  public name = 'EMAIL_INTELLIGENCE_COLLECTOR';
  public category = 'IDENTITY' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'email';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const emailNorm = Normalizer.normalizeEmail(target.raw);
    const { address, user, domain } = emailNorm.normalized;
    const startedAt = new Date().toISOString();

    // 1. Gravatar Cryptographic MD5 Query
    const hash = crypto.createHash('md5').update(address.trim().toLowerCase()).digest('hex');
    const gravatarUrl = `https://en.gravatar.com/${hash}.json`;
    const gravRes = await SafeRequester.executeRequest('Gravatar API', gravatarUrl, { timeout: 3500 });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'Gravatar MD5 Profile Registry',
      query: `${address} -> md5:${hash}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: gravRes.durationMs,
      status: gravRes.status,
      httpStatus: gravRes.response?.status,
      resultCount: gravRes.status === 'FOUND' && gravRes.response?.data?.entry?.[0] ? 1 : 0
    });

    if (gravRes.status === 'FOUND' && gravRes.response?.data?.entry?.[0]) {
      const entry = gravRes.response.data.entry[0];
      const sourceRel = SafeRequester.getSourceReliability('Gravatar API');

      output.evidences.push({
        id: `gravatar_${hash}`,
        source: 'Gravatar (Automattic Identity Registry)',
        sourceType: 'API',
        sourceUrl: gravatarUrl,
        independenceGroup: 'gravatar',
        method: 'md5_cryptographic_hash_lookup',
        observedAt: startedAt,
        retrievedAt: new Date().toISOString(),
        type: 'email_hash',
        rawValue: entry,
        normalizedValue: {
          email: address,
          hash,
          displayName: entry.displayName,
          profileUrl: entry.profileUrl,
          aboutMe: entry.aboutMe,
          currentLocation: entry.currentLocation,
          photos: entry.photos?.map((p: any) => p.value) || [],
          accounts: entry.accounts?.map((a: any) => ({ domain: a.domain, username: a.username, url: a.url })) || []
        },
        rawExcerpt: `Gravatar matched for hash ${hash}: ${entry.displayName}`,
        status: 'VERIFIED',
        verificationScope: 'OWNERSHIP', // Confirms they own this email hash
        confidence: 98,
        reliability: sourceRel.reliability,
        metadata: {
          note: 'Cryptographically verified profile bound to email MD5 hash'
        }
      });
    }

    // 2. Common Free / Disposable Email Provider Classification
    const disposableDomains = new Set(['tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'throwawaymail.com', 'yopmail.com', 'trashmail.com']);
    const freeDomains = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'zoho.com', 'aol.com']);

    const isDisposable = disposableDomains.has(domain);
    const isFree = freeDomains.has(domain);

    output.evidences.push({
      id: `email_domain_class_${domain}`,
      source: 'Mail Provider Classification Matrix',
      sourceType: 'AUTHORITATIVE_REGISTRY',
      independenceGroup: 'domain_classification',
      method: 'static_domain_set_evaluation',
      observedAt: startedAt,
      retrievedAt: new Date().toISOString(),
      type: 'account',
      rawValue: { address, user, domain, isDisposable, isFree },
      normalizedValue: { address, user, domain, isDisposable, isFreeMail: isFree, isCustomCorporateDomain: !isDisposable && !isFree },
      rawExcerpt: `Domain ${domain} classified as ${isDisposable ? 'Disposable' : isFree ? 'Free Provider' : 'Corporate/Custom'}`,
      status: 'VERIFIED',
      verificationScope: 'ATTRIBUTE_OBSERVED',
      confidence: 90,
      reliability: 0.90,
      metadata: {
        note: 'Domain classification relies on known lists; does not verify account existence'
      }
    });

    return output;
  }
}
