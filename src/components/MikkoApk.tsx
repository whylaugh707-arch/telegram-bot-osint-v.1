import React, { useState } from 'react';
import { Smartphone, ShieldCheck, Key, RefreshCw, Download, Layers, ShieldAlert, Cpu, AlertTriangle } from 'lucide-react';

export default function MikkoApk() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorState, setErrorState] = useState(false);

  // Compiler parameters
  const [packageName, setPackageName] = useState('com.mikko.emptyapp');
  const [appTitle, setAppTitle] = useState('Mikko Blank App');
  const [versionCode, setVersionCode] = useState('1');
  const [loading, setLoading] = useState(false);
  const [compilingStep, setCompilingStep] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleAuthorize = () => {
    if (password === '1928') {
      setIsAuthenticated(true);
      setErrorState(false);
    } else {
      setErrorState(true);
      setPassword('');
      setTimeout(() => setErrorState(false), 2000);
    }
  };

  const handleCompile = async () => {
    setLoading(true);
    setDownloadUrl('');
    
    // Aesthetic simulated compile steps for educational immersion
    const steps = [
      'Initializing compilation workspace...',
      'Templating AndroidManifest.xml manifest schema...',
      'Bundling classes.dex empty activity headers...',
      'Constructing resources.arsc table index...',
      'Injecting assets/mikko_license.txt clearance certificate...',
      'Aligning zip package sectors (zipaligned check)...',
      'Signing Android Package (Mikko Developer Certificate)...',
      'Finalizing MikkoAPK_Empty.apk archive stream...'
    ];

    for (let i = 0; i < steps.length; i++) {
      setCompilingStep(steps[i]);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    try {
      const response = await fetch('/api/mikkoapk/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: '1928',
          packageName,
          appTitle,
          versionCode
        })
      });

      if (!response.ok) {
        throw new Error('Server side compilation failed.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (e: any) {
      alert('Failed to compile APK on backend: ' + e.message);
    } finally {
      setLoading(false);
      setCompilingStep('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full min-h-[500px] bg-[#020205] items-center justify-center text-[#a855f7] relative overflow-hidden p-6">
        <div className="absolute inset-0 bg-[#a855f7]/5 blur-3xl pointer-events-none" />
        <div className="z-10 bg-slate-950/80 border border-[#a855f7]/30 p-8 flex flex-col items-center max-w-sm w-full rounded shadow-[0_0_50px_rgba(168,85,247,0.15)]">
          <Smartphone className="w-16 h-16 mb-6 text-[#a855f7] animate-pulse drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
          <h2 className="text-xl font-bold mb-2 tracking-[0.2em] uppercase text-white">MIKKO_APK V.1</h2>
          <p className="text-[10px] text-center font-mono text-[#a855f7]/60 uppercase tracking-widest border-b border-[#a855f7]/20 pb-4 mb-4 w-full">
            Security Authorization Gateway
          </p>
          <div className="w-full text-[9px] font-mono text-[#a855f7]/50 text-center mb-6 bg-[#a855f7]/5 p-3 border border-[#a855f7]/10 uppercase tracking-wider leading-relaxed">
            Analytical empty Android APK builder. Ensure you enter the safe learning clearance code to unlock compilation resources.
          </div>
          <div className="w-full space-y-4">
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAuthorize();
              }}
              placeholder="ENTER CLEARANCE CODE"
              className={`w-full bg-slate-950 border ${
                errorState ? 'border-red-500 text-red-500' : 'border-[#a855f7]/40 text-[#a855f7]'
              } text-center px-4 py-3 focus:outline-none focus:border-[#a855f7] uppercase tracking-[0.5em] font-mono text-xs shadow-[inset_0_0_15px_rgba(168,85,247,0.05)] transition-all`}
            />
            <button 
              onClick={handleAuthorize}
              className="w-full py-3.5 bg-[#a855f7] hover:bg-[#b060f8] text-black font-black text-xs uppercase tracking-[0.3em] transition-all rounded shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            >
              AUTHORIZE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[#020205] text-[#a855f7] space-y-6">
      <div className="flex justify-between items-start border-b border-[#a855f7]/20 pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center mb-1 tracking-widest text-[#a855f7] uppercase">
            <Smartphone className="w-6 h-6 mr-3 text-[#a855f7]" /> MIKKO_APK V.1
          </h2>
          <p className="text-[10px] text-[#a855f7]/60 uppercase tracking-widest font-mono">
            Blank Android Package Compiler & Forensic Tool
          </p>
        </div>
        <div className="px-3 py-1 bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7] text-[9px] font-mono font-bold tracking-[0.2em] animate-pulse flex items-center">
          <ShieldCheck className="w-3.5 h-3.5 mr-2" /> CLEARANCE_VERIFIED_1928
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Compiler Form */}
        <div className="space-y-6 bg-slate-950/60 border border-[#a855f7]/20 p-5 rounded">
          <div className="flex items-center space-x-2 border-b border-[#a855f7]/20 pb-3 mb-4">
            <Cpu className="w-4 h-4 text-[#a855f7]" />
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Target Configuration</h3>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-[10px] text-[#a855f7]/60 mb-2 uppercase tracking-widest">
                Package Identifier
              </label>
              <input 
                type="text" 
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="e.g. com.example.emptyapp"
                className="w-full bg-slate-950 border border-[#a855f7]/30 text-white rounded px-4 py-2.5 outline-none focus:border-[#a855f7] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#a855f7]/60 mb-2 uppercase tracking-widest">
                Application Title
              </label>
              <input 
                type="text" 
                value={appTitle}
                onChange={e => setAppTitle(e.target.value)}
                placeholder="e.g. My Clean App"
                className="w-full bg-slate-950 border border-[#a855f7]/30 text-white rounded px-4 py-2.5 outline-none focus:border-[#a855f7] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#a855f7]/60 mb-2 uppercase tracking-widest">
                Version Code
              </label>
              <input 
                type="number" 
                value={versionCode}
                onChange={e => setVersionCode(e.target.value)}
                placeholder="e.g. 1"
                className="w-full bg-slate-950 border border-[#a855f7]/30 text-white rounded px-4 py-2.5 outline-none focus:border-[#a855f7] transition-all"
              />
            </div>

            <button
              onClick={handleCompile}
              disabled={loading}
              className={`w-full py-4 text-black font-black text-xs uppercase tracking-[0.3em] transition-all active:scale-[0.98] flex items-center justify-center space-x-2 rounded ${
                loading ? 'bg-[#a855f7]/50 cursor-not-allowed' : 'bg-[#a855f7] hover:bg-[#b060f8] cursor-pointer'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'COMPILING PACKAGE...' : 'BUILD_BLANK_APK'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Console Output & Status */}
        <div className="space-y-6">
          <div className="bg-slate-950 border border-[#a855f7]/20 p-5 rounded min-h-[300px] flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 border-b border-[#a855f7]/10 pb-2 mb-4">
                <Layers className="w-4 h-4 text-[#a855f7]" />
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Compilation Monitor</h3>
              </div>

              <div className="font-mono text-[11px] space-y-2 leading-relaxed text-zinc-400">
                <div>[SYSTEM] Workplace operational. Ready for action.</div>
                <div>[VERIFICATION] Password validated: 1928 (AUTHORIZED)</div>
                {packageName && <div>[MANIFEST] Target: <span className="text-[#a855f7]">{packageName}</span></div>}
                {appTitle && <div>[RESOURCES] App Title: <span className="text-[#a855f7]">{appTitle}</span></div>}
                {loading && (
                  <div className="mt-4 border-t border-[#a855f7]/10 pt-3 animate-pulse">
                    <div className="text-[#a855f7] font-bold">[BUILDING] {compilingStep}</div>
                  </div>
                )}
                {downloadUrl && (
                  <div className="mt-4 border border-[#a855f7]/40 bg-[#a855f7]/5 p-4 rounded text-[#a855f7] space-y-3 animate-in fade-in zoom-in-95">
                    <div className="text-xs font-bold uppercase tracking-widest flex items-center">
                      <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" /> APK COMPILED SUCCESSFULLY!
                    </div>
                    <p className="text-[10px] text-zinc-300">
                      The blank, fully empty APK (with customized packageName & title) is ready. Use the button below to retrieve the compiled package.
                    </p>
                    <a 
                      href={downloadUrl}
                      download="MikkoAPK_Empty.apk"
                      className="inline-flex items-center space-x-2 bg-[#a855f7] text-black px-4 py-2 font-display text-[10px] tracking-widest font-black uppercase rounded hover:bg-[#b060f8] transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>DOWNLOAD APK FILE</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[9px] font-mono text-zinc-600 border-t border-[#a855f7]/10 pt-3 mt-4 flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Safe sandboxed build engine. Absolutely no malicious code embedded.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
