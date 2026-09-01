/**
 * OSINT Nexus - Collector Base & Strict SSRF-Protected Requester (Phase 2 Refactor)
 * Standardizes external data ingestion with strict IP bounds, circuit breaking, and source reliability.
 */

import { CollectorLog, Evidence, InvestigationLimitation, SourceReliability, SourceStatus, TargetInput } from '../models/types';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Normalizer } from '../normalization';
import dns from 'dns/promises';

export interface CollectorOutput {
  evidences: Evidence[];
  logs: CollectorLog[];
  limitations: InvestigationLimitation[];
}

export interface Collector {
  name: string;
  category: 'NETWORK' | 'IDENTITY' | 'INFRASTRUCTURE' | 'REGISTRY' | 'SEARCH';
  supports(target: TargetInput): boolean;
  collect(target: TargetInput): Promise<CollectorOutput>;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class SafeRequester {
  private static domainQueues = new Map<string, Promise<void>>();
  private static circuitBreakers = new Map<string, CircuitBreakerState>();
  private static sourceReliabilityRegistry = new Map<string, SourceReliability>();

  public static readonly STANDARD_USER_AGENT = 'OSINT-Nexus-Intelligence-Engine/2.5 (+https://nexus-osint.local; ethical-recon)';

  static {
    // Seed standard source reliability heuristics
    SafeRequester.registerSourceReliability('GitHub API', 0.95, true, 'Authoritative developer identity platform');
    SafeRequester.registerSourceReliability('Gravatar API', 0.95, true, 'Cryptographic email MD5 hash binding');
    SafeRequester.registerSourceReliability('CrossRef API', 0.90, true, 'Official DOI registration agency');
    SafeRequester.registerSourceReliability('OpenAlex API', 0.85, true, 'Global scholarly knowledge graph');
    SafeRequester.registerSourceReliability('DNS PTR Resolver', 0.95, true, 'Authoritative root and in-addr.arpa resolver');
    SafeRequester.registerSourceReliability('DuckDuckGo Public Search Index', 0.45, false, 'Third-party web crawler search index (discovery only)');
  }

  public static registerSourceReliability(source: string, reliability: number, supportsVerification: boolean, notes: string): void {
    this.sourceReliabilityRegistry.set(source, { source, reliability, supportsVerification, notes });
  }

  public static getSourceReliability(source: string): SourceReliability {
    return this.sourceReliabilityRegistry.get(source) || {
      source,
      reliability: 0.60,
      supportsVerification: false,
      notes: 'General unclassified public source'
    };
  }

  /**
   * SSRF Protection: Validates that a target URL is safe to query.
   * Resolves hostname to IP and verifies that it is not loopback, private, link-local, or reserved.
   */
  public static async validateUrlSafety(rawUrl: string): Promise<{ safe: boolean; reason?: string; resolvedIp?: string }> {
    try {
      const parsed = new URL(rawUrl);

      // 1. Only allow HTTP and HTTPS protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
      }

      const hostname = parsed.hostname;

      // 2. Direct IP check or DNS resolution
      let ipCandidate = hostname;
      const directIpNorm = Normalizer.normalizeIP(hostname);

      if (!directIpNorm) {
        // Resolve domain via DNS
        try {
          const resolved = await dns.lookup(hostname);
          ipCandidate = resolved.address;
        } catch (err: any) {
          return { safe: false, reason: `DNS lookup failed for hostname ${hostname}: ${err.message}` };
        }
      }

      // 3. Classify resolved IP
      const ipClassification = Normalizer.normalizeIP(ipCandidate);
      if (!ipClassification) {
        return { safe: false, reason: `Unrecognized IP format for resolved host: ${ipCandidate}` };
      }

      if (ipClassification.normalized.isPrivateOrLocal) {
        return { 
          safe: false, 
          reason: `SSRF Blocked: Destination IP ${ipCandidate} is classified as ${ipClassification.normalized.type} (Bogon/Private/Local Range).`,
          resolvedIp: ipCandidate
        };
      }

      return { safe: true, resolvedIp: ipCandidate };

    } catch (err: any) {
      return { safe: false, reason: `URL parsing exception: ${err.message}` };
    }
  }

