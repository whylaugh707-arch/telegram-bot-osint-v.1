import { getCaptureScript } from './trapTemplates.ts';
const script = getCaptureScript('test', 'https://example.com', { tmplId: 'cloudflare', perms: ['media'] });
console.log(script);
