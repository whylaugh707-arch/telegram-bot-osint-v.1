const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
const replacement = `bot.action('confirm_verified', async (ctx) => {
        if (!ctx.from) return;
        agreementUsers.add(ctx.from.id);
        saveAgreement();
        ctx.answerCbQuery("System verified!").catch(() => {});
        const safeName = (ctx.from.first_name || 'User').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const txt = getStartMsg(safeName);
        try {
            await ctx.editMessageCaption(txt, { parse_mode: 'HTML', ...mainReplyKeyboard }).catch(() => ctx.reply(txt, { parse_mode: 'HTML', ...mainReplyKeyboard }));
        } catch(e) {
            ctx.reply(txt, { parse_mode: 'HTML', ...mainReplyKeyboard }).catch(()=>{});
        }
    });`;
code = code.replace(/bot\.action\('confirm_verified', async \(ctx\) => \{[\s\S]*?\n    \}\);/g, replacement);
fs.writeFileSync('server.ts', code);
