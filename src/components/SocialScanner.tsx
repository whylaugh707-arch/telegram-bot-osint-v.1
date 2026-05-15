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
    <div className="flex flex-col h-full bg-neutral-900 border-x border-neutral-900">
      <div className="p-6 border-b border-neutral-800">
        <h2 className="text-xl font-bold flex items-center mb-2">
          <UserSearch className="w-5 h-5 mr-2 text-rose-500" /> Username Cross-Reference
        </h2>
        <p className="text-sm text-neutral-400">Search for username availability and accounts across social networks.</p>
        <p className="text-xs text-rose-500/70 mt-1 flex items-center">
          <AlertCircle className="w-3 h-3 mr-1 inline" /> 
          Note: Some platforms block automated checks. Results indicate probable existence.
        </p>
      </div>

      <div className="p-6 flex-1">
         <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.trim().toLowerCase())}
              placeholder="Enter username (e.g., satoshin@gmx.com -> satoshin)"
              className="w-full bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 font-mono text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Scanning...' : 'Scan Networks'}
          </button>
        </form>

        {result && (
          <div>
            <h3 className="font-mono text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              SCAN RESULTS FOR: <span className="text-emerald-400">@{result.username}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.results.map((item: any, idx: number) => (
                <a 
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                    item.found 
                      ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20' 
                      : item.status === 'error' || item.status === 403 || item.status === 429
                        ? 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                        : 'bg-neutral-950/50 border-neutral-800 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="font-medium text-sm text-neutral-200">{item.name}</div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {item.found && <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">FOUND</span>}
                    {(!item.found && (item.status === 403 || item.status === 429)) && <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">BLOCKED/RATE LIMITED</span>}
                    {(!item.found && item.status === 404) && <span className="text-xs font-mono text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded">NOT FOUND</span>}
                    {(!item.found && item.status === 'error') && <span className="text-xs font-mono text-red-500 bg-red-500/10 px-2 py-0.5 rounded">ERROR</span>}
                    <ExternalLink className="w-4 h-4 text-neutral-500" />
                  </div>
                </a>
              ))}
            </div>
            
            <div className="mt-8 p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-400">
               <ShieldQuestion className="w-5 h-5 text-neutral-500 mb-2" />
               <p>Due to platform anti-scraping protections, a "BLOCKED/RATE LIMITED" or "FOUND" (via 200 OK on a redirect) result might require manual verification. Click the external links to confirm the profile visually.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
