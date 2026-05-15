import React, { useState } from 'react';
import { Network, Globe, Mail, UserSearch, ShieldAlert, Cpu } from 'lucide-react';
import IpTools from './components/IpTools';
import DomainTools from './components/DomainTools';
import EmailTools from './components/EmailTools';
import SocialScanner from './components/SocialScanner';

type Tab = 'ip' | 'domain' | 'email' | 'social';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('social');

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-rose-500/30">
      {/* Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur top-0 sticky z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            </div>
            <h1 className="font-sans text-xl font-bold tracking-widest text-neutral-100" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
              OSINT<span className="text-neutral-500">_DASHBOARD</span>
            </h1>
          </div>
          <div className="flex items-center space-x-4 text-xs font-mono text-neutral-500 hidden sm:flex">
            <span>STATUS: <span className="text-emerald-400">ONLINE</span></span>
            <span>NODE: <span className="text-neutral-400">ALPHA-1</span></span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-3 space-y-2">
          <div className="mb-4 px-3 text-xs font-semibold text-neutral-500 tracking-wider">MODULES</div>
          <NavButton 
            active={activeTab === 'social'} 
            onClick={() => setActiveTab('social')} 
            icon={<UserSearch className="w-4 h-4" />} 
            label="Social Scanner" 
          />
          <NavButton 
            active={activeTab === 'ip'} 
            onClick={() => setActiveTab('ip')} 
            icon={<Network className="w-4 h-4" />} 
            label="IP & Network" 
          />
          <NavButton 
            active={activeTab === 'domain'} 
            onClick={() => setActiveTab('domain')} 
            icon={<Globe className="w-4 h-4" />} 
            label="Domain & DNS" 
          />
          <NavButton 
            active={activeTab === 'email'} 
            onClick={() => setActiveTab('email')} 
            icon={<Mail className="w-4 h-4" />} 
            label="Email Intel" 
          />
          
          <div className="mt-8 mb-4 px-3 text-xs font-semibold text-neutral-500 tracking-wider">SYSTEM</div>
          <div className="px-3 py-2 flex items-center space-x-3 text-sm text-neutral-400">
            <Cpu className="w-4 h-4" />
            <span>Proxy Active</span>
          </div>
        </div>

        {/* Workspace */}
        <div className="md:col-span-9">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden min-h-[600px] shadow-2xl">
            {activeTab === 'social' && <SocialScanner />}
            {activeTab === 'ip' && <IpTools />}
            {activeTab === 'domain' && <DomainTools />}
            {activeTab === 'email' && <EmailTools />}
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
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-neutral-800 text-neutral-100 shadow-sm border border-neutral-700/50' 
          : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 border border-transparent'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-500" />}
    </button>
  );
}

