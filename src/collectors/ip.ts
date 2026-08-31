/**
 * OSINT Nexus - IP Intelligence Collector
 * Enriches IP addresses with BGP ASN, Geolocation, Reverse DNS, and Bogon filtering.
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

    const ipInfo = Normalizer.normalizeIP(target.raw);
    if (!ipInfo) {
      output.limitations.push({
        scope: 'IP Parsing',
        reason: 'Malformed IP address format',
        impact: 'Cannot query network infrastructure',
        recommendation: 'Verify IP format before submission'
      });
      return output;
    }

    // Check if IP is private/loopback/documentation
    if (ipInfo.type !== 'PUBLIC') {
      output.evidences.push({
        id: `ip_bogon_${ipInfo.normalized}`,
        tier: 'DIRECT_VERIFICATION',
        type: 'ip_geo',
        key: 'IP_CLASSIFICATION',
        value: { ip: ipInfo.normalized, type: ipInfo.type, version: ipInfo.version },
        confidenceScore: 100,
        verified: true,
        provenance: {
          collector: this.name,
          source: 'RFC_STANDARDS_PARSER',
          retrievedAt: new Date().toISOString(),
          durationMs: 1,
          method: 'RFC_CIDR_MATCHING'
        },
        metadata: { isNonRoutable: true }
      });
      return output;
    }

    // 1. IP-API / Public BGP Geo Lookup
    const geoUrl = `http://ip-api.com/json/${ipInfo.normalized}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;
    const startedAt = new Date().toISOString();
    const reqRes = await SafeRequester.executeRequest('ip-api.com', geoUrl, { timeout: 4000 });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'IP-API Geolocation Engine',
      query: ipInfo.normalized,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: reqRes.durationMs,
      status: reqRes.status,
      httpStatus: reqRes.response?.status,
      resultCount: reqRes.status === 'FOUND' && reqRes.response?.data?.status === 'success' ? 1 : 0,
      error: reqRes.error
    });

    if (reqRes.status === 'FOUND' && reqRes.response?.data?.status === 'success') {
      const data = reqRes.response.data;
      output.evidences.push({
        id: `ip_geo_${ipInfo.normalized}`,
        tier: 'DIRECT_VERIFICATION',
        type: 'ip_geo',
        key: 'IP_NETWORK_METADATA',
        value: {
          ip: ipInfo.normalized,
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          region: data.regionName,
          isp: data.isp,
          org: data.org,
          as: data.as,
          asname: data.asname,
          lat: data.lat,
          lon: data.lon,
          isProxy: data.proxy,
          isHosting: data.hosting,
          isMobile: data.mobile
        },
        confidenceScore: 95,
        verified: true,
        provenance: {
          collector: this.name,
          source: 'IP-API (Global BGP & Geo DB)',
          sourceUrl: geoUrl,
          httpStatus: reqRes.response.status,
          retrievedAt: new Date().toISOString(),
          durationMs: reqRes.durationMs,
          method: 'BGP_ROUTING_TABLE_LOOKUP'
        }
      });
    }

    // 2. Reverse DNS (PTR)
    try {
      const ptrs = await dns.reverse(ipInfo.normalized);
      if (ptrs && ptrs.length > 0) {
        output.evidences.push({
          id: `ip_ptr_${ipInfo.normalized}`,
          tier: 'DIRECT_VERIFICATION',
          type: 'dns_record',
          key: 'REVERSE_DNS_PTR',
          value: { ptrRecords: ptrs },
          confidenceScore: 98,
          verified: true,
          provenance: {
            collector: this.name,
            source: 'DNS PTR Resolver',
            retrievedAt: new Date().toISOString(),
            durationMs: 50,
            method: 'DNS_IN_ADDR_ARPA_QUERY'
          }
        });
      }
    } catch {
      // PTR not found is standard for residential/dynamic IPs
    }

    return output;
  }
}
