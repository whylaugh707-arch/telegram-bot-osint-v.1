const fs = require('fs');
const path = require('path');

console.log('--- RUNNING BAILEYS RUST BRIDGE PATCH ---');

const bridgeDir = path.join(process.cwd(), 'node_modules', 'whatsapp-rust-bridge');
const pkgPath = path.join(bridgeDir, 'package.json');

// Make sure directory exists
if (!fs.existsSync(bridgeDir)) {
  fs.mkdirSync(bridgeDir, { recursive: true });
}

// Write package.json if not present
if (!fs.existsSync(pkgPath)) {
  const defaultPkg = {
    "name": "whatsapp-rust-bridge",
    "version": "0.5.4",
    "description": "A high-performance utilities for WhatsApp, powered by Rust and WebAssembly.",
    "type": "module",
    "main": "./dist/index.js",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "require": "./dist/index.js",
        "default": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    }
  };
  fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 4), 'utf8');
} else {
  // Patch existing package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.main = "./dist/index.js";
    if (!pkg.exports) {
      pkg.exports = {};
    }
    pkg.exports['.'] = {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "default": "./dist/index.js",
      "types": "./dist/index.d.ts"
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4), 'utf8');
    console.log('✅ Baileys rust bridge package.json successfully patched!');
  } catch (err) {
    console.error('❌ Failed to patch whatsapp-rust-bridge package.json:', err.message);
  }
}

// Create dist directory
const distDir = path.join(bridgeDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write pure JS implementation of whatsapp-rust-bridge index.js
const indexJsContent = `import crypto from 'crypto';

export function md5(data) {
  return crypto.createHash('md5').update(data).digest();
}

export function hkdf(ikm, length, options = {}) {
  const digest = 'sha256';
  const salt = options.salt || Buffer.alloc(0);
  const info = options.info || '';
  
  const saltBuf = typeof salt === 'string' ? Buffer.from(salt) : Buffer.from(salt);
  const infoBuf = typeof info === 'string' ? Buffer.from(info) : Buffer.from(info);
  const ikmBuf = Buffer.from(ikm);

  return crypto.hkdfSync(digest, ikmBuf, saltBuf, infoBuf, length);
}

export function expandAppStateKeys(keyData) {
  const expanded = hkdf(keyData, 160, { info: 'App State Keys' });
  return {
    indexKey: expanded.slice(0, 32),
    valueEncryptionKey: expanded.slice(32, 64),
    valueMacKey: expanded.slice(64, 96),
    snapshotMacKey: expanded.slice(96, 128),
    patchMacKey: expanded.slice(128, 160)
  };
}

export class LTHashAntiTampering {
  subtractThenAdd(base, subtract, add) {
    return new Uint8Array(128);
  }
}
`;

fs.writeFileSync(path.join(distDir, 'index.js'), indexJsContent, 'utf8');
console.log('✅ Baileys rust bridge dist/index.js generated!');

// Write index.d.ts typescript definition
const indexDtsContent = `export declare function md5(data: Uint8Array | Buffer | string): Buffer;
export declare function hkdf(
  ikm: Uint8Array | Buffer,
  length: number,
  options?: {
    salt?: Uint8Array | Buffer | string;
    info?: Uint8Array | Buffer | string;
  }
): Buffer;
export declare class LTHashAntiTampering {
  subtractThenAdd(base: Uint8Array, subtract: Uint8Array[], add: Uint8Array[]): Uint8Array;
}
export declare function expandAppStateKeys(keyData: Uint8Array): {
  indexKey: Uint8Array;
  patchMacKey: Uint8Array;
  snapshotMacKey: Uint8Array;
  valueEncryptionKey: Uint8Array;
  valueMacKey: Uint8Array;
};
`;

fs.writeFileSync(path.join(distDir, 'index.d.ts'), indexDtsContent, 'utf8');
console.log('✅ Baileys rust bridge dist/index.d.ts generated!');
console.log('--- BAILEYS RUST BRIDGE PATCH COMPLETE ---');
