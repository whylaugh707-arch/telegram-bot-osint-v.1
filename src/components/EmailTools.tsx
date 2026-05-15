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
    <div className="flex flex-col h-full bg-neutral-900 border-x border-neutral-900">
      <div className="p-6 border-b border-neutral-800">
        <h2 className="text-xl font-bold flex items-center mb-2">
          <Mail className="w-5 h-5 mr-2 text-rose-500" /> Email Intelligence
        </h2>
        <p className="text-sm text-neutral-400">Validate email syntax and check MX records for deliverability.</p>
      </div>

      <div className="p-6">
         <form onSubmit={handleSearch} className="flex space-x-3 mb-8">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter email address (e.g., target@example.com)"
              className="w-full bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 font-mono text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Scanning...' : 'Verify'}
          </button>
        </form>

        {result && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Syntax Validation</div>
                  <div className="font-mono text-sm">{result.validFormat ? 'Valid Format' : 'Invalid Format'}</div>
                </div>
                {result.validFormat ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-red-500" />}
              </div>
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">MX Records (Domain Active)</div>
                  <div className="font-mono text-sm">{result.mxRecords && result.mxRecords.length > 0 ? 'Receiving Emails' : 'No MX Records'}</div>
                </div>
                {result.mxRecords && result.mxRecords.length > 0 ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-red-500" />}
              </div>
            </div>

            {result.mxRecords && result.mxRecords.length > 0 && (
              <div>
                 <h3 className="font-mono text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">MX RECORDS FOUND FOR {result.domain}</h3>
                 <div className="bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                   <table className="w-full text-left text-sm font-mono">
                     <thead className="bg-neutral-900 border-b border-neutral-800">
                       <tr>
                         <th className="px-4 py-3 text-neutral-400 font-medium font-sans text-xs">Priority</th>
                         <th className="px-4 py-3 text-neutral-400 font-medium font-sans text-xs">Exchange Server</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-neutral-800/50">
                       {result.mxRecords.map((mx: any, idx: number) => (
                         <tr key={idx} className="hover:bg-neutral-900/50">
                           <td className="px-4 py-3">{mx.priority}</td>
                           <td className="px-4 py-3 text-emerald-400">{mx.exchange}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </div>
            )}
            
            {result.error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-mono flex flex-col gap-1">
                 <strong>Error checking records:</strong>
                 <span>{result.message}</span>
                 <span className="text-xs opacity-70">{result.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
