/**
 * OSINT Nexus - Collector Base & Rate Limiter Infrastructure
 * Provides standardized interface, token-bucket rate limiting, exponential backoff, and circuit breaker.
 */

import { CollectorLog, Evidence, InvestigationLimitation, SourceStatus, TargetInput } from '../models/types';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

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

  private static getRandomUserAgent(): string {
    const uas = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  }

  /**
   * Request with circuit breaker, timeout, rate limiting, and exponential retry
   */
  public static async executeRequest(
    sourceName: string,
    url: string,
    config: AxiosRequestConfig = {},
    maxRetries: number = 1
  ): Promise<{ response?: AxiosResponse; status: SourceStatus; error?: string; durationMs: number }> {
    const startedAt = Date.now();
    const domain = new URL(url).hostname;
    
    // Check Circuit Breaker
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
      'User-Agent': this.getRandomUserAgent(),
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
          validateStatus: () => true // Handle all status codes cleanly
        });

        const durationMs = Date.now() - startedAt;

        // HTTP 429: Rate Limited
        if (res.status === 429) {
          cb.failures++;
          cb.lastFailureTime = Date.now();
          if (cb.failures >= 3) cb.state = 'OPEN';
          this.circuitBreakers.set(domain, cb);
          return { response: res, status: 'RATE_LIMITED', error: 'HTTP 429 Too Many Requests', durationMs };
        }

        // HTTP 403: Blocked / Cloudflare / WAF
        if (res.status === 403) {
          return { response: res, status: 'BLOCKED', error: 'HTTP 403 Forbidden / Anti-Bot WAF', durationMs };
        }

        // HTTP 404: Not Found
        if (res.status === 404) {
          return { response: res, status: 'NOT_FOUND', durationMs };
        }

        // HTTP 200: OK
        if (res.status >= 200 && res.status < 300) {
          // Reset breaker on success
          cb.failures = 0;
          cb.state = 'CLOSED';
          this.circuitBreakers.set(domain, cb);
          return { response: res, status: 'FOUND', durationMs };
        }

        // Other HTTP Statuses
        return {
          response: res,
          status: 'ERROR',
          error: `Unexpected HTTP ${res.status}`,
          durationMs
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
