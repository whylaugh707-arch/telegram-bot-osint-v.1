import React, { useState, useEffect } from 'react';
import { Search, MapPin, Activity, Terminal } from 'lucide-react';

export default function IpTools() {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [ownIp, setOwnIp] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/osint/ip')
      .then(res => res.json())
      .then(data => setOwnIp(data.query))
      .catch(console.error);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/osint/ip?ip=${ip}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black text-[#00ff00]">
      <div className="p-6 border-b border-[#00ff00]/20 bg-[#00ff00]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter">
          <Activity className="w-5 h-5 mr-3 text-[#00ff00]" /> IP_INTELLIGENCE
        </h2>
        <p className="text-xs text-[#00ff00]/60 uppercase tracking-widest">Locate, identify, and analyze grid nodes via IP forensics.</p>
        
        {ownIp && (
          <div className="mt-4 p-3 bg-black border border-[#00ff00]/20 flex items-center space-x-3 text-[10px]">
            <Terminal className="w-4 h-4 text-[#00ff00]" />
            <span className="text-[#00ff00]/40 uppercase tracking-widest">Local_Identity:</span>
            <span className="font-mono text-[#00ff00] font-bold">{ownIp}</span>
          </div>
        )}
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff00]/40" />
            <input
              type="text"
              value={ip}
              onChange={e => setIp(e.target.value)}
              placeholder="TARGET_IP_ADDR"
              className="w-full bg-black border border-[#00ff00]/20 text-[#00ff00] rounded pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#00ff00]/60 focus:ring-1 focus:ring-[#00ff00]/40 font-mono text-sm placeholder:text-[#00ff00]/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ip}
            className="px-6 py-2.5 bg-[#00ff00] hover:bg-[#00ff00]/80 text-black font-bold text-xs uppercase tracking-tighter disabled:opacity-30 transition-all active:scale-95"
          >
            {loading ? 'TRACING_ROUTE...' : 'START_TRACE'}
          </button>
        </form>

        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="font-mono text-[10px] font-bold text-[#00ff00]/40 uppercase tracking-[0.3em] mb-4 border-b border-[#00ff00]/10 pb-2">TRACE_MANIFEST</h3>
            
            {result.status === 'success' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard label="IP_ADDR" value={result.query} />
                <InfoCard label="ISP_PROVIDER" value={result.isp} />
                <InfoCard label="ORG_ENTITY" value={result.org} />
                <InfoCard label="ASN_GATE" value={result.as} />
                <InfoCard label="GEOFENCED_LOC" value={`${result.city}, ${result.regionName}, ${result.country}`} />
                <InfoCard label="VECTOR_COORDS" value={`${result.lat}, ${result.lon}`} />
              </div>
            ) : (
              <div className="p-4 bg-red-500/10 border border-red-500/40 text-red-500 text-xs font-mono uppercase tracking-widest">
                CRITICAL_ERROR: {result.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-4 bg-black border border-[#00ff00]/10 hover:border-[#00ff00]/30 transition-all group">
      <div className="text-[10px] text-[#00ff00]/40 mb-2 font-bold tracking-widest group-hover:text-[#00ff00]/60 transition-colors uppercase">{label}</div>
      <div className="font-mono text-sm text-[#00ff00] font-bold">{value || 'NULL'}</div>
    </div>
  );
}
