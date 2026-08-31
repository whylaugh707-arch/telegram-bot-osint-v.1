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
import { SearchDiscoveryCollector } from '../collectors/search';
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
    new SearchDiscoveryCollector()
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
        const canonicalKey = `${ev.type}:${ev.key}:${typeof ev.value === 'object' ? JSON.stringify(ev.value) : ev.value}`;
        if (!evidenceMap.has(canonicalKey)) {
          evidenceMap.set(canonicalKey, ev);
          allEvidences.push(ev);
        }
      }
    }

    // 5. Entity Resolution Layer
    const { entities, relationships } = EntityResolver.resolve(targetInput, allEvidences);

    // 6. Multi-Factor Confidence & Risk Scoring
    const confidenceAssessment = ConfidenceScorer.calculate(targetInput, allEvidences, entities);
    if (entities[0]) {
      entities[0].confidence = {
        score: confidenceAssessment.score,
        level: confidenceAssessment.level,
        reasons: confidenceAssessment.reasons
      };
    }
    allLimitations.push(...confidenceAssessment.limitations);

    // 7. Evidence Graph Builder
    const graph = EvidenceGraphBuilder.build(targetInput, entities, relationships, allEvidences);

    // 8. Generate Advanced Dorking Matrix
    const dorks = generateDorkMatrix(cleanTarget, classification === 'email' ? 'email' : classification === 'domain' ? 'domain' : classification === 'ipv4' || classification === 'ipv6' ? 'ip' : 'username');

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    const sourcesFound = allLogs.filter(l => l.status === 'FOUND').length;
    const sourcesFailed = allLogs.filter(l => l.status !== 'FOUND' && l.status !== 'NOT_FOUND').length;
    const highConfidenceEvidences = allEvidences.filter(e => e.confidenceScore >= 80).length;
    const directContactsFound = entities[0]?.properties.filter(p => p.type === 'phone' || p.type === 'email').length || 0;

    return {
      target: targetInput,
      timing: {
        startedAt,
        finishedAt,
        durationMs
      },
      entities,
      relationships,
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
    const { target, confidence, entities, evidences, summary, timing, dorkMatrix } = report;
    const primary = entities[0];
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
    if (primary && primary.properties.length > 0) {
      txt += `📱 <b>VEKTOR ENTITAS & KONTAK TERVERIFIKASI:</b>\n`;
      const phones = primary.properties.filter(p => p.type === 'phone');
      const emails = primary.properties.filter(p => p.type === 'email');
      const names = primary.properties.filter(p => p.type === 'name');
      const orgs = primary.properties.filter(p => p.type === 'organization');
      const locations = primary.properties.filter(p => p.type === 'location');

      if (phones.length > 0) {
        phones.forEach(ph => {
          txt += `├ 📞 <b>WhatsApp / HP:</b> <code>${ph.value}</code> (<a href="https://wa.me/${ph.value.replace(/[^0-9]/g, '')}">Hubungi Langsung</a>) [Confidence: ${ph.confidence}%]\n`;
        });
      } else {
        txt += `├ 📞 <b>WhatsApp / HP:</b> <i>❌ Tidak teridentifikasi di rekaman publik</i>\n`;
      }

      if (emails.length > 0) {
        emails.forEach(em => {
          txt += `├ 📧 <b>Email:</b> <code>${em.value}</code> [Confidence: ${em.confidence}%]\n`;
        });
      } else {
        txt += `├ 📧 <b>Email:</b> <i>❌ Tidak teridentifikasi di profil publik terbuka</i>\n`;
      }

      if (names.length > 0) {
        names.forEach(nm => {
          txt += `├ 👤 <b>Nama Terdeteksi:</b> <code>${nm.value}</code> [Confidence: ${nm.confidence}%]\n`;
        });
      }

      if (orgs.length > 0) {
        orgs.forEach(o => {
          txt += `├ 🏢 <b>Afiliasi / Organisasi:</b> <code>${o.value}</code>\n`;
        });
      }

      if (locations.length > 0) {
        locations.forEach(loc => {
          txt += `├ 📍 <b>Lokasi / Domisili:</b> <code>${loc.value}</code>\n`;
        });
      }
      txt += `\n`;
    }

    // 3. Observed Profiles (Verified Accounts)
    const observedAccounts = evidences.filter(e => e.tier === 'OBSERVED_PROFILE' && e.verified);
    if (observedAccounts.length > 0) {
      txt += `🌐 <b>PROFIL PUBLIK TERVERIFIKASI (${observedAccounts.length}):</b>\n`;
      observedAccounts.slice(0, 15).forEach(acc => {
        const val = acc.value as any;
        txt += `├ 🔗 <a href="${val.url}"><b>${val.platform}</b></a>${val.note ? ` - <i>${val.note}</i>` : ''}\n`;
      });
      txt += `\n`;
    }

    // 4. Scholarly & Academic Records
    const academicPubs = evidences.filter(e => e.tier === 'REGISTRY_RECORD' && e.type === 'academic_pub');
    if (academicPubs.length > 0) {
      txt += `📄 <b>REKAM JEJAK AKADEMIK & INSTITUSI (${academicPubs.length}):</b>\n`;
      academicPubs.slice(0, 5).forEach(pub => {
        const val = pub.value as any;
        txt += `├ 📚 <a href="${val.url || '#'}"><b>${val.title || val.name}</b></a>${val.publisher ? ` [${val.publisher}]` : ''}\n`;
      });
      txt += `\n`;
    }

    // 5. Network / DNS Infrastructure
    const dnsEvidences = evidences.filter(e => e.type === 'dns_record' || e.type === 'mx_server' || e.type === 'ip_geo');
    if (dnsEvidences.length > 0) {
      txt += `📡 <b>INFRASTRUKTUR JARINGAN & DNS:</b>\n`;
      dnsEvidences.slice(0, 5).forEach(net => {
        if (net.key === 'IP_NETWORK_METADATA') {
          const val = net.value as any;
          txt += `├ 🌐 <b>IP Geolocation:</b> ${val.city}, ${val.country} [ISP: ${val.isp || val.org} | AS: ${val.as}]\n`;
        } else if (net.key === 'DNS_ADDRESS_RECORDS') {
          const val = net.value as any;
          txt += `├ 🌐 <b>IP Addresses:</b> ${val.ipv4.join(', ')}\n`;
        } else if (net.key === 'DNS_MAIL_EXCHANGERS') {
          const val = net.value as any;
          txt += `├ ✉️ <b>Mail Exchangers:</b> ${val.mx.map((m: any) => m.host).join(', ')}\n`;
        }
      });
      txt += `\n`;
    }

    // 6. Advanced Google Dorking Matrix
    if (dorkMatrix.length > 0) {
      txt += `🔎 <b>ADVANCED GOOGLE DORKING MATRIX:</b>\n`;
      dorkMatrix.slice(0, 4).forEach(d => {
        txt += `• <a href="${d.url}">${d.title}</a>\n`;
      });
      txt += `\n`;
    }

    // 7. Graph Summary
    txt += `🔗 <b>PROVENANCE & GRAPH RELATION:</b>\n` +
           `• <code>[Target: ${target.raw}]</code> ➔ <code>[Entitas: ${entities.length}]</code> ➔ <code>[Evidence Tervalidasi: ${summary.highConfidenceEvidences}]</code> ➔ <code>[Sumber Query: ${summary.totalSourcesQueried}]</code>\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `💡 <i>Catatan Investigasi: Hasil dianalisis secara non-invasif dari sumber publik terbuka dengan model verifikasi bukti bertingkat.</i>`;

    return txt;
  }
}

export const evidenceEngine = new EvidenceOSINTEngine();
