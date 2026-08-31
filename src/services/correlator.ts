// src/services/correlator.ts
import axios from 'axios';
import crypto from 'crypto';
import dns from 'dns/promises';

export interface CorrelatePlatform {
  name: string;
  category: 'Indo' | 'Social' | 'Dev' | 'Design' | 'Gaming' | 'Audio' | 'Creator' | 'Content' | 'Finance';
  url: string;
  apiEndpoint?: string;
  checkMethod: 'api_github' | 'api_gravatar' | 'api_npm' | 'api_reddit' | 'api_duolingo' | 'api_gitlab' | 'api_docker' | 'api_codeforces' | 'api_hackernews' | 'api_keybase' | 'api_chess' | 'get_with_signature' | 'status_only';
  mustContain?: string[];
  mustNotContain?: string[];
  expectedStatus?: number[];
  extractBio?: boolean;
}

export interface DiscoveredContact {
  type: 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'phone' | 'website' | 'name';
  value: string;
  source: string;
  link?: string;
}

export interface PlatformCheckResult {
  name: string;
  category: string;
  url: string;
  found: boolean;
  note?: string;
  extractedText?: string;
}

// 12 Realistic Modern User-Agents across Windows, Mac, Linux, iOS, Android
const REAL_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36"
];

const ACCEPT_LANGUAGES = [
  "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "id,en-US;q=0.9,en;q=0.8",
  "en-US,en;q=0.9,id;q=0.8"
];

export function getRandomHeaders(): Record<string, string> {
  const ua = REAL_USER_AGENTS[Math.floor(Math.random() * REAL_USER_AGENTS.length)];
  const lang = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
  const isMobile = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone");
  const platform = ua.includes("Windows") ? '"Windows"' : ua.includes("Macintosh") || ua.includes("iPhone") ? '"macOS"' : ua.includes("Android") ? '"Android"' : '"Linux"';

  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": lang,
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua": '"Chromium";v="124", "Not:A-Brand";v="99"',
    "Sec-Ch-Ua-Mobile": isMobile ? "?1" : "?0",
    "Sec-Ch-Ua-Platform": platform,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
  };
}

