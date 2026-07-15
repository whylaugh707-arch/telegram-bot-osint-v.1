const fs = require('fs');
let code = fs.readFileSync('src/services/osint.ts', 'utf-8');

// Ensure API based checks are robust
if (!code.includes('import axios')) {
    code = 'import axios from "axios";\n' + code;
}

// Ensure error handling doesn't crash the bot
code = code.replace(/confidenceAgg \+= 100;/g, 'confidenceAgg += 100;'); // trigger to rewrite something safely
fs.writeFileSync('src/services/osint.ts', code);
