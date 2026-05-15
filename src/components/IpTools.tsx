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
    <div className="flex flex-col h-full bg-neutral-900">
      <div className="p-6 border-b border-neutral-800 bg-neutral-900">
        <h2 className="text-xl font-bold flex items-center mb-2">
          <Activity className="w-5 h-5 mr-2 text-rose-500" /> IP Intelligence
        </h2>
        <p className="text-sm text-neutral-400">Locate, identify, and analyze IP addresses.</p>
        
        {ownIp && (
          <div className="mt-4 p-3 bg-neutral-950 rounded-lg border border-neutral-800 flex items-center space-x-3 text-sm">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <span className="text-neutral-500">Your current IP address:</span>
            <span className="font-mono text-emerald-400 font-medium">{ownIp}</span>
          </div>
        )}
      </div>

      <div className="p-6 flex-1">
        <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={ip}
              onChange={e => setIp(e.target.value)}
              placeholder="Enter IP address (e.g., 8.8.8.8)"
              className="w-full bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 font-mono text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ip}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Scanning...' : 'Trace'}
          </button>
        </form>

        {result && (
          <div className="space-y-4">
            <h3 className="font-mono text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">TRACE RESULTS</h3>
            
            {result.status === 'success' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard label="IP Address" value={result.query} />
                <InfoCard label="ISP" value={result.isp} />
                <InfoCard label="Organization" value={result.org} />
                <InfoCard label="ASN" value={result.as} />
                <InfoCard label="Location" value={`${result.city}, ${result.regionName}, ${result.country}`} />
                <InfoCard label="Coordinates" value={`${result.lat}, ${result.lon}`} />
              </div>
            ) : (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-mono">
                Error tracing IP: {result.message}
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
    <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="font-mono text-sm text-neutral-200">{value || '-'}</div>
    </div>
  );
}
