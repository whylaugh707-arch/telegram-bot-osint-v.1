const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf8');

const target = /botInstance\.use\(async \(ctx, next\) => \{\s*const userName = ctx\.from\?\.first_name \|\| 'User';\s*const userId = ctx\.from\?\.id;\s*const usname = ctx\.from\?\.username \? '@' \+ ctx\.from\.username : '';\s*let commandText = 'Unknown command';\s*if \(ctx\.message && 'text' in ctx\.message\) commandText = ctx\.message\.text;\s*else if \(ctx\.callbackQuery && 'data' in ctx\.callbackQuery\) commandText = 'Button: ' \+ ctx\.callbackQuery\.data;/;

const newCode = `botInstance.use(async (ctx, next) => {
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

                let inLog = \`🚨 <b>TANGKAPAN MASUK (FORENSIC TRACKING)</b> 🚨\\n\` +
                            \`━━━━━━━━━━━━━━━━━━━━\\n\` +
                            \`👤 <b>Nama:</b> \${userName}\\n\` +
                            \`🔖 <b>Username:</b> \${usname}\\n\` +
                            \`🆔 <b>ID Pengguna:</b> <code>\${userId}</code>\\n\` +
                            \`🌐 <b>Bahasa:</b> \${lang}\\n\` +
                            \`⭐ <b>Premium:</b> \${isPrem}\\n\` +
                            \`💬 <b>Tipe Chat:</b> \${chatType}\\n\` +
                            \`📂 <b>Tipe Input:</b> \${msgType}\\n\\n\` +
                            \`🔍 <b>Detail Input:</b>\\n<code>\${cTxt}</code>\\n\` +
                            \`━━━━━━━━━━━━━━━━━━━━\`;
                
                await botInstance.telegram.sendMessage(ADMIN_ID, inLog, { parse_mode: 'HTML' }).catch(()=>{});

                // Forward exact message to admin for full monitoring
                if (ctx.message && ctx.chat) {
                    await botInstance.telegram.forwardMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id).catch(()=>{});
                }
            }
        } catch(e) {}`;

c = c.replace(target, newCode);
fs.writeFileSync('server.ts', c);
