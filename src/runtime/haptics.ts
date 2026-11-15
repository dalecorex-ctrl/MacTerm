export type HapticKind = 'tap' | 'tab' | 'split' | 'error' | 'copy';

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

const HAPTICS_ENABLED_KEY = 'macos_terminal_haptics_v1';

class HapticsController {
  private enabled: boolean;

  constructor() {
    this.enabled = this.loadInitialEnabled();
  }

  private loadInitialEnabled(): boolean {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(HAPTICS_ENABLED_KEY) : null;
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // ignore storage access errors
    }
    return true;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(HAPTICS_ENABLED_KEY, next ? 'true' : 'false');
      }
    } catch {
      // ignore
    }
  }

  public isMobileOrApk(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (window.AndroidBridge) return true;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const touchPoints = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');
    return coarse || touchPoints || mobileUa;
  }

  private pulse(pattern: number | number[], kind: HapticKind): void {
    if (!this.enabled || !this.isMobileOrApk()) return;

    // Web Vibration API (primary cross-platform mobile & Android WebView signal)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore blocked vibration without user activation
    }

    // Native Android APK WebView bridge reinforcement
    try {
      if (typeof window !== 'undefined') {
        if (window.AndroidBridge?.hapticFeedback) {
          window.AndroidBridge.hapticFeedback(kind);
        } else if (kind !== 'error') {
          window.AndroidBridge?.hapticTap?.();
        }
      }
    } catch {
      // Ignore native bridge errors
    }
  }

  public tap(): void {
    this.pulse(8, 'tap');
  }

  public tabCreate(): void {
    this.pulse([12], 'tab');
  }

  public tabClose(): void {
    this.pulse([8], 'tab');
  }

  public splitPane(): void {
    this.pulse([10, 28, 14], 'split');
  }

  public closePane(): void {
    this.pulse([10], 'split');
  }

  public commandError(): void {
    this.pulse([26, 36, 40], 'error');
  }

  public copy(): void {
    this.pulse([15], 'copy');
  }

  public zoomBoundary(): void {
    this.pulse([8], 'tap');
  }
}

export const haptics = new HapticsController();
