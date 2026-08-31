// src/services/correlator.ts
import axios from 'axios';
import crypto from 'crypto';
import dns from 'dns/promises';

export interface CorrelatePlatform {
  name: string;
  category: 'Indo' | 'Social' | 'Dev' | 'Design' | 'Gaming' | 'Audio' | 'Creator' | 'Content' | 'Finance';
  url: string;
  checkType?: 'head' | 'get' | 'api_github' | 'api_gravatar' | 'api_npm';
  bodyCheckKeyword?: string;
  soft404Keyword?: string;
}

export interface DiscoveredContact {
  type: 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'phone' | 'website';
  value: string;
  source: string;
  link?: string;
}

export interface CorrelationResult {
  target: string;
  targetType: 'ip' | 'domain' | 'email' | 'username';
  elapsedSeconds: number;
  confidenceScore: number;
  riskScore: number;
  totalScanned: number;
  confirmedPlatforms: { name: string; category: string; url: string; note?: string }[];
  contacts: DiscoveredContact[];
  matchedIdentities: { field: string; value: string; matchCount: number; platforms: string[] }[];
  dorkMatrix: { title: string; query: string; url: string }[];
  graphNodes: { id: string; label: string; group: string }[];
  rawDetails: any;
}

// 12 Realistic Modern User-Agents across Windows, Mac, Linux, iOS, Android
const REAL_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0",
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
];

const ACCEPT_LANGUAGES = [
  "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "id,en-US;q=0.9,en;q=0.8",
  "en-US,en;q=0.9,id;q=0.8",
  "id-ID,en;q=0.8,en-GB;q=0.7",
  "en-GB,en-US;q=0.9,en;q=0.8,id;q=0.7"
];

export function getRandomHeaders(): Record<string, string> {
  const ua = REAL_USER_AGENTS[Math.floor(Math.random() * REAL_USER_AGENTS.length)];
  const lang = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
  const isMobile = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone");
  const platform = ua.includes("Windows") ? '"Windows"' : ua.includes("Macintosh") || ua.includes("iPhone") ? '"macOS"' : ua.includes("Android") ? '"Android"' : '"Linux"';

  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": lang,
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua": '"Chromium";v="123", "Not:A-Brand";v="8"',
    "Sec-Ch-Ua-Mobile": isMobile ? "?1" : "?0",
    "Sec-Ch-Ua-Platform": platform,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0"
  };
}

