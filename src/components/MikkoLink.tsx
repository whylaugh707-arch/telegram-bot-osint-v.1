import React, { useState } from 'react';
import { Shield, Link, Activity, Search, ShieldAlert, ShieldCheck, Globe, Server, Info, AlertTriangle } from 'lucide-react';

export default function MikkoLink() {
  const [targetUrl, setTargetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  const analyzeUrl = async () => {
    if (!targetUrl) return;
    setLoading(true);
    setError('');
    setResults(null);
    
    try {
      let urlStr = targetUrl;
      // Add protocol if missing for parsing
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = 'https://' + urlStr;
      }
      
      const urlObj = new URL(urlStr);
      const domain = urlObj.hostname;

      // Parallel fetch to existing OSINT endpoints
      const [ipRes, whoisRes, dnsRes] = await Promise.allSettled([
        fetch(`/api/osint/ip?ip=${domain}`).then(r => r.json()),
        fetch(`/api/osint/whois?domain=${domain}`).then(r => r.json()),
        fetch(`/api/osint/dns?domain=${domain}`).then(r => r.json())
      ]);

      const ipData = ipRes.status === 'fulfilled' ? ipRes.value : null;
      const whoisData = whoisRes.status === 'fulfilled' ? whoisRes.value : null;
      const dnsData = dnsRes.status === 'fulfilled' ? dnsRes.value : null;

      // Extract details safely
      const creationDate = whoisData?.creation_date || whoisData?.created_date || null;
      let ageDays = -1;
      if (creationDate) {
        const diff = new Date().getTime() - new Date(creationDate).getTime();
        ageDays = Math.floor(diff / (1000 * 3600 * 24));
      }

      const riskScore = calculateRisk(urlStr, ageDays, ipData);

      setResults({
        originalUrl: targetUrl,
        domain,
        protocol: urlObj.protocol.replace(':', ''),
        ipData: ipData?.status === 'success' ? ipData : null,
        ageDays,
        riskScore,
        dnsRecords: dnsData?.records ? Object.keys(dnsData.records).length : 0
      });

    } catch (err: any) {
      setError(err.message || 'Failed to parse or analyze URL. Ensure it is a valid link.');
    } finally {
      setLoading(false);
    }
  };

  const calculateRisk = (url: string, ageDays: number, ipData: any) => {
    let score = 0;
    let reasons = [];

    if (url.startsWith('http://')) {
      score += 30;
      reasons.push('Unencrypted protocol (HTTP)');
    }
    
    if (ageDays > -1 && ageDays < 30) {
      score += 40;
      reasons.push(`Domain is highly new (${ageDays} days old)`);
    } else if (ageDays > -1 && ageDays < 180) {
      score += 20;
      reasons.push(`Domain is relatively new`);
    }

    if (ipData?.proxy || ipData?.hosting) {
      score += 20;
      reasons.push('Hosted on VPN/Proxy or Cloud Server masking');
    }

    const tld = url.split('/')[2]?.split('.').pop()?.toLowerCase();
    if (['xyz', 'top', 'pw', 'cc', 'ru', 'tk'].includes(tld || '')) {
      score += 25;
      reasons.push(`Suspicious TLD (.${tld})`);
    }

    return { 
      level: score >= 60 ? 'CRITICAL' : score >= 30 ? 'ELEVATED' : 'SAFE', 
      score: Math.min(score, 100), 
      reasons: reasons.length ? reasons : ['No immediate threat signatures detected'] 
    };
  };

  return (
    <div className="flex flex-col h-full bg-[#030508] text-[#00f3ff] font-serif">
      <div className="p-6 border-b border-[#00f3ff]/20 bg-[#00f3ff]/5">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold flex items-center tracking-tighter text-white">
            <Search className="w-6 h-6 mr-3 text-[#00f3ff]" /> MIKKO_URL_SANDBOX
          </h2>
          <span className="text-[10px] font-bold px-2 py-1 border border-[#00f3ff]/30 text-[#00f3ff]/60 uppercase">Defensive Module</span>
        </div>
        <p className="text-xs text-[#00f3ff]/60 uppercase tracking-widest leading-relaxed">
          Deep Link Inspection. Uncover target host routing, domain forensic age, and geographic masking anomalies without executing the payload.
        </p>
      </div>

      <div className="p-6 overflow-y-auto space-y-6">
        
        {/* Input Scope */}
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[#00f3ff]/60 mb-2 uppercase tracking-widest">Suspicious Target URL</label>
            <div className="flex">
              <input 
                type="text" 
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyzeUrl()}
                placeholder="e.g., http://free-nitro-discord-gift.xyz/claim"
                className="flex-1 bg-black border border-[#00f3ff]/20 text-[#00f3ff] rounded-l px-4 py-3 focus:outline-none focus:border-[#00f3ff]/60 text-sm font-mono placeholder:text-[#00f3ff]/20"
              />
              <button
                onClick={analyzeUrl}
                disabled={loading || !targetUrl}
                className="px-6 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 border border-l-0 border-[#00f3ff]/20 text-[#00f3ff] font-bold text-xs uppercase tracking-widest rounded-r transition-all disabled:opacity-50"
              >
                {loading ? <Activity className="w-4 h-4 animate-spin" /> : 'ANALYZE'}
              </button>
            </div>
            {error && <p className="text-red-500 text-[10px] mt-2 uppercase tracking-wide">Error: {error}</p>}
          </div>
        </div>

        {/* Results Stream */}
        {results && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300">
            
            {/* Left Column: Risk Engine */}
            <div className="space-y-6">
              <div className={`p-5 rounded border ${results.riskScore.level === 'CRITICAL' ? 'border-red-500/40 bg-red-500/5' : results.riskScore.level === 'ELEVATED' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-green-500/40 bg-green-500/5'}`}>
                <div className="flex items-center space-x-3 mb-4">
                  {results.riskScore.level === 'CRITICAL' ? <ShieldAlert className="w-8 h-8 text-red-500" /> : 
                   results.riskScore.level === 'ELEVATED' ? <AlertTriangle className="w-8 h-8 text-yellow-500" /> : 
                   <ShieldCheck className="w-8 h-8 text-green-500" />}
                  <div>
                    <h3 className={`text-xl font-bold tracking-widest ${results.riskScore.level === 'CRITICAL' ? 'text-red-500' : results.riskScore.level === 'ELEVATED' ? 'text-yellow-500' : 'text-green-500'}`}>
                      {results.riskScore.level}
                    </h3>
                    <p className="text-[10px] uppercase font-mono bg-black/40 px-2 py-0.5 mt-1 rounded text-white/60">Risk Score: {results.riskScore.score}/100</p>
                  </div>
                </div>
                
                <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
                  <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Threat Indication Flags:</div>
                  {results.riskScore.reasons.map((r: string, i: number) => (
                    <div key={i} className="flex items-start space-x-2 text-xs font-mono">
                      <span className={results.riskScore.level === 'SAFE' ? 'text-green-500/60' : 'text-[#00f3ff]/60'}>{'>'}</span>
                      <span className="text-white/80">{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-black border border-[#00f3ff]/10 rounded font-mono text-xs space-y-3">
                <div className="flex items-center space-x-2 text-[#00f3ff]/50 mb-2 border-b border-[#00f3ff]/10 pb-2">
                  <Link className="w-4 h-4" />
                  <span className="uppercase tracking-widest text-[10px] font-bold">Protocol Breakdown</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <span className="text-white/40">Domain:</span>
                  <span className="text-[#00f3ff] truncate">{results.domain}</span>
                  <span className="text-white/40">Protocol:</span>
                  <span className="text-white uppercase">{results.protocol}</span>
                  <span className="text-white/40">DNS Records (Est):</span>
                  <span className="text-white">{results.dnsRecords} sets found</span>
                </div>
              </div>
            </div>

            {/* Right Column: Infrastructure Recon */}
            <div className="space-y-6">
              <div className="p-4 bg-black border border-[#00f3ff]/10 rounded font-mono text-xs h-full">
                <div className="flex items-center space-x-2 text-[#00f3ff]/50 mb-4 border-b border-[#00f3ff]/10 pb-2">
                  <Globe className="w-4 h-4" />
                  <span className="uppercase tracking-widest text-[10px] font-bold">Infrastructure Routing</span>
                </div>
                
                {results.ipData ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="text-[9px] text-white/40 uppercase tracking-widest">Public Server IP</div>
                      <div className="text-sm font-bold text-emerald-400">{results.ipData.query}</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px]">
                      <div>
                        <div className="text-white/40 mb-0.5">ISP / Host</div>
                        <div className="text-white leading-tight">{results.ipData.isp || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-white/40 mb-0.5">Provider AS</div>
                        <div className="text-white leading-tight truncate">{results.ipData.as || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-white/40 mb-0.5">Location</div>
                        <div className="text-white leading-tight">{results.ipData.city}, {results.ipData.country}</div>
                      </div>
                      <div>
                        <div className="text-white/40 mb-0.5">Network Type</div>
                        <div className="text-white leading-tight">{results.ipData.hosting ? 'Data Center / Cloud' : 'Standard IP'}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-white/20">
                     <Server className="w-8 h-8 mb-2 opacity-50" />
                     <span className="text-[10px] uppercase">Could not resolve routing</span>
                  </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-[#00f3ff]/10">
                  <div className="flex items-center space-x-2 text-white/40 mb-2">
                    <Info className="w-3.5 h-3.5" />
                    <span className="text-[9px] uppercase tracking-widest">WHOIS Registry Recon</span>
                  </div>
                  {results.ageDays > -1 ? (
                    <div className="text-[10px] text-white/70">
                      Domain was registered exactly <span className="text-[#00f3ff] font-bold">{results.ageDays}</span> days ago.
                    </div>
                  ) : (
                    <div className="text-[10px] text-white/30">WHOIS masking active. Registration shielded.</div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

