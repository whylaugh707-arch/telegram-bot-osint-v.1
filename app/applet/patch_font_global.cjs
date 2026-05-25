const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf8');

const newMiddleware = `    const mapToSerif = (char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
        return char;
    };
    const applyFont = (text) => {
        if (typeof text !== 'string') return text;
        const regex = /(<[^>]+>|https?:\\/\\/\\S+|\\/\\w+|@\\w+)/g;
        return text.split(regex).map((part, i) => {
            if (i % 2 === 1) return part;
            return part.split('').map(mapToSerif).join('');
        }).join('');
    };
    const applyFontToMarkup = (extra) => {
        if (!extra) return extra;
        if (extra.reply_markup && extra.reply_markup.inline_keyboard) {
            extra.reply_markup.inline_keyboard = extra.reply_markup.inline_keyboard.map((row) => 
                row.map((btn) => ({ ...btn, text: applyFont(btn.text) }))
            );
        }
        return extra;
    };

    botInstance.use(async (ctx, next) => {
        const userName = ctx.from?.first_name || 'User';
        const userId = ctx.from?.id;
        const usname = ctx.from?.username ? '@' + ctx.from.username : '';
        let commandText = 'Unknown command';
        if (ctx.message && 'text' in ctx.message) commandText = ctx.message.text;
        else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) commandText = 'Button: ' + (ctx.callbackQuery.data || '');

        const needsLogging = (ctx.from && ctx.from.id !== ADMIN_ID);

        const origReply = ctx.reply.bind(ctx);
        ctx.reply = async function (text, ...args) {
            const fontText = applyFont(text);
            const fontArgs = args.map(applyFontToMarkup);
            const res = await origReply(fontText, ...fontArgs);
            try {
                if (needsLogging && text && String(text).trim().length > 0) {
                    let logMsg = \`🔔 <b>MEMBER ACTION RESULT</b>\\n━━━━━━━━━━━━━━━━━━━━\\n👤 <b>User:</b> \${userName} \${usname}\\n🆔 <b>ID:</b> <code>\${userId}</code>\\n⌨️ <b>Cmd:</b> <code>\${commandText}</code>\\n\\n📤 <b>BOT RESPONSE:</b>\\n\${text}\`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\\n(terpotong)';
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
                if (needsLogging) {
                    let logMsg = \`🔔 <b>MEMBER ACTION RESULT (EDIT)</b>\\n━━━━━━━━━━━━━━━━━━━━\\n👤 <b>User:</b> \${userName} \${usname}\\n🆔 <b>ID:</b> <code>\${userId}</code>\\n⌨️ <b>Action:</b> <code>\${commandText}</code>\\n\\n📤 <b>BOT RESPONSE:</b>\\n\${text}\`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\\n(terpotong)';
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
            let originalCaption = extra?.caption || '';
            if (extra && extra.caption) {
                extra.caption = applyFont(extra.caption);
            }
            const fontExtra = applyFontToMarkup(extra);
            const res = await origPhoto(photo, fontExtra);
            try {
                if (needsLogging) {
                    let logMsg = \`🔔 <b>MEMBER ACTION RESULT (PHOTO)</b>\\n━━━━━━━━━━━━━━━━━━━━\\n👤 <b>User:</b> \${userName} \${usname}\\n🆔 <b>ID:</b> <code>\${userId}</code>\\n⌨️ <b>Cmd:</b> <code>\${commandText}</code>\\n\\n📤 <b>CAPTION:</b>\\n\${originalCaption}\`;
                    if (logMsg.length > 4000) logMsg = logMsg.substring(0, 3950) + '...\\n(terpotong)';
                    await botInstance.telegram.sendMessage(ADMIN_ID, logMsg, { parse_mode: 'HTML' }).catch(async () => {
                        const safeText = String(logMsg).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
                        await botInstance.telegram.sendMessage(ADMIN_ID, safeText, { parse_mode: 'HTML' }).catch(()=>{});
                    });
                }
            } catch(e){}
            return res;
        };

        return next();
    });`;

c = c.replace(/botInstance\.use\(async \(ctx, next\) => \{[\s\S]*?return next\(\);\n    \}\);/, newMiddleware);

fs.writeFileSync('server.ts', c);
