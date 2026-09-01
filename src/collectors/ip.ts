/**
 * OSINT Nexus - IP Infrastructure & Bogon Intelligence Collector (Phase 2 Refactor)
 * Comprehensive Bogon/SSRF classification, Shodan InternetDB, and PTR lookup with explicit provenance.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';
import dns from 'dns/promises';

export class IPCollector implements Collector {
  public name = 'IP_INFRASTRUCTURE_COLLECTOR';
  public category = 'NETWORK' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'ipv4' || target.classification === 'ipv6';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const norm = Normalizer.normalizeIP(target.raw);
    if (!norm) return output;

    const ip = norm.normalized.ip;
    const ipType = norm.normalized.type;
    const startedAt = new Date().toISOString();

    // 1. IP Range Classification Evidence (Bogon / Private / Public)
    output.evidences.push({
      id: `ip_bogon_${ip}`,
      source: 'RFC Address Allocation Standard (IANA/IETF)',
      sourceType: 'AUTHORITATIVE_REGISTRY',
      independenceGroup: 'iana_rfc_spec',
      method: norm.normalizationMethod,
      observedAt: startedAt,
      retrievedAt: new Date().toISOString(),
      type: 'bogon_check',
      rawValue: { ip: target.raw },
      normalizedValue: { ip, type: ipType, isPrivateOrLocal: norm.normalized.isPrivateOrLocal },
      rawExcerpt: `IP Range Classification: ${ipType} (${norm.normalized.isPrivateOrLocal ? 'Non-Routable Bogon/Private/Local Range' : 'Globally Routable Public Address'})`,
      status: 'VERIFIED',
      verificationScope: 'ATTRIBUTE_OBSERVED',
      confidence: 100,
      reliability: 1.0
    });

    // If private or local, do not attempt public telemetry lookup
    if (norm.normalized.isPrivateOrLocal) {
      output.limitations.push({
        scope: 'IP_GEO_AND_PORT_SCAN',
        reason: `Target IP ${ip} belongs to ${ipType} space.`,
        impact: 'Public intelligence registries cannot query internal or loopback IP ranges.',
        recommendation: 'Target must be tested internally or via enterprise gateway.'
      });
      return output;
    }

    // 2. Reverse DNS (PTR) Resolution
    try {
      const ptrs = await dns.reverse(ip);
      if (ptrs.length > 0) {
        output.evidences.push({
          id: `ip_ptr_${ip}`,
          source: 'Authoritative in-addr.arpa / ip6.arpa DNS PTR',
          sourceType: 'DNS',
          independenceGroup: 'authoritative_ptr_dns',
          method: 'dns_reverse_lookup',
          observedAt: startedAt,
          retrievedAt: new Date().toISOString(),
          type: 'dns_record',
          rawValue: { ip, ptrs },
          normalizedValue: { ip, hostnames: ptrs },
          rawExcerpt: `PTR Hostnames: ${ptrs.join(', ')}`,
          status: 'VERIFIED',
          verificationScope: 'ATTRIBUTE_OBSERVED',
          confidence: 95,
          reliability: 0.95
        });
      }
    } catch {
      // PTR not set
    }

    // 3. Shodan InternetDB Open Port & Vulnerability Query
    const shodanUrl = `https://internetdb.shodan.io/${ip}`;
    const shodanRes = await SafeRequester.executeRequest(
      'Shodan InternetDB API',
      shodanUrl,
      { timeout: 4000 }
    );

    output.logs.push({
      collectorName: this.name,
      sourceName: 'Shodan InternetDB API',
      query: ip,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: shodanRes.durationMs,
      status: shodanRes.status,
      httpStatus: shodanRes.response?.status,
      resultCount: shodanRes.status === 'FOUND' ? 1 : 0,
      error: shodanRes.error
    });

    if (shodanRes.status === 'FOUND' && shodanRes.response?.data) {
      const data = shodanRes.response.data;
      output.evidences.push({
        id: `ip_shodan_${ip}`,
        source: 'Shodan InternetDB Network Telemetry',
        sourceType: 'API',
        sourceUrl: shodanUrl,
        independenceGroup: 'shodan_telemetry',
        method: 'internetdb_rest_api',
        observedAt: startedAt,
        retrievedAt: new Date().toISOString(),
        type: 'ip_geo',
        rawValue: data,
        normalizedValue: {
          ip,
          ports: data.ports || [],
          cves: data.cves || [],
          hostnames: data.hostnames || [],
          tags: data.tags || []
        },
        rawExcerpt: `Open Ports: ${(data.ports || []).join(', ') || 'None'} | CVEs: ${(data.cves || []).length}`,
        status: 'CORROBORATED',
        verificationScope: 'ATTRIBUTE_OBSERVED',
        confidence: 85,
        reliability: 0.85
      });
    }

    return output;
  }
}
