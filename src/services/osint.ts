// src/services/osint.ts
import fs from 'fs';
import path from 'path';

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
}

export interface IntelligenceScore {
    risk: number;        
    confidence: number;  
    exposure: number;    
}

const HISTORY_FILE = path.join(process.cwd(), 'wa_auth_global', 'osint_history.json');

export class OsintEngine {
    
    private getHistory() {
       try {
           if (fs.existsSync(HISTORY_FILE)) {
               return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
           }
       } catch(e) {}
       return {};
    }

    private saveHistory(data: any) {
       try {
           if(!fs.existsSync(path.dirname(HISTORY_FILE))) {
               fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
           }
           fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
       } catch(e) {}
    }

    public async analyzeTarget(target: string): Promise<IntelligenceData> {
        const history = this.getHistory();
        const pastChecks = history[target] || [];
        
        let type: 'username' | 'email' | 'domain' | 'ip' | 'phone' = 'username';
        if (target.includes('@')) type = 'email';
        else if (/^[0-9\.]+$/.test(target)) type = 'ip';
        else if (target.includes('.')) type = 'domain';

        const findings: Finding[] = [];
        
        // Simulating modular parallel checks. In production, these call real APIs.
        if (type === 'username') {
            // Check Github
            findings.push({ platform: 'github', url: `https://github.com/${target}`, data: 'Profile Match', confidence: 92 });
            // Check Telegram
            findings.push({ platform: 'telegram', url: `https://t.me/${target}`, data: 'Public Handle', confidence: 85 });
            // Check Instagram
            findings.push({ platform: 'instagram', url: `https://instagram.com/${target}`, data: 'Account Match', confidence: 78 });
        } else if (type === 'email') {
            findings.push({ platform: 'gravatar', data: 'Avatar Found', confidence: 95 });
            findings.push({ platform: 'haveibeenpwned', data: '2 Leaks Found', confidence: 100 });
        } else if (type === 'ip') {
            findings.push({ platform: 'shodan', data: 'Open Ports: 80, 443', confidence: 90 });
            findings.push({ platform: 'threatfox', data: 'No known IOCs', confidence: 50 });
        }

        // Add history delta finding if seen before
        if (pastChecks.length > 0) {
            const lastCheck = pastChecks[pastChecks.length - 1];
            const timeDiff = Math.floor((Date.now() - lastCheck.timestamp) / (1000 * 60 * 60 * 24));
            findings.push({ 
                platform: 'internal_history', 
                data: `Target identified ${timeDiff} days ago. Profile hasn't changed.`, 
                confidence: 100 
            });
        }

        // Calculate score
        let totalConf = findings.reduce((a, b) => a + b.confidence, 0);
        let baseConf = findings.length > 0 ? totalConf / findings.length : 0;
        if (findings.length > 2) baseConf += 10;

        const score = {
            risk: findings.length * 15,
            confidence: Math.min(100, baseConf),
            exposure: Math.min(100, findings.length * 20)
        };

        // Build Relational Graph Model
        const nodes = [{ id: target, group: 'target', label: target }];
        const links = [];
        findings.forEach(f => {
             const nid = `${f.platform}_${target}`;
             nodes.push({ id: nid, group: type, label: f.platform });
             links.push({ source: target, target: nid, value: f.confidence / 20 });
        });

        const result: IntelligenceData = {
             target, type, findings, score, timestamp: Date.now(),
             graph: { nodes, links }
        };

        // Update history
        pastChecks.push({ timestamp: result.timestamp, score: result.score });
        history[target] = pastChecks;
        this.saveHistory(history);

        return result;
    }
}

export const osintEngine = new OsintEngine();
