/**
 * OSINT Nexus - Public & Academic Registry Collector (Phase 2 Refactor)
 * Queries CrossRef, OpenAlex, and Wikipedia. Observes name occurrences without blindly verifying identity.
 */

import { Collector, CollectorOutput, SafeRequester } from './base';
import { Evidence, TargetInput } from '../models/types';

export class RegistryCollector implements Collector {
  public name = 'PUBLIC_REGISTRY_COLLECTOR';
  public category = 'REGISTRY' as const;

  public supports(target: TargetInput): boolean {
    return target.classification === 'username' || target.classification === 'person_name' || target.classification === 'domain';
  }

  public async collect(target: TargetInput): Promise<CollectorOutput> {
    const output: CollectorOutput = {
      evidences: [],
      logs: [],
      limitations: []
    };

    const query = target.raw.trim();
    if (query.length < 3) return output;

    const startedAt = new Date().toISOString();

    // 1. CrossRef Scholarly Metadata API
    const crossRefUrl = `https://api.crossref.org/works?query.author=${encodeURIComponent(query)}&rows=3&select=DOI,title,author,published-print,published-online,publisher`;
    const crRes = await SafeRequester.executeRequest('CrossRef API', crossRefUrl, { timeout: 4000 });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'CrossRef Global Academic Registry',
      query,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: crRes.durationMs,
      status: crRes.status,
      httpStatus: crRes.response?.status,
      resultCount: crRes.response?.data?.message?.items?.length || 0
    });

    if (crRes.status === 'FOUND' && crRes.response?.data?.message?.items?.length > 0) {
      const items = crRes.response.data.message.items;
      items.forEach((item: any, idx: number) => {
        const title = item.title?.[0] || 'Untitled Publication';
        const doi = item.DOI;
        const publisher = item.publisher || 'Unknown Publisher';
        const authorMatch = item.author?.find((a: any) => 
          (a.family && query.toLowerCase().includes(a.family.toLowerCase())) ||
          (a.given && query.toLowerCase().includes(a.given.toLowerCase()))
        );

        const sourceRel = SafeRequester.getSourceReliability('CrossRef API');

        output.evidences.push({
          id: `crossref_${doi || idx}`,
          source: 'CrossRef (Official DOI Registration Agency)',
          sourceType: 'API',
          sourceUrl: doi ? `https://doi.org/${doi}` : crossRefUrl,
          independenceGroup: 'scholarly_registry_crossref',
          method: 'metadata_author_search',
          observedAt: startedAt,
          retrievedAt: new Date().toISOString(),
          type: 'academic_pub',
          rawValue: item,
          normalizedValue: {
            title,
            doi,
            publisher,
            url: doi ? `https://doi.org/${doi}` : undefined,
            matchedAuthor: authorMatch ? `${authorMatch.given || ''} ${authorMatch.family || ''}`.trim() : query,
            affiliation: authorMatch?.affiliation?.[0]?.name
          },
          rawExcerpt: `Publication: ${title} | DOI: ${doi} | Author Match: ${authorMatch ? 'Yes' : 'No'}`,
          status: 'OBSERVED', // Not verified! It's just an observation of a name.
          verificationScope: 'ATTRIBUTE_OBSERVED',
          confidence: 60, // Much lower than before, wait for cross-corroboration
          reliability: sourceRel.reliability,
          metadata: { note: 'Name match in academic registry does not confirm target is this specific author.' }
        });
      });
    }

    // 2. OpenAlex Global Scholarly Graph
    const openAlexUrl = `https://api.openalex.org/authors?search=${encodeURIComponent(query)}&per_page=2`;
    const oaRes = await SafeRequester.executeRequest('OpenAlex API', openAlexUrl, { timeout: 4000 });

    output.logs.push({
      collectorName: this.name,
      sourceName: 'OpenAlex Open Research Graph',
      query,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: oaRes.durationMs,
      status: oaRes.status,
      httpStatus: oaRes.response?.status,
      resultCount: oaRes.response?.data?.results?.length || 0
    });

    if (oaRes.status === 'FOUND' && oaRes.response?.data?.results?.length > 0) {
      const sourceRel = SafeRequester.getSourceReliability('OpenAlex API');
      oaRes.response.data.results.forEach((auth: any) => {
        if (auth.display_name && (auth.works_count > 0 || auth.cited_by_count > 0)) {
          output.evidences.push({
            id: `openalex_${auth.id}`,
            source: 'OpenAlex Knowledge Graph',
            sourceType: 'API',
            sourceUrl: auth.id,
            independenceGroup: 'scholarly_registry_openalex',
            method: 'entity_graph_match',
            observedAt: startedAt,
            retrievedAt: new Date().toISOString(),
            type: 'academic_pub',
            rawValue: auth,
            normalizedValue: {
              name: auth.display_name,
              institution: auth.last_known_institutions?.[0]?.display_name,
              country: auth.last_known_institutions?.[0]?.country_code,
              worksCount: auth.works_count,
              citationsCount: auth.cited_by_count,
              orcid: auth.orcid,
              openAlexId: auth.id
            },
            rawExcerpt: `Scholar: ${auth.display_name} | Works: ${auth.works_count} | ORCID: ${auth.orcid || 'N/A'}`,
            status: 'OBSERVED', // Not verified identity, merely observed record
            verificationScope: 'ATTRIBUTE_OBSERVED',
            confidence: 65,
            reliability: sourceRel.reliability,
            metadata: { note: 'Scholarly profile match. May be a namesake.' }
          });
        }
      });
    }

    return output;
  }
}
