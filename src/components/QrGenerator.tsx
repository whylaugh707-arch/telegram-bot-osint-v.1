import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QrCode, Copy, Check } from 'lucide-react';

export default function QrGenerator() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950 border border-[#38bdf8]/20 rounded p-6 space-y-4">
      <h3 className="text-sm font-bold text-[#38bdf8] flex items-center mb-4 tracking-widest uppercase">
        <QrCode className="w-4 h-4 mr-2" /> QR_GENERATOR
      </h3>
      
      <div className="space-y-4">
        <input 
          type="text" 
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste LINK here..."
          className="w-full bg-slate-950 border border-[#38bdf8]/20 text-[#38bdf8] rounded px-4 py-2 text-sm font-display placeholder:text-[#38bdf8]/20 focus:outline-none focus:border-[#38bdf8]/60"
        />
        
        {url && (
          <div className="flex flex-col items-center pt-4">
            <div className="p-2 bg-white rounded">
              <QRCodeCanvas value={url} size={160} bgColor="#ffffff" fgColor="#000000" />
            </div>
            
            <button 
              onClick={copyToClipboard}
              className="mt-4 flex items-center space-x-2 text-[10px] uppercase font-bold text-[#38bdf8] hover:text-[#38bdf8]/70"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'COPIED' : 'COPY_LINK'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
