import React, { useState } from 'react';
import { Fingerprint, Network, Globe, Mail, UserSearch, ShieldAlert, Cpu, Zap, Activity, BookOpen, QrCode, Shield, Skull } from 'lucide-react';
import IpTools from './components/IpTools';
import DomainTools from './components/DomainTools';
import EmailTools from './components/EmailTools';
import SocialScanner from './components/SocialScanner';
import StealthLogger from './components/StealthLogger';
import IndoOsint from './components/IndoOsint';
import DorkGenerator from './components/DorkGenerator';
import QrGenerator from './components/QrGenerator';
import SantoPetrus from './components/SantoPetrus';

type Tab = 'social' | 'ip' | 'domain' | 'email' | 'logger' | 'indo' | 'dork' | 'qr' | 'santopetrus';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('social');

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff00] font-serif selection:bg-[#00ff00]/30 selection:text-black">
      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-30"></div>
      
      {/* Navbar */}
      <header className="border-b border-[#00ff00]/20 bg-black/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded border border-[#00ff00]/40 flex items-center justify-center bg-[#00ff00]/5 group hover:bg-[#00ff00]/20 transition-all">
              <ShieldAlert className="w-6 h-6 text-[#00ff00] animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-[0.2em] uppercase">
                TRIHEXA<span className="text-white/40">_HUB</span>
              </h1>
              <div className="text-[10px] text-[#00ff00]/40 flex items-center space-x-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00ff00] animate-ping"></span>
                <span>OSINT_TERMINAL_V9.3//LOCAL_INSTANCE</span>
              </div>
            </div>
          </div>
          <div className="hidden lg:flex items-center space-x-6 text-[10px] tracking-widest text-[#00ff00]/60">
            <div className="flex flex-col items-end border-r border-[#00ff00]/20 pr-6">
              <span>UPLINK: <span className="text-[#00ff00]">STABLE</span></span>
              <span>ENCRYPTION: <span className="text-[#00ff00]">AES-256</span></span>
            </div>
            <div className="flex flex-col items-end">
              <span>LATENCY: <span className="text-[#00ff00]">14MS</span></span>
              <span>ENTITY: <span className="text-[#00ff00]">ANONYMOUS</span></span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-3 space-y-1">
          <div className="mb-6 px-4 py-2 bg-[#00ff00]/10 border-l-4 border-[#00ff00] text-[11px] font-bold tracking-tighter">
            CORE_MODULES
          </div>
          <NavButton 
            active={activeTab === 'social'} 
            onClick={() => setActiveTab('social')} 
            icon={<UserSearch className="w-4 h-4" />} 
            label="GLOBAL_SCANNER" 
          />
          <NavButton 
            active={activeTab === 'indo'} 
            onClick={() => setActiveTab('indo')} 
            icon={<Fingerprint className="w-4 h-4" />} 
            label="INDO_OSINT" 
          />
          <NavButton 
            active={activeTab === 'ip'} 
            onClick={() => setActiveTab('ip')} 
            icon={<Activity className="w-4 h-4" />} 
            label="NETWORK_INTEL" 
          />
          <NavButton 
            active={activeTab === 'domain'} 
            onClick={() => setActiveTab('domain')} 
            icon={<Globe className="w-4 h-4" />} 
            label="DNS_FORENSICS" 
          />
          <NavButton 
            active={activeTab === 'email'} 
            onClick={() => setActiveTab('email')} 
            icon={<Mail className="w-4 h-4" />} 
            label="SMTP_AUDIT" 
          />
          <NavButton 
            active={activeTab === 'dork'} 
            onClick={() => setActiveTab('dork')} 
            icon={<BookOpen className="w-4 h-4" />} 
            label="DORK_ENGINE" 
          />
          
          <div className="mt-8 mb-4 px-4 py-2 bg-[#00ff00]/10 border-l-4 border-[#00ff00] text-[11px] font-bold tracking-tighter">
            STEALTH_TOOLS
          </div>
          <NavButton 
            active={activeTab === 'logger'} 
            onClick={() => setActiveTab('logger')} 
            icon={<Zap className="w-4 h-4" />} 
            label="STEALTH_LOGGER" 
          />
          <NavButton 
            active={activeTab === 'qr'} 
            onClick={() => setActiveTab('qr')} 
            icon={<QrCode className="w-4 h-4" />} 
            label="QR_GENERATOR" 
          />
          <NavButton 
            active={activeTab === 'santopetrus'} 
            onClick={() => setActiveTab('santopetrus')} 
            icon={<Skull className="w-4 h-4 text-[#ff0000]" />} 
            label="SANTO_PETRUS" 
          />
          
          <div className="mt-8 mb-6 px-4 py-2 bg-[#ff0000]/10 border-l-4 border-[#ff0000] text-[11px] font-bold tracking-tighter text-[#ff0000]">
            SYSTEM_STATUS
          </div>
          <div className="px-4 py-3 border border-[#00ff00]/10 bg-[#00ff00]/5 rounded text-[10px] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#00ff00]/40 text-xs">CPU_LOAD</span>
              <span>12.4%</span>
            </div>
            <div className="w-full bg-[#00ff00]/10 h-1 rounded overflow-hidden">
              <div className="bg-[#00ff00] h-full w-[12.4%]"></div>
            </div>
            <div className="flex justify-between mt-4">
              <span className="text-[#00ff00]/40 text-xs">MEM_USE</span>
              <span>442MB</span>
            </div>
            <div className="w-full bg-[#00ff00]/10 h-1 rounded overflow-hidden">
              <div className="bg-[#00ff00] h-full w-[40%]"></div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="md:col-span-9">
          <div className="bg-black border border-[#00ff00]/30 rounded shadow-[0_0_50px_rgba(0,255,0,0.1)] relative min-h-[700px]">
            {/* Terminal Window Header */}
            <div className="bg-[#00ff00]/10 border-b border-[#00ff00]/20 px-4 py-2 flex items-center justify-between">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              </div>
              <div className="text-[10px] tracking-widest opacity-40 uppercase">
                {activeTab}_PROTOCOL_OVERRIDE
              </div>
              <div className="w-12"></div>
            </div>

            <div className="p-0 h-full overflow-hidden">
              {activeTab === 'social' && <SocialScanner />}
              {activeTab === 'indo' && <IndoOsint />}
              {activeTab === 'ip' && <IpTools />}
              {activeTab === 'domain' && <DomainTools />}
              {activeTab === 'email' && <EmailTools />}
              {activeTab === 'dork' && <DorkGenerator />}
              {activeTab === 'logger' && <StealthLogger />}
              {activeTab === 'qr' && <QrGenerator />}
              {activeTab === 'santopetrus' && <SantoPetrus />}
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
          ? 'bg-[#00ff00]/10 text-[#00ff00] border-[#00ff00] shadow-[inset_4px_0_0_0_#00ff00]' 
          : 'text-[#00ff00]/40 hover:text-[#00ff00]/70 hover:bg-[#00ff00]/5 border-transparent'
      }`}
    >
      <span className={active ? 'animate-pulse' : ''}>{icon}</span>
      <span className="text-[11px] font-bold tracking-[0.2em] font-serif">{label}</span>
      {active && <div className="ml-auto text-[10px] animate-pulse">_ACTIVE</div>}
    </button>
  );
}

