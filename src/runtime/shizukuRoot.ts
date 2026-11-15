export type PrivilegeLevel = 'user' | 'shizuku' | 'root';

declare global {
  interface Window {
    AndroidBridge?: {
      copyText?: (text: string) => void;
      hapticTap?: () => void;
      hapticFeedback?: (kind: string) => void;
      isRootAvailable?: () => boolean;
      isShizukuAvailable?: () => boolean;
      execPrivilegedCommand?: (cmd: string, mode: string) => string;
      pickHomeDirectory?: () => void;
      getHomeDirectoryName?: () => string;
      getHomeDirectorySnapshot?: () => string;
    };
  }
}

class ShizukuRootController {
  private level: PrivilegeLevel = 'user';
  private listeners = new Set<(level: PrivilegeLevel) => void>();

  constructor() {
    // Check initial native capabilities if available
  }

  public getLevel(): PrivilegeLevel {
    return this.level;
  }

  public setLevel(next: PrivilegeLevel): void {
    if (this.level === next) return;
    this.level = next;
    for (const fn of this.listeners) {
      try {
        fn(next);
      } catch {
        // ignore
      }
    }
  }

  public subscribe(fn: (level: PrivilegeLevel) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public isRoot(): boolean {
    if (typeof window !== 'undefined' && window.AndroidBridge?.isRootAvailable) {
      try {
        return Boolean(window.AndroidBridge.isRootAvailable());
      } catch {
        // fallback
      }
    }
    return this.level === 'root';
  }

  public isShizuku(): boolean {
    if (typeof window !== 'undefined' && window.AndroidBridge?.isShizukuAvailable) {
      try {
        return Boolean(window.AndroidBridge.isShizukuAvailable());
      } catch {
        // fallback
      }
    }
    return this.level === 'shizuku' || this.level === 'root';
  }

  public execSync(cmd: string, currentLevel: PrivilegeLevel): { exitCode: number; stdout: string } {
    if (currentLevel === 'user') {
      return { exitCode: 1, stdout: `Permission denied: command requires root or Shizuku elevation (${cmd})\n` };
    }

    if (typeof window !== 'undefined' && window.AndroidBridge?.execPrivilegedCommand) {
      try {
        const out = window.AndroidBridge.execPrivilegedCommand(cmd, currentLevel);
        return { exitCode: 0, stdout: out };
      } catch (err) {
        return { exitCode: 1, stdout: `Privileged execution error: ${String(err)}\n` };
      }
    }

    // Simulated privileged execution for local web runtime
    if (cmd.startsWith('su') || cmd.startsWith('sudo')) {
      return { exitCode: 0, stdout: `[${currentLevel.toUpperCase()}] Executed: ${cmd}\n` };
    }
    return { exitCode: 0, stdout: `[${currentLevel.toUpperCase()} shell] Executed: ${cmd}\n` };
  }
}

export const shizukuRoot = new ShizukuRootController();
