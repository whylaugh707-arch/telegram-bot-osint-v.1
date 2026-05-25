import React, { useState } from 'react';
import { Search, ExternalLink, FileText, Lock, Database, Camera } from 'lucide-react';

export default function DorkGenerator() {
  const [query, setQuery] = useState('');
  
  const dorks = [
    { name: 'Index of / (Directories)', icon: <FileText className="w-4 h-4" />, dork: `intitle:"index of" "${query}"` },
    { name: 'Sensitive PDF/Docs', icon: <FileText className="w-4 h-4" />, dork: `"${query}" filetype:pdf OR filetype:doc OR filetype:xlsx` },
    { name: 'Login Pages', icon: <Lock className="w-4 h-4" />, dork: `inurl:login "${query}"` },
    { name: 'SQL Syntax Errors', icon: <Database className="w-4 h-4" />, dork: `"${query}" "sql syntax"` },
    { name: 'Config/Env Files', icon: <Lock className="w-4 h-4" />, dork: `"${query}" filetype:env OR filetype:conf OR filetype:sql` },
    { name: 'Open Camera/CCTV', icon: <Camera className="w-4 h-4" />, dork: `inurl:view/view.shtml "${query}"` }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 font-display">
      <div className="p-6 border-b border-[#38bdf8]/20 bg-[#38bdf8]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter uppercase">
          <Search className="w-5 h-5 mr-3 text-[#38bdf8]" /> Google_Dork_Generator
        </h2>
        <p className="text-[10px] text-[#38bdf8]/60 uppercase tracking-[0.2em]">Advanced search operator crafting for exposed assets and sensitive data.</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <div className="space-y-4">
          <label className="text-[10px] font-bold text-[#38bdf8]/40 uppercase tracking-widest">Base_Keyword</label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. company_name, site.com"
            className="w-full bg-slate-950 border border-[#38bdf8]/20 text-[#38bdf8] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#38bdf8]/60 font-display"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dorks.map((d, i) => (
            <button
              key={i}
              disabled={!query}
              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(d.dork)}`, '_blank')}
              className="p-4 border border-[#38bdf8]/10 bg-slate-950 hover:border-[#38bdf8]/50 hover:bg-[#38bdf8]/5 text-left transition-all group disabled:opacity-30"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3 text-[#38bdf8]/60 group-hover:text-[#38bdf8] transition-colors">
                  {d.icon}
                  <span className="text-xs font-bold uppercase tracking-tight">{d.name}</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#38bdf8]/20 group-hover:text-[#38bdf8] transition-colors" />
              </div>
              <div className="text-[10px] font-display opacity-30 group-hover:opacity-60 transition-opacity break-all">
                {d.dork}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
