export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strike: '\x1b[9m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  fg256: (n: number) => `\x1b[38;5;${n}m`,
  bg256: (n: number) => `\x1b[48;5;${n}m`,
  fgRgb: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
  bgRgb: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,

  clearScreen: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K',
  clearToEnd: '\x1b[K',
  clearToScreenEnd: '\x1b[J',
  altScreenOn: '\x1b[?1049h',
  altScreenOff: '\x1b[?1049l',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  saveCursor: '\x1b7',
  restoreCursor: '\x1b8',
  moveTo: (row: number, col: number) => `\x1b[${Math.max(1, row)};${Math.max(1, col)}H`,
  moveUp: (n = 1) => `\x1b[${n}A`,
  moveDown: (n = 1) => `\x1b[${n}B`,
  moveRight: (n = 1) => `\x1b[${n}C`,
  moveLeft: (n = 1) => `\x1b[${n}D`,
  bell: '\x07',
};

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export interface Termios {
  icanon: boolean;
  echo: boolean;
  isig: boolean;
  opost: boolean;
  icrnl: boolean;
  baudRate: number;
}

export type TtyDataListener = (data: string) => void;
export type TtyResizeListener = (cols: number, rows: number) => void;

export class TtyDevice {
  public readonly id: string;
  public readonly path: string;
  public cols = 80;
  public rows = 24;
  public termios: Termios = {
    icanon: true,
    echo: true,
    isig: true,
    opost: true,
    icrnl: true,
    baudRate: 38400,
  };

  private writeTarget: ((data: string) => void) | null = null;
  private dataListeners = new Set<TtyDataListener>();
  private resizeListeners = new Set<TtyResizeListener>();
  private titleListener: ((title: string) => void) | null = null;
  private bufferQueue: string[] = [];

  constructor(index: number) {
    const suffix = String(index).padStart(3, '0');
    this.id = `ttys${suffix}`;
    this.path = `/dev/ttys${suffix}`;
  }

  public attachOutput(fn: (data: string) => void): () => void {
    this.writeTarget = fn;
    if (this.bufferQueue.length > 0) {
      for (const chunk of this.bufferQueue) {
        fn(chunk);
      }
      this.bufferQueue = [];
    }
    return () => {
      if (this.writeTarget === fn) {
        this.writeTarget = null;
      }
    };
  }

  public attachTitleListener(fn: (title: string) => void): void {
    this.titleListener = fn;
  }

  public setTitle(title: string): void {
    this.titleListener?.(title);
  }

  public write(data: string): void {
    if (this.writeTarget) {
      this.writeTarget(data);
    } else {
      this.bufferQueue.push(data);
    }
  }

  public writeln(line = ''): void {
    this.write(line + '\r\n');
  }

  public emitInput(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  public onData(listener: TtyDataListener): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  public setSize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    for (const listener of this.resizeListeners) {
      listener(cols, rows);
    }
  }

  public onResize(listener: TtyResizeListener): () => void {
    this.resizeListeners.add(listener);
    return () => {
      this.resizeListeners.delete(listener);
    };
  }

  public setRawMode(raw: boolean): void {
    if (raw) {
      this.termios.icanon = false;
      this.termios.echo = false;
    } else {
      this.termios.icanon = true;
      this.termios.echo = true;
      this.termios.isig = true;
      this.termios.opost = true;
      this.termios.icrnl = true;
    }
  }
}
