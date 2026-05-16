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
    <div className="flex flex-col h-full bg-black text-[#00ff00]">
      <div className="p-6 border-b border-[#00ff00]/20 bg-[#00ff00]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter">
          <Globe className="w-5 h-5 mr-3 text-[#00ff00]" /> DOMAIN_INTEL
        </h2>
        <p className="text-xs text-[#00ff00]/60 uppercase tracking-widest">Cross-grid DNS lookup and WHOIS domain registration auditing.</p>
      </div>

      <div className="p-6 overflow-y-auto">
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff00]/40" />
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="TARGET_DOMAIN"
              className="w-full bg-black border border-[#00ff00]/20 text-[#00ff00] rounded pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#00ff00]/60 focus:ring-1 focus:ring-[#00ff00]/40 font-mono text-sm placeholder:text-[#00ff00]/20"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleWhois}
              disabled={loadingWhois || !domain}
              className="px-4 py-2.5 border border-[#00ff00]/20 hover:bg-[#00ff00]/10 text-[#00ff00] font-bold text-xs uppercase tracking-tighter disabled:opacity-30 transition-all active:scale-95"
            >
              {loadingWhois ? 'BUSY...' : 'WHOIS'}
            </button>
            <button
              onClick={handleDns}
              disabled={loadingDns || !domain}
              className="px-6 py-2.5 bg-[#00ff00] hover:bg-[#00ff00]/80 text-black font-bold text-xs uppercase tracking-tighter disabled:opacity-30 transition-all active:scale-95"
            >
              {loadingDns ? 'BUSY...' : 'DNS_SCAN'}
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex space-x-8 border-b border-[#00ff00]/10 mb-6">
            <button 
              className={`pb-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-all ${activeTab === 'whois' ? 'text-[#00ff00] border-b border-[#00ff00]' : 'text-[#00ff00]/40 hover:text-[#00ff00]'}`}
              onClick={() => setActiveTab('whois')}
            >WHOIS_MANIFEST</button>
            <button 
              className={`pb-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-all ${activeTab === 'dns' ? 'text-[#00ff00] border-b border-[#00ff00]' : 'text-[#00ff00]/40 hover:text-[#00ff00]'}`}
              onClick={() => setActiveTab('dns')}
            >DNS_REGISTRY</button>
          </div>

          <div className="relative">
            {activeTab === 'whois' && whoisResult && (
              <div className="bg-black/50 rounded border border-[#00ff00]/20 p-6 max-h-[450px] overflow-y-auto font-mono text-xs text-[#00ff00]/80 whitespace-pre-wrap leading-relaxed shadow-[inset_0_0_20px_rgba(0,255,0,0.05)]">
                {whoisResult}
              </div>
            )}
            
            {activeTab === 'dns' && dnsResult && (
              <div className="bg-black/50 rounded border border-[#00ff00]/20 p-6 max-h-[450px] overflow-y-auto font-mono text-xs text-[#00ff00]/80 whitespace-pre-wrap leading-relaxed shadow-[inset_0_0_20px_rgba(0,255,0,0.05)]">
                {dnsResult}
              </div>
            )}

            {activeTab === 'whois' && !whoisResult && !loadingWhois && (
               <div className="text-center py-20 text-[#00ff00]/20 text-[10px] uppercase tracking-[0.3em] flex flex-col items-center">
                 <AlignLeft className="w-10 h-10 mb-4 opacity-20 animate-pulse" />
                 Awaiting target domain...
               </div>
            )}
            {activeTab === 'dns' && !dnsResult && !loadingDns && (
               <div className="text-center py-20 text-[#00ff00]/20 text-[10px] uppercase tracking-[0.3em] flex flex-col items-center">
                 <AlignLeft className="w-10 h-10 mb-4 opacity-20 animate-pulse" />
                 DNS grid query pending
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
