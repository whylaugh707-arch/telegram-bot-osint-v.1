import React, { useState } from 'react';
import { Fingerprint, Car, Phone, Search, Info, AlertTriangle } from 'lucide-react';

export default function IndoOsint() {
  const [nik, setNik] = useState('');
  const [plat, setPlat] = useState('');
  const [phone, setPhone] = useState('');
  
  const [nikResult, setNikResult] = useState<any>(null);
  const [platResult, setPlatResult] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleNikSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nik || nik.length !== 16) return;
    setLoading('nik');
    try {
      const res = await fetch(`/api/osint/nik?nik=${nik}`);
      const data = await res.json();
      setNikResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handlePlatSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plat) return;
    setLoading('plat');
    try {
      const res = await fetch(`/api/osint/plat?plat=${plat}`);
      const data = await res.json();
      setPlatResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handlePhoneDork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}`;
    const trueCallerUrl = `https://www.truecaller.com/search/id/${cleanPhone}`;
    window.open(waUrl, '_blank');
    window.open(trueCallerUrl, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-black font-serif">
      <div className="p-6 border-b border-[#00ff00]/20 bg-[#00ff00]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter uppercase">
          <Fingerprint className="w-5 h-5 mr-3 text-[#00ff00]" /> Indo_Osint_Module
        </h2>
        <p className="text-[10px] text-[#00ff00]/60 uppercase tracking-[0.2em]">Targeting Indonesian local data grids: NIK, License Plates, and Telecom Dorks.</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-8">
        {/* NIK DECODER */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#00ff00]/80">
            <Fingerprint className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">NIK_DECODER (16-DIGIT)</h3>
          </div>
          <form onSubmit={handleNikSearch} className="flex space-x-2">
            <input
              type="text"
              value={nik}
              onChange={e => setNik(e.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
              placeholder="320xxxxxxxxxxxxx"
              className="flex-1 bg-black border border-[#00ff00]/20 text-[#00ff00] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#00ff00]/60 font-serif"
            />
            <button 
              disabled={loading === 'nik' || nik.length !== 16}
              className="bg-[#00ff00] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter disabled:opacity-20"
            >
              {loading === 'nik' ? 'WAIT...' : 'DECODE'}
            </button>
          </form>

          {nikResult && !nikResult.error && (
            <div className="p-4 border border-[#00ff00]/30 bg-[#00ff00]/5 flex flex-col space-y-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-2 gap-4">
                 <DataField label="IDENT_SEX" value={nikResult.gender} />
                 <DataField label="IDENT_BORN" value={nikResult.birthDate} />
                 <DataField label="LOCAL_PROV" value={nikResult.province} />
                 <DataField label="LOCAL_SEQ" value={nikResult.sequence} />
              </div>
            </div>
          )}
        </section>

        {/* LICENSE PLATE */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#00ff00]/80">
            <Car className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">PLATE_ANALYZER</h3>
          </div>
          <form onSubmit={handlePlatSearch} className="flex space-x-2">
            <input
              type="text"
              value={plat}
              onChange={e => setPlat(e.target.value.toUpperCase())}
              placeholder="B 1234 ABC"
              className="flex-1 bg-black border border-[#00ff00]/20 text-[#00ff00] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#00ff00]/60 font-serif"
            />
            <button 
              disabled={loading === 'plat' || !plat}
              className="bg-[#00ff00] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter disabled:opacity-20"
            >
              {loading === 'plat' ? 'WAIT...' : 'TRACE'}
            </button>
          </form>

          {platResult && !platResult.error && (
            <div className="p-4 border border-[#00ff00]/30 bg-[#00ff00]/5 animate-in fade-in zoom-in-95 duration-300">
               <DataField label="REG_REGION" value={platResult.region} />
               <div className="mt-2 text-[10px] text-[#00ff00]/40">ORIGIN_CODE: {platResult.code}</div>
            </div>
          )}
        </section>

        {/* PHONE DORK */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#00ff00]/80">
            <Phone className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">TELECOM_DORKER</h3>
          </div>
          <form onSubmit={handlePhoneDork} className="flex space-x-2">
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0812xxxxxxxx"
              className="flex-1 bg-black border border-[#00ff00]/20 text-[#00ff00] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#00ff00]/60 font-serif"
            />
            <button 
              className="bg-[#00ff00] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter"
            >
              LAUNCH_WEB
            </button>
          </form>
          <div className="text-[9px] text-[#00ff00]/40 flex items-start space-x-2">
            <Info className="w-3 h-3 mt-0.5" />
            <span>Clicking launch will open specialized OSINT web endpoints (WhatsApp & TrueCaller) in new buffers.</span>
          </div>
        </section>

        <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500/80 text-[10px] flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p>WARNING: LOCAL DATA GRIDS ARE SUBJECT TO PROVIDER LATENCY. SOME DATA MAY BE OBSOLETE OR CACHED BY INTERMEDIATE RELAYS.</p>
        </div>
      </div>
    </div>
  );
}

function DataField({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <div className="text-[8px] text-[#00ff00]/40 font-bold uppercase tracking-widest">{label}</div>
      <div className="text-sm text-[#00ff00] font-bold">{value}</div>
    </div>
  );
}
