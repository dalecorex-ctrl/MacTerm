import type { TerminalTab } from '../types/ui';

const LAYOUT_STORAGE_KEY = 'macos_terminal_layout_v1';
const SESSIONS_STORAGE_KEY = 'macos_terminal_sessions_v1';

export interface PersistedLayout {
  tabs: TerminalTab[];
  activeTabId: string;
}

export interface PersistedPaneSession {
  cwd: string;
  prevCwd: string;
  history: string[];
  envOverrides: Record<string, string>;
  aliases: Record<string, string>;
  updatedAt: number;
}

export function loadPersistedLayout(): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayout;
    if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedLayout(tabs: TerminalTab[], activeTabId: string): void {
  try {
    const payload: PersistedLayout = { tabs, activeTabId };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPersistedLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function readAllSessions(): Record<string, PersistedPaneSession> {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedPaneSession>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllSessions(map: Record<string, PersistedPaneSession>): void {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors
  }
}

export function loadPersistedPaneSession(paneId: string): PersistedPaneSession | null {
  const all = readAllSessions();
  return all[paneId] ?? null;
}

export function savePersistedPaneSession(paneId: string, session: PersistedPaneSession): void {
  const all = readAllSessions();
  all[paneId] = {
    ...session,
    history: session.history.slice(-250),
    updatedAt: Date.now(),
  };
  writeAllSessions(all);
}

export function removePersistedPaneSession(paneId: string): void {
  const all = readAllSessions();
  if (paneId in all) {
    delete all[paneId];
    writeAllSessions(all);
  }
}

export function clearAllPersistedSessions(): void {
  try {
    localStorage.removeItem(SESSIONS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
