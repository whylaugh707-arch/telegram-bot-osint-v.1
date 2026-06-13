import React, { useState } from 'react';
import { Search, Brain, Activity, Target, ShieldAlert, Cpu, Database } from 'lucide-react';
import { RelationalGraph } from './RelationalGraph';

export default function IntelligencePlatform() {
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [intelData, setIntelData] = useState<any>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setLoading(true);

    try {
      const resp = await fetch(`/api/osint/analyze?target=${encodeURIComponent(target)}`);
      const data = await resp.json();
      setIntelData(data);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold uppercase tracking-widest text-[#38bdf8] flex items-center gap-3">
          <Brain className="w-6 h-6" />
          Intelligence Correlator
        </h2>
      </div>

      <form onSubmit={handleScan} className="flex gap-4">
        <input 
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Enter username, email, or IP address..."
          className="flex-1 bg-slate-900/50 border border-[#38bdf8]/30 rounded-lg px-4 py-3 text-white placeholder-[#38bdf8]/30 focus:outline-none focus:border-[#38bdf8]"
        />
        <button 
          disabled={loading}
          className="bg-[#38bdf8]/20 hover:bg-[#38bdf8]/40 text-[#38bdf8] border border-[#38bdf8]/50 px-8 py-3 rounded-lg flex items-center gap-2 font-bold transition-all disabled:opacity-50"
        >
          {loading ? <Activity className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          {loading ? 'ANALYZING...' : 'Correlate'}
        </button>
      </form>

      {intelData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          
          <div className="lg:col-span-1 border border-slate-800 bg-slate-900/50 rounded-lg p-5 flex flex-col space-y-6">
            <h3 className="uppercase tracking-widest font-bold text-slate-300 border-b border-slate-800 pb-2">Confidence Matrix</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#10b981]">{Math.round(intelData.score?.confidence || 0)}%</span>
                <span className="text-xs text-slate-500 uppercase mt-1">Confidence</span>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#ef4444]">{Math.round(intelData.score?.risk || 0)}/100</span>
                <span className="text-xs text-slate-500 uppercase mt-1">Risk Score</span>
              </div>
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col items-center justify-center col-span-2">
                <span className="text-2xl font-bold text-[#f59e0b]">{Math.round(intelData.score?.exposure || 0)}%</span>
                <span className="text-xs text-slate-500 uppercase mt-1">Footprint Exposure</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              <h3 className="uppercase tracking-widest font-bold text-slate-300 border-b border-slate-800 pb-2">Entity Correlation</h3>
              {intelData.findings?.map((f: any, i: number) => (
                <div key={i} className="flex flex-col p-3 rounded bg-slate-950 border border-slate-800 relative overflow-hidden group">
                  <div className={`absolute top-0 bottom-0 left-0 w-1 ${f.confidence > 70 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <div className="flex justify-between items-center mb-1 pl-2">
                     <span className="text-sm font-bold text-[#38bdf8] capitalize">{f.platform}</span>
                     <span className="text-[10px] text-slate-500">Conf: {f.confidence}%</span>
                  </div>
                  <div className="text-xs text-slate-400 pl-2 break-all">{f.data}</div>
                  {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#38bdf8]/60 hover:text-[#38bdf8] mt-2 pl-2">Verify Link »</a>}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 border border-slate-800 bg-slate-900/50 rounded-lg flex flex-col overflow-hidden relative">
             <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                <h3 className="uppercase tracking-widest font-bold text-slate-300">Entity Relational Graph</h3>
             </div>
             <div className="flex-1 w-full relative">
                {/* Visual Relational Node Map */}
                <RelationalGraph data={intelData.graph} />
             </div>
          </div>

        </div>
      )}
    </div>
  );
}
