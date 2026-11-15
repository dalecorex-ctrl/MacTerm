import { Columns2, Github, Package, Plus, SlidersHorizontal, Terminal as TerminalIcon } from 'lucide-react';

interface MacDockProps {
  isWindowMinimized: boolean;
  isWindowClosed: boolean;
  onRestoreOrFocusTerminal: () => void;
  onNewTab: () => void;
  onSplitPane: () => void;
  onOpenPackages: () => void;
  onOpenSettings: () => void;
  onOpenRepoRunner: () => void;
}

export function MacDock({
  isWindowMinimized,
  isWindowClosed,
  onRestoreOrFocusTerminal,
  onNewTab,
  onSplitPane,
  onOpenPackages,
  onOpenSettings,
  onOpenRepoRunner,
}: MacDockProps) {
  const items = [
    {
      label: isWindowClosed ? 'Open Terminal' : isWindowMinimized ? 'Restore Terminal' : 'Terminal',
      icon: TerminalIcon,
      onClick: onRestoreOrFocusTerminal,
      active: !isWindowClosed,
      accent: 'from-slate-800 to-zinc-950 border-white/25 text-emerald-400',
    },
    {
      label: 'New Tab (⌘T)',
      icon: Plus,
      onClick: onNewTab,
      active: false,
      accent: 'from-slate-700/90 to-slate-900 border-white/15 text-sky-300',
    },
    {
      label: 'Split Pane (⌘D)',
      icon: Columns2,
      onClick: onSplitPane,
      active: false,
      accent: 'from-slate-700/90 to-slate-900 border-white/15 text-indigo-300',
    },
    {
      label: 'GitHub Repo Runner',
      icon: Github,
      onClick: onOpenRepoRunner,
      active: false,
      accent: 'from-sky-700/80 to-sky-950 border-sky-400/25 text-sky-200',
    },
    {
      label: 'Homebrew Packages',
      icon: Package,
      onClick: onOpenPackages,
      active: false,
      accent: 'from-amber-700/80 to-amber-950 border-amber-400/25 text-amber-200',
    },
    {
      label: 'Settings (⌘,)',
      icon: SlidersHorizontal,
      onClick: onOpenSettings,
      active: false,
      accent: 'from-zinc-700 to-zinc-900 border-white/15 text-zinc-200',
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-4">
      <nav
        aria-label="macOS Dock"
        className="aqua-dock pointer-events-auto flex items-center gap-2 rounded-[18px] px-2.5 py-1.5 backdrop-blur-xl"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              title={item.label}
              aria-label={item.label}
              className="group relative flex flex-col items-center rounded-xl p-1 transition-transform duration-150 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-[11px] border bg-gradient-to-b shadow-md transition-transform duration-150 group-hover:scale-105 ${item.accent}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              {item.active && (
                <span className="mt-1 h-1 w-1 rounded-full bg-white/80" aria-hidden="true" />
              )}
              {!item.active && <span className="mt-1 h-1 w-1" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
