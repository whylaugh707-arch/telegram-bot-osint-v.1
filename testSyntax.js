import fs from 'fs';
const content = fs.readFileSync('test_output.html', 'utf8');
const scriptMatches = content.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatches) {
  scriptMatches.forEach((s) => {
    const code = s.replace(/<\/?script>/g, '');
    try {
      new Function(code);
      console.log('Syntax OK');
    } catch (e) {
      console.error('Syntax Error:', e);
      fs.writeFileSync('syntax_error_code.js', code);
    }
  });
}
