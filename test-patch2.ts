import { Telegraf, Context } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy');
const origCallApi = bot.telegram.callApi;

bot.telegram.callApi = async function(method: string, payload: any, extra?: any) {
    console.log(`[PATCH] Intercepted callApi: ${method}`);
    if (method === 'getMe') return { id: 1, is_bot: true, first_name: 'bot', username: 'bot' };
    console.log(`[PATCH] Payload:`, payload);
    return { message_id: 123 }; // mock return
};

bot.command('ip', (ctx) => {
    console.log("Is it same?", ctx.telegram === bot.telegram);
    console.log("Is callApi patched?", ctx.telegram.callApi === bot.telegram.callApi);
    ctx.reply("Result of IP scan");
});

(async () => {
    await bot.handleUpdate({
        update_id: 1,
        message: { message_id: 1, date: 1, chat: { id: 12345, type: 'private' }, text: '/ip', from: { id: 12345, is_bot: false, first_name: 'test' } }
    });
})();
