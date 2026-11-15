import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Download,
  Smartphone,
  Terminal,
  X,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { soundEffects } from '../runtime/audio';

interface AndroidApkModalProps {
  isOpen: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstallPwa: () => void;
  onClose: () => void;
}

interface ApkMetadata {
  exists: boolean;
  filename?: string;
  packageName?: string;
  appName?: string;
  version?: string;
  sizeFormatted?: string;
  sizeBytes?: number;
  signatures?: string[];
  mtime?: string;
  verified?: boolean;
}

export function AndroidApkModal({
  isOpen,
  isInstallable,
  isInstalled,
  isIOS,
  onInstallPwa,
  onClose,
}: AndroidApkModalProps) {
  const [apkMeta, setApkMeta] = useState<ApkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/apk/status');
      if (res.ok) {
        const data = await res.json();
        setApkMeta(data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const copyToClipboard = (text: string, label: string) => {
    soundEffects.bell();
    navigator.clipboard.writeText(text);
    setCopiedCmd(label);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          soundEffects.closePane();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Android APK and Install Manager"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-[#0d1c24]/95 text-slate-100 shadow-2xl shadow-cyan-950/40 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        {/* macOS Style Window Titlebar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-5 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEffects.closePane();
                onClose();
              }}
              aria-label="Close"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F56] text-[9px] font-bold text-black/70 hover:brightness-110 active:brightness-90 transition-transform"
            >
              ×
            </button>
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Android APK & App Installation
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEffects.closePane();
              onClose();
            }}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[80vh] space-y-5 overflow-y-auto p-6 text-xs leading-relaxed">
          {/* Main APK Download Card */}
          <section className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-teal-950/20 to-slate-900/60 p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Android Debug APK · Ready
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    v1.0.0 (Android 8.0+)
                  </span>
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  MacTerm (MacTerm.apk)
                </h3>
                <p className="text-slate-300 text-[11.5px] max-w-md">
                  Debug-signed build produced by Gradle. Ready to sideload on Android 8.0 or newer.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                  <span>Package: <strong className="text-cyan-300 font-medium">com.pogsmac.terminal</strong></span>
                  <span>·</span>
                  <span>Size: <strong className="text-white font-medium">{apkMeta?.sizeFormatted || 'unknown'}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
                <a
                  href="/MacTerm.apk"
                  download="MacTerm.apk"
                  onClick={() => soundEffects.tabCreate()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-95"
                >
                  <Download className="h-4 w-4 stroke-[2.5]" />
                  Download APK
                </a>
              </div>
            </div>
          </section>

          {/* Quick Install Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone Sideloading */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
              <h4 className="flex items-center gap-2 font-semibold text-white text-xs">
                <Smartphone className="h-4 w-4 text-sky-400" />
                Direct Mobile Install
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                <li>Tap <strong className="text-white">Download APK</strong> on your Android phone.</li>
                <li>Tap the downloaded <code className="text-cyan-300 font-mono">MacTerm.apk</code> notification.</li>
                <li>When prompted, allow <strong className="text-slate-200">"Install unknown apps"</strong> for your browser.</li>
                <li>Tap <strong className="text-white">Install</strong> and launch Pogs Terminal!</li>
              </ol>
            </div>

            {/* ADB Sideloading */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 font-semibold text-white text-xs">
                  <Terminal className="h-4 w-4 text-amber-400" />
                  ADB USB / Wi-Fi Install
                </h4>
                <button
                  type="button"
                  onClick={() => copyToClipboard('adb install -r MacTerm.apk', 'adb')}
                  className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
                >
                  {copiedCmd === 'adb' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedCmd === 'adb' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-2 font-mono text-[11px] text-amber-300">
                adb install -r MacTerm.apk
              </pre>
              <p className="text-[10.5px] text-slate-400">
                Or launch directly via ADB: <code className="text-cyan-300 font-mono">adb shell am start -n com.pogsmac.terminal/.MainActivity</code>
              </p>
            </div>
          </div>

          {/* CLI Terminal Tip */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 p-3.5 flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px]">
              <span className="font-semibold text-sky-200">macOS CLI Terminal Commands</span>
              <p className="text-slate-300">
                You can also manage the APK directly inside any terminal tab:
              </p>
              <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10.5px]">
                <code className="rounded bg-black/40 px-2 py-0.5 text-cyan-300">apk info</code>
                <code className="rounded bg-black/40 px-2 py-0.5 text-cyan-300">apk download</code>
                <code className="rounded bg-black/40 px-2 py-0.5 text-cyan-300">apk adb</code>
              </div>
            </div>
          </div>

          {/* Instant PWA Install Section */}
          <section className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Smartphone className="h-4 w-4 text-indigo-400" />
                  Install Standalone Web App (PWA)
                </h3>
                <p className="text-slate-300 text-[11px]">
                  Offline service worker & standalone app manifest are active for 1-tap browser installation without APK sideloading.
                </p>
              </div>
              {isInstalled && (
                <span className="flex shrink-0 items-center gap-1 text-emerald-400 font-medium text-[11px]">
                  <CheckCircle2 className="h-4 w-4" />
                  Installed
                </span>
              )}
            </div>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => {
                  soundEffects.tabCreate();
                  onInstallPwa();
                }}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <Download className="h-3.5 w-3.5" />
                Install PWA App Now
              </button>
            )}

            {!isInstalled && !isInstallable && isIOS && (
              <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300 text-[11px]">
                On iOS Safari: tap <strong className="text-white">Share</strong> then choose{' '}
                <strong className="text-white">Add to Home Screen</strong>.
              </p>
            )}

            {!isInstalled && !isInstallable && !isIOS && (
              <p className="text-slate-400 text-[11px]">
                In Android Chrome or Edge, open browser menu and select{' '}
                <strong className="text-slate-200">Install app</strong> /{' '}
                <strong className="text-slate-200">Add to Home screen</strong>.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
