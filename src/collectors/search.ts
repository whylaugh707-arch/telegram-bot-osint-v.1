/**
 * OSINT Nexus - Web Discovery & Search Engine Collector (Phase 2 Refactor)
 * Handles public index search, snippet extraction, contact vector filtering, and independence grouping.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';

export class SearchCollector implements Collector {
  public name = 'WEB_DISCOVERY_SEARCH_COLLECTOR';
  public category = 'SEARCH' as const;

  // Known generic / operational non-personal emails to filter out
  private static readonly GENERIC_EMAIL_PREFIXES = [
    'support@', 'info@', 'contact@', 'sales@', 'billing@', 'admin@', 
    'administrator@', 'abuse@', 'privacy@', 'security@', 'help@', 
    'no-reply@', 'noreply@', 'mailer-daemon@', 'postmaster@', 'press@', 'inquiry@'
  ];

  public supports(target: TargetInput): boolean {
    return target.classification === 'username' || 
           target.classification === 'person_name' || 
           target.classification === 'email' || 
           target.classification === 'domain';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const query = target.normalized;
    const startedAt = new Date().toISOString();
    const encodedQuery = encodeURIComponent(`"${query}"`);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const searchRes = await SafeRequester.executeRequest(
      'DuckDuckGo Public Search Index',
      searchUrl,
      { timeout: 5000 }
    );

    output.logs.push({
      collectorName: this.name,
      sourceName: 'DuckDuckGo Public Search Index',
      query,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: searchRes.durationMs,
      status: searchRes.status,
      httpStatus: searchRes.response?.status,
      resultCount: 0,
      error: searchRes.error
    });

    if (searchRes.status !== 'FOUND' || !searchRes.response?.data) {
      output.limitations.push({
        scope: 'SEARCH_DISCOVERY',
        reason: searchRes.error || 'Public search index query returned no response or was rate limited',
        impact: 'External web mentions, pastebin references, and public document snippets could not be discovered.',
        recommendation: 'Use targeted Google Dork Matrix queries manually or configure a dedicated search API proxy.'
      });
      return output;
    }

    const html = String(searchRes.response.data);
    const resultBlocks = html.split(/<div class="result__body">/);

    let snippetCount = 0;
    const discoveredEmails = new Set<string>();
    const discoveredPhones = new Set<string>();

    for (let i = 1; i < Math.min(resultBlocks.length, 8); i++) {
      const block = resultBlocks[i];
      const titleMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<a class="result__url[^>]*>([\s\S]*?)<\/a>/i);
      const urlMatch = block.match(/href="([^"]+)"/i);
      const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i);

      if (urlMatch) {
        let rawUrl = urlMatch[1];
        if (rawUrl.includes('uddg=')) {
          const m = rawUrl.match(/uddg=([^&]+)/);
          if (m) rawUrl = decodeURIComponent(m[1]);
        }

        const snippetText = (snippetMatch ? snippetMatch[1] : '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim();

        if (snippetText && rawUrl.startsWith('http')) {
          snippetCount++;
          let domainName = 'web_source';
          try {
            domainName = new URL(rawUrl).hostname.replace(/^www\./, '');
          } catch {}

          // Determine independence group: if search returns a profile from github.com,
          // the independence group is "github", not "duckduckgo".
          const independenceGroup = domainName.replace(/[^a-z0-9]/g, '_');

          // Store Web Snippet Evidence
          output.evidences.push({
            id: `snip_${independenceGroup}_${i}`,
            source: `Public Web (${domainName}) via DuckDuckGo Index`,
            sourceType: 'WEB_CRAWL',
            sourceUrl: rawUrl,
            independenceGroup,
            method: 'duckduckgo_snippet_scrape',
            observedAt: startedAt,
            retrievedAt: new Date().toISOString(),
            type: 'web_snippet',
            rawValue: { url: rawUrl, snippet: snippetText },
            normalizedValue: { url: rawUrl, snippet: snippetText, domain: domainName },
            rawExcerpt: snippetText.slice(0, 200),
            status: 'OBSERVED',
            verificationScope: 'ATTRIBUTE_OBSERVED',
            confidence: 45,
            reliability: 0.45,
            metadata: { domain: domainName }
          });

          // 1. Context-Aware Email Extraction (Reject generic support/info/billing emails)
          const emailMatches = snippetText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          for (const rawEm of emailMatches) {
            const lowerEm = rawEm.toLowerCase();
            const isGeneric = SearchCollector.GENERIC_EMAIL_PREFIXES.some(prefix => lowerEm.startsWith(prefix));
            
            if (!isGeneric && !discoveredEmails.has(lowerEm)) {
              discoveredEmails.add(lowerEm);
              output.evidences.push({
                id: `contact_em_${independenceGroup}_${discoveredEmails.size}`,
                source: `Web Snippet Mention (${domainName})`,
                sourceType: 'WEB_CRAWL',
                sourceUrl: rawUrl,
                independenceGroup,
                method: 'snippet_regex_extraction_context_filtered',
                observedAt: startedAt,
                retrievedAt: new Date().toISOString(),
                type: 'contact_vector',
                rawValue: { email: rawEm, snippet: snippetText },
                normalizedValue: { type: 'EMAIL', value: lowerEm, isFilteredGeneric: false },
                rawExcerpt: `Snippet context: ${snippetText}`,
                status: 'OBSERVED',
                verificationScope: 'ATTRIBUTE_OBSERVED',
                confidence: 50,
                reliability: 0.45
              });
            }
          }

          // 2. WhatsApp Link / Phone Reference Observation (Explicitly NOT verified account)
          const waMatches = snippetText.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=|\+62|08)[0-9]{8,14}/gi) || [];
          for (const waRef of waMatches) {
            const digits = waRef.replace(/[^0-9]/g, '');
            if (digits.length >= 9 && digits.length <= 14 && !discoveredPhones.has(digits)) {
              discoveredPhones.add(digits);
              output.evidences.push({
                id: `contact_wa_${independenceGroup}_${discoveredPhones.size}`,
                source: `Web Mention (${domainName})`,
                sourceType: 'WEB_CRAWL',
                sourceUrl: rawUrl,
                independenceGroup,
                method: 'public_link_observed_regex',
                observedAt: startedAt,
                retrievedAt: new Date().toISOString(),
                type: 'phone_ref',
                rawValue: { rawReference: waRef, digits },
                normalizedValue: { type: 'PUBLIC_WHATSAPP_LINK_OBSERVED', value: digits, verifiedAccount: false },
                rawExcerpt: `Observed public messaging link in web snippet: ${waRef}`,
                status: 'OBSERVED',
                verificationScope: 'ATTRIBUTE_OBSERVED', // Explicitly NOT ACCOUNT_EXISTENCE or IDENTITY
                confidence: 40,
                reliability: 0.40,
                metadata: { note: 'Public chat link observed in index snippet; does not confirm identity or active ownership' }
              });
            }
          }
        }
      }
    }

    if (output.logs.length > 0) {
      output.logs[0].resultCount = snippetCount;
    }

    return output;
  }
}
