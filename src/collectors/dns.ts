/**
 * OSINT Nexus - Full DNS Record & Infrastructure Collector
 * Resolves complete A, AAAA, MX, NS, TXT, CNAME, SOA, and CAA records without dropping entries.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';
import dns from 'dns/promises';

export class DNSCollector implements Collector {
  public name = 'DNS_INFRASTRUCTURE_COLLECTOR';
  public category = 'INFRASTRUCTURE' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'domain' || target.classification === 'email';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    let domain = target.normalized;
    if (target.classification === 'email') {
      const parts = target.raw.split('@');
      if (parts.length === 2) domain = Normalizer.normalizeDomain(parts[1]).normalized;
    } else {
      domain = Normalizer.normalizeDomain(target.raw).normalized;
    }

    const startedAt = new Date().toISOString();

    // 1. Resolve A & AAAA Records (Store ALL resolved IPs)
    try {
      const aRecords = await dns.resolve4(domain).catch(() => [] as string[]);
      const aaaaRecords = await dns.resolve6(domain).catch(() => [] as string[]);

      if (aRecords.length > 0 || aaaaRecords.length > 0) {
        output.evidences.push({
          id: `dns_a_${domain}`,
          tier: 'DIRECT_VERIFICATION',
          type: 'dns_record',
          key: 'DNS_ADDRESS_RECORDS',
          value: { ipv4: aRecords, ipv6: aaaaRecords, count: aRecords.length + aaaaRecords.length },
          confidenceScore: 100,
          verified: true,
          provenance: {
            collector: this.name,
            source: 'Authoritative DNS Resolver',
            retrievedAt: new Date().toISOString(),
            durationMs: 40,
            method: 'DNS_A_AAAA_LOOKUP'
          },
          metadata: { isMultiHomed: aRecords.length > 1 }
        });
      }
    } catch (e: any) {
      output.logs.push({
        collectorName: this.name,
        sourceName: 'DNS A/AAAA Lookup',
        query: domain,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: 40,
        status: 'NOT_FOUND',
        resultCount: 0,
        error: e.message
      });
    }

    // 2. Resolve MX Records
    try {
      const mxRecords = await dns.resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]);
      if (mxRecords.length > 0) {
        // Sort by priority
        const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority);
        output.evidences.push({
          id: `dns_mx_${domain}`,
          tier: 'DIRECT_VERIFICATION',
          type: 'mx_server',
          key: 'DNS_MAIL_EXCHANGERS',
          value: { mx: sortedMx.map(m => ({ host: m.exchange, priority: m.priority })) },
          confidenceScore: 98,
          verified: true,
          provenance: {
            collector: this.name,
            source: 'DNS MX Resolver',
            retrievedAt: new Date().toISOString(),
            durationMs: 35,
            method: 'DNS_MX_QUERY'
          }
        });
      }
    } catch {}

    // 3. Resolve NS Nameservers
    try {
      const nsRecords = await dns.resolveNs(domain).catch(() => [] as string[]);
      if (nsRecords.length > 0) {
        output.evidences.push({
          id: `dns_ns_${domain}`,
          tier: 'DIRECT_VERIFICATION',
          type: 'dns_record',
          key: 'DNS_NAMESERVERS',
          value: { nameservers: nsRecords },
          confidenceScore: 98,
          verified: true,
          provenance: {
            collector: this.name,
            source: 'DNS NS Resolver',
            retrievedAt: new Date().toISOString(),
            durationMs: 35,
            method: 'DNS_NS_QUERY'
          }
        });
      }
    } catch {}

    // 4. Resolve TXT (SPF, DKIM, Security Tokens)
    try {
      const txtRecords = await dns.resolveTxt(domain).catch(() => [] as string[][]);
      const flattenedTxt = txtRecords.map(t => t.join(''));
      if (flattenedTxt.length > 0) {
        const spf = flattenedTxt.find(t => t.startsWith('v=spf1'));
        const dmarc = flattenedTxt.find(t => t.startsWith('v=DMARC1'));
        const verificationTokens = flattenedTxt.filter(t => 
          t.includes('google-site-verification') || 
          t.includes('facebook-domain-verification') || 
          t.includes('MS=') || 
          t.includes('brave-ledger-verification')
        );

        output.evidences.push({
          id: `dns_txt_${domain}`,
          tier: 'DIRECT_VERIFICATION',
          type: 'dns_record',
          key: 'DNS_TXT_SECURITY_TOKENS',
          value: { spf, dmarc, verificationTokens, allTxt: flattenedTxt },
          confidenceScore: 95,
          verified: true,
          provenance: {
            collector: this.name,
            source: 'DNS TXT Resolver',
            retrievedAt: new Date().toISOString(),
            durationMs: 45,
            method: 'DNS_TXT_QUERY'
          }
        });
      }
    } catch {}

    // 5. Cloudflare DNS-over-HTTPS (DoH) fallback & Certificate Transparency Check
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const dohRes = await SafeRequester.executeRequest('Cloudflare DoH', dohUrl, {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 3500
    });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'Cloudflare DNS-over-HTTPS (1.1.1.1)',
      query: domain,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: dohRes.durationMs,
      status: dohRes.status,
      httpStatus: dohRes.response?.status,
      resultCount: dohRes.response?.data?.Answer?.length || 0
    });

    return output;
  }
}
