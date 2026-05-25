const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf8');

c = c.replace(
  /fetch\(\`http:\/\/ip-api\.com\/json\/\$\{targetIp\}\?fields=status,country,city,isp,as,mobile,proxy,query\`\)/g,
  "fetch(`http://ip-api.com/json/${targetIp}?fields=status,country,regionName,city,district,lat,lon,isp,as,org,mobile,proxy,hosting,query`)"
);

// Enhance IP OSINT Output formatting
const oldIpReply = /let reply = \`<b>🌐 TARGET IP ANALYTICS PRO<\/b>\\n\` \+[\s\S]*?ctx\.reply\(reply, \{ parse_mode: 'HTML', \.\.\.mapKb \}\);/g;

c = c.replace(/TARGET IP ANALYTICS PRO/g, "TARGET IP ANALYTICS PRO (ENTERPRISE EDITION)");
c = c.replace(/WHOIS DATA ANALYTICS/g, "WHOIS DATA ANALYTICS (ENTERPRISE EDITION)");
c = c.replace(/DNS MAPPING PRO/g, "DNS MAPPING PRO (ENTERPRISE EDITION)");
c = c.replace(/EMAIL MX VALIDATOR/g, "EMAIL MX VALIDATOR (ENTERPRISE EDITION)");
c = c.replace(/PORT SCANNER/g, "PORT SCANNER (ENTERPRISE EDITION)");
c = c.replace(/NETWORK & IP \(ADVANCED\):/g, "NETWORK & IP (ENTERPRISE AUDIT):");
c = c.replace(/DIGITAL FOOTPRINT:/g, "DIGITAL FOOTPRINT (ENTERPRISE):");
c = c.replace(/FINANCIAL & SECURITY:/g, "FINANCIAL & SECURITY (ENTERPRISE):");

fs.writeFileSync('server.ts', c);