// Build strictly verified platforms with zero false-positives
export function buildPlatformList(user: string): CorrelatePlatform[] {
  const u = encodeURIComponent(user);
  return [
    // 🇮🇩 EKOSISTEM INDONESIA
    {
      name: "Saweria",
      category: "Indo",
      url: `https://saweria.co/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman tidak ditemukan", "404", "User not found"],
      mustContain: [u, "saweria"],
      extractBio: true
    },
    {
      name: "Trakteer",
      category: "Indo",
      url: `https://trakteer.id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Halaman tidak ditemukan", "Oops!"],
      mustContain: [u, "trakteer"],
      extractBio: true
    },
    {
      name: "KaryaKarsa",
      category: "Indo",
      url: `https://karyakarsa.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Kreator tidak ditemukan"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Sociabuzz",
      category: "Indo",
      url: `https://sociabuzz.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Halaman tidak ditemukan", "User Not Found"],
      mustContain: ["sociabuzz.com/", u],
      extractBio: true
    },
    {
      name: "Kitabisa",
      category: "Indo",
      url: `https://kitabisa.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman Tidak Ditemukan", "404"],
      mustContain: [u]
    },
    {
      name: "Blogger ID",
      category: "Indo",
      url: `https://${u}.blogspot.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Blog has been removed", "Blog tidak ditemukan", "does not exist"],
      mustContain: ["blogspot.com"]
    },
    {
      name: "WordPress ID",
      category: "Indo",
      url: `https://${u}.wordpress.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["doesn’t exist", "does not exist", "Do you want to register", "Create your website at WordPress.com", "Privacy Policy Updates"],
      mustContain: [u]
    },

    // 🌐 SOCIAL NETWORKS & MESSAGING
    {
      name: "GitHub",
      category: "Social",
      url: `https://github.com/${u}`,
      checkMethod: 'api_github'
    },
    {
      name: "Telegram",
      category: "Social",
      url: `https://t.me/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["If you have Telegram, you can contact", "tgme_page_extra", "Don't have Telegram yet?", "channel doesn't exist"],
      mustContain: [`@${user}`, "tgme_page_title"],
      extractBio: true
    },
    {
      name: "Gravatar",
      category: "Social",
      url: `https://en.gravatar.com/${u}`,
      checkMethod: 'api_gravatar'
    },
    {
      name: "Reddit",
      category: "Social",
      url: `https://www.reddit.com/user/${u}`,
      apiEndpoint: `https://www.reddit.com/user/${u}/about.json`,
      checkMethod: 'api_reddit'
    },
    {
      name: "Keybase",
      category: "Social",
      url: `https://keybase.io/${u}`,
      apiEndpoint: `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${u}`,
      checkMethod: 'api_keybase'
    },
    {
      name: "Mastodon",
      category: "Social",
      url: `https://mastodon.social/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Record not found", "Page not found"],
      mustContain: [`@${user}`]
    },
    {
      name: "Pinterest",
      category: "Social",
      url: `https://www.pinterest.com/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404", "Page Not Found"],
      mustContain: [user]
    },
    {
      name: "Linktree",
      category: "Social",
      url: `https://linktr.ee/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["The page you're looking for doesn't exist", "404", "profile-not-found"],
      mustContain: [`@${user}`],
      extractBio: true
    },
    {
      name: "Carrd",
      category: "Social",
      url: `https://${u}.carrd.co`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["This site doesn't exist", "404", "Site Not Found"],
      mustContain: ["carrd.co"],
      extractBio: true
    },
    {
      name: "Bento.me",
      category: "Social",
      url: `https://bento.me/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User not found", "bento.me"],
      mustContain: [user],
      extractBio: true
    },

    // 💻 DEVELOPER PLATFORMS
    {
      name: "GitLab",
      category: "Dev",
      url: `https://gitlab.com/${u}`,
      apiEndpoint: `https://gitlab.com/api/v4/users?username=${u}`,
      checkMethod: 'api_gitlab'
    },
    {
      name: "NPM Registry",
      category: "Dev",
      url: `https://www.npmjs.com/~${u}`,
      checkMethod: 'api_npm'
    },
    {
      name: "DockerHub",
      category: "Dev",
      url: `https://hub.docker.com/u/${u}`,
      apiEndpoint: `https://hub.docker.com/v2/users/${u}/`,
      checkMethod: 'api_docker'
    },
    {
      name: "Codeforces",
      category: "Dev",
      url: `https://codeforces.com/profile/${u}`,
      apiEndpoint: `https://codeforces.com/api/user.info?handles=${u}`,
      checkMethod: 'api_codeforces'
    },
    {
      name: "HackerNews",
      category: "Dev",
      url: `https://news.ycombinator.com/user?id=${u}`,
      apiEndpoint: `https://hacker-news.firebaseio.com/v0/user/${u}.json`,
      checkMethod: 'api_hackernews'
    },
    {
      name: "Dev.to",
      category: "Dev",
      url: `https://dev.to/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "The page you were looking for doesn't exist"],
      mustContain: [user]
    },
    {
      name: "Hashnode",
      category: "Dev",
      url: `https://hashnode.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User not found"],
      mustContain: [`@${user}`]
    },
    {
      name: "Replit",
      category: "Dev",
      url: `https://replit.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "We couldn't find that"],
      mustContain: [`@${user}`]
    },
    {
      name: "CodePen",
      category: "Dev",
      url: `https://codepen.io/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Couldn't find that"],
      mustContain: [user]
    },
    {
      name: "Pastebin",
      category: "Dev",
      url: `https://pastebin.com/u/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Not Found", "Unknown User", "404"],
      mustContain: [`Public Pastes of ${user}`]
    },

    // 🎮 GAMING & ENTERTAINMENT
    {
      name: "Steam Community",
      category: "Gaming",
      url: `https://steamcommunity.com/id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["The specified profile could not be found.", "Error: An error was encountered while processing your request"],
      mustContain: ["actual_persona_name", user],
      extractBio: true
    },
    {
      name: "Chess.com",
      category: "Gaming",
      url: `https://www.chess.com/member/${u}`,
      apiEndpoint: `https://api.chess.com/pub/player/${u}`,
      checkMethod: 'api_chess'
    },
    {
      name: "Lichess",
      category: "Gaming",
      url: `https://lichess.org/@/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "No user found"],
      mustContain: [user]
    },
    {
      name: "Duolingo",
      category: "Content",
      url: `https://www.duolingo.com/profile/${u}`,
      apiEndpoint: `https://www.duolingo.com/2017-06-30/users?username=${u}`,
      checkMethod: 'api_duolingo'
    },
    {
      name: "SoundCloud",
      category: "Audio",
      url: `https://soundcloud.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["We can't find that user", "404", "SoundCloud - Hear the world’s sounds"],
      mustContain: [user]
    },
    {
      name: "Bandcamp",
      category: "Audio",
      url: `https://${u}.bandcamp.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Sorry, that isn't a Bandcamp artist or label", "404"],
      mustContain: ["bandcamp.com"]
    },
    {
      name: "BuyMeACoffee",
      category: "Finance",
      url: `https://www.buymeacoffee.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Couldn't find this creator"],
      mustContain: [user]
    },
    {
      name: "Ko-fi",
      category: "Finance",
      url: `https://ko-fi.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page Not Found", "404", "Page not found!"],
      mustContain: [user]
    }
  ];
}

