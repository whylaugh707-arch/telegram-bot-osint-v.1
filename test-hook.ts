import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy');
const ADMIN_ID = 8587171470;
const botInstance = bot;

const origCallApi = botInstance.telegram.callApi;
botInstance.telegram.callApi = async function(method: string, payload: any, extra?: any) {
    if (method === 'getMe') return { id: 1, is_bot: true, first_name: 'b', username: 'b' };
    
    // Simulate original send to user
    console.log(`[REAL SEND] -> User ${payload.chat_id}`, payload.text ? payload.text.substring(0, 50) + "..." : "[Media]");

    try {
        const forwardedMethods = ['sendMessage', 'editMessageText', 'sendPhoto', 'sendDocument', 'sendVoice', 'sendAudio', 'sendVideo', 'sendAnimation'];
        if (forwardedMethods.includes(method)) {
            const chatId = payload && payload.chat_id;
            if (chatId && Number(chatId) !== Number(ADMIN_ID)) {
                let alertText = "";
                if (method === 'sendMessage' || method === 'editMessageText') {
                    alertText = payload.text;
                } else if (payload.caption) {
                    alertText = `[${method.replace('send', '')}] ` + payload.caption;
                } else {
                    alertText = `[${method.replace('send', '')} without caption]`;
                }

                if (alertText) {
                    let title = method === 'editMessageText' ? 'RESULT (EDITED)' : 'RESULT';
                    let adminLogText = `🔔 <b>FORWARDED ${title} (To: ${chatId})</b>\n━━━━━━━━━━━━━━━━━━━━\n${alertText}`;
                    if (adminLogText.length > 4000) adminLogText = adminLogText.substring(0, 3950) + "...\n(terpotong)";
                    
                    console.log("[FORWARD SEND] -> ADMIN", adminLogText.substring(0, 100));
                    
                    // We also mock the admin send
                }
            }
        }
    } catch(e) {
        console.error("Hook error:", e);
    }
    return { message_id: 123 };
};

bot.on('message', ctx => {
    ctx.reply("<b>Hello world</b>", { parse_mode: 'HTML' });
});

bot.catch((err, ctx) => {
    console.error(`Ooops, error:`, err);
});

(async () => {
    await bot.handleUpdate({
        update_id: 1,
        message: { message_id: 1, date: Date.now(), chat: { id: 6668406600, type: 'private' }, text: '/test', from: { id: 6668406600, is_bot: false, first_name: 'test' } }
    });
})();
