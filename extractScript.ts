import fs from 'fs';
const content = fs.readFileSync('output.html', 'utf8');
const scriptMatches = content.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatches) {
  const code = scriptMatches[0].replace(/<\/?script>/g, '');
  fs.writeFileSync('generated_script.js', code);
}
