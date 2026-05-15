import React, { useState } from 'react';
import { Search, Globe, AlignLeft } from 'lucide-react';

export default function DomainTools() {
  const [domain, setDomain] = useState('');
  const [loadingWhois, setLoadingWhois] = useState(false);
  const [loadingDns, setLoadingDns] = useState(false);
  const [whoisResult, setWhoisResult] = useState<string | null>(null);
  const [dnsResult, setDnsResult] = useState<string | null>(null);

  const handleWhois = async () => {
    if (!domain) return;
    setLoadingWhois(true);
    setWhoisResult(null);
    try {
      const res = await fetch(`/api/osint/whois?q=${domain}`);
      const json = await res.json();
      setWhoisResult(json.data || "Error fetching WHOIS");
      setActiveTab('whois');
    } catch {
      setWhoisResult("Error connecting to server");
    } finally {
      setLoadingWhois(false);
    }
  };

  const handleDns = async () => {
    if (!domain) return;
    setLoadingDns(true);
    setDnsResult(null);
    try {
      const res = await fetch(`/api/osint/dns?q=${domain}`);
      const json = await res.json();
      setDnsResult(json.data || "Error fetching DNS records");
      setActiveTab('dns');
    } catch {
      setDnsResult("Error connecting to server");
    } finally {
      setLoadingDns(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'whois'|'dns'>('whois');

  return (
    <div className="flex flex-col h-full bg-neutral-900 border-x border-neutral-900">
      <div className="p-6 border-b border-neutral-800">
        <h2 className="text-xl font-bold flex items-center mb-2">
          <Globe className="w-5 h-5 mr-2 text-rose-500" /> Domain & DNS Intel
        </h2>
        <p className="text-sm text-neutral-400">DNS lookup and WHOIS domain registration info.</p>
      </div>

      <div className="p-6">
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="Enter domain (e.g., google.com)"
              className="w-full bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 font-mono text-sm"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleWhois}
              disabled={loadingWhois || !domain}
              className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loadingWhois ? '...' : 'WHOIS'}
            </button>
            <button
              onClick={handleDns}
              disabled={loadingDns || !domain}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loadingDns ? '...' : 'DNS Scan'}
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="mt-4">
          <div className="flex space-x-4 border-b border-neutral-800 mb-4">
            <button 
              className={`pb-2 text-sm font-medium ${activeTab === 'whois' ? 'text-rose-500 border-b-2 border-rose-500' : 'text-neutral-500 hover:text-neutral-300'}`}
              onClick={() => setActiveTab('whois')}
            >WHOIS Data</button>
            <button 
              className={`pb-2 text-sm font-medium ${activeTab === 'dns' ? 'text-rose-500 border-b-2 border-rose-500' : 'text-neutral-500 hover:text-neutral-300'}`}
              onClick={() => setActiveTab('dns')}
            >DNS Records</button>
          </div>

          <div className="relative">
            {activeTab === 'whois' && whoisResult && (
              <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-4 max-h-[400px] overflow-y-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {whoisResult}
              </div>
            )}
            
            {activeTab === 'dns' && dnsResult && (
              <div className="bg-neutral-950 rounded-lg border border-neutral-800 p-4 max-h-[400px] overflow-y-auto font-mono text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {dnsResult}
              </div>
            )}

            {activeTab === 'whois' && !whoisResult && !loadingWhois && (
               <div className="text-center py-12 text-neutral-600 text-sm flex flex-col items-center">
                 <AlignLeft className="w-8 h-8 mb-2 opacity-50" />
                 Enter a domain and run WHOIS lookup to see results
               </div>
            )}
            {activeTab === 'dns' && !dnsResult && !loadingDns && (
               <div className="text-center py-12 text-neutral-600 text-sm flex flex-col items-center">
                 <AlignLeft className="w-8 h-8 mb-2 opacity-50" />
                 Enter a domain and run DNS scan to see results
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
