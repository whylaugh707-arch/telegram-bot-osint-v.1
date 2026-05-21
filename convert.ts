const map: Record<string, string> = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
const text = 'Alat Pelacakan intensitas tinggi, dibangun oleh jeemikko, memiliki fitur fitur canggih seperti OSINT & RECON, STEALTH LOGGER, ADV TOOLS, COMPLEX GAMES, ALARM HUB, dan WHATSAPP BOT.\n\nsalam hormat saya, JeeMikko';
console.log(text.toLowerCase().split('').map(c => map[c] || c).join(''));
