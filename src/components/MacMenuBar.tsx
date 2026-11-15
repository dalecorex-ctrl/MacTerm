import { useEffect, useRef, useState } from 'react';
import { Download, Github, Package, SlidersHorizontal, Smartphone } from 'lucide-react';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface MacMenuBarProps {
  onNewTab: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onClosePane: () => void;
  onClearScrollback: () => void;
  onResetTty: () => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onResetFont: () => void;
  onToggleMaximize: () => void;
  onMinimizeWindow: () => void;
  onOpenSettings: () => void;
  onOpenPackages: () => void;
  onOpenAndroidApk: () => void;
  onOpenRepoRunner: () => void;
  isInstallable?: boolean;
  onInstallPwa?: () => void;
  onRunCommand: (cmd: string) => void;
}

export function MacMenuBar({
  onNewTab,
  onSplitHorizontal,
  onSplitVertical,
  onClosePane,
  onClearScrollback,
  onResetTty,
  onIncreaseFont,
  onDecreaseFont,
  onResetFont,
  onToggleMaximize,
  onMinimizeWindow,
  onOpenSettings,
  onOpenPackages,
  onOpenAndroidApk,
  onOpenRepoRunner,
  isInstallable,
  onInstallPwa,
  onRunCommand,
}: MacMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [clockText, setClockText] = useState(() => formatMacClock(new Date()));
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setClockText(formatMacClock(new Date())), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [openMenu]);

  const menus: Record<string, MenuItem[]> = {
    Terminal: [
      { label: 'About Terminal', action: () => onRunCommand('neofetch') },
      { divider: true, label: '' },
      { label: 'Settings...', shortcut: '⌘,', action: onOpenSettings },
      { label: 'TTY & ANSI Packages...', shortcut: '⌘P', action: onOpenPackages },
      { label: 'Install / Android APK...', action: onOpenAndroidApk },
      { divider: true, label: '' },
      { label: 'Reset TTY State', action: onResetTty },
    ],
    Shell: [
      { label: 'New Tab', shortcut: '⌘T', action: onNewTab },
      { label: 'Split Horizontally', shortcut: '⌘D', action: onSplitHorizontal },
      { label: 'Split Vertically', shortcut: '⇧⌘D', action: onSplitVertical },
      { divider: true, label: '' },
      { label: 'Clone GitHub Repo...', shortcut: '⌘G', action: onOpenRepoRunner },
      { label: 'Close Pane / Tab', shortcut: '⌘W', action: onClosePane },
      { label: 'Inspect TTY (stty -a)', action: () => onRunCommand('tty && stty -a') },
    ],
    Edit: [
      { label: 'Clear Screen', shortcut: '⌘K', action: onClearScrollback },
      { divider: true, label: '' },
      { label: 'Run ANSI Color Test', action: () => onRunCommand('colortest && truecolor') },
      { label: 'Run Figlet Rainbow', action: () => onRunCommand('figlet "macOS" | lolcat') },
    ],
    View: [
      { label: 'Bigger Text', shortcut: '⌘+', action: onIncreaseFont },
      { label: 'Smaller Text', shortcut: '⌘-', action: onDecreaseFont },
      { label: 'Default Text Size', shortcut: '⌘0', action: onResetFont },
      { divider: true, label: '' },
      { label: 'Toggle Full Window', shortcut: '⌃⌘F', action: onToggleMaximize },
    ],
    Window: [
      { label: 'Minimize', shortcut: '⌘M', action: onMinimizeWindow },
      { label: 'Zoom', action: onToggleMaximize },
      { divider: true, label: '' },
      { label: 'Open Process Monitor (htop)', action: () => onRunCommand('htop') },
      { label: 'Open File Manager (ranger)', action: () => onRunCommand('ranger') },
    ],
    Help: [
      { label: 'Shell Command Reference', action: () => onRunCommand('help') },
      { label: 'Homebrew Formulae', action: () => onRunCommand('brew list') },
    ],
  };

  return (
    <header
      ref={barRef}
      className="relative z-40 flex h-7 w-full shrink-0 items-center justify-between border-b border-white/10 bg-black/45 px-3 text-[13px] font-medium text-white/95 backdrop-blur-2xl"
    >
      <div className="flex items-center gap-0.5">
        {/* Minimal macOS geometric apple mark */}
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'Terminal' ? null : 'Terminal')}
          aria-label="System menu"
          className="flex h-6 items-center rounded px-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
          <svg viewBox="0 0 14 17" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
            <path d="M11.6 9.1c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.5 2 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0-.1-2.1-.8-2.1-3zM9.5 3.1c.6-.7 1-1.7.9-2.7-.8 0-1.8.6-2.4 1.3-.5.6-1 1.6-.8 2.5.9.1 1.8-.4 2.3-1.1z" />
          </svg>
        </button>

        {Object.keys(menus).map((name) => {
          const isOpen = openMenu === name;
          const isAppTitle = name === 'Terminal';
          return (
            <div key={name} className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu(isOpen ? null : name)}
                onMouseEnter={() => {
                  if (openMenu !== null && openMenu !== name) setOpenMenu(name);
                }}
                className={`h-6 whitespace-nowrap shrink-0 rounded px-2.5 text-[13px] transition-colors ${
                  isAppTitle ? 'font-bold' : 'font-normal text-white/90'
                } ${isOpen ? 'bg-white/20 text-white' : 'hover:bg-white/12'}`}
              >
                {name}
              </button>

              {isOpen && (
                <div className="absolute left-0 top-[26px] z-50 min-w-[232px] rounded-lg border border-white/15 bg-[#1d2028]/95 p-1 shadow-2xl backdrop-blur-2xl">
                  {menus[name].map((item, idx) =>
                    item.divider ? (
                      <div key={`div-${idx}`} className="my-1 h-px bg-white/10" />
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                          setOpenMenu(null);
                          item.action?.();
                        }}
                        className="flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-1 text-left text-[12.5px] text-white/90 transition-colors hover:bg-sky-600 hover:text-white disabled:opacity-40"
                      >
                        <span className="whitespace-nowrap">{item.label}</span>
                        {item.shortcut && (
                          <span className="font-mono text-[11px] text-white/55">{item.shortcut}</span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        {isInstallable && onInstallPwa && (
          <button
            type="button"
            onClick={onInstallPwa}
            title="Install App"
            className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded bg-sky-600/90 px-2 text-[11.5px] font-medium text-white transition-colors hover:bg-sky-500"
          >
            <Download className="h-3 w-3" />
            <span>Install</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenAndroidApk}
          title="Android APK & Install"
          className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-2 text-[12px] text-white/85 transition-colors hover:bg-white/15"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span className="hidden md:inline">APK</span>
        </button>

        <button
          type="button"
          onClick={onOpenRepoRunner}
          title="Clone GitHub Repository"
          className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-2 text-[12px] text-white/85 transition-colors hover:bg-white/15"
        >
          <Github className="h-3.5 w-3.5 text-sky-400" />
          <span className="hidden sm:inline">Repo</span>
        </button>

        <button
          type="button"
          onClick={onOpenPackages}
          title="Open TTY & ANSI Packages"
          className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-2 text-[12px] text-white/85 transition-colors hover:bg-white/15"
        >
          <Package className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Packages</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Terminal Settings"
          className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-2 text-[12px] text-white/85 transition-colors hover:bg-white/15"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        <span className="pl-1.5 text-[12.5px] font-medium tabular-nums text-white/90 whitespace-nowrap">
          {clockText}
        </span>
      </div>
    </header>
  );
}

function formatMacClock(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}  ${hours}:${mins} ${ampm}`;
}
