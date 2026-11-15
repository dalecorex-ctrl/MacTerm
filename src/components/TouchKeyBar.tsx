import { useState } from 'react';
import { haptics } from '../runtime/haptics';

interface TouchKeyBarProps {
  isLightTheme: boolean;
  onSendSequence: (seq: string) => void;
}

export function TouchKeyBar({ isLightTheme, onSendSequence }: TouchKeyBarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);

  const emit = (seq: string, isChar = false) => {
    haptics.tap();
    if (ctrlActive && isChar && seq.length === 1) {
      const code = seq.toUpperCase().charCodeAt(0) - 64;
      if (code >= 1 && code <= 26) {
        onSendSequence(String.fromCharCode(code));
      } else {
        onSendSequence(seq);
      }
      setCtrlActive(false);
      return;
    }
    if (ctrlActive) setCtrlActive(false);
    onSendSequence(seq);
  };

  const keys: Array<{ label: string; seq: string; isChar?: boolean; isCtrl?: boolean }> = [
    { label: 'ESC', seq: '\x1b' },
    { label: 'TAB', seq: '\t' },
    { label: 'CTRL', seq: '', isCtrl: true },
    { label: '^C', seq: '\x03' },
    { label: '^D', seq: '\x04' },
    { label: '↑', seq: '\x1b[A' },
    { label: '↓', seq: '\x1b[B' },
    { label: '←', seq: '\x1b[D' },
    { label: '→', seq: '\x1b[C' },
    { label: '|', seq: '|', isChar: true },
    { label: '~', seq: '~', isChar: true },
    { label: '/', seq: '/', isChar: true },
    { label: '-', seq: '-', isChar: true },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Touch Terminal Keys"
      className={`flex shrink-0 items-center gap-1 overflow-x-auto border-t px-2 py-1.5 ${
        isLightTheme
          ? 'border-black/10 bg-black/[0.04]'
          : 'border-white/10 bg-black/35'
      }`}
    >
      {keys.map((k) => {
        const active = k.isCtrl && ctrlActive;
        return (
          <button
            key={k.label}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // Keep focus inside xterm textarea
            }}
            onClick={() => {
              if (k.isCtrl) {
                haptics.tap();
                setCtrlActive((v) => !v);
              } else {
                emit(k.seq, k.isChar);
              }
            }}
            className={`flex h-7 min-w-[36px] shrink-0 items-center justify-center rounded-md px-2 font-mono text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-sky-500 text-white'
                : isLightTheme
                  ? 'border border-black/10 bg-white text-slate-800 active:bg-slate-200'
                  : 'border border-white/10 bg-white/[0.07] text-slate-200 active:bg-white/20'
            }`}
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}
