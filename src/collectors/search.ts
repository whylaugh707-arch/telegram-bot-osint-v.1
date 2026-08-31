/**
 * OSINT Nexus - Search & Discovery Collector
 * Collects public web discovery snippets, extracting contact candidates with explicit DISCOVERY provenance.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';

export class SearchDiscoveryCollector implements Collector {
  public name = 'SEARCH_DISCOVERY_COLLECTOR';
  public category = 'SEARCH' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'username' || target.classification === 'person_name' || target.classification === 'email' || target.classification === 'phone';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const query = target.raw.trim();
    const startedAt = new Date().toISOString();

    // Query DuckDuckGo HTML non-JS endpoint safely
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await SafeRequester.executeRequest('DuckDuckGo HTML', searchUrl, {
      headers: {
        'Referer': 'https://html.duckduckgo.com/',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 4500
    });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'DuckDuckGo Public Search Index',
      query,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: res.durationMs,
      status: res.status,
      httpStatus: res.response?.status,
      resultCount: res.status === 'FOUND' ? 1 : 0
    });

    if (res.status === 'FOUND' && typeof res.response?.data === 'string') {
      const html = res.response.data;
      const resultRegex = /<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      let count = 0;

      while ((match = resultRegex.exec(html)) !== null && count < 6) {
        count++;
        let rawUrl = match[1];
        if (rawUrl.includes('uddg=')) {
          const uParam = rawUrl.split('uddg=')[1]?.split('&')[0];
          if (uParam) rawUrl = decodeURIComponent(uParam);
        }

        const rawSnippet = match[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

        // 1. Store Search Discovery Snippet
        output.evidences.push({
          id: `search_discovery_${count}`,
          tier: 'DISCOVERY_SNIPPET',
          type: 'web_snippet',
          key: 'PUBLIC_SEARCH_INDEX_RECORD',
          value: {
            title: `Web Result #${count}`,
            url: rawUrl,
            snippet: rawSnippet
          },
          rawExcerpt: rawSnippet,
          confidenceScore: 50, // Moderate discovery confidence
          verified: false, // Explicitly false for search results
          provenance: {
            collector: this.name,
            source: 'Public Web Search Index',
            sourceUrl: rawUrl,
            httpStatus: 200,
            retrievedAt: new Date().toISOString(),
            durationMs: res.durationMs,
            method: 'WEB_CRAWL_SNIPPET_EXTRACTION'
          },
          metadata: { note: 'Discovery only. Unverified without corroborating direct profile evidence.' }
        });

        // 2. Extract potential contact vectors from snippet
        // WhatsApp / Phone
        const waMatch = rawSnippet.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=|\+?628|08)[0-9\-\s]{8,14}/gi);
        if (waMatch) {
          waMatch.forEach(w => {
            const cleanW = w.replace(/[^0-9]/g, '');
            if (cleanW.length >= 10 && cleanW.length <= 14) {
              output.evidences.push({
                id: `disc_phone_${cleanW}`,
                tier: 'DISCOVERY_SNIPPET',
                type: 'phone_ref',
                key: 'DISCOVERED_PHONE_CANDIDATE',
                value: { phone: cleanW, sourceUrl: rawUrl },
                rawExcerpt: w,
                confidenceScore: 55,
                verified: false,
                provenance: {
                  collector: this.name,
                  source: `Web Snippet (${new URL(rawUrl).hostname})`,
                  sourceUrl: rawUrl,
                  retrievedAt: new Date().toISOString(),
                  durationMs: 1,
                  method: 'REGEX_DISCOVERY'
                }
              });
            }
          });
        }

        // Email
        const emailMatch = rawSnippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
        if (emailMatch) {
          emailMatch.forEach(em => {
            const cleanEm = em.toLowerCase();
            if (!cleanEm.endsWith('.png') && !cleanEm.endsWith('.jpg') && !cleanEm.includes('duckduckgo')) {
              output.evidences.push({
                id: `disc_email_${cleanEm}`,
                tier: 'DISCOVERY_SNIPPET',
                type: 'account',
                key: 'DISCOVERED_EMAIL_CANDIDATE',
                value: { email: cleanEm, sourceUrl: rawUrl },
                rawExcerpt: em,
                confidenceScore: 60,
                verified: false,
                provenance: {
                  collector: this.name,
                  source: `Web Snippet (${new URL(rawUrl).hostname})`,
                  sourceUrl: rawUrl,
                  retrievedAt: new Date().toISOString(),
                  durationMs: 1,
                  method: 'REGEX_DISCOVERY'
                }
              });
            }
          });
        }
      }
    }

    return output;
  }
}
