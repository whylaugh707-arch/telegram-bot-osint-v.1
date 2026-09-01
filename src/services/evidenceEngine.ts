/**
 * OSINT Nexus - Evidence-Driven OSINT Correlation Engine
 * End-to-end evidence collection, normalization, entity resolution, and provenance audit pipeline.
 */

import { Collector } from '../collectors/base';
import { IPCollector } from '../collectors/ip';
import { DNSCollector } from '../collectors/dns';
import { EmailCollector } from '../collectors/email';
import { UsernameCollector } from '../collectors/username';
import { RegistryCollector } from '../collectors/registry';
import { SearchCollector } from '../collectors/search';
import { Evidence, InvestigationReport, TargetInput } from '../models/types';
import { Normalizer } from '../normalization';
import { EntityResolver } from '../correlation/entityResolver';
import { ConfidenceScorer } from '../correlation/confidence';
import { EvidenceGraphBuilder } from '../correlation/graph';
import { generateDorkMatrix } from './correlator';

export class EvidenceOSINTEngine {
  private collectors: Collector[] = [
    new IPCollector(),
    new DNSCollector(),
    new EmailCollector(),
    new UsernameCollector(),
    new RegistryCollector(),
    new SearchCollector()
  ];

  /**
   * Execute Full Evidence-Driven Investigation Pipeline
   */
  public async investigate(rawTarget: string): Promise<InvestigationReport> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    // 1. Target Classification & Normalization
    const cleanTarget = (rawTarget || '').trim();
    const classification = Normalizer.classifyTarget(cleanTarget);
    
    let normalized = cleanTarget;
    if (classification === 'domain') normalized = Normalizer.normalizeDomain(cleanTarget).normalized;
    else if (classification === 'email') normalized = Normalizer.normalizeEmail(cleanTarget).normalized.address;
    else if (classification === 'username') normalized = Normalizer.normalizeUsername(cleanTarget).normalized.standard;
    else if (classification === 'ipv4' || classification === 'ipv6') normalized = Normalizer.normalizeIP(cleanTarget)?.normalized || cleanTarget;

    const targetInput: TargetInput = {
      raw: cleanTarget,
      classification,
      normalized
    };

    // 2. Investigation Planner: Filter applicable collectors
    const activeCollectors = this.collectors.filter(c => c.supports(targetInput));

    // 3. Parallel Safe Collector Execution
    const collectorOutputs = await Promise.all(
      activeCollectors.map(async (collector) => {
        try {
          return await collector.collect(targetInput);
        } catch (err: any) {
          return {
            evidences: [],
            logs: [{
              collectorName: collector.name,
              sourceName: collector.name,
              query: cleanTarget,
              startedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - startTimeMs,
              status: 'ERROR' as const,
              resultCount: 0,
              error: err.message || 'Fatal collector execution fault'
            }],
            limitations: [{
              scope: collector.name,
              reason: err.message || 'Execution error',
              impact: 'Partial data omission in pipeline',
              recommendation: 'Check source reachability'
            }]
          };
        }
      })
    );

    // 4. Flatten and Deduplicate Evidence with Canonical Keys
    const allEvidences: Evidence[] = [];
    const evidenceMap = new Map<string, Evidence>();
    const allLogs = collectorOutputs.flatMap(o => o.logs);
    const allLimitations = collectorOutputs.flatMap(o => o.limitations || []);

    for (const output of collectorOutputs) {
      for (const ev of output.evidences) {
        const canonicalKey = `${ev.type}:${ev.independenceGroup}:${typeof ev.normalizedValue === 'object' ? JSON.stringify(ev.normalizedValue) : ev.normalizedValue}`;
        if (!evidenceMap.has(canonicalKey)) {
          evidenceMap.set(canonicalKey, ev);
          allEvidences.push(ev);
        }
      }
    }

    // 5. Entity Resolution Layer
    const { entities, relationships, contradictions } = EntityResolver.resolve(targetInput, allEvidences);

