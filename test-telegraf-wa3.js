import "dotenv/config";
import { Telegraf, Telegram } from "telegraf";
const bot = new Telegraf(process.env.TG_BOT_TOKEN || "test:token");

const originalCallApi = Telegram.prototype.callApi;
Telegram.prototype.callApi = async function (method, payload, options) {
  if (method === "getMe") return { username: "test_bot" };
  console.log("Mock Prototype callApi:", method, payload);
  return { message_id: 111 };
}

bot.use((ctx, next) => {
  ctx.reply("agreement msg!").catch(e => console.log("reply err:", e.message));
  return next();
});

async function run() {
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 62812345678, is_bot: false, first_name: "WA User" },
      chat: { id: `@wa_62812345678`, type: 'private' },
      date: Math.floor(Date.now()/1000),
      text: "/start",
      entities: [{ type: 'bot_command', offset: 0, length: 6 }]
    }
  });
}
run();
