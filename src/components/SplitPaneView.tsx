import { useRef } from 'react';
import type { SplitNode, TerminalSettings } from '../types/ui';
import { TerminalPane } from './TerminalPane';

interface SplitPaneViewProps {
  node: SplitNode;
  activePaneId: string;
  isTabVisible: boolean;
  isSplit: boolean;
  isLightTheme: boolean;
  settings: TerminalSettings;
  onFocusPane: (paneId: string) => void;
  onExitPane: (paneId: string) => void;
  onUpdateRatio: (splitId: string, ratio: number) => void;
  onChangeFontSize: (fontSize: number) => void;
}

export function SplitPaneView({
  node,
  activePaneId,
  isTabVisible,
  isSplit,
  isLightTheme,
  settings,
  onFocusPane,
  onExitPane,
  onUpdateRatio,
  onChangeFontSize,
}: SplitPaneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (node.type === 'leaf') {
    return (
      <TerminalPane
        paneId={node.paneId}
        isFocused={node.paneId === activePaneId}
        isTabVisible={isTabVisible}
        isSplit={isSplit}
        settings={settings}
        onFocus={onFocusPane}
        onExitPane={onExitPane}
        onChangeFontSize={onChangeFontSize}
      />
    );
  }

  const isHorizontalSplit = node.direction === 'horizontal'; // side-by-side left/right

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const onMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const rawRatio = isHorizontalSplit
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.18, Math.min(0.82, rawRatio));
      onUpdateRatio(node.id, clamped);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const firstPct = `${(node.ratio * 100).toFixed(2)}%`;
  const secondPct = `${((1 - node.ratio) * 100).toFixed(2)}%`;

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${isHorizontalSplit ? 'flex-row' : 'flex-col'}`}
    >
      <div style={{ flexBasis: firstPct }} className="min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden">
        <SplitPaneView
          node={node.first}
          activePaneId={activePaneId}
          isTabVisible={isTabVisible}
          isSplit={true}
          isLightTheme={isLightTheme}
          settings={settings}
          onFocusPane={onFocusPane}
          onExitPane={onExitPane}
          onUpdateRatio={onUpdateRatio}
          onChangeFontSize={onChangeFontSize}
        />
      </div>

      <div
        role="separator"
        aria-orientation={isHorizontalSplit ? 'vertical' : 'horizontal'}
        onMouseDown={handleDividerMouseDown}
        className={`shrink-0 transition-colors ${
          isHorizontalSplit ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize'
        } ${
          isLightTheme
            ? 'bg-black/10 hover:bg-sky-500/60'
            : 'bg-white/10 hover:bg-sky-400/60'
        }`}
      />

      <div style={{ flexBasis: secondPct }} className="min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden">
        <SplitPaneView
          node={node.second}
          activePaneId={activePaneId}
          isTabVisible={isTabVisible}
          isSplit={true}
          isLightTheme={isLightTheme}
          settings={settings}
          onFocusPane={onFocusPane}
          onExitPane={onExitPane}
          onUpdateRatio={onUpdateRatio}
          onChangeFontSize={onChangeFontSize}
        />
      </div>
    </div>
  );
}