export function buildPlatformList(user: string): CorrelatePlatform[] {
  const u = encodeURIComponent(user);
  return [
    // 🇮🇩 INDONESIA POPULAR PLATFORMS & ECOSYSTEM (35+)
    { name: "Kaskus", category: "Indo", url: `https://www.kaskus.co.id/@${u}` },
    { name: "Kompasiana", category: "Indo", url: `https://www.kompasiana.com/${u}` },
    { name: "Saweria", category: "Indo", url: `https://saweria.co/${u}`, checkType: 'get' },
    { name: "Trakteer", category: "Indo", url: `https://trakteer.id/${u}`, checkType: 'get' },
    { name: "KaryaKarsa", category: "Indo", url: `https://karyakarsa.com/${u}`, checkType: 'get' },
    { name: "Sociabuzz", category: "Indo", url: `https://sociabuzz.com/${u}`, checkType: 'get' },
    { name: "Kitabisa", category: "Indo", url: `https://kitabisa.com/@${u}` },
    { name: "Bukalapak", category: "Indo", url: `https://www.bukalapak.com/u/${u}` },
    { name: "Tokopedia", category: "Indo", url: `https://www.tokopedia.com/people/${u}` },
    { name: "Shopee ID", category: "Indo", url: `https://shopee.co.id/${u}` },
    { name: "Blibli Seller", category: "Indo", url: `https://www.blibli.com/merchant/${u}` },
    { name: "OLX ID", category: "Indo", url: `https://www.olx.co.id/profile/${u}` },
    { name: "Detik Forum", category: "Indo", url: `https://forum.detik.com/member.php?username=${u}` },
    { name: "Kumparan", category: "Indo", url: `https://kumparan.com/${u}` },
    { name: "Hipwee", category: "Indo", url: `https://www.hipwee.com/author/${u}` },
    { name: "IDN Times", category: "Indo", url: `https://www.idntimes.com/author/${u}` },
    { name: "Mojok.co", category: "Indo", url: `https://mojok.co/author/${u}` },
    { name: "Blogger ID", category: "Indo", url: `https://${u}.blogspot.com`, checkType: 'get' },
    { name: "WordPress ID", category: "Indo", url: `https://${u}.wordpress.com`, checkType: 'get' },
    { name: "Brainly ID", category: "Indo", url: `https://brainly.co.id/profil/${u}` },
    { name: "Kaskus FJB", category: "Indo", url: `https://www.kaskus.co.id/fjb/user/${u}` },
    { name: "Mamikos", category: "Indo", url: `https://mamikos.com/profile/${u}` },
    { name: "Bstation / Bilibili TV", category: "Indo", url: `https://www.bilibili.tv/en/space/${u}` },
    { name: "MobileLegends Rank", category: "Indo", url: `https://m.mobilelegends.com/en/search/user?keyword=${u}` },
    { name: "UniPin", category: "Indo", url: `https://www.unipin.com/user/${u}` },
    { name: "Codashop Forum", category: "Indo", url: `https://community.codashop.com/id/profile/${u}` },
    { name: "Itemku", category: "Indo", url: `https://itemku.com/toko/${u}` },
    { name: "Fastwork ID", category: "Indo", url: `https://fastwork.id/user/${u}` },
    { name: "Sribulancer", category: "Indo", url: `https://www.sribu.com/id/freelancers/${u}` },
    { name: "JobsID", category: "Indo", url: `https://www.jobs.id/user/${u}` },
    { name: "Glints ID", category: "Indo", url: `https://glints.com/id/profile/${u}` },
    { name: "JobStreet ID", category: "Indo", url: `https://www.jobstreet.co.id/profile/${u}` },
    { name: "Tribunnews Author", category: "Indo", url: `https://www.tribunnews.com/penulis/${u}` },
    { name: "Kompasiana Komunitas", category: "Indo", url: `https://kompas.id/penulis/${u}` },
    { name: "Kaskus Podcast", category: "Indo", url: `https://podcast.kaskus.co.id/${u}` },

    // 🌐 SOCIAL NETWORKS & MESSAGING (35+)
    { name: "GitHub", category: "Social", url: `https://github.com/${u}`, checkType: 'api_github' },
    { name: "Telegram", category: "Social", url: `https://t.me/${u}`, checkType: 'get' },
    { name: "Twitter / X", category: "Social", url: `https://twitter.com/${u}` },
    { name: "Instagram", category: "Social", url: `https://www.instagram.com/${u}/` },
    { name: "TikTok", category: "Social", url: `https://www.tiktok.com/@${u}` },
    { name: "Threads", category: "Social", url: `https://www.threads.net/@${u}` },
    { name: "Bluesky", category: "Social", url: `https://bsky.app/profile/${u}.bsky.social` },
    { name: "Mastodon", category: "Social", url: `https://mastodon.social/@${u}` },
    { name: "Reddit", category: "Social", url: `https://www.reddit.com/user/${u}` },
    { name: "Pinterest", category: "Social", url: `https://www.pinterest.com/${u}/` },
    { name: "Facebook Profile", category: "Social", url: `https://www.facebook.com/${u}` },
    { name: "LinkedIn", category: "Social", url: `https://www.linkedin.com/in/${u}` },
    { name: "YouTube Channel", category: "Social", url: `https://www.youtube.com/@${u}` },
    { name: "Snapchat", category: "Social", url: `https://www.snapchat.com/add/${u}` },
    { name: "Tumblr", category: "Social", url: `https://${u}.tumblr.com` },
    { name: "VKontakte", category: "Social", url: `https://vk.com/${u}` },
    { name: "Discord Profile Link", category: "Social", url: `https://discord.id/user/${u}` },
    { name: "Quora", category: "Social", url: `https://www.quora.com/profile/${u}` },
    { name: "Medium", category: "Social", url: `https://medium.com/@${u}` },
    { name: "Substack", category: "Social", url: `https://${u}.substack.com` },
    { name: "Gravatar", category: "Social", url: `https://en.gravatar.com/${u}`, checkType: 'api_gravatar' },
    { name: "Keybase", category: "Social", url: `https://keybase.io/${u}` },
    { name: "Vimeo", category: "Social", url: `https://vimeo.com/${u}` },
    { name: "DailyMotion", category: "Social", url: `https://www.dailymotion.com/${u}` },
    { name: "Lemon8", category: "Social", url: `https://www.lemon8-app.com/${u}` },
    { name: "LINE Voom", category: "Social", url: `https://line.me/ti/p/~${u}` },
    { name: "Ask.fm", category: "Social", url: `https://ask.fm/${u}` },
    { name: "Tellonym", category: "Social", url: `https://tellonym.me/${u}` },
    { name: "CuriousCat", category: "Social", url: `https://curiouscat.live/${u}` },
    { name: "Clubhouse", category: "Social", url: `https://www.clubhouse.com/@${u}` },
    { name: "Weibo", category: "Social", url: `https://weibo.com/${u}` },
    { name: "Badoo", category: "Social", url: `https://badoo.com/profile/${u}` },
    { name: "Tinder Web", category: "Social", url: `https://tinder.com/@${u}` },
    { name: "Bumble Web", category: "Social", url: `https://bumble.com/app/profile/${u}` },
    { name: "OkCupid", category: "Social", url: `https://www.okcupid.com/profile/${u}` },

    // 💻 DEVELOPER & CODING HUBS (30+)
    { name: "GitLab", category: "Dev", url: `https://gitlab.com/${u}` },
    { name: "Bitbucket", category: "Dev", url: `https://bitbucket.org/${u}/` },
    { name: "NPM Registry", category: "Dev", url: `https://www.npmjs.com/~${u}`, checkType: 'api_npm' },
    { name: "PyPI", category: "Dev", url: `https://pypi.org/user/${u}/` },
    { name: "DockerHub", category: "Dev", url: `https://hub.docker.com/u/${u}` },
    { name: "CodePen", category: "Dev", url: `https://codepen.io/${u}` },
    { name: "Replit", category: "Dev", url: `https://replit.com/@${u}` },
    { name: "Dev.to", category: "Dev", url: `https://dev.to/${u}` },
    { name: "Hashnode", category: "Dev", url: `https://hashnode.com/@${u}` },
    { name: "HackerRank", category: "Dev", url: `https://www.hackerrank.com/${u}` },
    { name: "LeetCode", category: "Dev", url: `https://leetcode.com/${u}` },
    { name: "Kaggle", category: "Dev", url: `https://www.kaggle.com/${u}` },
    { name: "StackOverflow", category: "Dev", url: `https://stackoverflow.com/users/${u}` },
    { name: "Codecademy", category: "Dev", url: `https://www.codecademy.com/profiles/${u}` },
    { name: "FreeCodeCamp", category: "Dev", url: `https://www.freecodecamp.org/${u}` },
    { name: "SourceForge", category: "Dev", url: `https://sourceforge.net/u/${u}` },
    { name: "Glitch", category: "Dev", url: `https://glitch.com/@${u}` },
    { name: "Pastebin", category: "Dev", url: `https://pastebin.com/u/${u}` },
    { name: "Gist GitHub", category: "Dev", url: `https://gist.github.com/${u}` },
    { name: "Packagist", category: "Dev", url: `https://packagist.org/users/${u}/` },
    { name: "Crates.io", category: "Dev", url: `https://crates.io/users/${u}` },
    { name: "RubyGems", category: "Dev", url: `https://rubygems.org/profiles/${u}` },
    { name: "HackerEarth", category: "Dev", url: `https://www.hackerearth.com/@${u}` },
    { name: "Codeforces", category: "Dev", url: `https://codeforces.com/profile/${u}` },
    { name: "TopCoder", category: "Dev", url: `https://www.topcoder.com/members/${u}` },
    { name: "Exercism", category: "Dev", url: `https://exercism.org/profiles/${u}` },
    { name: "JSFiddle", category: "Dev", url: `https://jsfiddle.net/user/${u}` },
    { name: "Bugcrowd", category: "Dev", url: `https://bugcrowd.com/${u}` },
    { name: "HackerOne", category: "Dev", url: `https://hackerone.com/${u}` },
    { name: "TryHackMe", category: "Dev", url: `https://tryhackme.com/p/${u}` },

    // 🎨 DESIGN, PORTFOLIO & BIO HUBS (25+)
    { name: "Linktree", category: "Design", url: `https://linktr.ee/${u}`, checkType: 'get' },
    { name: "Carrd", category: "Design", url: `https://${u}.carrd.co`, checkType: 'get' },
    { name: "Bento.me", category: "Design", url: `https://bento.me/${u}`, checkType: 'get' },
    { name: "Bio.link", category: "Design", url: `https://bio.link/${u}`, checkType: 'get' },
    { name: "Behance", category: "Design", url: `https://www.behance.net/${u}` },
    { name: "Dribbble", category: "Design", url: `https://dribbble.com/${u}` },
    { name: "Figma Community", category: "Design", url: `https://www.figma.com/@${u}` },
    { name: "Canva Profile", category: "Design", url: `https://www.canva.com/p/${u}` },
    { name: "ArtStation", category: "Design", url: `https://www.artstation.com/${u}` },
    { name: "DeviantArt", category: "Design", url: `https://www.deviantart.com/${u}` },
    { name: "500px", category: "Design", url: `https://500px.com/p/${u}` },
    { name: "Flickr", category: "Design", url: `https://www.flickr.com/people/${u}` },
    { name: "Unsplash", category: "Design", url: `https://unsplash.com/@${u}` },
    { name: "VSCO", category: "Design", url: `https://vsco.co/${u}` },
    { name: "About.me", category: "Design", url: `https://about.me/${u}`, checkType: 'get' },
    { name: "Read.cv", category: "Design", url: `https://read.cv/${u}` },
    { name: "Polywork", category: "Design", url: `https://www.polywork.com/${u}` },
    { name: "Carbonmade", category: "Design", url: `https://${u}.carbonmade.com` },
    { name: "Adobe Portfolio", category: "Design", url: `https://${u}.myportfolio.com` },
    { name: "Notion Site", category: "Design", url: `https://${u}.notion.site` },
    { name: "Giphy Channel", category: "Design", url: `https://giphy.com/channel/${u}` },
    { name: "Imgur Profile", category: "Design", url: `https://imgur.com/user/${u}` },
    { name: "Freepik Contributor", category: "Design", url: `https://www.freepik.com/author/${u}` },
    { name: "Shutterstock", category: "Design", url: `https://www.shutterstock.com/g/${u}` },
    { name: "Vecteezy", category: "Design", url: `https://www.vecteezy.com/members/${u}` },

    // 🎮 GAMING, LIVESTREAM & ESPORTS (25+)
    { name: "Steam Community", category: "Gaming", url: `https://steamcommunity.com/id/${u}`, checkType: 'get' },
    { name: "Steam Profile", category: "Gaming", url: `https://steamcommunity.com/profiles/${u}` },
    { name: "Twitch", category: "Gaming", url: `https://www.twitch.tv/${u}` },
    { name: "Kick Livestream", category: "Gaming", url: `https://kick.com/${u}` },
    { name: "Roblox", category: "Gaming", url: `https://www.roblox.com/user.aspx?username=${u}` },
    { name: "Minecraft NameMC", category: "Gaming", url: `https://namemc.com/profile/${u}` },
    { name: "Chess.com", category: "Gaming", url: `https://www.chess.com/member/${u}`, checkType: 'get' },
    { name: "Lichess", category: "Gaming", url: `https://lichess.org/@/${u}` },
    { name: "Speedrun.com", category: "Gaming", url: `https://www.speedrun.com/users/${u}` },
    { name: "Osu!", category: "Gaming", url: `https://osu.ppy.sh/users/${u}` },
    { name: "Riot Tracker (Valorant)", category: "Gaming", url: `https://tracker.gg/valorant/profile/riot/${u}` },
    { name: "Fortnite Tracker", category: "Gaming", url: `https://fortnitetracker.com/profile/all/${u}` },
    { name: "Apex Tracker", category: "Gaming", url: `https://apex.tracker.gg/apex/profile/origin/${u}` },
    { name: "PSNProfiles", category: "Gaming", url: `https://psnprofiles.com/${u}` },
    { name: "XboxGamertag", category: "Gaming", url: `https://xboxgamertag.com/search/${u}` },
    { name: "NexusMods", category: "Gaming", url: `https://www.nexusmods.com/users/${u}` },
    { name: "MyAnimeList", category: "Gaming", url: `https://myanimelist.net/profile/${u}` },
    { name: "AniList", category: "Gaming", url: `https://anilist.co/user/${u}/` },
    { name: "GameJolt", category: "Gaming", url: `https://gamejolt.com/@${u}` },
    { name: "Itch.io", category: "Gaming", url: `https://${u}.itch.io` },
    { name: "Battle.net Tracker", category: "Gaming", url: `https://overwatchtracker.com/profile/pc/global/${u}` },
    { name: "Faceit", category: "Gaming", url: `https://www.faceit.com/en/players/${u}` },
    { name: "Esea", category: "Gaming", url: `https://play.esea.net/users/${u}` },
    { name: "Dotabuff", category: "Gaming", url: `https://www.dotabuff.com/players/${u}` },
    { name: "Op.gg League", category: "Gaming", url: `https://www.op.gg/summoners/sg/${u}` },

    // 🎵 MUSIC, AUDIO & PODCASTS (20+)
    { name: "Spotify User", category: "Audio", url: `https://open.spotify.com/user/${u}` },
    { name: "SoundCloud", category: "Audio", url: `https://soundcloud.com/${u}` },
    { name: "Bandcamp", category: "Audio", url: `https://${u}.bandcamp.com` },
    { name: "Last.fm", category: "Audio", url: `https://www.last.fm/user/${u}` },
    { name: "Mixcloud", category: "Audio", url: `https://www.mixcloud.com/${u}/` },
    { name: "Audiomack", category: "Audio", url: `https://audiomack.com/${u}` },
    { name: "ReverbNation", category: "Audio", url: `https://www.reverbnation.com/${u}` },
    { name: "Deezer Profile", category: "Audio", url: `https://www.deezer.com/profile/${u}` },
    { name: "Genius Lyrics", category: "Audio", url: `https://genius.com/${u}` },
    { name: "Smule Karaoke", category: "Audio", url: `https://www.smule.com/${u}` },
    { name: "BandLab", category: "Audio", url: `https://www.bandlab.com/${u}` },
    { name: "Anchor.fm Podcast", category: "Audio", url: `https://anchor.fm/${u}` },
    { name: "Podbean", category: "Audio", url: `https://${u}.podbean.com` },
    { name: "Castbox", category: "Audio", url: `https://castbox.fm/channel/${u}` },
    { name: "TuneIn", category: "Audio", url: `https://tunein.com/user/${u}` },
    { name: "Traxsource", category: "Audio", url: `https://www.traxsource.com/artist/${u}` },
    { name: "Beatport", category: "Audio", url: `https://www.beatport.com/artist/${u}` },
    { name: "Discogs", category: "Audio", url: `https://www.discogs.com/user/${u}` },
    { name: "Hearthis.at", category: "Audio", url: `https://hearthis.at/${u}` },
    { name: "Soundclick", category: "Audio", url: `https://www.soundclick.com/${u}` },

    // 💰 FINANCE, FREELANCE & COMMERCE (20+)
    { name: "Fiverr", category: "Finance", url: `https://www.fiverr.com/${u}` },
    { name: "Upwork", category: "Finance", url: `https://www.upwork.com/freelancers/~${u}` },
    { name: "Freelancer.com", category: "Finance", url: `https://www.freelancer.com/u/${u}` },
    { name: "Gumroad", category: "Finance", url: `https://gumroad.com/${u}` },
    { name: "BuyMeACoffee", category: "Finance", url: `https://www.buymeacoffee.com/${u}`, checkType: 'get' },
    { name: "Ko-fi", category: "Finance", url: `https://ko-fi.com/${u}`, checkType: 'get' },
    { name: "PayPal.Me", category: "Finance", url: `https://www.paypal.com/paypalme/${u}` },
    { name: "Patreon", category: "Finance", url: `https://www.patreon.com/${u}` },
    { name: "ProductHunt", category: "Finance", url: `https://www.producthunt.com/@${u}` },
    { name: "AngelList / Wellfound", category: "Finance", url: `https://wellfound.com/u/${u}` },
    { name: "CashApp", category: "Finance", url: `https://cash.app/$${u}` },
    { name: "Venmo", category: "Finance", url: `https://venmo.com/${u}` },
    { name: "eBay User", category: "Finance", url: `https://www.ebay.com/usr/${u}` },
    { name: "Etsy Shop/User", category: "Finance", url: `https://www.etsy.com/shop/${u}` },
    { name: "Envato / ThemeForest", category: "Finance", url: `https://themeforest.net/user/${u}` },
    { name: "CreativeMarket", category: "Finance", url: `https://creativemarket.com/users/${u}` },
    { name: "OpenSea NFT", category: "Finance", url: `https://opensea.io/${u}` },
    { name: "Rarible NFT", category: "Finance", url: `https://rarible.com/user/${u}` },
    { name: "Binance Feed", category: "Finance", url: `https://www.binance.com/en/feed/profile/${u}` },
    { name: "TradingView", category: "Finance", url: `https://www.tradingview.com/u/${u}/` },

    // 📚 CONTENT, READING, LIFESTYLE & LEARNING (20+)
    { name: "Goodreads", category: "Content", url: `https://www.goodreads.com/${u}` },
    { name: "Wattpad", category: "Content", url: `https://www.wattpad.com/user/${u}` },
    { name: "AO3 (Archive of Our Own)", category: "Content", url: `https://archiveofourown.org/users/${u}` },
    { name: "Scribd", category: "Content", url: `https://www.scribd.com/${u}` },
    { name: "Issuu", category: "Content", url: `https://issuu.com/${u}` },
    { name: "SlideShare", category: "Content", url: `https://www.slideshare.net/${u}` },
    { name: "Letterboxd", category: "Content", url: `https://letterboxd.com/${u}` },
    { name: "IMDb Profile", category: "Content", url: `https://www.imdb.com/user/ur${u}` },
    { name: "TMDb", category: "Content", url: `https://www.themoviedb.org/u/${u}` },
    { name: "Trakt.tv", category: "Content", url: `https://trakt.tv/users/${u}` },
    { name: "Strava", category: "Content", url: `https://www.strava.com/athletes/${u}` },
    { name: "Komoot", category: "Content", url: `https://www.komoot.com/user/${u}` },
    { name: "AllTrails", category: "Content", url: `https://www.alltrails.com/members/${u}` },
    { name: "TripAdvisor", category: "Content", url: `https://www.tripadvisor.com/members/${u}` },
    { name: "Couchsurfing", category: "Content", url: `https://www.couchsurfing.com/people/${u}` },
    { name: "Interpals", category: "Content", url: `https://www.interpals.net/${u}` },
    { name: "Duolingo", category: "Content", url: `https://www.duolingo.com/profile/${u}` },
    { name: "Coursera Profile", category: "Content", url: `https://www.coursera.org/user/${u}` },
    { name: "Instructables", category: "Content", url: `https://www.instructables.com/member/${u}` },
    { name: "HubPages", category: "Content", url: `https://hubpages.com/@${u}` }
  ];
}

