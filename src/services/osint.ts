// src/services/osint.ts
import axios from 'axios';
import crypto from 'crypto';
import dns from 'dns/promises';

export interface IntelligenceData {
    target: string;
    type: 'username' | 'email' | 'domain' | 'ip' | 'phone';
    findings: Finding[];
    score: IntelligenceScore;
    timestamp: number;
    graph: { nodes: any[], links: any[] };
}

export interface Finding {
    platform: string;
    url?: string;
    data: any;
    confidence: number;
    evidence: string;
    timestamp: string;
    verified: boolean;
}

export interface IntelligenceScore {
    risk: number;        
    confidence: number;  
    exposure: number;    
}

export class OsintEngine {
    
    // Using actual internet crawling / API for verification
    public async analyzeTarget(target: string): Promise<IntelligenceData> {
        let type: 'username' | 'email' | 'domain' | 'ip' | 'phone' = 'username';
        if (target.includes('@')) type = 'email';
        else if (/^[0-9\.]+$/.test(target)) type = 'ip';
        else if (target.includes('.')) type = 'domain';

        const findings: Finding[] = [];
        const timestamp = new Date().toISOString();
        
        let risk = 0;
        let confidenceAgg = 0;

        if (type === 'username') {
            // Check Github Real API
            try {
                const ghRes = await axios.get(`https://api.github.com/users/${target}`, { validateStatus: () => true, timeout: 5000 });
                if (ghRes.status === 200 && ghRes.data.login) {
                    findings.push({ 
                        platform: 'GitHub', 
                        url: ghRes.data.html_url, 
                        data: { name: ghRes.data.name, bio: ghRes.data.bio, public_repos: ghRes.data.public_repos },
                        evidence: `HTTP 200 OK from api.github.com/users/${target}`,
                        confidence: 100,
                        verified: true,
                        timestamp 
                    });
                    risk += 15;
                    confidenceAgg += 100;
                }
            } catch (e) {}

            // Check NPM Real API
            try {
                const npmRes = await axios.get(`https://registry.npmjs.org/-/user/org.couchdb.user:${target}`, { validateStatus: () => true, timeout: 5000 });
                if (npmRes.status === 200) {
                    findings.push({ 
                        platform: 'NPM', 
                        url: `https://www.npmjs.com/~${target}`, 
                        data: 'Registered Developer Account',
                        evidence: `HTTP 200 OK from registry.npmjs.org`,
                        confidence: 100,
                        verified: true,
                        timestamp 
                    });
                    risk += 20;
                    confidenceAgg += 100;
                }
            } catch (e) {}

        } else if (type === 'email') {
            const hash = crypto.createHash('md5').update(target.trim().toLowerCase()).digest('hex');
            try {
                const gravatar = await axios.get(`https://en.gravatar.com/${hash}.json`, { validateStatus: () => true, timeout: 5000 });
                if (gravatar.status === 200) {
                    const prof = gravatar.data.entry[0];
                    findings.push({ 
                        platform: 'Gravatar', 
                        url: prof.profileUrl, 
                        data: { display_name: prof.displayName, hash }, 
                        evidence: `Profile JSON payload found at gravatar.com/${hash}.json`,
                        confidence: 100, 
                        verified: true,
                        timestamp
                    });
                    risk += 30;
                    confidenceAgg += 100;
                }
            } catch (e) {}
            
            // Checking common domain MX for structure
            try {
                const domain = target.split('@')[1];
                const mxRecords = await dns.resolveMx(domain);
                if (mxRecords && mxRecords.length > 0) {
                     findings.push({
                        platform: 'DNS MX Check',
                        data: `Valid Mail Exchange records: ${mxRecords[0].exchange}`,
                        evidence: `DNS MX query returned ${mxRecords.length} records.`,
                        confidence: 90,
                        verified: true,
                        timestamp
                     })
                     confidenceAgg += 90;
                }
            } catch (e) {}
            
        } else if (type === 'ip') {
            try {
                const ipApi = await axios.get(`http://ip-api.com/json/${target}`, { timeout: 5000 });
                if (ipApi.data.status === 'success') {
                    findings.push({ 
                        platform: 'IP-API Geolocation', 
                        data: { as: ipApi.data.as, isp: ipApi.data.isp, city: ipApi.data.city, country: ipApi.data.country }, 
                        evidence: `Direct ISP resolution via BGP databases`,
                        confidence: 100, 
                        verified: true,
                        timestamp
                    });
                    risk += 40;
                    confidenceAgg += 100;
                }
            } catch (e) {}
        } else if (type === 'domain') {
            try {
                 const records = await dns.resolveA(target);
                 findings.push({ 
                        platform: 'DNS A Record', 
                        data: `Resolves to: ${records.join(', ')}`, 
                        evidence: `DNS lookup successful.`,
                        confidence: 100, 
                        verified: true,
                        timestamp
                    });
                 confidenceAgg += 100;
            } catch(e) {}
        }

        const score = {
            risk: Math.min(100, risk),
            confidence: findings.length > 0 ? Math.min(100, confidenceAgg / findings.length) : 0,
            exposure: Math.min(100, findings.length * 25)
        };

        // Graph Model representing actual discovered relationship structures
        const nodes = [{ id: target, group: 'target', label: target }];
        const links = [];
        findings.forEach((f, idx) => {
             const nid = `node_${idx}_${f.platform}`;
             nodes.push({ id: nid, group: 'evidence', label: f.platform });
             links.push({ source: target, target: nid, value: f.confidence });
        });

        const result: IntelligenceData = {
             target, type, findings, score, timestamp: Date.now(),
             graph: { nodes, links }
        };

        return result;
    }
}

export const osintEngine = new OsintEngine();
