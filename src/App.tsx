import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Plus, Settings2, TerminalSquare } from 'lucide-react';
import type { SplitDirection, SplitNode, TerminalSettings, TerminalTab } from './types/ui';
import { sessionRegistry } from './runtime/sessionRegistry';
import { loadPersistedLayout, savePersistedLayout } from './runtime/sessionStorage';
import { haptics } from './runtime/haptics';
import { soundEffects } from './runtime/audio';
import { ANSI } from './runtime/tty';
import { usePWAInstall } from './hooks/usePWAInstall';
import { TerminalWindow } from './components/TerminalWindow';
import wallpaperUrl from './assets/images/macos_desktop_wallpaper_1794665700940.jpg';

const MacMenuBar = lazy(() => import('./components/MacMenuBar').then((module) => ({ default: module.MacMenuBar })));
const MacDock = lazy(() => import('./components/MacDock').then((module) => ({ default: module.MacDock })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal })));
const PackagesModal = lazy(() => import('./components/PackagesModal').then((module) => ({ default: module.PackagesModal })));
const AndroidApkModal = lazy(() => import('./components/AndroidApkModal').then((module) => ({ default: module.AndroidApkModal })));
const RepoRunnerModal = lazy(() => import('./components/RepoRunnerModal').then((module) => ({ default: module.RepoRunnerModal })));

const SETTINGS_KEY = 'macos_terminal_settings_v2';

const DEFAULT_SETTINGS: TerminalSettings = {
  profileId: 'pogs',
  fontSize: 13.5,
  cursorStyle: 'block',
  cursorBlink: true,
  opacity: 0.92,
  showDock: true,
  showTouchBar: 'auto',
  hapticsEnabled: true,
  soundEnabled: true,
};

