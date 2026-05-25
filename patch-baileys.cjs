const fs = require('fs');
const path = require('path');

const targetPath = path.join(process.cwd(), 'node_modules', 'whatsapp-rust-bridge', 'package.json');

console.log('--- RUNNING BAILEYS RUST BRIDGE PATCH ---');
if (fs.existsSync(targetPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    
    // Set main
    pkg.main = "./dist/index.js";
    
    // Set exports mapping clearly for ESP module loader inside node
    if (!pkg.exports) {
      pkg.exports = {};
    }
    pkg.exports['.'] = {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "default": "./dist/index.js",
      "types": "./dist/index.d.ts"
    };
    
    fs.writeFileSync(targetPath, JSON.stringify(pkg, null, 4), 'utf8');
    console.log('✅ Baileys rust bridge package.json successfully patched!');
  } catch (err) {
    console.error('❌ Failed to patch whatsapp-rust-bridge package.json:', err.message);
  }
} else {
  console.log('ℹ️ whatsapp-rust-bridge package.json not found inside local node_modules scope.');
}
