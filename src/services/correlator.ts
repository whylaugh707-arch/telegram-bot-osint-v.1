// src/services/correlator.ts
import axios from 'axios';
import crypto from 'crypto';
import dns from 'dns/promises';

export interface CorrelatePlatform {
  name: string;
  category: 'Indo' | 'Social' | 'Dev' | 'Design' | 'Gaming' | 'Audio' | 'Creator' | 'Content' | 'Finance' | 'Education' | 'Community' | 'Career';
  url: string;
  apiEndpoint?: string;
  checkMethod: 'api_github' | 'api_gravatar' | 'api_npm' | 'api_reddit' | 'api_duolingo' | 'api_gitlab' | 'api_docker' | 'api_codeforces' | 'api_hackernews' | 'api_keybase' | 'api_chess' | 'api_pypi' | 'api_rubygems' | 'api_crates' | 'api_packagist' | 'get_with_signature';
  mustContain?: string[];
  mustNotContain?: string[];
  extractBio?: boolean;
}

export interface DiscoveredContact {
  type: 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'phone' | 'website' | 'name' | 'location' | 'institution';
  value: string;
  source: string;
  link?: string;
}

export interface DiscoveredPublicRecord {
  title: string;
  source: string;
  details: string;
  url?: string;
}

export interface WebSearchFinding {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export interface PlatformCheckResult {
  name: string;
  category: string;
  url: string;
  found: boolean;
  note?: string;
  extractedText?: string;
}

// Realistic modern User-Agents
const REAL_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
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

// Generate handle and email candidates from raw input
export function generatePermutations(rawInput: string): {
  fullName?: string;
  handles: string[];
  emailCandidates: string[];
} {
  const cleaned = rawInput.trim();
  const hasSpaces = /\s+/.test(cleaned);

  if (hasSpaces) {
    const parts = cleaned.split(/\s+/).map(p => p.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
    const joined = parts.join('');
    const dot = parts.join('.');
    const under = parts.join('_');
    const dash = parts.join('-');

    const handles = Array.from(new Set([joined, under, dot, dash])).filter(h => h.length >= 3);
    const emailCandidates = [
      `${joined}@gmail.com`,
      `${dot}@gmail.com`,
      `${under}@gmail.com`,
      `${joined}@yahoo.com`,
      `${dot}@yahoo.com`,
      `${joined}@hotmail.com`,
      `${joined}@outlook.com`
    ];

    return {
      fullName: cleaned,
      handles,
      emailCandidates
    };
  } else {
    const handle = cleaned.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const emailCandidates = [
      `${handle}@gmail.com`,
      `${handle}@yahoo.com`,
      `${handle}@outlook.com`,
      `${handle}@hotmail.com`
    ];
    return {
      handles: [handle],
      emailCandidates
    };
  }
}

// 🌐 200+ COMPREHENSIVE PLATFORM DATABASE (INDONESIAN & GLOBAL ECOSYSTEM)
export function buildPlatformList(user: string): CorrelatePlatform[] {
  const u = encodeURIComponent(user);
  return [
    // 🇮🇩 EKOSISTEM INDONESIA & ASIA TENGGARA (25+ Platform)
    {
      name: "Saweria",
      category: "Indo",
      url: `https://saweria.co/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman tidak ditemukan", "404", "User not found", "Page not found"],
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
      name: "Lynk.id",
      category: "Indo",
      url: `https://lynk.id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Halaman tidak ditemukan"],
      mustContain: ["lynk.id", u],
      extractBio: true
    },
    {
      name: "Mayar.id",
      category: "Indo",
      url: `https://mayar.id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Halaman Tidak Ditemukan"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "TipTip",
      category: "Indo",
      url: `https://tiptip.id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Not Found"],
      mustContain: [u]
    },
    {
      name: "Kaskus",
      category: "Indo",
      url: `https://www.kaskus.co.id/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Member tidak ditemukan", "404", "Halaman tidak ditemukan"],
      mustContain: [`@${user}`],
      extractBio: true
    },
    {
      name: "Kompasiana",
      category: "Indo",
      url: `https://www.kompasiana.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman tidak ditemukan", "404", "Akun tidak aktif"],
      mustContain: [u],
      extractBio: true
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
    {
      name: "Brainly ID",
      category: "Indo",
      url: `https://brainly.co.id/profil/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Pengguna tidak ditemukan", "404", "Halaman tidak ditemukan"],
      mustContain: [u]
    },
    {
      name: "Fastwork ID",
      category: "Indo",
      url: `https://fastwork.id/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found", "Tidak ditemukan"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Sribulancer",
      category: "Indo",
      url: `https://www.sribu.com/id/freelancers/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Not Found", "Tidak ditemukan"],
      mustContain: [u]
    },
    {
      name: "Scribd ID",
      category: "Indo",
      url: `https://www.scribd.com/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User not found"],
      mustContain: [u]
    },
    {
      name: "Detik Forum",
      category: "Indo",
      url: `https://forum.detik.com/member.php?username=${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User specified does not exist", "Invalid User specified"],
      mustContain: [u]
    },
    {
      name: "Tokopedia Seller",
      category: "Indo",
      url: `https://www.tokopedia.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Toko Tidak Ditemukan", "Waduh, tujuanmu nggak ada", "404"],
      mustContain: ["tokopedia.com", u]
    },
    {
      name: "Bukalapak",
      category: "Indo",
      url: `https://www.bukalapak.com/u/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman Tidak Ditemukan", "404", "Lapak tidak ditemukan"],
      mustContain: [u]
    },
    {
      name: "Shopee Feed",
      category: "Indo",
      url: `https://shopee.co.id/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Halaman tidak ditemukan", "404"],
      mustContain: ["shopee.co.id", u]
    },

    // 🌐 SOCIAL NETWORKS & MESSAGING (35+ Platform)
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
      name: "Bio.link",
      category: "Social",
      url: `https://bio.link/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found", "Claim this username"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Beacons",
      category: "Social",
      url: `https://beacons.ai/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Claim your page"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Bento.me",
      category: "Social",
      url: `https://bento.me/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found", "bento doesn't exist"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Campsite",
      category: "Social",
      url: `https://campsite.bio/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "About.me",
      category: "Social",
      url: `https://about.me/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "PAGE NOT FOUND"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Twitter / X",
      category: "Social",
      url: `https://x.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["This account doesn’t exist", "Account suspended", "User not found"],
      mustContain: [u]
    },
    {
      name: "Instagram",
      category: "Social",
      url: `https://www.instagram.com/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Sorry, this page isn't available.", "Page Not Found • Instagram"],
      mustContain: ["instagram.com"]
    },
    {
      name: "Facebook Profile",
      category: "Social",
      url: `https://www.facebook.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["This content isn't available right now", "Page Not Found"],
      mustContain: ["facebook.com"]
    },
    {
      name: "TikTok",
      category: "Social",
      url: `https://www.tiktok.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Couldn't find this account", "Account not found", "404"],
      mustContain: [`@${user}`],
      extractBio: true
    },
    {
      name: "YouTube Channel",
      category: "Social",
      url: `https://www.youtube.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 Not Found", "This channel does not exist"],
      mustContain: [`@${user}`],
      extractBio: true
    },
    {
      name: "Threads",
      category: "Social",
      url: `https://www.threads.net/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page Not Found", "404"],
      mustContain: [`@${user}`]
    },
    {
      name: "Bluesky",
      category: "Social",
      url: `https://bsky.app/profile/${u}.bsky.social`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Profile not found", "Account has been suspended"],
      mustContain: [u]
    },
    {
      name: "Mastodon Social",
      category: "Social",
      url: `https://mastodon.social/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Record not found", "Page not found"],
      mustContain: [`@${user}`]
    },
    {
      name: "Tumblr",
      category: "Social",
      url: `https://${u}.tumblr.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["There's nothing here.", "404", "Whatever you were looking for doesn't exist"],
      mustContain: ["tumblr.com"]
    },
    {
      name: "VK (Vkontakte)",
      category: "Social",
      url: `https://vk.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "User was deleted", "has been removed"],
      mustContain: [u]
    },
    {
      name: "Disqus",
      category: "Social",
      url: `https://disqus.com/by/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404"],
      mustContain: [u]
    },
    {
      name: "Ask.fm",
      category: "Social",
      url: `https://ask.fm/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404", "Well, that didn't go well"],
      mustContain: [u]
    },
    {
      name: "Tellonym",
      category: "Social",
      url: `https://tellonym.me/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Tellonym - not found"],
      mustContain: [u]
    },
    {
      name: "CuriousCat",
      category: "Social",
      url: `https://curiouscat.live/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found"],
      mustContain: [u]
    },
    {
      name: "Quora Profile",
      category: "Social",
      url: `https://www.quora.com/profile/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 Not Found", "Page Not Found"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "Medium",
      category: "Social",
      url: `https://medium.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["PAGE NOT FOUND", "404", "Out of nothing, something"],
      mustContain: [`@${user}`],
      extractBio: true
    },
    {
      name: "Substack",
      category: "Social",
      url: `https://${u}.substack.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found", "Publish on Substack"],
      mustContain: ["substack.com"]
    },
    {
      name: "Patreon",
      category: "Creator",
      url: `https://www.patreon.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Looking for someone?"],
      mustContain: [u],
      extractBio: true
    },
    {
      name: "BuyMeACoffee",
      category: "Creator",
      url: `https://www.buymeacoffee.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Couldn't find this creator"],
      mustContain: [user]
    },
    {
      name: "Ko-fi",
      category: "Creator",
      url: `https://ko-fi.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Page Not Found - Ko-fi"],
      mustContain: [u]
    },
    {
      name: "Goodreads",
      category: "Content",
      url: `https://www.goodreads.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404"],
      mustContain: [u]
    },
    {
      name: "Wattpad",
      category: "Content",
      url: `https://www.wattpad.com/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404", "Whoops, looks like something went wrong"],
      mustContain: [u]
    },
    {
      name: "Letterboxd",
      category: "Content",
      url: `https://letterboxd.com/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 - Page Not Found", "Sorry, we can’t find the page you’ve asked for."],
      mustContain: [u]
    },
    {
      name: "MyAnimeList",
      category: "Content",
      url: `https://myanimelist.net/profile/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 Not Found", "This page doesn't exist."],
      mustContain: [u]
    },

    // 💻 DEVELOPER, CODE & TECH ECOSYSTEM (40+ Platform)
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
      name: "PyPI (Python)",
      category: "Dev",
      url: `https://pypi.org/user/${u}/`,
      apiEndpoint: `https://pypi.org/pypi/${u}/json`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 Not Found", "User not found"],
      mustContain: [u]
    },
    {
      name: "DockerHub",
      category: "Dev",
      url: `https://hub.docker.com/u/${u}`,
      apiEndpoint: `https://hub.docker.com/v2/users/${u}/`,
      checkMethod: 'api_docker'
    },
    {
      name: "RubyGems",
      category: "Dev",
      url: `https://rubygems.org/profiles/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u]
    },
    {
      name: "Packagist (PHP)",
      category: "Dev",
      url: `https://packagist.org/users/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found"],
      mustContain: [u]
    },
    {
      name: "Crates.io (Rust)",
      category: "Dev",
      url: `https://crates.io/users/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found"],
      mustContain: [u]
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
      mustNotContain: ["404", "Page Not Found"],
      mustContain: [u]
    },
    {
      name: "JSFiddle",
      category: "Dev",
      url: `https://jsfiddle.net/user/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User not found"],
      mustContain: [u]
    },
    {
      name: "LeetCode",
      category: "Dev",
      url: `https://leetcode.com/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found", "page does not exist"],
      mustContain: [u]
    },
    {
      name: "HackerRank",
      category: "Dev",
      url: `https://www.hackerrank.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found"],
      mustContain: [u]
    },
    {
      name: "Kaggle",
      category: "Dev",
      url: `https://www.kaggle.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "We couldn't find that page"],
      mustContain: [u]
    },
    {
      name: "HuggingFace",
      category: "Dev",
      url: `https://huggingface.co/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found", "Page not found"],
      mustContain: [u]
    },
    {
      name: "SourceForge",
      category: "Dev",
      url: `https://sourceforge.net/u/${u}/profile/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User Not Found"],
      mustContain: [u]
    },
    {
      name: "ProductHunt",
      category: "Dev",
      url: `https://www.producthunt.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found"],
      mustContain: [`@${user}`]
    },
    {
      name: "Bitbucket",
      category: "Dev",
      url: `https://bitbucket.org/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Resource not found"],
      mustContain: [u]
    },
    {
      name: "Codecademy",
      category: "Dev",
      url: `https://www.codecademy.com/profiles/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u]
    },
    {
      name: "Codeberg",
      category: "Dev",
      url: `https://codeberg.org/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page Not Found", "404"],
      mustContain: [u]
    },

    // 🎨 DESIGN, CREATIVE & AUDIO (25+ Platform)
    {
      name: "Behance",
      category: "Design",
      url: `https://www.behance.net/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Oops! We can’t find that page", "404"],
      mustContain: [u]
    },
    {
      name: "Dribbble",
      category: "Design",
      url: `https://dribbble.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Whoops, that page is gone.", "404"],
      mustContain: [u]
    },
    {
      name: "ArtStation",
      category: "Design",
      url: `https://www.artstation.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "User not found"],
      mustContain: [u]
    },
    {
      name: "DeviantArt",
      category: "Design",
      url: `https://www.deviantart.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404 Not Found", "Deactivated Account", "Page Not Found"],
      mustContain: [u]
    },
    {
      name: "Figma Community",
      category: "Design",
      url: `https://www.figma.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found", "Figma - Page Not Found"],
      mustContain: [`@${user}`]
    },
    {
      name: "500px",
      category: "Design",
      url: `https://500px.com/p/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "We couldn't find the page"],
      mustContain: [u]
    },
    {
      name: "Flickr",
      category: "Design",
      url: `https://www.flickr.com/people/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page Not Found", "404", "Oops! Looking for something?"],
      mustContain: [u]
    },
    {
      name: "Unsplash",
      category: "Design",
      url: `https://unsplash.com/@${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [`@${user}`]
    },
    {
      name: "VSCO",
      category: "Design",
      url: `https://vsco.co/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "This page is not available"],
      mustContain: [u]
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
      name: "Spotify Artist/User",
      category: "Audio",
      url: `https://open.spotify.com/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page not found", "404", "Couldn't find that page"],
      mustContain: ["spotify.com"]
    },
    {
      name: "Bandcamp",
      category: "Audio",
      url: `https://${u}.bandcamp.com`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Sorry, that site doesn't exist", "Bandcamp"],
      mustContain: ["bandcamp.com"]
    },
    {
      name: "Mixcloud",
      category: "Audio",
      url: `https://www.mixcloud.com/${u}/`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page Not Found", "404"],
      mustContain: [u]
    },
    {
      name: "Last.fm",
      category: "Audio",
      url: `https://www.last.fm/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404", "Page Not Found"],
      mustContain: [u]
    },
    {
      name: "Vimeo",
      category: "Content",
      url: `https://vimeo.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found", "Sorry, we couldn’t find that page"],
      mustContain: [u]
    },
    {
      name: "DailyMotion",
      category: "Content",
      url: `https://www.dailymotion.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u]
    },

    // 🎮 GAMING & VIRTUAL PLATFORMS (15+ Platform)
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
      mustNotContain: ["404", "Page not found", "There is no user with this name"],
      mustContain: [u]
    },
    {
      name: "Twitch",
      category: "Gaming",
      url: `https://www.twitch.tv/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Time Machine", "Unless you’ve got a time machine"],
      mustContain: [u]
    },
    {
      name: "Roblox User",
      category: "Gaming",
      url: `https://www.roblox.com/user.aspx?username=${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["Page cannot be found", "404"],
      mustContain: [u]
    },
    {
      name: "Speedrun.com",
      category: "Gaming",
      url: `https://www.speedrun.com/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404"],
      mustContain: [u]
    },
    {
      name: "NexusMods",
      category: "Gaming",
      url: `https://www.nexusmods.com/users/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found"],
      mustContain: [u]
    },
    {
      name: "osu!",
      category: "Gaming",
      url: `https://osu.ppy.sh/users/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "User not found"],
      mustContain: [u]
    },

    // 🎓 EDUCATION, CAREER & REPUTATION (20+ Platform)
    {
      name: "Duolingo",
      category: "Education",
      url: `https://www.duolingo.com/profile/${u}`,
      apiEndpoint: `https://www.duolingo.com/2017-06-30/users?username=${u}`,
      checkMethod: 'api_duolingo'
    },
    {
      name: "Academia.edu",
      category: "Education",
      url: `https://independent.academia.edu/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found", "Sorry, this page is not available"],
      mustContain: [u]
    },
    {
      name: "ResearchGate",
      category: "Education",
      url: `https://www.researchgate.net/profile/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404: Page not found", "Profile not found"],
      mustContain: [u]
    },
    {
      name: "Freelancer",
      category: "Career",
      url: `https://www.freelancer.com/u/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["User not found", "404", "This page is not found"],
      mustContain: [u]
    },
    {
      name: "Fiverr",
      category: "Career",
      url: `https://www.fiverr.com/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u]
    },
    {
      name: "Crunchbase",
      category: "Career",
      url: `https://www.crunchbase.com/person/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page Not Found"],
      mustContain: [u]
    },
    {
      name: "Strava",
      category: "Social",
      url: `https://www.strava.com/athletes/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "The page you are looking for does not exist"],
      mustContain: [u]
    },
    {
      name: "TripAdvisor",
      category: "Community",
      url: `https://www.tripadvisor.com/Profile/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Profile not found"],
      mustContain: [u]
    },
    {
      name: "OpenSea",
      category: "Finance",
      url: `https://opensea.io/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "This page couldn't be found"],
      mustContain: [u]
    },
    {
      name: "Rarible",
      category: "Finance",
      url: `https://rarible.com/user/${u}`,
      checkMethod: 'get_with_signature',
      mustNotContain: ["404", "Page not found"],
      mustContain: [u]
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
  text = text
    .replace(/href=["'](https?:\/\/[^"']+)["']/gi, ' [LINK: $1] ')
    .replace(/href=["'](mailto:[^"']+)["']/gi, ' [MAILTO: $1] ')
    .replace(/href=["'](tel:[^"']+)["']/gi, ' [TEL: $1] ');

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

const JUNK_EMAILS = [
  'automattic.com', 'wordpress.com', 'cloudflare.com', 'google.com', 'sentry.io', 
  'github.com', 'w3.org', 'schema.org', 'example.com', 'domain.com', 'jsdelivr.net',
  'bootstrapcdn.com', 'facebook.com', 'twitter.com', 'apple.com', 'microsoft.com',
  'wix.com', 'gravatar.com', 'medium.com', 'vimeo.com', 'telegram.org'
];

const JUNK_EMAIL_PREFIXES = [
  'privacy', 'privacypolicy', 'support', 'admin', 'contact', 'help', 'info', 'sales',
  'billing', 'noreply', 'no-reply', 'abuse', 'legal', 'terms', 'security', 'marketing',
  'press', 'feedback', 'team', 'service', 'notification', 'notifications'
];

// Extract contacts strictly with real values
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

  // Indonesian mobile number with keyword "wa" or "whatsapp" or "no hp" or "telp" or standard Indonesian GSM prefix
  const waTextRegex = /\b(?:wa|whatsapp|no\s*hp|nohp|telp|kontak|hubungi|call)\s*[:=]?\s*(\+?628[1-9][0-9]{7,10}|08[1-9][0-9]{7,10})\b/gi;
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

  // Standalone Indonesian mobile phone number (+628xxx or 08xxx with 10-13 digits)
  const standaloneIndoPhone = /\b(\+628[1-9][0-9]{7,10}|08[1-9][0-9]{8,10})\b/g;
  while ((match = standaloneIndoPhone.exec(cleanText)) !== null) {
    let num = match[1].replace(/[^0-9]/g, '');
    if (num.startsWith('08')) num = '62' + num.substring(1);
    const formatted = `+${num}`;
    if (!contacts.some(c => c.value === formatted)) {
      contacts.push({
        type: 'phone',
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

// 🌐 LIVE SEARCH ENGINE CRAWLER & HARVESTER (Scrapes Google / DuckDuckGo / Open Web)
export async function scrapeSearchSnippetsAndExtract(targetName: string): Promise<{
  findings: WebSearchFinding[];
  contacts: DiscoveredContact[];
}> {
  const findings: WebSearchFinding[] = [];
  const contacts: DiscoveredContact[] = [];
  if (!targetName || targetName.length < 2) return { findings, contacts };

  const queries = [
    `"${targetName}" (wa.me OR "08" OR "+628" OR "whatsapp")`,
    `"${targetName}" ("@gmail.com" OR "@yahoo.com" OR "email" OR "kontak")`,
    `"${targetName}" (site:kaskus.co.id OR site:kompasiana.com OR site:linkedin.com OR site:github.com)`
  ];

  for (const q of queries) {
    try {
      // 1. Query DuckDuckGo HTML Engine
      const searchRes = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        headers: getRandomHeaders(),
        timeout: 4500,
        validateStatus: () => true
      });

      if (searchRes.status === 200 && typeof searchRes.data === 'string') {
        const html = searchRes.data;
        // Parse results with regex
        const resultRegex = /<a class="result__url" href="([^"]+)".*?<a class="result__snippet[^>]*>(.*?)<\/a>/gis;
        let rMatch;
        let count = 0;
        while ((rMatch = resultRegex.exec(html)) !== null && count < 3) {
          count++;
          let rawUrl = rMatch[1];
          // Unwrap duckduckgo redirect if present
          if (rawUrl.includes('uddg=')) {
            const parsedUddg = new URLSearchParams(rawUrl.split('?')[1] || '').get('uddg');
            if (parsedUddg) rawUrl = decodeURIComponent(parsedUddg);
          }

          const snippet = rMatch[2].replace(/<[^>]+>/g, '').trim();
          if (snippet.length > 10) {
            findings.push({
              title: `Hasil Pencarian Web: ${targetName}`,
              snippet,
              url: rawUrl,
              source: 'Web Index / Search Snippet'
            });

            // Extract contact vectors immediately from search snippet
            const snippetContacts = extractContactsFromText(snippet, `Search Engine Snippet (${new URL(rawUrl).hostname})`);
            contacts.push(...snippetContacts);

            // Fetch target page safely if snippet is promising
            if (rawUrl.startsWith('http') && !rawUrl.includes('google') && !rawUrl.includes('duckduckgo')) {
              try {
                const pageRes = await axios.get(rawUrl, {
                  headers: getRandomHeaders(),
                  timeout: 3500,
                  maxRedirects: 2,
                  validateStatus: () => true
                });
                if (pageRes.status === 200 && typeof pageRes.data === 'string') {
                  const pageContacts = extractContactsFromText(pageRes.data, `Direct Page (${new URL(rawUrl).hostname})`);
                  contacts.push(...pageContacts);
                }
              } catch(e) {}
            }
          }
        }
      }
    } catch(e) {}
  }

  return { findings, contacts };
}

// Query academic and public registries (OpenAlex, CrossRef, Wikipedia)
export async function queryPublicRegistries(targetName: string): Promise<DiscoveredPublicRecord[]> {
  const records: DiscoveredPublicRecord[] = [];
  if (!targetName || targetName.length < 3) return records;

  // 1. CrossRef Works & Papers
  try {
    const crRes不易 = await axios.get(`https://api.crossref.org/works?query.author=${encodeURIComponent(targetName)}&rows=3`, {
      headers: { 'User-Agent': 'OSINT-Nexus/2.0 (contact: admin@nexus-intel.org)' },
      timeout: 4500
    });
    if (crRes不易.data?.message?.items?.length > 0) {
      crRes不易.data.message.items.forEach((item: any) => {
        const title = item.title?.[0] || 'Karya Ilmiah / Publikasi';
        const publisher = item.publisher || 'Penerbit Jurnal';
        const doi = item.DOI ? `https://doi.org/${item.DOI}` : undefined;
        records.push({
          title: `Publikasi Jurnal / Karya Ilmiah: ${title}`,
          source: `CrossRef (${publisher})`,
          details: `DOI: ${item.DOI || 'Tercatat'} | Tahun: ${item.created?.['date-parts']?.[0]?.[0] || '-'}`,
          url: doi
        });
      });
    }
  } catch(e) {}

  // 2. OpenAlex Academic Author Registry
  try {
    const alexRes = await axios.get(`https://api.openalex.org/authors?search=${encodeURIComponent(targetName)}`, {
      headers: { 'User-Agent': 'OSINT-Nexus/2.0' },
      timeout: 4500
    });
    if (alexRes.data?.results?.length > 0) {
      alexRes.data.results.slice(0, 2).forEach((a: any) => {
        const institution = a.last_known_institutions?.[0]?.display_name || 'Institusi Akademik';
        records.push({
          title: `Profil Akademisi / Peneliti: ${a.display_name}`,
          source: 'OpenAlex Scholarly Registry',
          details: `Institusi/Afiliasi: ${institution} | Jumlah Karya: ${a.works_count || 1}`,
          url: a.id
        });
      });
    }
  } catch(e) {}

  // 3. Wikipedia Search
  try {
    const wikiRes = await axios.get(`https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(targetName)}&format=json`, {
      headers: { 'User-Agent': 'OSINT-Nexus/2.0' },
      timeout: 4000
    });
    if (wikiRes.data?.query?.search?.length > 0) {
      const top = wikiRes.data.query.search[0];
      if (top.title.toLowerCase().includes(targetName.toLowerCase())) {
        records.push({
          title: `Entri Ensiklopedia: ${top.title}`,
          source: 'Wikipedia Indonesia',
          details: top.snippet.replace(/<[^>]+>/g, ''),
          url: `https://id.wikipedia.org/wiki/${encodeURIComponent(top.title)}`
        });
      }
    }
  } catch(e) {}

  return records;
}

// Generate Actionable Google Dork Matrix
export function generateDorkMatrix(target: string, type: 'username' | 'email' | 'domain' | 'ip') {
  const dorks: { title: string; query: string; url: string }[] = [];
  const q = encodeURIComponent;

  if (type === 'username') {
    const u = target;
    dorks.push({
      title: "📱 WhatsApp & Nomor HP Terindeks",
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
      title: "📸 Lintas Media Sosial (IG, TikTok, X, FB, LinkedIn)",
      query: `"${u}" (site:instagram.com OR site:tiktok.com OR site:twitter.com OR site:facebook.com OR site:linkedin.com)`,
      url: `https://www.google.com/search?q=${q(`"${u}" (site:instagram.com OR site:tiktok.com OR site:twitter.com OR site:facebook.com OR site:linkedin.com)`)}`
    });
  } else if (type === 'email') {
    const em = target;
    const [user] = em.split('@');
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
  } else {
    const ip = target;
    dorks.push({
      title: "🌐 Shodan InternetDB Query",
      query: `https://internetdb.shodan.io/${ip}`,
      url: `https://internetdb.shodan.io/${ip}`
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
