const AUDIO_ENABLED_KEY = 'macos_terminal_audio_v1';

class MacAudioController {
  private enabled: boolean;
  private ctx: AudioContext | null = null;

  constructor() {
    this.enabled = this.loadInitialEnabled();
  }

  private loadInitialEnabled(): boolean {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(AUDIO_ENABLED_KEY) : null;
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // ignore storage errors
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
        localStorage.setItem(AUDIO_ENABLED_KEY, next ? 'true' : 'false');
      }
    } catch {
      // ignore
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private playTone(
    freq: number,
    durationSec: number,
    opts?: {
      type?: OscillatorType;
      gain?: number;
      delaySec?: number;
      endFreq?: number;
    },
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + (opts?.delaySec ?? 0);
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = opts?.type ?? 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (opts?.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.endFreq), now + durationSec);
      }

      const peak = opts?.gain ?? 0.045;
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec + 0.015);
    } catch {
      // Ignore Web Audio errors when blocked before user gesture
    }
  }

  /** Airy crystalline macOS "Glass" chime for new tab creation */
  public tabCreate(): void {
    this.playTone(587.33, 0.09, { type: 'sine', gain: 0.038 }); // D5
    this.playTone(880.0, 0.14, { type: 'sine', gain: 0.034, delaySec: 0.048 }); // A5
  }

  /** Soft descending macOS "Tink" tone for closing a tab */
  public tabClose(): void {
    this.playTone(659.25, 0.075, { type: 'sine', gain: 0.034 }); // E5
    this.playTone(440.0, 0.11, { type: 'sine', gain: 0.028, delaySec: 0.04 }); // A4
  }

  /** Crisp dual-tap chime for splitting a pane */
  public splitPane(): void {
    this.playTone(523.25, 0.06, { type: 'triangle', gain: 0.032 }); // C5
    this.playTone(783.99, 0.095, { type: 'sine', gain: 0.032, delaySec: 0.038 }); // G5
  }

  /** Subtle soft close tick for closing a split pane */
  public closePane(): void {
    this.playTone(493.88, 0.08, { type: 'sine', gain: 0.03, endFreq: 329.63 });
  }

  /** Classic subtle macOS terminal BEL (\x07) ping */
  public bell(): void {
    this.playTone(1046.5, 0.16, { type: 'sine', gain: 0.042 }); // C6
    this.playTone(1567.98, 0.14, { type: 'sine', gain: 0.018, delaySec: 0.01 }); // G6 overtone
  }

  /** Gentle macOS notification chime for agent completion / alerts */
  public alert(): void {
    this.playTone(783.99, 0.1, { type: 'sine', gain: 0.035 }); // G5
    this.playTone(1046.5, 0.16, { type: 'sine', gain: 0.038, delaySec: 0.065 }); // C6
  }

  /** Subtle warm low "Basso" thud on command error */
  public error(): void {
    this.playTone(185.0, 0.11, { type: 'triangle', gain: 0.045, endFreq: 130.81 });
    this.playTone(146.83, 0.13, { type: 'sine', gain: 0.04, delaySec: 0.07, endFreq: 110.0 });
  }

  /** Ultra-subtle crystalline tick for copy */
  public copy(): void {
    this.playTone(1174.66, 0.055, { type: 'sine', gain: 0.022 });
  }
}

export const soundEffects = new MacAudioController();
