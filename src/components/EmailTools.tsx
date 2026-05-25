import React, { useState } from 'react';
import { Mail, Search, CheckCircle2, XCircle } from 'lucide-react';

export default function EmailTools() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/osint/email?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-[#38bdf8]">
      <div className="p-6 border-b border-[#38bdf8]/20 bg-[#38bdf8]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter">
          <Mail className="w-5 h-5 mr-3 text-[#38bdf8]" /> SMTP_AUDIT
        </h2>
        <p className="text-xs text-[#38bdf8]/60 uppercase tracking-widest">Validate email syntax and audit MX grid records for deliverability.</p>
      </div>

      <div className="p-6 overflow-y-auto">
         <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#38bdf8]/40" />
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="TARGET_EMAIL_ADDR"
              className="w-full bg-slate-950 border border-[#38bdf8]/20 text-[#38bdf8] rounded pl-10 pr-4 py-2.5 focus:outline-none focus:border-[#38bdf8]/60 focus:ring-1 focus:ring-[#38bdf8]/40 font-display text-sm placeholder:text-[#38bdf8]/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="px-6 py-2.5 bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-black font-bold text-xs uppercase tracking-tighter disabled:opacity-30 transition-all active:scale-95"
          >
            {loading ? 'AUDITING...' : 'START_AUDIT'}
          </button>
        </form>

        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 border border-[#38bdf8]/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#38bdf8]/40 mb-1 font-bold uppercase tracking-widest">SYNTAX_STATUS</div>
                  <div className="font-display text-sm text-[#38bdf8] font-bold">{result.validFormat ? 'VALID_REGISTRY' : 'MALFORMED_DATA'}</div>
                </div>
                {result.validFormat ? <CheckCircle2 className="text-[#38bdf8] w-5 h-5" /> : <XCircle className="text-red-500 w-5 h-5" />}
              </div>
              <div className="p-4 bg-slate-950 border border-[#38bdf8]/10 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#38bdf8]/40 mb-1 font-bold uppercase tracking-widest">GRID_RECEPTION</div>
                  <div className="font-display text-sm text-[#38bdf8] font-bold">{result.mxRecords && result.mxRecords.length > 0 ? 'STATUS_ACTIVE' : 'STATUS_NULL'}</div>
                </div>
                {result.mxRecords && result.mxRecords.length > 0 ? <CheckCircle2 className="text-[#38bdf8] w-5 h-5" /> : <XCircle className="text-red-500 w-5 h-5" />}
              </div>
            </div>

            {result.mxRecords && result.mxRecords.length > 0 && (
              <div>
                 <h3 className="font-display text-[10px] font-bold text-[#38bdf8]/40 uppercase tracking-[0.3em] mb-4 border-b border-[#38bdf8]/10 pb-2">MX_REGISTRY_MANIFEST: {result.domain}</h3>
                 <div className="bg-slate-950/50 border border-[#38bdf8]/20 overflow-hidden shadow-[inset_0_0_20px_rgba(0,255,0,0.05)]">
                   <table className="w-full text-left text-sm font-display">
                     <thead className="bg-[#38bdf8]/5 border-b border-[#38bdf8]/10">
                       <tr>
                         <th className="px-4 py-3 text-[#38bdf8]/60 font-bold text-[10px] uppercase tracking-widest">PRIORITY</th>
                         <th className="px-4 py-3 text-[#38bdf8]/60 font-bold text-[10px] uppercase tracking-widest">EXCHANGE_NODE</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-[#38bdf8]/5">
                       {result.mxRecords.map((mx: any, idx: number) => (
                         <tr key={idx} className="hover:bg-[#38bdf8]/5 transition-colors">
                           <td className="px-4 py-3 text-xs opacity-60">{mx.priority}</td>
                           <td className="px-4 py-3 text-xs text-[#38bdf8] font-bold">{mx.exchange}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </div>
            )}
            
            {result.error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-display uppercase tracking-[0.2em] space-y-1">
                 <div className="font-bold">CRITICAL_AUDIT_FAIL:</div>
                 <div className="opacity-80">{result.message}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