    // 6. Multi-Factor Confidence & Risk Scoring
    const confidenceAssessment = ConfidenceScorer.calculate(targetInput, allEvidences, entities, contradictions, relationships);
    allLimitations.push(...confidenceAssessment.limitations);

    // 7. Evidence Graph Builder
    const graph = EvidenceGraphBuilder.build(targetInput, entities, relationships, allEvidences);

    // 8. Generate Advanced Dorking Matrix
    const dorks = generateDorkMatrix(cleanTarget, classification === 'email' ? 'email' : classification === 'domain' ? 'domain' : classification === 'ipv4' || classification === 'ipv6' ? 'ip' : 'username');

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    const sourcesFound = allLogs.filter(l => l.status === 'FOUND').length;
    const sourcesFailed = allLogs.filter(l => l.status !== 'FOUND' && l.status !== 'NOT_FOUND').length;
    const highConfidenceEvidences = allEvidences.filter(e => e.confidence >= 80).length;
    const directContactsFound = entities.reduce((acc, ent) => acc + ent.attributes.filter(a => a.type === 'phone' || a.type === 'email').length, 0);

    return {
      target: targetInput,
      timing: {
        startedAt,
        finishedAt,
        durationMs
      },
      entities,
      relationships,
      contradictions,
      evidences: allEvidences,
      logs: allLogs,
      graph,
      confidence: {
        score: confidenceAssessment.score,
        level: confidenceAssessment.level,
        reasons: confidenceAssessment.reasons,
        riskScore: confidenceAssessment.riskScore
      },
      summary: {
        totalSourcesQueried: allLogs.length,
        sourcesFound,
        sourcesFailed,
        highConfidenceEvidences,
        directContactsFound
      },
      limitations: allLimitations,
      dorkMatrix: dorks
    };
  }

  /**
   * Format Investigation Report into an Evidence-Driven Telegram Dossier
   */
  public formatTelegramDossier(report: InvestigationReport): string {
    const { target, confidence, entities, contradictions, evidences, summary, timing, dorkMatrix } = report;
    const durationSec = Math.max(1, Math.round(timing.durationMs / 1000));

    let txt = `🧠 <b>EVIDENCE-DRIVEN INTELLIGENCE DOSSIER</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `🎯 <b>TARGET:</b> <code>${target.raw}</code>\n` +
              `🏷️ <b>KLASIFIKASI:</b> <code>${target.classification.toUpperCase()}</code> (Canonical: <code>${target.normalized}</code>)\n` +
              `⏱️ <b>AUDIT DURATION:</b> ${durationSec} detik (${summary.totalSourcesQueried} sumber dianalisis)\n` +
              `📊 <b>CONFIDENCE MATRIX:</b> <b>${confidence.score}% [${confidence.level}]</b>\n` +
              `🛡️ <b>RISK EXPOSURE SCORE:</b> <b>${confidence.riskScore}%</b>\n\n`;

    // 1. Key Confidence Reasons (Audit Trail)
    txt += `🔬 <b>AUDIT TRAIL & CORRELATION BASIS:</b>\n`;
    confidence.reasons.slice(0, 4).forEach(r => {
      txt += `├ 📌 ${r}\n`;
    });
    txt += `\n`;

    // 2. Discovered Identity Properties (Direct Contact Vectors)
    if (entities.length > 0) {
      txt += `📱 <b>VEKTOR ENTITAS KANDIDAT (${entities.length} Ditemukan):</b>\n`;
      entities.forEach((ent, idx) => {
        txt += `\n🔸 <b>Kandidat ${idx + 1}: ${ent.label}</b> [Status: ${ent.status}]\n`;
        const phones = ent.attributes.filter(p => p.type === 'phone');
        const emails = ent.attributes.filter(p => p.type === 'email');
        const names = ent.attributes.filter(p => p.type === 'name');
        const orgs = ent.attributes.filter(p => p.type === 'organization');

        if (phones.length > 0) {
          phones.forEach(ph => txt += `├ 📞 <b>Phone:</b> <code>${ph.raw}</code>\n`);
        }
        if (emails.length > 0) {
          emails.forEach(em => txt += `├ 📧 <b>Email:</b> <code>${em.raw}</code>\n`);
        }
        if (names.length > 0) {
          names.forEach(nm => txt += `├ 👤 <b>Name:</b> <code>${nm.raw}</code>\n`);
        }
        if (orgs.length > 0) {
          orgs.forEach(o => txt += `├ 🏢 <b>Org:</b> <code>${o.raw}</code>\n`);
        }
      });
      txt += `\n`;
    }

    // 3. Contradictions
    if (contradictions && contradictions.length > 0) {
      txt += `⚠️ <b>ANOMALI / KONTRADIKSI (${contradictions.length}):</b>\n`;
      contradictions.forEach(c => {
        txt += `├ 🔴 <b>${c.attribute.toUpperCase()}:</b> ${c.explanation}\n`;
      });
      txt += `\n`;
    }

    // 4. Observed Profiles (Verified Accounts)
    const highConfAccounts = evidences.filter(e => (e.status === 'VERIFIED' || e.status === 'CORROBORATED') && e.type === 'account');
    if (highConfAccounts.length > 0) {
      txt += `🌐 <b>PROFIL PUBLIK TERVERIFIKASI (${highConfAccounts.length}):</b>\n`;
      highConfAccounts.slice(0, 15).forEach(acc => {
        const val = acc.normalizedValue as any;
        txt += `├ 🔗 <a href="${val.url || acc.sourceUrl || '#'}"><b>${val.platform || acc.source}</b></a>\n`;
      });
      txt += `\n`;
    }

    // 5. Network / DNS Infrastructure
    const dnsEvidences = evidences.filter(e => e.type === 'dns_record' || e.type === 'mx_server' || e.type === 'ip_geo');
    if (dnsEvidences.length > 0) {
      txt += `📡 <b>INFRASTRUKTUR JARINGAN & DNS:</b>\n`;
      dnsEvidences.slice(0, 5).forEach(net => {
        if (net.method === 'ip_geolocation' && net.normalizedValue) {
          const val = net.normalizedValue as any;
          txt += `├ 🌐 <b>IP Geolocation:</b> ${val.city}, ${val.country} [ISP: ${val.isp || val.org} | AS: ${val.as}]\n`;
        } else if (net.method === 'dns_a_record_lookup' && net.normalizedValue) {
          const val = net.normalizedValue as any;
          txt += `├ 🌐 <b>IP Addresses:</b> ${(val.ipv4 || []).join(', ')}\n`;
        } else if (net.method === 'dns_mx_record_lookup' && net.normalizedValue) {
          const val = net.normalizedValue as any;
          txt += `├ ✉️ <b>Mail Exchangers:</b> ${(val.mx || []).map((m: any) => m.host).join(', ')}\n`;
        }
      });
      txt += `\n`;
    }

    // 6. Advanced Google Dorking Matrix
    if (dorkMatrix && dorkMatrix.length > 0) {
      txt += `🔎 <b>ADVANCED GOOGLE DORKING MATRIX:</b>\n`;
      dorkMatrix.slice(0, 4).forEach(d => {
        txt += `• <a href="${d.url}">${d.title}</a>\n`;
      });
      txt += `\n`;
    }

    // 7. Graph Summary
    txt += `🔗 <b>PROVENANCE & GRAPH RELATION:</b>\n` +
           `• <code>[Target: ${target.raw}]</code> ➔ <code>[Kandidat Entitas: ${entities.length}]</code> ➔ <code>[Evidence Tervalidasi: ${summary.highConfidenceEvidences}]</code> ➔ <code>[Sumber Query: ${summary.totalSourcesQueried}]</code>\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `💡 <i>Catatan Investigasi: Hasil dianalisis secara non-invasif dari sumber publik terbuka dengan model verifikasi bukti bertingkat.</i>`;

    return txt;
  }
}

export const evidenceEngine = new EvidenceOSINTEngine();
