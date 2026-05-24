import { Telegraf, Context } from 'telegraf';
import * as dotenv from 'dotenv';
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'dummy');
const origSend = bot.telegram.sendMessage;
bot.telegram.sendMessage = async function(...args: any[]) {
    console.log("PATCH HIT!");
    return origSend.apply(this, args);
};

bot.command('ip', (ctx) => {
    console.log("Is it same?", ctx.telegram === bot.telegram);
    console.log("Is send patched?", ctx.telegram.sendMessage === bot.telegram.sendMessage);
});
bot.handleUpdate({
    update_id: 1,
    message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: '/ip' }
});