// Clean HTML to pure text to PREVENT ANY CSS/JS garbage matching
export function sanitizeHtmlToText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  
  // 1. Remove all scripts, styles, SVGs, noscript, comments
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 2. Replace hrefs with explicit text markers for accurate extraction
  text = text.replace(/href=["'](https?:\/\/[^"']+)["']/gi, ' [LINK: $1] ');

  // 3. Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 4. Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 5. Normalize whitespace
  return text.replace(/\s+/g, ' ').trim();
}

// Strictly extract contacts with ZERO false positives
const JUNK_EMAILS = [
  'automattic.com', 'wordpress.com', 'cloudflare.com', 'google.com', 'sentry.io', 
  'github.com', 'w3.org', 'schema.org', 'example.com', 'domain.com', 'jsdelivr.net',
  'bootstrapcdn.com', 'facebook.com', 'twitter.com', 'apple.com', 'microsoft.com'
];

const JUNK_EMAIL_PREFIXES = [
  'privacy', 'privacypolicy', 'support', 'admin', 'contact', 'help', 'info', 'sales',
  'billing', 'noreply', 'no-reply', 'abuse', 'legal', 'terms', 'security', 'marketing',
  'press', 'feedback', 'team', 'service', 'notification', 'notifications'
];

export function extractContactsFromText(rawHtmlOrText: string, sourceName: string): DiscoveredContact[] {
  const contacts: DiscoveredContact[] = [];
  if (!rawHtmlOrText || typeof rawHtmlOrText !== 'string') return contacts;

  const cleanText = sanitizeHtmlToText(rawHtmlOrText);

  // 1. WhatsApp Regex (Explicit wa.me link or explicit Indonesian Mobile Number)
  const waLinkRegex = /\[LINK:\s*https?:\/\/(?:api\.)?(?:wa\.me|whatsapp\.com\/send\?phone=)\/?(\+?[0-9]{10,15})/gi;
  let match;
  while ((match = waLinkRegex.exec(cleanText)) !== null) {
    let num = match[1].replace(/[^0-9]/g, '');
    if (num.startsWith('08')) num = '62' + num.substring(1);
    const formatted = `+${num}`;
    if (!contacts.some(c => c.value === formatted)) {
      contacts.push({
        type: 'whatsapp',
        value: formatted,
        source: sourceName,
        link: `https://wa.me/${num}`
      });
    }
  }

  // Indonesian mobile number with keyword "wa" or "whatsapp" or "no hp"
  const waTextRegex = /\b(?:wa|whatsapp|no\s*hp|nohp|telp)\s*[:=]?\s*(\+?628[1-9][0-9]{7,10}|08[1-9][0-9]{7,10})\b/gi;
  while ((match = waTextRegex.exec(cleanText)) !== null) {
    let num = match[1].replace(/[^0-9]/g, '');
    if (num.startsWith('08')) num = '62' + num.substring(1);
    const formatted = `+${num}`;
    if (!contacts.some(c => c.value === formatted)) {
      contacts.push({
        type: 'whatsapp',
        value: formatted,
        source: sourceName,
        link: `https://wa.me/${num}`
      });
    }
  }

  // 2. Email Regex (Strict filter out vendors & privacy policies)
  const emailRegex = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
  while ((match = emailRegex.exec(cleanText)) !== null) {
    const em = match[1].toLowerCase();
    const [userPart, domainPart] = em.split('@');
    
    // Check junk domain
    const isJunkDomain = JUNK_EMAILS.some(j => domainPart.includes(j));
    const isJunkPrefix = JUNK_EMAIL_PREFIXES.includes(userPart.toLowerCase().replace(/[^a-z]/g, ''));

    if (!isJunkDomain && !isJunkPrefix && !contacts.some(c => c.value === em)) {
      contacts.push({
        type: 'email',
        value: em,
        source: sourceName,
        link: `mailto:${em}`
      });
    }
  }

  // 3. Instagram Regex (ONLY from explicit instagram.com link or "IG: @handle")
  const igLinkRegex = /\[LINK:\s*https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{3,30})\/?\]/gi;
  const igBanned = ['p', 'reel', 'explore', 'stories', 'tv', 'direct', 'accounts', 'about', 'developer', 'legal', 'directory', 'privacy'];
  while ((match = igLinkRegex.exec(cleanText)) !== null) {
    const handle = match[1];
    if (!igBanned.includes(handle.toLowerCase()) && !contacts.some(c => c.type === 'instagram' && c.value === `@${handle}`)) {
      contacts.push({
        type: 'instagram',
        value: `@${handle}`,
        source: sourceName,
        link: `https://instagram.com/${handle}`
      });
    }
  }

  // Explicit keyword IG: @username (NOT random word matching)
  const igKeywordRegex = /\b(?:instagram|ig)\s*[:=]\s*@?([a-zA-Z0-9_.]{3,30})\b/gi;
  while ((match = igKeywordRegex.exec(cleanText)) !== null) {
    const handle = match[1];
    if (!igBanned.includes(handle.toLowerCase()) && !contacts.some(c => c.type === 'instagram' && c.value === `@${handle}`)) {
      contacts.push({
        type: 'instagram',
        value: `@${handle}`,
        source: sourceName,
        link: `https://instagram.com/${handle}`
      });
    }
  }

  // 4. Telegram Regex (ONLY from explicit t.me link or "Telegram: @handle")
  const tgLinkRegex = /\[LINK:\s*https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{4,32})\/?\]/gi;
  const tgBanned = ['share', 'joinchat', 'addstickers', 'c', 's', 'iv', 'setlanguage', 'contact'];
  while ((match = tgLinkRegex.exec(cleanText)) !== null) {
    const handle = match[1];
    if (!tgBanned.includes(handle.toLowerCase()) && !contacts.some(c => c.type === 'telegram' && c.value === `@${handle}`)) {
      contacts.push({
        type: 'telegram',
        value: `@${handle}`,
        source: sourceName,
        link: `https://t.me/${handle}`
      });
    }
  }

  return contacts;
}