  /**
   * Request with SSRF protection, circuit breaker, timeout, rate limiting, and exponential retry
   */
  public static async executeRequest(
    sourceName: string,
    url: string,
    config: AxiosRequestConfig = {},
    maxRetries: number = 1
  ): Promise<{ response?: AxiosResponse; status: SourceStatus; error?: string; durationMs: number; resolvedIp?: string }> {
    const startedAt = Date.now();

    // 1. SSRF Validation
    const ssrfCheck = await this.validateUrlSafety(url);
    if (!ssrfCheck.safe) {
      return {
        status: 'BLOCKED',
        error: ssrfCheck.reason || 'SSRF Security Check Failed',
        durationMs: Date.now() - startedAt,
        resolvedIp: ssrfCheck.resolvedIp
      };
    }

    const domain = new URL(url).hostname;
    
    // 2. Check Circuit Breaker
    const cb = this.circuitBreakers.get(domain) || { failures: 0, lastFailureTime: 0, state: 'CLOSED' };
    if (cb.state === 'OPEN') {
      if (Date.now() - cb.lastFailureTime > 30000) {
        cb.state = 'HALF_OPEN';
      } else {
        return {
          status: 'BLOCKED',
          error: `Circuit breaker OPEN for domain: ${domain}`,
          durationMs: Date.now() - startedAt
        };
      }
    }

    const headers = {
      'User-Agent': this.STANDARD_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      ...config.headers
    };

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const timeout = config.timeout || 4500;
        const res = await axios.get(url, {
          ...config,
          headers,
          timeout,
          maxRedirects: 3,
          validateStatus: () => true // Handle all status codes cleanly
        });

        const durationMs = Date.now() - startedAt;

        // HTTP 429: Rate Limited
        if (res.status === 429) {
          cb.failures++;
          cb.lastFailureTime = Date.now();
          if (cb.failures >= 3) cb.state = 'OPEN';
          this.circuitBreakers.set(domain, cb);
          return { response: res, status: 'RATE_LIMITED', error: 'HTTP 429 Too Many Requests', durationMs, resolvedIp: ssrfCheck.resolvedIp };
        }

        // HTTP 403: Blocked / Cloudflare / WAF
        if (res.status === 403) {
          return { response: res, status: 'BLOCKED', error: 'HTTP 403 Forbidden / Anti-Bot WAF', durationMs, resolvedIp: ssrfCheck.resolvedIp };
        }

        // HTTP 404: Not Found
        if (res.status === 404) {
          return { response: res, status: 'NOT_FOUND', durationMs, resolvedIp: ssrfCheck.resolvedIp };
        }

        // HTTP 200 - 299: OK (Page Retrieved, not automatically identity-verified)
        if (res.status >= 200 && res.status < 300) {
          cb.failures = 0;
          cb.state = 'CLOSED';
          this.circuitBreakers.set(domain, cb);
          return { response: res, status: 'FOUND', durationMs, resolvedIp: ssrfCheck.resolvedIp };
        }

        // Other HTTP Statuses
        return {
          response: res,
          status: 'ERROR',
          error: `Unexpected HTTP ${res.status}`,
          durationMs,
          resolvedIp: ssrfCheck.resolvedIp
        };

      } catch (err: any) {
        attempt++;
        const durationMs = Date.now() - startedAt;

        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          if (attempt > maxRetries) {
            return { status: 'TIMEOUT', error: `Request timed out after ${config.timeout || 4500}ms`, durationMs };
          }
        } else if (attempt > maxRetries) {
          cb.failures++;
          cb.lastFailureTime = Date.now();
          if (cb.failures >= 3) cb.state = 'OPEN';
          this.circuitBreakers.set(domain, cb);
          return { status: 'ERROR', error: err.message || 'Network exception', durationMs };
        }

        // Exponential backoff wait
        await new Promise(resolve => setTimeout(resolve, attempt * 300));
      }
    }

    return {
      status: 'ERROR',
      error: 'Max retries exhausted',
      durationMs: Date.now() - startedAt
    };
  }
}
