import React, { useState } from 'react';
import { UserSearch, Search, ExternalLink, ShieldQuestion, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SocialScanner() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/osint/username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      <div className="p-6 border-b border-[#00ff00]/20 bg-[#00ff00]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter">
          <UserSearch className="w-5 h-5 mr-3 text-[#00ff00]" /> USERNAME_CROSS_REF
        </h2>
        <p className="text-xs text-[#00ff00]/60 uppercase tracking-widest">Search for identity availability and leaked accounts across social grids.</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
         <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff00]/40" />
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.trim().toLowerCase())}
              placeholder="TARGET_USERNAME"
              className="w-full bg-black border border-[#00ff00]/20 text-[#00ff00] rounded pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#00ff00]/60 focus:ring-1 focus:ring-[#00ff00]/40 font-serif text-sm placeholder:text-[#00ff00]/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username}
            className="px-6 py-2.5 bg-[#00ff00] hover:bg-[#00ff00]/80 text-black font-bold text-xs uppercase tracking-tighter disabled:opacity-30 transition-all active:scale-95"
          >
            {loading ? 'RUNNING_RECON...' : 'INIT_SCAN'}
          </button>
        </form>

        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="font-serif text-[10px] font-bold text-[#00ff00]/40 uppercase tracking-[0.3em] mb-4 border-b border-[#00ff00]/10 pb-2 flex justify-between">
              <span>SCAN_REPORT: @{result.username}</span>
              <span>STATE: PROCESSED</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.results.map((item: any, idx: number) => (
                <a 
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-4 border group transition-all duration-300 ${
                    item.found 
                      ? 'bg-[#00ff00]/10 border-[#00ff00]/40 hover:bg-[#00ff00]/20' 
                      : 'bg-black border-[#00ff00]/5 hover:border-[#00ff00]/20 opacity-40 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${item.found ? 'text-[#00ff00]' : 'text-white/40'}`}>{item.name.toUpperCase()}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between">
                    {item.found ? (
                      <span className="text-[9px] font-bold text-[#00ff00] bg-[#00ff00]/10 px-2 py-0.5 border border-[#00ff00]/20 tracking-tighter">DATA_MATCHED</span>
                    ) : (
                      <span className="text-[9px] font-bold text-white/20 tracking-tighter">
                        {item.status === 403 || item.status === 429 ? 'GRID_LOCKED' : 'NULL_DATA'}
                      </span>
                    )}
                    <span className="text-[8px] opacity-20 font-serif">#{idx+1024}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
