import { useEffect, useState } from 'react';
import { FolderOpen, RotateCcw, Volume2, X } from 'lucide-react';
import type { CursorStyle, TerminalSettings, TouchBarMode } from '../types/ui';
import { TERMINAL_PROFILES } from '../runtime/themes';
import { vfs } from '../runtime/vfs';
import { packageRegistry } from '../runtime/packages';
import { soundEffects } from '../runtime/audio';
import { clearAllPersistedSessions, clearPersistedLayout } from '../runtime/sessionStorage';

interface SettingsModalProps {
  isOpen: boolean;
  settings: TerminalSettings;
  onUpdate: (patch: Partial<TerminalSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({ isOpen, settings, onUpdate, onClose }: SettingsModalProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [homeFolderStatus, setHomeFolderStatus] = useState('');
  const [customBg, setCustomBg] = useState(settings.customTheme?.background ?? '#141b22');
  const [customFg, setCustomFg] = useState(settings.customTheme?.foreground ?? '#e2eff3');
  const [customCursor, setCustomCursor] = useState(settings.customTheme?.cursor ?? '#56d4dd');
  const [customAccent, setCustomAccent] = useState(settings.customTheme?.accent ?? '#3b82f6');

  useEffect(() => {
    if (!isOpen) return;
    const bridge = window.AndroidBridge;
    if (bridge?.getHomeDirectoryName) {
      const folderName = bridge.getHomeDirectoryName();
      if (folderName) setHomeFolderStatus(`Selected: ${folderName}`);
    }

    const importSelectedFolder = () => {
      const snapshotText = window.AndroidBridge?.getHomeDirectorySnapshot?.();
      if (!snapshotText) {
        setHomeFolderStatus('Could not read the selected folder. Choose it again.');
        return;
      }
      try {
        const result = vfs.importHomeSnapshot(JSON.parse(snapshotText));
        setHomeFolderStatus(`Imported ${result.files} text files and ${result.dirs} folders into ~. Re-import to refresh.`);
      } catch {
        setHomeFolderStatus('Could not import this folder. Try a smaller folder.');
      }
    };

    window.addEventListener('macterm-home-folder-selected', importSelectedFolder);
    return () => window.removeEventListener('macterm-home-folder-selected', importSelectedFolder);
  }, [isOpen]);

  if (!isOpen) return null;

  const fsStats = vfs.getStats();

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
        aria-label="Terminal Settings"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/15 bg-[#1c1f26]/95 text-slate-100 shadow-2xl backdrop-blur-2xl"
      >
        {/* macOS Sheet Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F56] text-[9px] font-bold text-black/70 hover:brightness-110"
            >
              ×
            </button>
            <h2 className="text-sm font-semibold tracking-tight text-white">Terminal Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto p-6">
          {/* Profiles & Custom Theme */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300">Terminal Themes & Presets</h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {TERMINAL_PROFILES.map((profile) => {
                const selected = settings.profileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onUpdate({ profileId: profile.id })}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all ${
                      selected
                        ? 'border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-xs font-semibold text-white">{profile.name}</span>
                      <div className="flex items-center gap-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: profile.windowBg }}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: profile.xterm.foreground }}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: profile.xterm.green }}
                        />
                      </div>
                    </div>
                    <span className="line-clamp-2 text-[11px] leading-snug text-slate-400">
                      {profile.description}
                    </span>
                  </button>
                );
              })}

