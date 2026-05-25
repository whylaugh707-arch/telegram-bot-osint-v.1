import React, { useState } from 'react';
import { Fingerprint, Car, Phone, Search, Info, AlertTriangle } from 'lucide-react';

export default function IndoOsint() {
  const [nik, setNik] = useState('');
  const [plat, setPlat] = useState('');
  const [phone, setPhone] = useState('');
  
  const [nikResult, setNikResult] = useState<any>(null);
  const [platResult, setPlatResult] = useState<any>(null);
  const [phoneResult, setPhoneResult] = useState<any>(null);
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
    setLoading('phone');
    
    setTimeout(() => {
      const cleanPhone = phone.replace(/\D/g, '');
      const numID = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
      
      // lookup prefix
      let prefix = "";
      if (cleanPhone.startsWith('628')) {
        prefix = '08' + cleanPhone.substring(3, 5);
      } else if (cleanPhone.startsWith('08')) {
        prefix = cleanPhone.substring(0, 4);
      } else if (cleanPhone.startsWith('8')) {
        prefix = '08' + cleanPhone.substring(1, 3);
      }

      const telkomsel = ["0811", "0812", "0813", "0821", "0822", "0823", "0851", "0852", "0853"];
      const indosat = ["0814", "0815", "0816", "0855", "0856", "0857", "0858"];
      const xl = ["0817", "0818", "0819", "0859", "0877", "0878"];
      const axis = ["0831", "0832", "0833", "0838"];
      const tri = ["0895", "0896", "0897", "0898", "0899"];
      const smartfren = ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"];

      let carrier = "Unknown Carrier";
      let brand = "Lokal / Satelit / Internasional";
      let logo = "👤";

      if (telkomsel.includes(prefix)) { carrier = "Telkomsel"; brand = "Loop / Kartu AS / SimPATI / By.U"; logo = "🔴"; }
      else if (indosat.includes(prefix)) { carrier = "Indosat Ooredoo"; brand = "IM3 / Mentari"; logo = "🟡"; }
      else if (xl.includes(prefix)) { carrier = "XL Axiata"; brand = "XL / Prioritas"; logo = "🔵"; }
      else if (axis.includes(prefix)) { carrier = "Axis Axiata"; brand = "Axis"; logo = "🟣"; }
      else if (tri.includes(prefix)) { carrier = "Three (3)"; brand = "Tri"; logo = "🟢"; }
      else if (smartfren.includes(prefix)) { carrier = "Smartfren"; brand = "Smartfren"; logo = "💗"; }

      setPhoneResult({
        number: phone,
        cleanNumber: cleanPhone,
        intlNumber: numID,
        carrier,
        brand,
        logo,
        prefixCode: prefix || "Unknown",
        dorks: [
          { name: "Truecaller Search", desc: "Lookup caller ID & name tag", url: `https://www.truecaller.com/search/global/${numID}`, color: "bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border-blue-600/30" },
          { name: "Direct WhatsApp", desc: "Open instant messaging chat node", url: `https://wa.me/${numID}`, color: "bg-green-600/10 text-green-400 hover:bg-green-600/20 border-green-600/30" },
          { name: "Telegram Check", desc: "Search Telegram custom deep link", url: `https://t.me/+${numID}`, color: "bg-sky-600/10 text-sky-400 hover:bg-sky-600/20 border-sky-600/30" },
          { name: "Database Leaks Scan", desc: "Find username/passwords database matches", url: `https://www.google.com/search?q=%22${phone}%22+OR+%22${numID}%22+AND+(leak+OR+db+OR+dump+OR+password+OR+database)`, color: "bg-red-600/10 text-red-400 hover:bg-red-600/20 border-red-600/30" },
          { name: "Spreadsheet Leaks", desc: "Dork public .xlsx / .pdf participant lists", url: `https://www.google.com/search?q=site:*.id+ext:xlsx+OR+ext:pdf+OR+ext:txt+%22${phone}%22`, color: "bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 border-amber-600/30" },
          { name: "Pastebin Scan", desc: "Dork pastes, logs, config blocks on Pastebin", url: `https://www.google.com/search?q=site:pastebin.com+OR+site:paste.ee+OR+site:ghostbin.co+%22${phone}%22`, color: "bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 border-purple-600/30" },
        ]
      });
      setLoading(null);
    }, 400);
  };

  return (
    <div className="flex flex-col h-full bg-black font-serif">
      <div className="p-6 border-b border-[#38bdf8]/20 bg-[#38bdf8]/5">
        <h2 className="text-xl font-bold flex items-center mb-2 tracking-tighter uppercase text-white">
          <Fingerprint className="w-5 h-5 mr-3 text-[#38bdf8]" /> Indo_Osint_Module
        </h2>
        <p className="text-[10px] text-[#38bdf8]/60 uppercase tracking-[0.2em]">Targeting Indonesian local data grids: NIK, License Plates, and Telecom Dorks.</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-8">
        {/* NIK DECODER */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#38bdf8]/80">
            <Fingerprint className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">NIK_DECODER (16-DIGIT)</h3>
          </div>
          <form onSubmit={handleNikSearch} className="flex space-x-2">
            <input
              type="text"
              value={nik}
              onChange={e => setNik(e.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
              placeholder="320xxxxxxxxxxxxx"
              className="flex-1 bg-black border border-[#38bdf8]/20 text-white rounded px-4 py-2 text-sm focus:outline-none focus:border-[#38bdf8]/60 font-serif"
            />
            <button 
              disabled={loading === 'nik' || nik.length !== 16}
              className="bg-[#38bdf8] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter disabled:opacity-20"
            >
              {loading === 'nik' ? 'WAIT...' : 'DECODE'}
            </button>
          </form>

          {nikResult && !nikResult.error && (
            <div className="p-4 border border-[#38bdf8]/30 bg-[#38bdf8]/5 flex flex-col space-y-2 animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-2 gap-4">
                 <DataField label="IDENT_SEX" value={nikResult.gender} />
                 <DataField label="IDENT_BORN" value={nikResult.birthDate} />
                 <DataField label="LOCAL_PROV" value={nikResult.province} />
                 <DataField label="LOCAL_KAB" value={nikResult.kabupaten || "Unknown"} />
                 <DataField label="LOCAL_KEC" value={nikResult.kecamatan || "Unknown"} />
                 <DataField label="LOCAL_ZIP" value={nikResult.postalCode || "Unknown"} />
                 <DataField label="LOCAL_SEQ" value={nikResult.sequence} />
              </div>
            </div>
          )}
        </section>

        {/* LICENSE PLATE */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#38bdf8]/80">
            <Car className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">PLATE_ANALYZER</h3>
          </div>
          <form onSubmit={handlePlatSearch} className="flex space-x-2">
            <input
              type="text"
              value={plat}
              onChange={e => setPlat(e.target.value.toUpperCase())}
              placeholder="B 1234 ABC"
              className="flex-1 bg-black border border-[#38bdf8]/20 text-white rounded px-4 py-2 text-sm focus:outline-none focus:border-[#38bdf8]/60 font-serif"
            />
            <button 
              disabled={loading === 'plat' || !plat}
              className="bg-[#38bdf8] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter disabled:opacity-20"
            >
              {loading === 'plat' ? 'WAIT...' : 'TRACE'}
            </button>
          </form>

          {platResult && !platResult.error && (
            <div className="p-4 border border-[#38bdf8]/30 bg-[#38bdf8]/5 animate-in fade-in zoom-in-95 duration-300">
               <DataField label="REG_REGION" value={platResult.region} />
               <div className="mt-2 text-[10px] text-[#38bdf8]/40">ORIGIN_CODE: {platResult.code}</div>
            </div>
          )}
        </section>

        {/* PHONE DORK */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-[#38bdf8]/80">
            <Phone className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-widest">ADV_PHONE_OSINT</h3>
          </div>
          <form onSubmit={handlePhoneDork} className="flex space-x-2">
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0812xxxxxxxx atau 628xxxxxxxx"
              className="flex-1 bg-black border border-[#38bdf8]/20 text-white rounded px-4 py-2 text-sm focus:outline-none focus:border-[#38bdf8]/60 font-serif"
            />
            <button 
              disabled={loading === 'phone' || !phone}
              className="bg-[#38bdf8] text-black px-4 py-2 font-bold text-[10px] uppercase tracking-tighter disabled:opacity-20"
            >
              {loading === 'phone' ? 'SCANNING...' : 'INTEL_SCAN'}
            </button>
          </form>

          {phoneResult && (
            <div className="p-4 border border-[#38bdf8]/30 bg-[#38bdf8]/5 space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-[#38bdf8]/20 pb-3">
                <span className="text-lg mr-2">{phoneResult.logo}</span>
                <span className="text-sm font-bold text-[#38bdf8] uppercase tracking-wide">
                  {phoneResult.carrier}
                </span>
                <span className="text-xs text-[#38bdf8]/60 ml-2">
                  ({phoneResult.brand})
                </span>
                <div className="mt-1 text-[10px] text-[#38bdf8]/40">
                  PREFIX_CODE: {phoneResult.prefixCode} • INT_FORMAT: +{phoneResult.intlNumber}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-[#38bdf8]/60 uppercase tracking-widest mb-2 font-bold">
                  KATEGORI INTELLIGENCE SCAN (DORKS)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {phoneResult.dorks.map((dork: any, idx: number) => (
                    <a
                      key={idx}
                      href={dork.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`p-2.5 border rounded flex flex-col justify-between transition-colors bg-black/40 hover:bg-[#38bdf8]/5 border-[#38bdf8]/10 hover:border-[#38bdf8]/30`}
                    >
                      <div>
                        <div className="text-xs font-bold text-[#38bdf8]">
                          {dork.name}
                        </div>
                        <div className="text-[10px] text-[#38bdf8]/60 leading-tight mt-1">
                          {dork.desc}
                        </div>
                      </div>
                      <div className="text-[9px] text-right text-[#38bdf8]/40 mt-1 font-mono">
                        LAUNCH_BUFFER ↗
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="text-[9px] text-[#38bdf8]/40 flex items-start space-x-2">
            <Info className="w-3 h-3 mt-0.5" />
            <span>Masukkan nomor telepon lengkap untuk menganalisis operator telekomunikasi resmi dan menghasilkan dork pencarian data bocor terarah.</span>
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
      <div className="text-[8px] text-[#38bdf8]/40 font-bold uppercase tracking-widest">{label}</div>
      <div className="text-sm text-[#38bdf8] font-bold">{value}</div>
    </div>
  );
}
