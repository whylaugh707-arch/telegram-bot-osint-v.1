import { Router } from 'express';
import { osintEngine } from '../services/osint';
import { buildPlatformList, getRandomHeaders, extractContactsFromText, generateDorkMatrix, generatePermutations, queryPublicRegistries } from '../services/correlator';
import axios from 'axios';
import dns from 'dns/promises';
import crypto from 'crypto';

const router = Router();

router.get('/correlate', async (req, res) => {
    try {
        const target = String(req.query.target || req.query.q || '').trim();
        if (!target) return res.status(400).json({ error: 'Target query parameter required' });

        const startTime = Date.now();
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(target);
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target);
        const cleanDomain = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const isDomain = !isIp && !isEmail && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanDomain);

        if (isIp) {
            let geoData: any = {};
            let shodanData: any = {};
            try {
                const geoRes = await fetch(`http://ip-api.com/json/${target}?fields=status,country,regionName,city,isp,org,as,mobile,proxy,hosting,lat,lon,timezone`);
                geoData = await geoRes.json();
            } catch(e) {}
            try {
                const sRes = await axios.get(`https://internetdb.shodan.io/${target}`, { timeout: 4000 });
                shodanData = sRes.data || {};
            } catch(e) {}

            return res.json({
                target,
                type: 'ip',
                elapsedMs: Date.now() - startTime,
                geo: geoData,
                shodan: shodanData,
                dorks: generateDorkMatrix(target, 'ip')
            });
        }

        if (isEmail) {
            const [userPart, domainPart] = target.split('@');
            let mxRecords: any[] = [];
            let gravatarData: any = null;
            try {
                mxRecords = await dns.resolveMx(domainPart).catch(() => []);
            } catch(e) {}
            const hash = crypto.createHash('md5').update(target.trim().toLowerCase()).digest('hex');
            try {
                const gRes = await axios.get(`https://en.gravatar.com/${hash}.json`, { headers: getRandomHeaders(), timeout: 4000, validateStatus: () => true });
                if (gRes.status === 200) gravatarData = gRes.data?.entry?.[0];
            } catch(e) {}

            return res.json({
                target,
                type: 'email',
                userPart,
                domainPart,
                mxRecords,
                gravatar: gravatarData,
                dorks: generateDorkMatrix(target, 'email'),
                elapsedMs: Date.now() - startTime
            });
        }

        // Persona & Multi-Handle / Name Scan
        const perm = generatePermutations(target);
        const primaryHandle = perm.handles[0] || target.replace(/[^a-zA-Z0-9_.-]/g, '');
        const confirmed: any[] = [];
        const contacts: any[] = [];

        // 1. Check Public Registries (CrossRef, OpenAlex, Wikipedia)
        const publicRecords = await queryPublicRegistries(perm.fullName || target);

        // 2. Gravatar Hash Permutations for common email variants
        for (const em of perm.emailCandidates) {
            const hash = crypto.createHash('md5').update(em).digest('hex');
            try {
                const gRes = await axios.get(`https://en.gravatar.com/${hash}.json`, { timeout: 3000, validateStatus: () => true });
                if (gRes.status === 200 && gRes.data?.entry?.[0]) {
                    const entry = gRes.data.entry[0];
                    if (entry.displayName) contacts.push({ type: 'name', value: entry.displayName, source: `Gravatar (${em})` });
                    if (entry.currentLocation) contacts.push({ type: 'location', value: entry.currentLocation, source: 'Gravatar' });
                    if (entry.aboutMe) contacts.push(...extractContactsFromText(entry.aboutMe, 'Gravatar Bio'));
                    confirmed.push({ name: 'Gravatar Profile', category: 'Social', url: entry.profileUrl, note: entry.displayName });
                }
            } catch(e) {}
        }

        // 3. Scan Verified Platforms for handles
        const handlesToScan = perm.handles.slice(0, 3);
        for (const h of handlesToScan) {
            const platforms = buildPlatformList(h);
            for (let i = 0; i < platforms.length; i += 15) {
                const batch = platforms.slice(i, i + 15);
                await Promise.all(batch.map(async (p) => {
                    const headers = getRandomHeaders();
                    try {
                        if (p.checkMethod === 'api_github') {
                            const gh = await axios.get(`https://api.github.com/users/${h}`, { headers: { ...headers, 'User-Agent': 'Mozilla/5.0' }, timeout: 4000, validateStatus: () => true });
                            if (gh.status === 200 && gh.data?.login) {
                                if (gh.data.email) contacts.push({ type: 'email', value: gh.data.email, source: 'GitHub' });
                                if (gh.data.bio) contacts.push(...extractContactsFromText(gh.data.bio, 'GitHub Bio'));
                                confirmed.push({ name: `${p.name} (@${h})`, category: p.category, url: gh.data.html_url, note: gh.data.name });
                            }
                        } else if (p.checkMethod === 'api_gravatar') {
                            const grav = await axios.get(`https://en.gravatar.com/${h}.json`, { headers, timeout: 4000, validateStatus: () => true });
                            if (grav.status === 200 && grav.data?.entry?.[0]) {
                                const entry = grav.data.entry[0];
                                if (entry.displayName) contacts.push({ type: 'name', value: entry.displayName, source: 'Gravatar' });
                                confirmed.push({ name: `${p.name} (@${h})`, category: p.category, url: entry.profileUrl || p.url, note: entry.displayName });
                            }
                        } else if (p.checkMethod === 'api_reddit') {
                            const r = await axios.get(p.apiEndpoint || `https://www.reddit.com/user/${h}/about.json`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000, validateStatus: () => true });
                            if (r.status === 200 && r.data?.data?.name) {
                                confirmed.push({ name: `${p.name} (@${h})`, category: p.category, url: p.url, note: `Karma: ${r.data.data.total_karma || 0}` });
                            }
                        } else if (p.checkMethod === 'api_npm') {
                            const npm = await axios.get(`https://registry.npmjs.org/-/user/org.couchdb.user:${h}`, { headers, timeout: 3500, validateStatus: () => true });
                            if (npm.status === 200 && npm.data?.name) {
                                if (npm.data.email) contacts.push({ type: 'email', value: npm.data.email, source: 'NPM' });
                                confirmed.push({ name: `${p.name} (@${h})`, category: p.category, url: p.url });
                            }
                        } else if (p.checkMethod === 'get_with_signature') {
                            const res = await axios.get(p.url, { headers, timeout: 4000, validateStatus: () => true, maxRedirects: 3 });
                            if (res.status === 200) {
                                const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                                if (p.mustNotContain && p.mustNotContain.some(kw => text.includes(kw))) return;
                                if (p.mustContain && !p.mustContain.every(kw => text.toLowerCase().includes(kw.toLowerCase()))) return;
                                if (p.extractBio) {
                                    contacts.push(...extractContactsFromText(text, p.name));
                                }
                                confirmed.push({ name: `${p.name} (@${h})`, category: p.category, url: p.url });
                            }
                        }
                    } catch(e) {}
                }));
            }
        }

        return res.json({
            target: perm.fullName || primaryHandle,
            type: perm.fullName ? 'Full Name / Persona' : 'username',
            handles: perm.handles,
            confirmed,
            contacts,
            publicRecords,
            dorks: generateDorkMatrix(primaryHandle, 'username'),
            elapsedMs: Date.now() - startTime
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/analyze', async (req, res) => {
    try {
        const target = String(req.query.target || '');
        const result = await osintEngine.analyzeTarget(target);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Assuming other simple wrappers...
// It is better to gradually move these over time. We just export them.

router.get('/ip', async (req, res) => {
    const ip = req.query.query || req.query.ip || '';
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,country,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ status: 'fail', message: 'System timeout' });
    }
});

router.get('/whois', async (req, res) => {
    const domain = String(req.query.domain || req.query.q || '').replace(/https?:\/\//, '').replace(/\/$/, '');
    try {
        const response = await fetch(`https://networkcalc.com/api/dns/whois/${domain}`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'WHOIS lookup failed' });
    }
});

router.get('/dns', async (req, res) => {
    const domain = String(req.query.domain || req.query.q || '').replace(/https?:\/\//, '').replace(/\/$/, '');
    try {
        const response = await fetch(`https://networkcalc.com/api/dns/lookup/${domain}`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'DNS lookup failed' });
    }
});

router.get('/email', async (req, res) => {
    const email = String(req.query.email || '');
    if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
    res.json({ email, validFormat: true, mxRecords: [] }); // using dummy till we verify DNS
});


export default router;