              {/* Custom Theme Card */}
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    profileId: 'custom',
                    customTheme: {
                      background: customBg,
                      foreground: customFg,
                      cursor: customCursor,
                      accent: customAccent,
                    },
                  })
                }
                className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all ${
                  settings.profileId === 'custom'
                    ? 'border-sky-400 bg-sky-500/15 ring-1 ring-sky-400/50'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-white">Custom</span>
                  <div className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: customBg }} />
                    <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: customFg }} />
                    <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ backgroundColor: customAccent }} />
                  </div>
                </div>
                <span className="line-clamp-2 text-[11px] leading-snug text-slate-400">
                  User-defined custom terminal palette.
                </span>
              </button>
            </div>

            {/* Custom Theme Builder */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-200">Custom Theme Builder</h4>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] text-slate-400">Quick BG:</span>
                  {['#0b111a', '#0f172a', '#18181b', '#1a1025', '#0d2622', '#261414', '#f8fafc'].map((bgHex) => (
                    <button
                      key={bgHex}
                      type="button"
                      title={`Set background ${bgHex}`}
                      onClick={() => {
                        setCustomBg(bgHex);
                        const nextFg = bgHex === '#f8fafc' ? '#0f172a' : customFg;
                        if (bgHex === '#f8fafc') setCustomFg(nextFg);
                        onUpdate({
                          profileId: 'custom',
                          customTheme: {
                            background: bgHex,
                            foreground: nextFg,
                            cursor: customCursor,
                            accent: customAccent,
                          },
                        });
                      }}
                      className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${
                        customBg.toLowerCase() === bgHex ? 'border-sky-400 ring-1 ring-sky-400' : 'border-white/25'
                      }`}
                      style={{ backgroundColor: bgHex }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Background</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(customBg) ? customBg : '#141b22'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomBg(val);
                        onUpdate({
                          profileId: 'custom',
                          customTheme: {
                            background: val,
                            foreground: customFg,
                            cursor: customCursor,
                            accent: customAccent,
                          },
                        });
                      }}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/25 bg-transparent"
                    />
                    <input
                      type="text"
                      value={customBg}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomBg(val);
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          onUpdate({
                            profileId: 'custom',
                            customTheme: {
                              background: val,
                              foreground: customFg,
                              cursor: customCursor,
                              accent: customAccent,
                            },
                          });
                        }
                      }}
                      className="w-full min-w-0 rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] text-slate-200 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Foreground</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(customFg) ? customFg : '#e2eff3'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomFg(val);
                        onUpdate({
                          profileId: 'custom',
                          customTheme: {
                            background: customBg,
                            foreground: val,
                            cursor: customCursor,
                            accent: customAccent,
                          },
                        });
                      }}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/25 bg-transparent"
                    />
                    <input
                      type="text"
                      value={customFg}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomFg(val);
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          onUpdate({
                            profileId: 'custom',
                            customTheme: {
                              background: customBg,
                              foreground: val,
                              cursor: customCursor,
                              accent: customAccent,
                            },
                          });
                        }
                      }}
                      className="w-full min-w-0 rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] text-slate-200 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Cursor</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(customCursor) ? customCursor : '#56d4dd'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomCursor(val);
                        onUpdate({
                          profileId: 'custom',
                          customTheme: {
                            background: customBg,
                            foreground: customFg,
                            cursor: val,
                            accent: customAccent,
                          },
                        });
                      }}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/25 bg-transparent"
                    />
                    <input
                      type="text"
                      value={customCursor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomCursor(val);
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          onUpdate({
                            profileId: 'custom',
                            customTheme: {
                              background: customBg,
                              foreground: customFg,
                              cursor: val,
                              accent: customAccent,
                            },
                          });
                        }
                      }}
                      className="w-full min-w-0 rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] text-slate-200 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">Accent</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(customAccent) ? customAccent : '#3b82f6'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomAccent(val);
                        onUpdate({
                          profileId: 'custom',
                          customTheme: {
                            background: customBg,
                            foreground: customFg,
                            cursor: customCursor,
                            accent: val,
                          },
                        });
                      }}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-white/25 bg-transparent"
                    />
                    <input
                      type="text"
                      value={customAccent}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomAccent(val);
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          onUpdate({
                            profileId: 'custom',
                            customTheme: {
                              background: customBg,
                              foreground: customFg,
                              cursor: customCursor,
                              accent: val,
                            },
                          });
                        }
                      }}
                      className="w-full min-w-0 rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] text-slate-200 focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      profileId: 'custom',
                      customTheme: {
                        background: customBg,
                        foreground: customFg,
                        cursor: customCursor,
                        accent: customAccent,
                      },
                    })
                  }
                  className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
                >
                  Apply Custom Theme
                </button>
              </div>
            </div>
          </section>

          <div className="h-px bg-white/10" />

          {/* Text & Cursor */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="font-size-range" className="text-xs font-medium text-slate-300">
                  Font Size
                </label>
                <span className="font-mono text-xs tabular-nums text-slate-400">{settings.fontSize} px</span>
              </div>
              <input
                id="font-size-range"
                type="range"
                min={9}
                max={26}
                step={0.5}
                value={settings.fontSize}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="w-full accent-sky-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="opacity-range" className="text-xs font-medium text-slate-300">
                  Window Opacity
                </label>
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {Math.round(settings.opacity * 100)}%
                </span>
              </div>
              <input
                id="opacity-range"
                type="range"
                min={72}
                max={100}
                step={2}
                value={Math.round(settings.opacity * 100)}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
                className="w-full accent-sky-500"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Terminal Monospace Font</span>
              <select
                value={settings.terminalFontFamily ?? '"JetBrains Mono", "SF Mono", Menlo, monospace'}
                onChange={(e) => onUpdate({ terminalFontFamily: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
              >
                <option value='"JetBrains Mono", "SF Mono", Menlo, monospace'>JetBrains Mono (Ligatures)</option>
                <option value='"Fira Code", monospace'>Fira Code (Code Ligatures)</option>
                <option value='"IBM Plex Mono", monospace'>IBM Plex Mono (Technical)</option>
                <option value='"SF Mono", Menlo, monospace'>SF Mono (Apple System)</option>
                <option value='"Source Code Pro", monospace'>Source Code Pro (Adobe)</option>
              </select>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">macOS UI Font</span>
              <select
                value={settings.uiFontFamily ?? '"Plus Jakarta Sans", sans-serif'}
                onChange={(e) => onUpdate({ uiFontFamily: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
              >
                <option value='"Plus Jakarta Sans", sans-serif'>Plus Jakarta Sans (Modern)</option>
                <option value='"DM Sans", sans-serif'>DM Sans (Geometric Clean)</option>
                <option value='"Manrope", sans-serif'>Manrope (Semi-Extended)</option>
              </select>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Cursor Style</span>
              <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-white/10 bg-black/30 p-1">
                {(['block', 'underline', 'bar'] as CursorStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onUpdate({ cursorStyle: style })}
                    className={`rounded-md py-1 text-xs font-medium capitalize transition-colors ${
                      settings.cursorStyle === style
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3">
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="text-xs font-medium text-slate-200">Blink Cursor</span>
                <input
                  type="checkbox"
                  checked={settings.cursorBlink}
                  onChange={(e) => onUpdate({ cursorBlink: e.target.checked })}
                  className="h-4 w-4 accent-sky-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="text-xs font-medium text-slate-200">Show Bottom Dock</span>
                <input
                  type="checkbox"
                  checked={settings.showDock}
                  onChange={(e) => onUpdate({ showDock: e.target.checked })}
                  className="h-4 w-4 accent-sky-500"
                />
              </label>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <label htmlFor="sound-toggle" className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-200">
                  <Volume2 className="h-3.5 w-3.5 text-sky-400" />
                  <span>Terminal Audio Feedback</span>
                </label>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.setEnabled(true);
                      soundEffects.bell();
                      if (settings.soundEnabled === false) {
                        onUpdate({ soundEnabled: true });
                      }
                    }}
                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10.5px] font-medium text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    Test
                  </button>
                  <input
                    id="sound-toggle"
                    type="checkbox"
                    checked={settings.soundEnabled !== false}
                    onChange={(e) => {
                      const next = e.target.checked;
                      onUpdate({ soundEnabled: next });
                      if (next) {
                        soundEffects.setEnabled(true);
                        soundEffects.tabCreate();
                      }
                    }}
                    className="h-4 w-4 accent-sky-500"
                  />
                </div>
              </div>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="text-xs font-medium text-slate-200">Mobile Haptics</span>
                <input
                  type="checkbox"
                  checked={settings.hapticsEnabled !== false}
                  onChange={(e) => onUpdate({ hapticsEnabled: e.target.checked })}
                  className="h-4 w-4 accent-sky-500"
                />
              </label>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
                <span className="text-xs font-medium text-slate-200">Touch Keys</span>
                <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5">
                  {(['auto', 'always', 'off'] as TouchBarMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdate({ showTouchBar: mode })}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                        settings.showTouchBar === mode
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="h-px bg-white/10" />

          <section className="space-y-3 rounded-xl border border-sky-500/20 bg-sky-950/15 p-4">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-200">Android Home Folder</h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Choose a folder you own. MacTerm imports up to 2 MB of text files into <code className="text-sky-300">~</code>; binary files are skipped. Android only grants access to the folder you select. This is a local snapshot, so re-import to refresh it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (window.AndroidBridge?.pickHomeDirectory) {
                    window.AndroidBridge.pickHomeDirectory();
                    setHomeFolderStatus('Choose a folder in Android’s picker…');
                  } else {
                    setHomeFolderStatus('Folder access is available in the MacTerm Android APK.');
                  }
                }}
                className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Choose folder and import
              </button>
              {homeFolderStatus && <span aria-live="polite" className="text-[11px] text-slate-300">{homeFolderStatus}</span>}
            </div>
          </section>

          {/* Local Runtime Storage */}
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold text-slate-200">Local Virtual Filesystem</h3>
              <p className="text-xs tabular-nums text-slate-400">
                {fsStats.dirs} directories · {fsStats.files} files · {(fsStats.bytes / 1024).toFixed(1)} KB stored locally
              </p>
            </div>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filesystem
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    vfs.reset();
                    packageRegistry.reset();
                    clearAllPersistedSessions();
                    clearPersistedLayout();
                    setConfirmReset(false);
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                >
                  Confirm Reset
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
