import { ShellSession } from './shell';

class SessionRegistry {
  private sessions = new Map<string, ShellSession>();
  private titles = new Map<string, string>();
  private titleListeners = new Set<() => void>();

  public getOrCreate(paneId: string, onExit?: () => void): ShellSession {
    const existing = this.sessions.get(paneId);
    if (existing) return existing;

    const session = new ShellSession({
      paneId,
      onTitleChange: (title) => {
        this.titles.set(paneId, title);
        for (const fn of this.titleListeners) fn();
      },
      onExitSession: onExit,
    });
    this.sessions.set(paneId, session);
    return session;
  }

  public get(paneId: string): ShellSession | undefined {
    return this.sessions.get(paneId);
  }

  public getTitle(paneId: string): string {
    return this.titles.get(paneId) ?? 'pogs@mac: ~ — zsh';
  }

  public dispose(paneId: string, removePersistence = false): void {
    const s = this.sessions.get(paneId);
    if (s) {
      s.dispose(removePersistence);
      this.sessions.delete(paneId);
      this.titles.delete(paneId);
    }
  }

  public subscribeTitles(fn: () => void): () => void {
    this.titleListeners.add(fn);
    return () => this.titleListeners.delete(fn);
  }
}

export const sessionRegistry = new SessionRegistry();
