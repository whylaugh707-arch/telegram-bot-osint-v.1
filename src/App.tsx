import React, { useState } from 'react';
import { Fingerprint, Network, Globe, Mail, UserSearch, ShieldAlert, Cpu, Zap, Activity, BookOpen, QrCode, Shield, Skull, Smartphone } from 'lucide-react';
import IpTools from './components/IpTools';
import DomainTools from './components/DomainTools';
import EmailTools from './components/EmailTools';
import SocialScanner from './components/SocialScanner';
import StealthLogger from './components/StealthLogger';
import IndoOsint from './components/IndoOsint';
import DorkGenerator from './components/DorkGenerator';
import QrGenerator from './components/QrGenerator';
import SantoPetrus from './components/SantoPetrus';
import MikkoApk from './components/MikkoApk';

import IntelligencePlatform from './components/IntelligencePlatform';

type Tab = 'intelligence' | 'social' | 'ip' | 'domain' | 'email' | 'logger' | 'indo' | 'dork' | 'qr' | 'santopetrus' | 'mikkoapk';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('intelligence');

  return (
    <div className="min-h-screen bg-[#020205] text-[#38bdf8] font-display selection:bg-[#38bdf8]/30 selection:text-black">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(10,12,24,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(56,189,248,0.03),rgba(56,189,248,0.01),rgba(56,189,248,0.03))] bg-[length:100%_2px,3px_100%] opacity-20"></div>
      
      {/* Navbar */}
      <header className="border-b border-[#38bdf8]/20 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded border border-[#38bdf8]/40 flex items-center justify-center bg-[#38bdf8]/5 group hover:bg-[#38bdf8]/20 transition-all">
              <ShieldAlert className="w-6 h-6 text-[#38bdf8] animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-[0.2em] uppercase text-white">
                TRIHEXA<span className="text-[#38bdf8]/60">_HUB</span>
              </h1>
              <div className="text-[10px] text-[#38bdf8]/40 flex items-center space-x-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#38bdf8] animate-ping"></span>
                <span>Intelligence Dashboard</span>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex items-center space-x-6 text-[10px] tracking-widest text-[#38bdf8]/60">
            <div className="flex flex-col items-end border-r border-[#38bdf8]/20 pr-6">
              <span>UPLINK: <span className="text-[#38bdf8]">STABLE</span></span>
              <span>ENCRYPTION: <span className="text-[#38bdf8]">AES-256</span></span>
            </div>
            <div className="flex flex-col items-end">
              <span>LATENCY: <span className="text-[#38bdf8]">14MS</span></span>
              <span>ENTITY: <span className="text-[#38bdf8]">ANONYMOUS</span></span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-3 space-y-1">
          <div className="mb-6 px-4 py-2 bg-[#38bdf8]/10 border-l-4 border-[#38bdf8] text-[11px] font-bold tracking-tighter">
            Core Modules
          </div>
          <NavButton 
            active={activeTab === 'intelligence'} 
            onClick={() => setActiveTab('intelligence')} 
            icon={<Network className="w-4 h-4" />} 
            label="Intelligence Engine" 
          />
          <NavButton 
            active={activeTab === 'social'} 
            onClick={() => setActiveTab('social')} 
            icon={<UserSearch className="w-4 h-4" />} 
            label="Global Scanner" 
          />
          <NavButton 
            active={activeTab === 'indo'} 
            onClick={() => setActiveTab('indo')} 
            icon={<Fingerprint className="w-4 h-4" />} 
            label="Indo OSINT" 
          />
          <NavButton 
            active={activeTab === 'ip'} 
            onClick={() => setActiveTab('ip')} 
            icon={<Activity className="w-4 h-4" />} 
            label="Network Intel" 
          />
          <NavButton 
            active={activeTab === 'domain'} 
            onClick={() => setActiveTab('domain')} 
            icon={<Globe className="w-4 h-4" />} 
            label="DNS Forensics" 
          />
          <NavButton 
            active={activeTab === 'email'} 
            onClick={() => setActiveTab('email')} 
            icon={<Mail className="w-4 h-4" />} 
            label="SMTP Audit" 
          />
          <NavButton 
            active={activeTab === 'dork'} 
            onClick={() => setActiveTab('dork')} 
            icon={<BookOpen className="w-4 h-4" />} 
            label="Dork Engine" 
          />
          
          <div className="mt-8 mb-4 px-4 py-2 bg-[#38bdf8]/10 border-l-4 border-[#38bdf8] text-[11px] font-bold tracking-tighter">
            Stealth Tools
          </div>
          <NavButton 
            active={activeTab === 'logger'} 
            onClick={() => setActiveTab('logger')} 
            icon={<Zap className="w-4 h-4" />} 
            label="Stealth Logger" 
          />
          <NavButton 
            active={activeTab === 'qr'} 
            onClick={() => setActiveTab('qr')} 
            icon={<QrCode className="w-4 h-4" />} 
            label="QR Generator" 
          />
          <NavButton 
            active={activeTab === 'santopetrus'} 
            onClick={() => setActiveTab('santopetrus')} 
            icon={<Skull className="w-4 h-4 text-[#ef4444]" />} 
            label="SANTO_PETRUS" 
          />
          <NavButton 
            active={activeTab === 'mikkoapk'} 
            onClick={() => setActiveTab('mikkoapk')} 
            icon={<Smartphone className="w-4 h-4 text-[#a855f7]" />} 
            label="MIKKO_APK" 
          />
          
          <div className="mt-8 mb-6 px-4 py-2 bg-[#ef4444]/10 border-l-4 border-[#ef4444] text-[11px] font-bold tracking-tighter text-[#ef4444]">
            System Status
          </div>
          <div className="px-4 py-3 border border-[#38bdf8]/10 bg-[#38bdf8]/5 rounded text-[10px] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#38bdf8]/40 text-xs">CPU_LOAD</span>
              <span>12.4%</span>
            </div>
            <div className="w-full bg-[#38bdf8]/10 h-1 rounded overflow-hidden">
              <div className="bg-[#38bdf8] h-full w-[12.4%]"></div>
            </div>
            <div className="flex justify-between mt-4">
              <span className="text-[#38bdf8]/40 text-xs">MEM_USE</span>
              <span>442MB</span>
            </div>
            <div className="w-full bg-[#38bdf8]/10 h-1 rounded overflow-hidden">
              <div className="bg-[#38bdf8] h-full w-[40%]"></div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="md:col-span-9">
          <div className="bg-slate-950/40 backdrop-blur border border-[#38bdf8]/30 rounded shadow-[0_0_50px_rgba(56,189,248,0.08)] relative min-h-[700px]">
            {/* Terminal Window Header */}
            <div className="bg-[#38bdf8]/10 border-b border-[#38bdf8]/20 px-4 py-2 flex items-center justify-between">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              </div>
              <div className="text-[10px] text-[#38bdf8]/70 tracking-widest opacity-80 uppercase font-bold">
                {activeTab}_PROTOCOL_INTERFACE
              </div>
              <div className="w-12"></div>
            </div>

            <div className="p-0 h-full overflow-hidden">
              {activeTab === 'intelligence' && <IntelligencePlatform />}
              {activeTab === 'social' && <SocialScanner />}
              {activeTab === 'indo' && <IndoOsint />}
              {activeTab === 'ip' && <IpTools />}
              {activeTab === 'domain' && <DomainTools />}
              {activeTab === 'email' && <EmailTools />}
              {activeTab === 'dork' && <DorkGenerator />}
              {activeTab === 'logger' && <StealthLogger />}
              {activeTab === 'qr' && <QrGenerator />}
              {activeTab === 'santopetrus' && <SantoPetrus />}
              {activeTab === 'mikkoapk' && <MikkoApk />}
            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-4 px-4 py-3 transition-all duration-200 border-l-2 ${
        active 
          ? 'bg-[#38bdf8]/10 text-white border-[#38bdf8] shadow-[inset_4px_0_0_0_#38bdf8]' 
          : 'text-[#38bdf8]/40 hover:text-[#38bdf8]/70 hover:bg-[#38bdf8]/5 border-transparent'
      }`}
    >
      <span className={active ? 'text-[#38bdf8]' : ''}>{icon}</span>
      <span className="text-[11px] font-bold tracking-[0.2em] font-display">{label}</span>
      {active && <div className="ml-auto text-[10px] text-[#38bdf8] animate-pulse"> Active</div>}
    </button>
  );
}

