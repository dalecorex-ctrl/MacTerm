import { useEffect, useRef, useState } from 'react';
import { Columns2, Folder, Plus, Rows2, X } from 'lucide-react';
import type { TerminalSettings, TerminalTab } from '../types/ui';
import { getProfileById } from '../runtime/themes';
import { sessionRegistry } from '../runtime/sessionRegistry';
import { SplitPaneView } from './SplitPaneView';
import { TouchKeyBar } from './TouchKeyBar';

interface TerminalWindowProps {
  tabs: TerminalTab[];
  activeTabId: string;
  settings: TerminalSettings;
  isAndroidApp: boolean;
  isMaximized: boolean;
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onFocusPane: (tabId: string, paneId: string) => void;
  onExitPane: (tabId: string, paneId: string) => void;
  onUpdateRatio: (tabId: string, splitId: string, ratio: number) => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onCloseWindow: () => void;
  onMinimizeWindow: () => void;
  onToggleMaximize: () => void;
  onSendTouchKey: (seq: string) => void;
  onChangeFontSize: (fontSize: number) => void;
}

function applyAlphaToRgba(colorStr: string, opacity: number): string {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity.toFixed(2)})`;
  }
  const hex = colorStr.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;
  }
  return colorStr;
}

export function TerminalWindow({
  tabs,
  activeTabId,
  settings,
  isAndroidApp,
  isMaximized,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onFocusPane,
  onExitPane,
  onUpdateRatio,
  onSplitHorizontal,
  onSplitVertical,
  onCloseWindow,
  onMinimizeWindow,
  onToggleMaximize,
  onSendTouchKey,
  onChangeFontSize,
}: TerminalWindowProps) {
  const [, setTitleTick] = useState(0);
  const [hoverTraffic, setHoverTraffic] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouchDevice(mq.matches || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    return sessionRegistry.subscribeTitles(() => {
      setTitleTick((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (isMaximized) {
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isMaximized]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeTitle = activeTab ? sessionRegistry.getTitle(activeTab.activePaneId) : 'Terminal — zsh';
  const profile = getProfileById(settings.profileId, settings.customTheme);
  const isLight = Boolean(profile.isLight);

  const windowBg = applyAlphaToRgba(profile.windowBg, settings.opacity);
  const titlebarBg = applyAlphaToRgba(profile.titlebarBg, Math.min(1, settings.opacity + 0.04));

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: dragOffset.x,
      startY: dragOffset.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.mouseX;
      const dy = ev.clientY - dragStartRef.current.mouseY;
      setDragOffset({
        x: dragStartRef.current.startX + dx,
        y: Math.max(-24, dragStartRef.current.startY + dy),
      });
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      style={{
        backgroundColor: isAndroidApp ? '#00252d' : windowBg,
        transform: isAndroidApp || isMaximized ? undefined : `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      className={`flex flex-col overflow-hidden ${isAndroidApp ? 'h-full w-full rounded-none border-0 shadow-none backdrop-blur-none' : 'backdrop-blur-2xl transition-[border-radius,box-shadow] duration-200'} ${
        isAndroidApp || isMaximized
          ? 'h-full w-full rounded-none border-0'
          : 'h-full w-full max-w-[1340px] rounded-[12px] border shadow-[0_28px_80px_-14px_rgba(0,0,0,0.82)]'
      } ${
        isLight && !isAndroidApp
          ? 'border-black/15 text-slate-900'
          : 'border-white/15 text-slate-100 ring-1 ring-inset ring-white/[0.06]'
      }`}
    >
      {!isAndroidApp && <>
      {/* macOS Titlebar */}
      <div
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) onToggleMaximize();
        }}
        style={{ backgroundColor: titlebarBg }}
        className={`flex h-9 shrink-0 items-center justify-between border-b px-3.5 ${
          isLight ? 'border-black/10' : 'border-white/10'
        }`}
      >
        {/* Traffic Light Window Controls */}
        <div
          className="flex items-center gap-2"
          onMouseEnter={() => setHoverTraffic(true)}
          onMouseLeave={() => setHoverTraffic(false)}
        >
          <button
            type="button"
            onClick={onCloseWindow}
            aria-label="Close Window"
            title="Close Window"
            className="flex h-3 w-3 items-center justify-center rounded-full border border-black/20 bg-[#FF5F56] text-[9px] font-bold leading-none text-black/75 transition-transform active:scale-90"
          >
            {hoverTraffic ? '×' : ''}
          </button>
          <button
            type="button"
            onClick={onMinimizeWindow}
            aria-label="Minimize Window"
            title="Minimize Window"
            className="flex h-3 w-3 items-center justify-center rounded-full border border-black/20 bg-[#FFBD2E] text-[9px] font-bold leading-none text-black/75 transition-transform active:scale-90"
          >
            {hoverTraffic ? '−' : ''}
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            aria-label="Zoom Window"
            title="Zoom / Toggle Full Window"
            className="flex h-3 w-3 items-center justify-center rounded-full border border-black/20 bg-[#27C93F] text-[9px] font-bold leading-none text-black/75 transition-transform active:scale-90"
          >
            {hoverTraffic ? '+' : ''}
          </button>
        </div>

        {/* Centered Dynamic macOS Terminal Title */}
        <div className="flex min-w-0 items-center gap-1.5 px-4">
          <Folder className={`h-3.5 w-3.5 shrink-0 ${isLight ? 'text-slate-600' : 'text-sky-400/90'}`} />
          <span
            className={`truncate font-sans text-[12.5px] font-semibold tracking-tight tabular-nums ${
              isLight ? 'text-slate-800' : 'text-slate-200'
            }`}
          >
            {activeTitle}
          </span>
        </div>

        {/* Quick Split Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSplitHorizontal}
            title="Split Horizontally (⌘D)"
            aria-label="Split Horizontally"
            className={`rounded p-1 transition-colors ${
              isLight ? 'text-slate-600 hover:bg-black/10' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSplitVertical}
            title="Split Vertically (⇧⌘D)"
            aria-label="Split Vertically"
            className={`rounded p-1 transition-colors ${
              isLight ? 'text-slate-600 hover:bg-black/10' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Rows2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      </>}

      {(!isAndroidApp || tabs.length > 1) && <>
      {/* macOS Tab Bar */}
      <div
        className={`flex h-8 shrink-0 items-center gap-1 border-b px-2 ${
          isLight ? 'border-black/10 bg-black/[0.04]' : 'border-white/[0.08] bg-black/25'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const title = sessionRegistry.getTitle(tab.activePaneId);
            const session = sessionRegistry.get(tab.activePaneId);
            const ttyLabel = session?.tty.id ?? 'ttys';
            const shortLabel = title.split('—')[0]?.trim() || 'zsh';

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex h-6 min-w-[140px] max-w-[260px] flex-1 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 text-[11.5px] transition-colors ${
                  isActive
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-white/12 text-white shadow-sm'
                    : isLight
                      ? 'text-slate-600 hover:bg-black/5'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                }`}
              >
                <span className="truncate font-medium">
                  {shortLabel} <span className="opacity-55">· {ttyLabel}</span>
                </span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    aria-label="Close Tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                      isActive ? 'opacity-75 hover:opacity-100' : ''
                    } ${isLight ? 'hover:bg-black/10' : 'hover:bg-white/15'}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNewTab}
          title="New Tab (⌘T)"
          aria-label="New Tab"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
            isLight
              ? 'text-slate-600 hover:bg-black/10 hover:text-slate-900'
              : 'text-slate-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      </>}

      {/* Terminal Viewport(s) — keep all tabs mounted to preserve TTY state & scrollback */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tabs.map((tab) => {
          const isTabVisible = tab.id === activeTabId;
          const isSplit = tab.root.type === 'split';
          return (
            <div
              key={tab.id}
              className={isTabVisible ? 'h-full w-full' : 'hidden'}
            >
              <SplitPaneView
                node={tab.root}
                activePaneId={tab.activePaneId}
                isTabVisible={isTabVisible}
                isSplit={isSplit}
                isLightTheme={isLight}
                settings={settings}
                onFocusPane={(paneId) => onFocusPane(tab.id, paneId)}
                onExitPane={(paneId) => onExitPane(tab.id, paneId)}
                onUpdateRatio={(splitId, ratio) => onUpdateRatio(tab.id, splitId, ratio)}
                onChangeFontSize={onChangeFontSize}
              />
            </div>
          );
        })}
      </div>

      {(settings.showTouchBar === 'always' || (settings.showTouchBar === 'auto' && isTouchDevice)) && (
        <TouchKeyBar isLightTheme={isLight} onSendSequence={onSendTouchKey} />
      )}
    </div>
  );
}
