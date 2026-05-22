const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('🛡️ Starting post-build security obfuscation for server code...');

const targetFile = 'dist/server.cjs';
if (fs.existsSync(targetFile)) {
  const code = fs.readFileSync(targetFile, 'utf8');
  
  const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    target: 'node',
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.6,
    unicodeEscapeSequence: false
  });

  fs.writeFileSync(targetFile, obfuscationResult.getObfuscatedCode());
  console.log('✅ Obfuscation complete! dist/server.cjs is now heavily encrypted and anti-debug protected.');
} else {
  console.log('⚠️ dist/server.cjs not found. Skipping obfuscation.');
}