let idCounter = 1;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${idCounter++}-${Math.random().toString(36).slice(2, 6)}`;

function createTab(): TerminalTab {
  const paneId = uid('pane');
  return {
    id: uid('tab'),
    root: { type: 'leaf', paneId },
    activePaneId: paneId,
  };
}

function collectPaneIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.paneId];
  return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
}

function splitLeafInTree(
  node: SplitNode,
  targetPaneId: string,
  direction: SplitDirection,
  newPaneId: string,
): SplitNode {
  if (node.type === 'leaf') {
    if (node.paneId !== targetPaneId) return node;
    return {
      type: 'split',
      id: uid('split'),
      direction,
      ratio: 0.5,
      first: node,
      second: { type: 'leaf', paneId: newPaneId },
    };
  }
  return {
    ...node,
    first: splitLeafInTree(node.first, targetPaneId, direction, newPaneId),
    second: splitLeafInTree(node.second, targetPaneId, direction, newPaneId),
  };
}

function removePaneFromTree(node: SplitNode, targetPaneId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.paneId === targetPaneId ? null : node;
  }
  const nextFirst = removePaneFromTree(node.first, targetPaneId);
  const nextSecond = removePaneFromTree(node.second, targetPaneId);
  if (!nextFirst) return nextSecond;
  if (!nextSecond) return nextFirst;
  return { ...node, first: nextFirst, second: nextSecond };
}

function updateRatioInTree(node: SplitNode, splitId: string, ratio: number): SplitNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    first: updateRatioInTree(node.first, splitId, ratio),
    second: updateRatioInTree(node.second, splitId, ratio),
  };
}

export default function App() {
  const [settings, setSettings] = useState<TerminalSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const [initialLayout] = useState(() => loadPersistedLayout());
  const [tabs, setTabs] = useState<TerminalTab[]>(() => initialLayout?.tabs ?? [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => initialLayout?.activeTabId ?? '');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWindowClosed, setIsWindowClosed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const [repoRunnerOpen, setRepoRunnerOpen] = useState(false);
  const [wallpaperFailed, setWallpaperFailed] = useState(false);

  const { isInstallable, isInstalled, isIOS, isOnline, install } = usePWAInstall();

  const resolvedActiveTabId = tabs.some((t) => t.id === activeTabId) ? activeTabId : tabs[0]?.id ?? '';
  const isAndroidApp = Boolean(
    window.AndroidBridge?.startLocalShell ||
    /Android/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get('surface') === 'android',
  );

  useEffect(() => {
    haptics.setEnabled(settings.hapticsEnabled !== false);
  }, [settings.hapticsEnabled]);

  useEffect(() => {
    soundEffects.setEnabled(settings.soundEnabled !== false);
  }, [settings.soundEnabled]);

  useEffect(() => {
    savePersistedLayout(tabs, resolvedActiveTabId);
  }, [tabs, resolvedActiveTabId]);

  const updateSettings = useCallback((patch: Partial<TerminalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      haptics.setEnabled(next.hapticsEnabled !== false);
      soundEffects.setEnabled(next.soundEnabled !== false);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const ensureWindowOpen = useCallback(() => {
    setIsMinimized(false);
    setIsWindowClosed(false);
  }, []);

  const handleNewTab = useCallback(() => {
    ensureWindowOpen();
    haptics.tabCreate();
    soundEffects.tabCreate();
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [ensureWindowOpen]);

  const handleCloseTab = useCallback((tabId: string) => {
    haptics.tabClose();
    soundEffects.tabClose();
    setTabs((prev) => {
      const target = prev.find((t) => t.id === tabId);
      if (target) {
        for (const pid of collectPaneIds(target.root)) {
          sessionRegistry.dispose(pid, true);
        }
      }
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        setIsWindowClosed(true);
        const fresh = createTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }
      return next;
    });
  }, []);

  const handleSplit = useCallback(
    (direction: SplitDirection) => {
      ensureWindowOpen();
      haptics.splitPane();
      soundEffects.splitPane();
      const newPaneId = uid('pane');
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== resolvedActiveTabId) return tab;
          return {
            ...tab,
            root: splitLeafInTree(tab.root, tab.activePaneId, direction, newPaneId),
            activePaneId: newPaneId,
          };
        }),
      );
    },
    [ensureWindowOpen, resolvedActiveTabId],
  );

  const handleClosePane = useCallback((tabId: string, paneId: string) => {
    haptics.closePane();
    soundEffects.closePane();
    sessionRegistry.dispose(paneId, true);
    setTabs((prev) => {
      const targetTab = prev.find((t) => t.id === tabId);
      if (!targetTab) return prev;
      const nextRoot = removePaneFromTree(targetTab.root, paneId);
      if (!nextRoot) {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length === 0) {
          setIsWindowClosed(true);
          const fresh = createTab();
          setActiveTabId(fresh.id);
          return [fresh];
        }
        return remaining;
      }
      const remainingPanes = collectPaneIds(nextRoot);
      const nextActive = remainingPanes.includes(targetTab.activePaneId)
        ? targetTab.activePaneId
        : remainingPanes[0];
      return prev.map((t) =>
        t.id === tabId ? { ...t, root: nextRoot, activePaneId: nextActive } : t,
      );
    });
  }, []);

  const handleFocusPane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t)),
    );
  }, []);

  const handleUpdateRatio = useCallback((tabId: string, splitId: string, ratio: number) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, root: updateRatioInTree(t.root, splitId, ratio) } : t,
      ),
    );
  }, []);

  const getActiveSession = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === resolvedActiveTabId);
    if (!activeTab) return undefined;
    return sessionRegistry.get(activeTab.activePaneId);
  }, [tabs, resolvedActiveTabId]);

  const handleClearActive = useCallback(() => {
    const s = getActiveSession();
    if (!s) return;
    s.tty.write(ANSI.clearScreen);
    s.tty.emitInput('\x0c');
  }, [getActiveSession]);

  const handleResetTty = useCallback(() => {
    const s = getActiveSession();
    if (!s) return;
    s.tty.setRawMode(false);
    s.tty.write(ANSI.reset + ANSI.showCursor + ANSI.altScreenOff + ANSI.clearScreen);
    s.tty.emitInput('\x0c');
  }, [getActiveSession]);

  const handleSendTouchKey = useCallback(
    (seq: string) => {
      const s = getActiveSession();
      if (s) s.tty.emitInput(seq);
    },
    [getActiveSession],
  );

  const handleRunCommand = useCallback(
    (cmd: string) => {
      ensureWindowOpen();
      const s = getActiveSession();
      if (s) {
        s.runProgrammaticCommand(cmd);
      }
    },
    [ensureWindowOpen, getActiveSession],
  );

  const handleRestoreOrFocusTerminal = useCallback(() => {
    if (isWindowClosed || isMinimized) {
      ensureWindowOpen();
    } else {
      setIsMinimized(true);
    }
  }, [ensureWindowOpen, isMinimized, isWindowClosed]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey;
      const ctrlShift = e.ctrlKey && e.shiftKey;

      if ((meta || ctrlShift) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab();
      } else if ((meta && !e.shiftKey && e.key.toLowerCase() === 'd') || (ctrlShift && e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        handleSplit('horizontal');
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleSplit('vertical');
      } else if ((meta || ctrlShift) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleClearActive();
      } else if ((meta || ctrlShift) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((o) => !o);
      } else if ((meta || ctrlShift) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPackagesOpen((o) => !o);
      } else if (meta && e.key === '=') {
        e.preventDefault();
        updateSettings({ fontSize: Math.min(26, settings.fontSize + 1) });
      } else if (meta && e.key === '-') {
        e.preventDefault();
        updateSettings({ fontSize: Math.max(9, settings.fontSize - 1) });
      } else if (meta && e.key === '0') {
        e.preventDefault();
        updateSettings({ fontSize: 13.5 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClearActive, handleNewTab, handleSplit, settings.fontSize, updateSettings]);

  const activeTab = tabs.find((t) => t.id === resolvedActiveTabId);

  return (
    <div
      style={{ fontFamily: settings.uiFontFamily || undefined }}
      className={`relative flex h-dvh w-screen flex-col overflow-hidden ${isAndroidApp ? 'bg-[#06252c]' : 'bg-[#0b252e]'}`}
    >
      {!isAndroidApp && (!wallpaperFailed ? (
        <img
          src={wallpaperUrl}
          alt="macOS desktop backdrop"
          referrerPolicy="no-referrer"
          onError={() => setWallpaperFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#144252_0%,_#0b252e_50%,_#061318_100%)]"
        />
      ))}

      {!isAndroidApp && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/20" />}

      {isAndroidApp ? (
        <header className="relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#072a31] px-3 text-slate-100">
          <div className="flex min-w-0 items-center gap-2.5">
            <TerminalSquare className="h-4 w-4 text-teal-300" aria-hidden="true" />
            <span className="truncate text-[13px] font-semibold tracking-wide">MacTerm</span>
            <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-teal-200">
              {window.AndroidBridge?.startLocalShell ? 'LOCAL SHELL' : 'PREVIEW'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleNewTab} aria-label="New terminal" title="New terminal" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Terminal settings" title="Terminal settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : (
        <Suspense fallback={null}>
          <MacMenuBar
          onNewTab={handleNewTab}
          onSplitHorizontal={() => handleSplit('horizontal')}
          onSplitVertical={() => handleSplit('vertical')}
          onClosePane={() => {
            if (activeTab) handleClosePane(activeTab.id, activeTab.activePaneId);
          }}
          onClearScrollback={handleClearActive}
          onResetTty={handleResetTty}
          onIncreaseFont={() => updateSettings({ fontSize: Math.min(26, settings.fontSize + 1) })}
          onDecreaseFont={() => updateSettings({ fontSize: Math.max(9, settings.fontSize - 1) })}
          onResetFont={() => updateSettings({ fontSize: 13.5 })}
          onToggleMaximize={() => setIsMaximized((m) => !m)}
          onMinimizeWindow={() => setIsMinimized(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPackages={() => setPackagesOpen(true)}
          onOpenAndroidApk={() => setAndroidModalOpen(true)}
          onOpenRepoRunner={() => setRepoRunnerOpen(true)}
          isInstallable={isInstallable && !isInstalled}
          onInstallPwa={() => {
            install();
          }}
          onRunCommand={handleRunCommand}
          />
        </Suspense>
      )}

      {!isOnline && !isAndroidApp && (
        <div className="relative z-30 bg-amber-600/90 px-3 py-1 text-center text-[11px] font-medium text-white">
          Offline Mode — Local TTY runtime & cached assets active
        </div>
      )}

      <main
        className={`relative z-10 flex min-h-0 flex-1 items-center justify-center ${
          isAndroidApp ? 'items-stretch p-0' : isMaximized
            ? 'p-0'
            : settings.showDock
              ? 'px-2 pt-2 pb-20 sm:px-6 sm:pt-4'
              : 'p-2 sm:p-6'
        }`}
      >
        {!isWindowClosed && !isMinimized ? (
          <TerminalWindow
            tabs={tabs}
            activeTabId={resolvedActiveTabId}
            settings={settings}
            isAndroidApp={isAndroidApp}
            isMaximized={isMaximized}
            onSelectTab={setActiveTabId}
            onNewTab={handleNewTab}
            onCloseTab={handleCloseTab}
            onFocusPane={handleFocusPane}
            onExitPane={handleClosePane}
            onUpdateRatio={handleUpdateRatio}
            onSplitHorizontal={() => handleSplit('horizontal')}
            onSplitVertical={() => handleSplit('vertical')}
            onCloseWindow={() => setIsWindowClosed(true)}
            onMinimizeWindow={() => setIsMinimized(true)}
            onToggleMaximize={() => setIsMaximized((m) => !m)}
            onSendTouchKey={handleSendTouchKey}
            onChangeFontSize={(fontSize) => updateSettings({ fontSize })}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/45 px-8 py-6 text-center shadow-2xl backdrop-blur-2xl">
            <p className="text-sm font-medium text-white/90">
              {isMinimized ? 'Terminal window minimized' : 'No open terminal windows'}
            </p>
            <button
              type="button"
              onClick={ensureWindowOpen}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
            >
              {isMinimized ? 'Restore Terminal' : 'New Terminal Window'}
            </button>
          </div>
        )}
      </main>

      {!isAndroidApp && settings.showDock && !isMaximized && (
        <Suspense fallback={null}>
          <MacDock
            isWindowMinimized={isMinimized}
            isWindowClosed={isWindowClosed}
            onRestoreOrFocusTerminal={handleRestoreOrFocusTerminal}
            onNewTab={handleNewTab}
            onSplitPane={() => handleSplit('horizontal')}
            onOpenPackages={() => setPackagesOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenRepoRunner={() => setRepoRunnerOpen(true)}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        {settingsOpen && (
          <SettingsModal
            isOpen
            settings={settings}
            onUpdate={updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {packagesOpen && <PackagesModal isOpen onClose={() => setPackagesOpen(false)} onRunCommand={handleRunCommand} />}
        {androidModalOpen && (
          <AndroidApkModal
            isOpen
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstallPwa={install}
            onClose={() => setAndroidModalOpen(false)}
          />
        )}
        {repoRunnerOpen && (
          <RepoRunnerModal
            isOpen
            onClose={() => setRepoRunnerOpen(false)}
            onRunCommand={handleRunCommand}
            cwd={getActiveSession()?.state.cwd ?? '/Users/pogs'}
            home={getActiveSession()?.state.env.HOME ?? '/Users/pogs'}
          />
        )}
      </Suspense>
    </div>
  );
}
