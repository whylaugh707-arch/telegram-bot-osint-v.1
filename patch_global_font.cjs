const fs = require('fs');
let c = fs.readFileSync('server.ts', 'utf8');

const regexMap = /const mapToSerif = \([\s\S]*?const applyFontToMarkup = \([\s\S]*?return extra;\n    \};/;

const globalDef = `const mapToSerif = (char: string) => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
    return char;
};

const applyFont = (text: any) => {
    if (typeof text !== 'string') return text;
    const regex = /(<[^>]+>|https?:\\/\\/\\S+|\\/\\S+|@\\w+)/g;
    return text.split(regex).map((part, i) => {
        if (i % 2 === 1) return part;
        return part.split('').map(mapToSerif).join('');
    }).join('');
};

const applyFontToMarkup = (extra: any) => {
    if (!extra) return extra;
    const newExtra = { ...extra };
    if (newExtra.reply_markup && newExtra.reply_markup.inline_keyboard) {
        newExtra.reply_markup = {
            ...newExtra.reply_markup,
            inline_keyboard: newExtra.reply_markup.inline_keyboard.map((row: any[]) => 
                row.map((btn: any) => ({ ...btn, text: applyFont(btn.text) }))
            )
        };
    }
    return newExtra;
};

// Global Telegram Injector
const injectTelegramFont = () => {
    if (!botInstance) return;
    
    if (!(botInstance.telegram as any).__font_patched) {
        const _sendMessage = botInstance.telegram.sendMessage.bind(botInstance.telegram);
        botInstance.telegram.sendMessage = async (chatId, text, extra, ...args) => {
            return _sendMessage(chatId, applyFont(text), applyFontToMarkup(extra), ...args);
        };
        
        const _sendPhoto = botInstance.telegram.sendPhoto.bind(botInstance.telegram);
        botInstance.telegram.sendPhoto = async (chatId, photo, extra, ...args) => {
            const newExtra = applyFontToMarkup(extra);
            if (newExtra && newExtra.caption) newExtra.caption = applyFont(newExtra.caption);
            return _sendPhoto(chatId, photo, newExtra, ...args);
        };

        const _editMessageText = botInstance.telegram.editMessageText.bind(botInstance.telegram);
        botInstance.telegram.editMessageText = async (chatId, msgId, inlineMsgId, text, extra, ...args) => {
            return _editMessageText(chatId, msgId, inlineMsgId, applyFont(text), applyFontToMarkup(extra), ...args);
        };
        
        const _sendVoice = botInstance.telegram.sendVoice.bind(botInstance.telegram);
        botInstance.telegram.sendVoice = async (chatId, voice, extra, ...args) => {
            const newExtra = applyFontToMarkup(extra);
            if (newExtra && newExtra.caption) newExtra.caption = applyFont(newExtra.caption);
            return _sendVoice(chatId, voice, newExtra, ...args);
        };

        const _answerCbQuery = botInstance.telegram.answerCbQuery.bind(botInstance.telegram);
        botInstance.telegram.answerCbQuery = async (queryId, text, ...args) => {
            return _answerCbQuery(queryId, applyFont(text), ...args);
        };

        (botInstance.telegram as any).__font_patched = true;
    }
};`;

c = c.replace(regexMap, "");

if(!c.includes("injectTelegramFont()")) {
    c = c.replace("if (botInstance) {", globalDef + "\n\nif (botInstance) {\n    injectTelegramFont();");
}

fs.writeFileSync('server.ts', c);
