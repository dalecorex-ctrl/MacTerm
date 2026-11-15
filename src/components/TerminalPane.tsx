import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { TerminalSettings } from '../types/ui';
import { getProfileById } from '../runtime/themes';
import { sessionRegistry } from '../runtime/sessionRegistry';
import { haptics } from '../runtime/haptics';
import { soundEffects } from '../runtime/audio';

interface TerminalPaneProps {
  paneId: string;
  isFocused: boolean;
  isTabVisible: boolean;
  isSplit: boolean;
  settings: TerminalSettings;
  onFocus: (paneId: string) => void;
  onExitPane: (paneId: string) => void;
  onChangeFontSize: (fontSize: number) => void;
}

interface ContextPopover {
  x: number;
  y: number;
  lineText: string;
  hasSelection: boolean;
}

const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 26;
const DEFAULT_FONT_SIZE = 13.5;

function clampFontSize(val: number): number {
  const stepped = Math.round(val * 2) / 2;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, stepped));
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    window.AndroidBridge?.copyText?.(text);
  } catch {
    // ignore
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function TerminalPane({
  paneId,
  isFocused,
  isTabVisible,
  isSplit,
  settings,
  onFocus,
  onExitPane,
  onChangeFontSize,
}: TerminalPaneProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onExitRef = useRef(onExitPane);
  onExitRef.current = onExitPane;

  const fontSizeRef = useRef(settings.fontSize);
  fontSizeRef.current = settings.fontSize;

  const onChangeFontSizeRef = useRef(onChangeFontSize);
  onChangeFontSizeRef.current = onChangeFontSize;

  const [zoomIndicator, setZoomIndicator] = useState<number | null>(null);
  const zoomTimerRef = useRef<number | null>(null);

  const [copyToast, setCopyToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [popover, setPopover] = useState<ContextPopover | null>(null);

  const showZoomBadge = useCallback((size: number) => {
    setZoomIndicator(size);
    if (zoomTimerRef.current !== null) window.clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = window.setTimeout(() => {
      setZoomIndicator(null);
      zoomTimerRef.current = null;
    }, 950);
  }, []);

  const showCopyToast = useCallback((msg: string) => {
    setCopyToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setCopyToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);

  const readBufferLineAtClientY = useCallback((clientY: number): string => {
    const term = termRef.current;
    const el = containerRef.current;
    if (!term || !el) return '';
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || term.rows <= 0) return '';
    const relY = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
    const row = Math.floor((relY / rect.height) * term.rows);
    const buf = term.buffer.active;
    const targetIdx = buf.viewportY + row;

    const getLine = (idx: number) => buf.getLine(idx)?.translateToString(true) ?? '';
    const exact = getLine(targetIdx).trimEnd();
    if (exact.trim()) return exact;

    for (const offset of [-1, 1, -2, 2]) {
      const candidate = getLine(targetIdx + offset).trimEnd();
      if (candidate.trim()) return candidate;
    }
    return '';
  }, []);

  const readAllBufferText = useCallback((): string => {
    const term = termRef.current;
    if (!term) return '';
    const buf = term.buffer.active;
    const start = Math.max(0, buf.length - 400);
    const lines: string[] = [];
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i)?.translateToString(true) ?? '';
      lines.push(line);
    }
    while (lines.length > 0 && !lines[lines.length - 1].trim()) {
      lines.pop();
    }
    return lines.join('\n');
  }, []);

  const openActionPopover = useCallback(
    (clientX: number, clientY: number, lineText: string, hasSelection: boolean) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const x = Math.max(12, Math.min(rect.width - 236, clientX - rect.left));
      const y = Math.max(12, Math.min(rect.height - 56, clientY - rect.top - 48));
      setPopover({ x, y, lineText, hasSelection });
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;

    const profile = getProfileById(settings.profileId, settings.customTheme);
    const term = new Terminal({
      allowProposedApi: true,
      allowTransparency: !window.AndroidBridge,
      fontFamily: settings.terminalFontFamily || '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
      fontSize: settings.fontSize,
      lineHeight: 1.24,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: window.AndroidBridge ? 1500 : 5000,
      theme: profile.xterm,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(el);

    termRef.current = term;
    fitRef.current = fitAddon;

    const session = sessionRegistry.getOrCreate(paneId, () => {
      onExitRef.current(paneId);
    });

    const detachOutput = session.tty.attachOutput((data) => {
      term.write(data);
    });

    const dataSub = term.onData((data) => {
      session.tty.emitInput(data);
    });

    const resizeSub = term.onResize(({ cols, rows }) => {
      session.tty.setSize(cols, rows);
      session.updateTitle();
    });

    const bellSub = term.onBell(() => {
      soundEffects.bell();
    });

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const isMod = ev.metaKey || (ev.ctrlKey && ev.shiftKey);
      if (isMod && ev.key.toLowerCase() === 'c' && term.hasSelection()) {
        const selected = term.getSelection();
        copyTextToClipboard(selected).then((ok) => {
          if (ok) showCopyToast(`Copied ${selected.length} chars`);
        });
        return false;
      }
      if (isMod && ev.key.toLowerCase() === 'v') {
        navigator.clipboard?.readText().then((txt) => {
          if (txt) session.tty.emitInput(txt);
        }).catch(() => {});
        return false;
      }
      return true;
    });

    let pinchStartDist = 0;
    let pinchStartFont = fontSizeRef.current;
    let isPinching = false;

    let longPressTimer: number | null = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let longPressFired = false;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.closest('[data-terminal-popover]')) return;
      onFocus(paneId);

      if (e.touches.length === 2) {
        e.preventDefault();
        clearLongPress();
        setPopover(null);
        isPinching = true;
        pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
        pinchStartFont = fontSizeRef.current;
        return;
      }

      if (e.touches.length === 1 && !isPinching) {
        setPopover(null);
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        longPressFired = false;
        clearLongPress();

        longPressTimer = window.setTimeout(() => {
          longPressTimer = null;
          longPressFired = true;
          haptics.copy();

          const hasSel = term.hasSelection();
          const selText = hasSel ? term.getSelection() : '';
          const lineText = readBufferLineAtClientY(touchStartY);
          const copyTarget = selText || lineText;

          if (copyTarget) {
            copyTextToClipboard(copyTarget).then((ok) => {
              if (ok) {
                const label = selText ? 'Copied selection' : 'Copied line';
                showCopyToast(`${label} (${copyTarget.length} chars)`);
              }
            });
          } else {
            showCopyToast('Select or tap Copy All');
          }

          openActionPopover(touchStartX, touchStartY, lineText, hasSel);
        }, 480);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching && pinchStartDist > 0) {
        e.preventDefault();
        clearLongPress();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const scale = dist / pinchStartDist;
        const nextFont = clampFontSize(pinchStartFont * scale);
        if (nextFont !== fontSizeRef.current) {
          if (nextFont === MIN_FONT_SIZE || nextFont === MAX_FONT_SIZE) {
            haptics.zoomBoundary();
          }
          onChangeFontSizeRef.current(nextFont);
        }
        showZoomBadge(nextFont);
        return;
      }

      if (e.touches.length === 1 && longPressTimer !== null) {
        const touch = e.touches[0];
        const moved = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);
        if (moved > 10) clearLongPress();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      clearLongPress();
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        pinchStartDist = 0;
      }
      if (longPressFired) {
        e.preventDefault();
        longPressFired = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.5 : -0.5;
      const nextFont = clampFontSize(fontSizeRef.current + delta);
      if (nextFont !== fontSizeRef.current) {
        onChangeFontSizeRef.current(nextFont);
      }
      showZoomBadge(nextFont);
    };

    wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd, { passive: false });
    wrapper.addEventListener('touchcancel', onTouchEnd);
    wrapper.addEventListener('wheel', onWheel, { passive: false });

    const doFit = () => {
      try {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          fitAddon.fit();
          session.tty.setSize(term.cols, term.rows);
          session.updateTitle();
        }
      } catch {
        // ignore
      }
    };

    requestAnimationFrame(doFit);

    let rafId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(doFit);
    });
    observer.observe(el);

    return () => {
      clearLongPress();
      if (zoomTimerRef.current !== null) window.clearTimeout(zoomTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
      wrapper.removeEventListener('touchend', onTouchEnd);
      wrapper.removeEventListener('touchcancel', onTouchEnd);
      wrapper.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(rafId);
      observer.disconnect();
      bellSub.dispose();
      dataSub.dispose();
      resizeSub.dispose();
      detachOutput();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const profile = getProfileById(settings.profileId, settings.customTheme);
    term.options.theme = profile.xterm;
    term.options.fontSize = settings.fontSize;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    if (settings.terminalFontFamily) {
      term.options.fontFamily = settings.terminalFontFamily;
    }
    requestAnimationFrame(() => {
      try {
        if (containerRef.current && containerRef.current.clientWidth > 0) {
          fitRef.current?.fit();
        }
      } catch {
        // ignore
      }
    });
  }, [settings]);

  useEffect(() => {
    if (!isTabVisible) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
      if (isFocused) {
        termRef.current?.focus();
      }
    });
  }, [isTabVisible, isFocused]);

  useEffect(() => {
    if (!popover) return;
    const id = window.setTimeout(() => setPopover(null), 4500);
    return () => window.clearTimeout(id);
  }, [popover]);

  const handleCopyAction = async (mode: 'selection' | 'line' | 'all') => {
    const term = termRef.current;
    if (!term) return;
    let text = '';
    if (mode === 'selection') text = term.getSelection();
    else if (mode === 'line') text = popover?.lineText ?? '';
    else text = readAllBufferText();

    setPopover(null);
    if (!text) {
      showCopyToast('Nothing to copy');
      return;
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
      haptics.copy();
      soundEffects.copy();
      showCopyToast(
        mode === 'all'
          ? `Copied buffer (${text.length} chars)`
          : mode === 'selection'
            ? `Copied selection (${text.length} chars)`
            : `Copied line (${text.length} chars)`,
      );
    }
  };

  const handlePasteAction = async () => {
    setPopover(null);
    const session = sessionRegistry.get(paneId);
    if (!session) return;
    try {
      const txt = await navigator.clipboard?.readText();
      if (txt) {
        session.tty.emitInput(txt);
        termRef.current?.focus();
      }
    } catch {
      showCopyToast('Clipboard paste blocked by browser');
    }
  };

  const profile = getProfileById(settings.profileId, settings.customTheme);

  return (
    <div
      ref={wrapperRef}
      onMouseDown={() => {
        onFocus(paneId);
        if (popover) setPopover(null);
        termRef.current?.focus();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onFocus(paneId);
        const term = termRef.current;
        const hasSel = Boolean(term?.hasSelection());
        const lineText = readBufferLineAtClientY(e.clientY);
        openActionPopover(e.clientX, e.clientY, lineText, hasSel);
      }}
      className={`xterm-touch-surface relative h-full w-full overflow-hidden px-3 py-2 transition-opacity duration-150 ${
        profile.isLight ? 'terminal-light' : ''
      } ${
        isSplit && !isFocused ? 'opacity-80' : 'opacity-100'
      }`}
    >
      {isSplit && isFocused && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2px] ring-1 ring-inset ring-sky-400/45 z-20"
        />
      )}

      <div ref={containerRef} className="h-full w-full" />

      {/* Pinch-to-Zoom Indicator */}
      {zoomIndicator !== null && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute top-3 right-3 z-30 rounded-lg border border-white/15 bg-black/75 px-2.5 py-1 font-mono text-xs font-medium text-white shadow-lg backdrop-blur-md"
        >
          {zoomIndicator}px · {Math.round((zoomIndicator / DEFAULT_FONT_SIZE) * 100)}%
        </div>
      )}

      {/* Long-Press Copy Toast */}
      {copyToast && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-emerald-400/30 bg-black/80 px-3 py-1 text-xs font-medium text-emerald-300 shadow-lg backdrop-blur-md"
        >
          {copyToast}
        </div>
      )}

      {/* Touch Long-Press / Right-Click macOS Action Menu */}
      {popover && (
        <div
          data-terminal-popover="true"
          style={{ left: popover.x, top: popover.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute z-40 flex items-center gap-1 rounded-lg border border-white/15 bg-[#1b222a]/95 p-1 text-xs text-slate-100 shadow-2xl backdrop-blur-xl"
        >
          {popover.hasSelection && (
            <button
              type="button"
              onClick={() => handleCopyAction('selection')}
              className="whitespace-nowrap rounded-md px-2.5 py-1 font-medium hover:bg-sky-500/25 hover:text-white"
            >
              Copy
            </button>
          )}
          {popover.lineText && (
            <button
              type="button"
              onClick={() => handleCopyAction('line')}
              className="whitespace-nowrap rounded-md px-2.5 py-1 font-medium hover:bg-sky-500/25 hover:text-white"
            >
              Copy Line
            </button>
          )}
          <button
            type="button"
            onClick={() => handleCopyAction('all')}
            className="whitespace-nowrap rounded-md px-2.5 py-1 font-medium hover:bg-sky-500/25 hover:text-white"
          >
            Copy All
          </button>
          <button
            type="button"
            onClick={handlePasteAction}
            className="whitespace-nowrap rounded-md px-2.5 py-1 font-medium hover:bg-sky-500/25 hover:text-white"
          >
            Paste
          </button>
        </div>
      )}
    </div>
  );
}
