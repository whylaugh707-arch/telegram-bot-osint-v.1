/**
 * OSINT Nexus - Multi-Platform Identity Collector (Phase 2 Refactor)
 * Strict platform verification with explicit ACCOUNT_EXISTENCE scopes and zero naive HTTP 200 assertions.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, EvidenceStatus, TargetInput, VerificationScope } from '../models/types';
import { buildPlatformList, CorrelatePlatform } from '../services/correlator';
import { Normalizer } from '../normalization';

export interface PlatformObservation {
  status: 'FOUND' | 'NOT_FOUND' | 'BLOCKED' | 'RATE_LIMITED' | 'ERROR' | 'AMBIGUOUS';
  profileUrl?: string;
  evidence: Evidence[];
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformVerifier {
  platform: string;
  check(handle: string, platformConfig: CorrelatePlatform): Promise<PlatformObservation>;
}

export class UsernameCollector implements Collector {
  public name = 'MULTI_PLATFORM_IDENTITY_COLLECTOR';
  public category = 'IDENTITY' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'username' || target.classification === 'person_name';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const norm = Normalizer.normalizeUsername(target.raw);
    const handle = norm.normalized.standard;
    if (!handle || handle.length < 2) return output;

    const platforms = buildPlatformList(handle);
    const batchSize = 12;

    for (let i = 0; i < platforms.length; i += batchSize) {
      const batch = platforms.slice(i, i + batchSize);
      await Promise.all(batch.map(async (p: CorrelatePlatform) => {
        const startedAt = new Date().toISOString();
        const targetUrl = p.apiEndpoint || p.url;
        
        const reqRes = await SafeRequester.executeRequest(p.name, targetUrl, {
          timeout: 4000
        });

        let obsStatus: PlatformObservation['status'] = 'NOT_FOUND';
        let evidenceStatus: EvidenceStatus = 'OBSERVED';
        let verificationScope: VerificationScope = 'ACCOUNT_EXISTENCE';
        let note = '';
        let metadata: Record<string, unknown> = {};
        let confidenceScore = 65;

        if (reqRes.status === 'FOUND' && reqRes.response) {
          const res = reqRes.response;

          // 1. GitHub API Verification (Authoritative API)
          if (p.checkMethod === 'api_github') {
            if (res.data?.login && String(res.data.login).toLowerCase() === handle.toLowerCase()) {
              obsStatus = 'FOUND';
              evidenceStatus = 'VERIFIED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 95;
              note = res.data.name ? `Name: ${res.data.name}` : 'GitHub Developer';
              metadata = { 
                login: res.data.login, 
                name: res.data.name, 
                email: res.data.email, 
                bio: res.data.bio, 
                blog: res.data.blog,
                company: res.data.company,
                location: res.data.location
              };
            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 2. Gravatar API Verification
          else if (p.checkMethod === 'api_gravatar') {
            if (res.data?.entry?.[0]) {
              obsStatus = 'FOUND';
              evidenceStatus = 'VERIFIED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 90;
              note = res.data.entry[0].displayName || 'Gravatar User';
              metadata = { displayName: res.data.entry[0].displayName, aboutMe: res.data.entry[0].aboutMe };
            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 3. Reddit API Verification
          else if (p.checkMethod === 'api_reddit') {
            if (res.data?.data?.name && !res.data.data.is_suspended) {
              obsStatus = 'FOUND';
              evidenceStatus = 'SUPPORTED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 85;
              note = `Karma: ${res.data.data.total_karma || 0}`;
            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 4. NPM Registry
          else if (p.checkMethod === 'api_npm') {
            if (res.data?.name) {
              obsStatus = 'FOUND';
              evidenceStatus = 'VERIFIED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 90;
              note = 'NPM Package Maintainer';
            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 5. GitLab API
          else if (p.checkMethod === 'api_gitlab') {
            if (Array.isArray(res.data) && res.data.some((u: any) => u.username?.toLowerCase() === handle.toLowerCase())) {
              obsStatus = 'FOUND';
              evidenceStatus = 'VERIFIED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 90;
              note = 'GitLab User';
            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 6. Signature-based verification (Strict body keyword & anti-false-positive checks)
          else if (p.checkMethod === 'get_with_signature') {
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            const lowerBody = body.toLowerCase();

            // Must Not Contain
            const failedNotContain = p.mustNotContain && p.mustNotContain.some(kw => body.includes(kw) || lowerBody.includes(kw.toLowerCase()));
            // Must Contain
            const passedMustContain = !p.mustContain || p.mustContain.every(kw => lowerBody.includes(kw.toLowerCase()));

            if (!failedNotContain && passedMustContain) {
              obsStatus = 'FOUND';
              evidenceStatus = 'SUPPORTED';
              verificationScope = 'ACCOUNT_EXISTENCE';
              confidenceScore = 75;
              
              // Extract additional contact vectors from HTML body
              const plainText = body.replace(/<[^>]*>?/gm, ' '); // Strip HTML tags for clean text matching
              
              const extractedEmails = plainText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
              const extractedWa = body.match(/wa\.me\/(?:\+)?(\d{8,15})/g) || []; // wa.me is usually in hrefs, so use raw body
              const extractedPhones = plainText.match(/\b(08\d{8,11}|628\d{8,12}|\+628\d{8,12})\b/g) || [];
              
              const uniqueEmails = Array.from(new Set(extractedEmails)).filter(e => !e.toLowerCase().includes('sentry.io') && !e.toLowerCase().includes('w3.org') && !e.toLowerCase().includes('example.com'));
              const uniqueWa = Array.from(new Set(extractedWa.map(w => w.replace('wa.me/', '').replace('+',''))));
              const uniquePhones = Array.from(new Set(extractedPhones));
              
              const locMatches = plainText.match(/\b(Jakarta|Bandung|Surabaya|Yogyakarta|Jogja|Semarang|Medan|Makassar|Bali|Indonesia|Jawa|Sumatera|Kalimantan|Sulawesi|Papua)\b/gi) || [];
              const eduMatches = plainText.match(/\b(SMA|SMK|SMP|SD|Universitas|Institut|Politeknik|Akademi|Sekolah Tinggi) [A-Za-z0-9 ]{3,30}\b/gi) || [];
              
              const uniqueLocs = Array.from(new Set(locMatches.map(l => l.toUpperCase())));
              const uniqueEdu = Array.from(new Set(eduMatches));

              if (uniqueEmails.length > 0) metadata.extractedEmails = uniqueEmails;
              if (uniqueWa.length > 0) metadata.extractedWhatsApp = uniqueWa;
              if (uniquePhones.length > 0) metadata.extractedPhones = uniquePhones;
              if (uniqueLocs.length > 0) metadata.extractedLocations = uniqueLocs;
              if (uniqueEdu.length > 0) metadata.extractedEducation = uniqueEdu;
              
              const notesParts = [];
              if (uniqueEmails.length > 0) notesParts.push(`Emails: ${uniqueEmails.length}`);
              if (uniqueWa.length > 0 || uniquePhones.length > 0) notesParts.push(`Phones: ${uniqueWa.length + uniquePhones.length}`);
              if (uniqueLocs.length > 0) notesParts.push(`Location: ${uniqueLocs.join(', ')}`);
              
              if (notesParts.length > 0) {
                 note = `Extracted: ${notesParts.join(' | ')}`;
              }

            } else {
              obsStatus = 'NOT_FOUND';
            }
          }
          // 7. Any generic platform without robust signatures is strictly marked AMBIGUOUS rather than verified
          else {
            obsStatus = 'AMBIGUOUS';
          }
        } else if (reqRes.status === 'BLOCKED') {
          obsStatus = 'BLOCKED';
        } else if (reqRes.status === 'RATE_LIMITED') {
          obsStatus = 'RATE_LIMITED';
        } else if (reqRes.status === 'TIMEOUT') {
          obsStatus = 'TIMEOUT';
        }

        // Record provenance log
        output.logs.push({
          collectorName: this.name,
          sourceName: p.name,
          query: handle,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: reqRes.durationMs,
          status: obsStatus === 'FOUND' ? 'FOUND' : obsStatus === 'AMBIGUOUS' ? 'AMBIGUOUS' : reqRes.status,
          httpStatus: reqRes.response?.status,
          resultCount: obsStatus === 'FOUND' ? 1 : 0,
          error: reqRes.error
        });

        // Store Evidence if verified/supported account presence is confirmed
        if (obsStatus === 'FOUND') {
          const independenceGroup = `platform_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const sourceRel = SafeRequester.getSourceReliability(p.name);

          output.evidences.push({
            id: `plat_${independenceGroup}_${handle}`,
            source: p.name,
            sourceType: p.checkMethod.startsWith('api_') ? 'API' : 'WEB_CRAWL',
            sourceUrl: p.url,
            independenceGroup,
            method: p.checkMethod,
            observedAt: startedAt,
            retrievedAt: new Date().toISOString(),
            type: 'account',
            rawValue: { platform: p.name, handle, url: p.url, rawHttpStatus: reqRes.response?.status },
            normalizedValue: { platform: p.name, handle: norm.normalized.standard, url: p.url, category: p.category, note },
            rawExcerpt: note,
            status: evidenceStatus,
            verificationScope,
            confidence: confidenceScore,
            reliability: sourceRel.reliability,
            metadata
          });
        }
      }));
    }

    return output;
  }
}
