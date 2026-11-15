export type CursorStyle = 'block' | 'underline' | 'bar';

export type TouchBarMode = 'auto' | 'always' | 'off';

export interface TerminalSettings {
  profileId: string;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  opacity: number; // 0.72 to 1.0
  showDock: boolean;
  showTouchBar: TouchBarMode;
  hapticsEnabled?: boolean;
  soundEnabled?: boolean;
  terminalFontFamily?: string;
  uiFontFamily?: string;
  customTheme?: {
    background: string;
    foreground: string;
    cursor: string;
    accent: string;
  };
}

export type SplitDirection = 'horizontal' | 'vertical';

export type SplitNode =
  | {
      type: 'leaf';
      paneId: string;
    }
  | {
      type: 'split';
      id: string;
      direction: SplitDirection;
      ratio: number; // 0.15 to 0.85
      first: SplitNode;
      second: SplitNode;
    };

export interface TerminalTab {
  id: string;
  root: SplitNode;
  activePaneId: string;
}
