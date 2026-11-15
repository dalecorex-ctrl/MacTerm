import { useEffect, useState } from 'react';
import { Check, Download, Play, Search, Trash2, X } from 'lucide-react';
import { packageRegistry, type PackageInfo } from '../runtime/packages';

interface PackagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string) => void;
}

type CategoryFilter = 'all' | PackageInfo['category'];

export function PackagesModal({ isOpen, onClose, onRunCommand }: PackagesModalProps) {
  const [packages, setPackages] = useState<PackageInfo[]>(() => packageRegistry.list());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  useEffect(() => {
    setPackages(packageRegistry.list());
    return packageRegistry.subscribe(() => {
      setPackages(packageRegistry.list());
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = packages.filter((p) => {
    const matchesCat = category === 'all' || p.category === category;
    const q = query.trim().toLowerCase();
    const matchesQ =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.binaries.some((b) => b.includes(q));
    return matchesCat && matchesQ;
  });

  const installedCount = packages.filter((p) => p.installed).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Homebrew TTY and ANSI Packages"
        className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#1c1f26]/95 text-slate-100 shadow-2xl backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Packages"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F56] text-[9px] font-bold text-black/70 hover:brightness-110"
            >
              ×
            </button>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Homebrew TTY & ANSI Formulae
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-slate-400">
              {installedCount} of {packages.length} installed
            </span>
            {installedCount < packages.length && (
              <button
                type="button"
                onClick={() => packageRegistry.installAll()}
                className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-sky-500"
              >
                Install All
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search formulae or binaries..."
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-1">
            {(['all', 'ai', 'tty', 'ansi', 'tui', 'core', 'dev'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'All' : cat.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Package List */}
        <div className="flex-1 divide-y divide-white/[0.07] overflow-y-auto px-5">
          {filtered.map((pkg) => {
            const isSystemCritical = pkg.preinstalled && ['zsh', 'coreutils', 'ncurses'].includes(pkg.name);
            return (
              <div
                key={pkg.name}
                className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-terminal font-semibold text-white">{pkg.name}</span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono tabular-nums text-slate-400">v{pkg.version}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400 uppercase">{pkg.category}</span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-slate-400">{pkg.binaries.join(', ')}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">{pkg.description}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {pkg.installed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onRunCommand(pkg.demoCmd);
                        }}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500"
                      >
                        <Play className="h-3 w-3" />
                        Run
                      </button>
                      {!isSystemCritical ? (
                        <button
                          type="button"
                          onClick={() => packageRegistry.uninstall(pkg.name)}
                          title={`Uninstall ${pkg.name}`}
                          className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-red-500/20 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 px-2 text-xs text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                          Core
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRunCommand(`brew install ${pkg.name}`);
                      }}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      brew install
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400">
              No formulae match "{query}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