// Generate Actionable Google Dork Matrix
export function generateDorkMatrix(target: string, type: 'username' | 'email' | 'domain' | 'ip') {
  const dorks: { title: string; query: string; url: string }[] = [];
  const q = encodeURIComponent;

  if (type === 'username') {
    const u = target;
    dorks.push({
      title: "📱 WhatsApp & Kontak Terindeks",
      query: `"${u}" ("wa.me" OR "08" OR "chat.whatsapp.com" OR "kontak")`,
      url: `https://www.google.com/search?q=${q(`"${u}" ("wa.me" OR "08" OR "chat.whatsapp.com" OR "kontak")`)}`
    });
    dorks.push({
      title: "🇮🇩 Indonesian Forums & Saweria/Trakteer",
      query: `"${u}" (site:kaskus.co.id OR site:kompasiana.com OR site:saweria.co OR site:trakteer.id OR site:karyakarsa.com)`,
      url: `https://www.google.com/search?q=${q(`"${u}" (site:kaskus.co.id OR site:kompasiana.com OR site:saweria.co OR site:trakteer.id OR site:karyakarsa.com)`)}`
    });
    dorks.push({
      title: "📑 Dokumen Terbuka (KTP / NIK / Ijazah / CV)",
      query: `"${u}" (filetype:pdf OR filetype:xlsx OR filetype:docx) ("NIK" OR "KTP" OR "Ijazah" OR "Biodata" OR "Curriculum Vitae")`,
      url: `https://www.google.com/search?q=${q(`"${u}" (filetype:pdf OR filetype:xlsx OR filetype:docx) ("NIK" OR "KTP" OR "Ijazah" OR "Biodata" OR "Curriculum Vitae")`)}`
    });
    dorks.push({
      title: "🔑 Repositori & Kredensial (GitHub/Pastebin)",
      query: `"${u}" (site:github.com OR site:gitlab.com OR site:pastebin.com) ("api_key" OR "password" OR "token" OR "secret")`,
      url: `https://www.google.com/search?q=${q(`"${u}" (site:github.com OR site:gitlab.com OR site:pastebin.com) ("api_key" OR "password" OR "token" OR "secret")`)}`
    });
    dorks.push({
      title: "📸 Lintas Media Sosial (IG, TikTok, X, FB)",
      query: `"${u}" (site:instagram.com OR site:tiktok.com OR site:twitter.com OR site:facebook.com OR site:threads.net)`,
      url: `https://www.google.com/search?q=${q(`"${u}" (site:instagram.com OR site:tiktok.com OR site:twitter.com OR site:facebook.com OR site:threads.net)`)}`
    });
  } else if (type === 'email') {
    const em = target;
    const [user, domain] = em.split('@');
    dorks.push({
      title: "📬 Kebocoran Database Publik (Pastebin / Text)",
      query: `"${em}" (site:pastebin.com OR site:throwbin.io OR filetype:txt OR filetype:sql)`,
      url: `https://www.google.com/search?q=${q(`"${em}" (site:pastebin.com OR site:throwbin.io OR filetype:txt OR filetype:sql)`)}`
    });
    dorks.push({
      title: "📱 Korelasi Nomor Telepon / WA",
      query: `("${em}" OR "${user}") ("08" OR "+62" OR "whatsapp" OR "wa.me")`,
      url: `https://www.google.com/search?q=${q(`("${em}" OR "${user}") ("08" OR "+62" OR "whatsapp" OR "wa.me")`)}`
    });
    dorks.push({
      title: "📂 Repositori Git & Commit Author",
      query: `"${em}" (site:github.com OR site:gitlab.com OR site:bitbucket.org)`,
      url: `https://www.google.com/search?q=${q(`"${em}" (site:github.com OR site:gitlab.com OR site:bitbucket.org)`)}`
    });
  } else if (type === 'domain') {
    const d = target;
    dorks.push({
      title: "🔑 Exposed Configuration & Env Files",
      query: `site:${d} (filetype:env OR filetype:yml OR filetype:json OR filetype:xml) ("password" OR "secret" OR "database")`,
      url: `https://www.google.com/search?q=${q(`site:${d} (filetype:env OR filetype:yml OR filetype:json OR filetype:xml) ("password" OR "secret" OR "database")`)}`
    });
    dorks.push({
      title: "🔒 Exposed Admin Login Portals",
      query: `site:${d} inurl:admin OR inurl:login OR inurl:portal OR inurl:dashboard`,
      url: `https://www.google.com/search?q=${q(`site:${d} inurl:admin OR inurl:login OR inurl:portal OR inurl:dashboard`)}`
    });
    dorks.push({
      title: "📑 Index of / Directory Listing",
      query: `site:${d} "index of /" OR "parent directory"`,
      url: `https://www.google.com/search?q=${q(`site:${d} "index of /" OR "parent directory"`)}`
    });
  } else {
    const ip = target;
    dorks.push({
      title: "🌐 Shodan InternetDB Query",
      query: `https://internetdb.shodan.io/${ip}`,
      url: `https://internetdb.shodan.io/${ip}`
    });
    dorks.push({
      title: "🔍 Google Index on IP",
      query: `"${ip}"`,
      url: `https://www.google.com/search?q=${q(`"${ip}"`)}`
    });
  }

  return dorks;
}

// Split long Telegram messages gracefully without breaking formatting
export function splitTelegramMessages(text: string, maxLen: number = 3600): string[] {
  if (!text || text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > maxLen) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? (currentChunk + '\n' + line) : line;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
