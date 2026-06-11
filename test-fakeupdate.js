import { Telegraf } from "telegraf";
const bot = new Telegraf("dummy:token");
bot.telegram.callApi = async (method, payload) => {
  if (method === "getMe") return { username: "mybot_bot" };
  console.log("MOCK CALL API:", method, payload);
  return { message_id: 111 };
}
bot.use((ctx, next) => {
  console.log("Middleware executed! chat id =", ctx.chat?.id, "text=", ctx.message?.text);
  next();
});
bot.start((ctx) => {
  console.log("START COMMAND EXECUTED!");
  ctx.reply("hello /start");
});
const fakeUpdate = {
                 update_id: 12345,
                 message: {
                     message_id: 1234,
                     from: { id: 62812345678, is_bot: false, first_name: "WA User" },
                     chat: { id: `@wa_62812345678`, type: 'private' },
                     date: Math.floor(Date.now()/1000),
                     text: "start",
                     entities: []
                 }
};
console.log("SENDING TEXT START");
bot.handleUpdate(fakeUpdate).catch(console.error);

const fakeUpdate2 = {
                 update_id: 12346,
                 message: {
                     message_id: 1235,
                     from: { id: 62812345678, is_bot: false, first_name: "WA User" },
                     chat: { id: `@wa_62812345678`, type: 'private' },
                     date: Math.floor(Date.now()/1000),
                     text: "/start",
                     entities: [{ type: 'bot_command', offset: 0, length: 6 }]
                 }
};
bot.handleUpdate(fakeUpdate2).catch(console.error);