// Deep Entity & Contact Regex Parser
export function extractContactsFromText(text: string, sourceName: string): DiscoveredContact[] {
  const contacts: DiscoveredContact[] = [];
  if (!text || typeof text !== 'string') return contacts;

  // 1. WhatsApp Regex (Indonesian + International format)
  const waDirectRegex = /(?:https?:\/\/)?(?:api\.)?(?:wa\.me|whatsapp\.com\/send\?phone=)\/?(\+?[0-9]{9,15})/gi;
  let match;
  while ((match = waDirectRegex.exec(text)) !== null) {
    let num = match[1].replace(/[^0-9]/g, '');
    if (num.startsWith('08')) num = '62' + num.substring(1);
    if (!contacts.some(c => c.value === num)) {
      contacts.push({
        type: 'whatsapp',
        value: `+${num}`,
        source: sourceName,
        link: `https://wa.me/${num}`
      });
    }
  }

  const waKeywordRegex = /(?:wa|whatsapp|no\s*hp|nohp|telp|kontak|contact)\s*[:=]?\s*(\+?62\d{8,13}|08\d{8,12})/gi;
  while ((match = waKeywordRegex.exec(text)) !== null) {
    let num = match[1].replace(/[^0-9]/g, '');
    if (num.startsWith('08')) num = '62' + num.substring(1);
    if (!contacts.some(c => c.value === `+${num}`)) {
      contacts.push({
        type: 'whatsapp',
        value: `+${num}`,
        source: sourceName,
        link: `https://wa.me/${num}`
      });
    }
  }

  // 2. Email Regex
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const junkDomains = ['sentry.io', 'example.com', 'domain.com', 'w3.org', 'schema.org', 'noreply', 'github.com', 'google.com', 'cloudflare.com', 'jsdelivr.net', 'bootstrapcdn.com'];
  while ((match = emailRegex.exec(text)) !== null) {
    const em = match[1].toLowerCase();
    const domain = em.split('@')[1];
    if (!junkDomains.some(j => domain.includes(j)) && !contacts.some(c => c.value === em)) {
      contacts.push({
        type: 'email',
        value: em,
        source: sourceName,
        link: `mailto:${em}`
      });
    }
  }

  // 3. Instagram Mentions Regex
  const igRegex = /(?:instagram\.com\/|ig\s*[:=]?\s*@?)([a-zA-Z0-9_.-]{3,30})/gi;
  const igJunk = ['p', 'reel', 'explore', 'stories', 'tv', 'direct', 'accounts', 'about', 'developer'];
  while ((match = igRegex.exec(text)) !== null) {
    const handle = match[1];
    if (!igJunk.includes(handle.toLowerCase()) && !contacts.some(c => c.type === 'instagram' && c.value === `@${handle}`)) {
      contacts.push({
        type: 'instagram',
        value: `@${handle}`,
        source: sourceName,
        link: `https://instagram.com/${handle}`
      });
    }
  }

  // 4. Telegram Mentions Regex
  const tgRegex = /(?:t\.me\/|telegram\.me\/|tg\s*[:=]?\s*@?)([a-zA-Z0-9_]{4,32})/gi;
  const tgJunk = ['share', 'joinchat', 'addstickers', 'c', 's', 'iv'];
  while ((match = tgRegex.exec(text)) !== null) {
    const handle = match[1];
    if (!tgJunk.includes(handle.toLowerCase()) && !contacts.some(c => c.type === 'telegram' && c.value === `@${handle}`)) {
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
