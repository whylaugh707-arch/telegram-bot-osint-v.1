import { Telegraf } from 'telegraf';

const bot = new Telegraf('dummy:token');
bot.telegram.callApi = async (method, payload, options) => {
    console.log("CALL API:", method, payload);
    if (method === 'getMe') return { id: 123, is_bot: true, first_name: 'bot', username: 'bot' };
    return true;
};

bot.use((ctx, next) => {
    console.log("MIDDLEWARE HIT:", ctx.message?.text);
    return next();
});
bot.command('test', (ctx) => {
    ctx.reply("Hello from test!");
});

async function run() {
    const fakeUpdate = {
        update_id: 1,
        message: {
            message_id: 1,
            from: { id: 628211638627, is_bot: false, first_name: "WA" },
            chat: { id: "@wa_628211638627", type: "private" },
            date: Date.now(),
            text: "/test",
            entities: [{ type: "bot_command", offset: 0, length: 5 }]
        }
    };
    await bot.handleUpdate(fakeUpdate);
}
run();
