import { ANSI, hslToRgb, stripAnsi } from '../tty';
import type { CommandHandler } from '../types';
import { packageRegistry } from '../packages';

// Clean 5-row uppercase + basic punctuation block glyph map for figlet/toilet
const FIGLET_GLYPHS: Record<string, string[]> = {
  A: ['  ▄▀▄  ', ' █   █ ', ' █████ ', ' █   █ ', ' █   █ '],
  B: [' ████  ', ' █   █ ', ' ████  ', ' █   █ ', ' ████  '],
  C: ['  ████ ', ' █     ', ' █     ', ' █     ', '  ████ '],
  D: [' ████  ', ' █   █ ', ' █   █ ', ' █   █ ', ' ████  '],
  E: [' █████ ', ' █     ', ' ████  ', ' █     ', ' █████ '],
  F: [' █████ ', ' █     ', ' ████  ', ' █     ', ' █     '],
  G: ['  ████ ', ' █     ', ' █  ██ ', ' █   █ ', '  ████ '],
  H: [' █   █ ', ' █   █ ', ' █████ ', ' █   █ ', ' █   █ '],
  I: [' █████ ', '   █   ', '   █   ', '   █   ', ' █████ '],
  J: [' █████ ', '    █  ', '    █  ', ' █  █  ', '  ██   '],
  K: [' █   █ ', ' █  █  ', ' ███   ', ' █  █  ', ' █   █ '],
  L: [' █     ', ' █     ', ' █     ', ' █     ', ' █████ '],
  M: [' █   █ ', ' ██ ██ ', ' █ █ █ ', ' █   █ ', ' █   █ '],
  N: [' █   █ ', ' ██  █ ', ' █ █ █ ', ' █  ██ ', ' █   █ '],
  O: ['  ███  ', ' █   █ ', ' █   █ ', ' █   █ ', '  ███  '],
  P: [' ████  ', ' █   █ ', ' ████  ', ' █     ', ' █     '],
  Q: ['  ███  ', ' █   █ ', ' █   █ ', ' █  ▄█ ', '  ██▀▄ '],
  R: [' ████  ', ' █   █ ', ' ████  ', ' █  █  ', ' █   █ '],
  S: ['  ████ ', ' █     ', '  ███  ', '     █ ', ' ████  '],
  T: [' █████ ', '   █   ', '   █   ', '   █   ', '   █   '],
  U: [' █   █ ', ' █   █ ', ' █   █ ', ' █   █ ', '  ███  '],
  V: [' █   █ ', ' █   █ ', ' █   █ ', '  █ █  ', '   █   '],
  W: [' █   █ ', ' █   █ ', ' █ █ █ ', ' ██ ██ ', ' █   █ '],
  X: [' █   █ ', '  █ █  ', '   █   ', '  █ █  ', ' █   █ '],
  Y: [' █   █ ', '  █ █  ', '   █   ', '   █   ', '   █   '],
  Z: [' █████ ', '    █  ', '   █   ', '  █    ', ' █████ '],
  '0': ['  ███  ', ' █  ██ ', ' █ █ █ ', ' ██  █ ', '  ███  '],
  '1': ['   █   ', '  ██   ', '   █   ', '   █   ', ' █████ '],
  '2': [' ████  ', '     █ ', '  ███  ', ' █     ', ' █████ '],
  '3': [' ████  ', '     █ ', '  ███  ', '     █ ', ' ████  '],
  '4': [' █   █ ', ' █   █ ', ' █████ ', '     █ ', '     █ '],
  '5': [' █████ ', ' █     ', ' ████  ', '     █ ', ' ████  '],
  '6': ['  ████ ', ' █     ', ' ████  ', ' █   █ ', '  ███  '],
  '7': [' █████ ', '    █  ', '   █   ', '  █    ', '  █    '],
  '8': ['  ███  ', ' █   █ ', '  ███  ', ' █   █ ', '  ███  '],
  '9': ['  ███  ', ' █   █ ', '  ████ ', '     █ ', '  ███  '],
  '!': ['  █  ', '  █  ', '  █  ', '     ', '  █  '],
  '.': ['     ', '     ', '     ', '     ', '  █  '],
  '-': ['     ', '     ', ' ─── ', '     ', '     '],
  '_': ['     ', '     ', '     ', '     ', ' ─── '],
  '/': ['    █ ', '   █  ', '  █   ', ' █    ', '█     '],
  ' ': ['     ', '     ', '     ', '     ', '     '],
};

const FORTUNES = [
  'There is no place like ~.',
  'A good terminal never asks for permission twice — unless you forgot sudo.',
  'In Unix everything is a file; in TTY everything is an escape sequence.',
  'Make each program do one thing well, and pipe its output through lolcat.',
  'Premature optimization is the root of all evil. — Donald Knuth',
  'Talk is cheap. Show me the ANSI hex dump.',
  'Termios rule #1: always restore ICANON and ECHO before exiting raw mode.',
];

export const ttyAnsiCommands: Record<string, CommandHandler> = {
  tty: ({ tty, writeStdout }) => {
    writeStdout(`${tty.path}\n`);
    return 0;
  },

  stty: ({ args, tty, writeStdout, writeStderr }) => {
    if (args.includes('size')) {
      writeStdout(`${tty.rows} ${tty.cols}\n`);
      return 0;
    }
    if (args.includes('raw')) {
      tty.setRawMode(true);
      return 0;
    }
    if (args.includes('sane') || args.includes('-raw') || args.includes('cooked')) {
      tty.setRawMode(false);
      return 0;
    }
    if (args.includes('-a') || args.length === 0) {
      const t = tty.termios;
      writeStdout(`speed ${t.baudRate} baud; ${tty.rows} rows; ${tty.cols} columns;\n`);
      writeStdout(`lflags: ${t.icanon ? 'icanon' : '-icanon'} ${t.isig ? 'isig' : '-isig'} ${t.echo ? 'echo' : '-echo'} echoe echok\n`);
      writeStdout(`iflags: ${t.icrnl ? 'icrnl' : '-icrnl'} ixon ixany imaxbel iutf8\n`);
      writeStdout(`oflags: ${t.opost ? 'opost' : '-opost'} onlcr oxtabs\n`);
      writeStdout(`cchars: intr = ^C; quit = ^\\; erase = ^?; kill = ^U; eof = ^D; susp = ^Z;\n`);
      return 0;
    }
    writeStderr(`stty: unknown option '${args[0]}'\n`);
    return 1;
  },

  tput: ({ args, tty, writeStdout, writeStderr }) => {
    const cap = args[0];
    if (!cap) {
      writeStderr('usage: tput capname [args]\n');
      return 1;
    }
    switch (cap) {
      case 'cols':
        writeStdout(`${tty.cols}\n`);
        return 0;
      case 'lines':
        writeStdout(`${tty.rows}\n`);
        return 0;
      case 'colors':
        writeStdout('256\n');
        return 0;
      case 'clear':
        tty.write(ANSI.clearScreen);
        return 0;
      case 'sgr0':
      case 'reset':
        writeStdout(ANSI.reset);
        return 0;
      case 'bold':
        writeStdout(ANSI.bold);
        return 0;
      case 'smul':
        writeStdout(ANSI.underline);
        return 0;
      case 'rev':
        writeStdout(ANSI.inverse);
        return 0;
      case 'civis':
        writeStdout(ANSI.hideCursor);
        return 0;
      case 'cnorm':
        writeStdout(ANSI.showCursor);
        return 0;
      case 'setaf': {
        const c = parseInt(args[1] ?? '7', 10);
        writeStdout(ANSI.fg256(Math.max(0, Math.min(255, c))));
        return 0;
      }
      case 'setab': {
        const c = parseInt(args[1] ?? '0', 10);
        writeStdout(ANSI.bg256(Math.max(0, Math.min(255, c))));
        return 0;
      }
      case 'cup': {
        const r = (parseInt(args[1] ?? '0', 10) || 0) + 1;
        const c = (parseInt(args[2] ?? '0', 10) || 0) + 1;
        writeStdout(ANSI.moveTo(r, c));
        return 0;
      }
      default:
        writeStderr(`tput: unknown terminfo capability '${cap}'\n`);
        return 1;
    }
  },

  colortest: ({ writeStdout }) => {
    writeStdout(`${ANSI.bold}ANSI 16-Color System Palette:${ANSI.reset}\n`);
    let row1 = '  ';
    let row2 = '  ';
    for (let i = 0; i < 8; i++) {
      row1 += `\x1b[48;5;${i}m   \x1b[0m `;
      row2 += `\x1b[48;5;${i + 8}m   \x1b[0m `;
    }
    writeStdout(row1 + '\n' + row2 + '\n\n');

    writeStdout(`${ANSI.bold}xterm-256 Color Cube (16..231):${ANSI.reset}\n`);
    for (let g = 0; g < 6; g++) {
      let line = '  ';
      for (let r = 0; r < 6; r++) {
        for (let b = 0; b < 6; b++) {
          const code = 16 + r * 36 + g * 6 + b;
          line += `${ANSI.bg256(code)}  `;
        }
        line += `${ANSI.reset} `;
      }
      writeStdout(line + ANSI.reset + '\n');
    }
    writeStdout(`\n${ANSI.bold}256-Color Grayscale Ramp (232..255):${ANSI.reset}\n  `);
    let gray = '';
    for (let i = 232; i <= 255; i++) {
      gray += `${ANSI.bg256(i)}  `;
    }
    writeStdout(gray + ANSI.reset + '\n\n');

    writeStdout(`${ANSI.bold}SGR Text Attributes:${ANSI.reset}\n`);
    writeStdout(`  ${ANSI.bold}Bold${ANSI.reset}  ${ANSI.dim}Dim${ANSI.reset}  ${ANSI.italic}Italic${ANSI.reset}  ${ANSI.underline}Underline${ANSI.reset}  ${ANSI.inverse}Inverse${ANSI.reset}  ${ANSI.strike}Strikethrough${ANSI.reset}\n`);
    return 0;
  },

  '256colors': (ctx) => ttyAnsiCommands.colortest(ctx),

  truecolor: ({ tty, writeStdout }) => {
    const width = Math.min(tty.cols - 4, 72);
    writeStdout(`${ANSI.bold}24-bit TrueColor RGB Spectrum (${width} steps):${ANSI.reset}\n`);
    for (let row = 0; row < 3; row++) {
      let line = '  ';
      for (let i = 0; i < width; i++) {
        const hue = (i / width) * 360;
        const lightness = row === 0 ? 0.65 : row === 1 ? 0.5 : 0.35;
        const [r, g, b] = hslToRgb(hue, 0.9, lightness);
        line += `${ANSI.bgRgb(r, g, b)} `;
      }
      writeStdout(line + ANSI.reset + '\n');
    }
    return 0;
  },

  'ansi-art': ({ writeStdout }) => {
    const art = [
      `${ANSI.fgRgb(255, 95, 86)}  ╭──────────────────────────────────────╮${ANSI.reset}`,
      `${ANSI.fgRgb(255, 189, 46)}  │  macOS Darwin TTY · ANSI TrueColor   │${ANSI.reset}`,
      `${ANSI.fgRgb(39, 201, 63)}  │  UTF-8 · VT100 · xterm-256color      │${ANSI.reset}`,
      `${ANSI.fgRgb(74, 158, 255)}  ╰──────────────────────────────────────╯${ANSI.reset}`,
    ];
    writeStdout(art.join('\n') + '\n');
    return 0;
  },

  spark: ({ args, stdin, writeStdout }) => {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const raw = (args.length > 0 ? args.join(' ') : stdin).trim();
    const nums = raw.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return 0;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    const sparkline = nums
      .map((n) => {
        const idx = Math.min(blocks.length - 1, Math.floor(((n - min) / range) * (blocks.length - 1)));
        return blocks[idx];
      })
      .join('');
    writeStdout(`${ANSI.brightCyan}${sparkline}${ANSI.reset}\n`);
    return 0;
  },

  figlet: ({ args, stdin, writeStdout }) => {
    const text = (args.filter((a) => !a.startsWith('-')).join(' ') || stdin.trim() || 'MACOS').toUpperCase();
    const rows = ['', '', '', '', ''];
    for (const ch of text) {
      const glyph = FIGLET_GLYPHS[ch] ?? FIGLET_GLYPHS[' '];
      for (let r = 0; r < 5; r++) {
        rows[r] += glyph[r];
      }
    }
    writeStdout(rows.join('\n') + '\n');
    return 0;
  },

  toilet: (ctx) => ttyAnsiCommands.figlet(ctx),

  lolcat: ({ args, stdin, writeStdout }) => {
    const text = args.length > 0 ? args.join(' ') + '\n' : stdin;
    if (!text) return 0;
    const lines = text.split('\n');
    let phase = Math.random() * 360;
    lines.forEach((line, lineIdx) => {
      if (lineIdx === lines.length - 1 && line === '') return;
      const plain = stripAnsi(line);
      let colored = '';
      for (let i = 0; i < plain.length; i++) {
        const hue = (phase + i * 7 + lineIdx * 18) % 360;
        const [r, g, b] = hslToRgb(hue, 0.92, 0.62);
        colored += `${ANSI.fgRgb(r, g, b)}${plain[i]}`;
      }
      writeStdout(colored + ANSI.reset + '\n');
    });
    return 0;
  },

  cowsay: ({ args, stdin, writeStdout }) => {
    const msg = (args.filter((a) => !a.startsWith('-')).join(' ') || stdin.trim() || 'Moo from macOS Terminal!').replace(/\n/g, ' ');
    const width = Math.min(48, Math.max(10, msg.length));
    const border = '─'.repeat(width + 2);
    const padded = msg.slice(0, 48).padEnd(width, ' ');
    writeStdout(` ╭${border}╮\n`);
    writeStdout(` │ ${padded} │\n`);
    writeStdout(` ╰${border}╯\n`);
    writeStdout(`        \\   ^__^\n`);
    writeStdout(`         \\  (oo)\\_______\n`);
    writeStdout(`            (__)\\       )\\/\\\n`);
    writeStdout(`                ||----w |\n`);
    writeStdout(`                ||     ||\n`);
    return 0;
  },

  fortune: ({ writeStdout, writeStderr }) => {
    if (!packageRegistry.isBinaryAvailable('fortune')) {
      writeStderr(`zsh: command not found: fortune (install with: brew install fortune)\n`);
      return 127;
    }
    const quote = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    writeStdout(quote + '\n');
    return 0;
  },

  boxes: ({ args, stdin, writeStdout, writeStderr }) => {
    if (!packageRegistry.isBinaryAvailable('boxes')) {
      writeStderr(`zsh: command not found: boxes (install with: brew install boxes)\n`);
      return 127;
    }
    const text = (args.join(' ') || stdin || 'macOS TTY').trimEnd();
    const lines = text.split('\n');
    const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length), 4);
    const top = `╔═${'═'.repeat(maxLen)}═╗`;
    const bot = `╚═${'═'.repeat(maxLen)}═╝`;
    writeStdout(`${ANSI.cyan}${top}${ANSI.reset}\n`);
    for (const l of lines) {
      const pad = ' '.repeat(maxLen - stripAnsi(l).length);
      writeStdout(`${ANSI.cyan}║${ANSI.reset} ${l}${pad} ${ANSI.cyan}║${ANSI.reset}\n`);
    }
    writeStdout(`${ANSI.cyan}${bot}${ANSI.reset}\n`);
    return 0;
  },

  neofetch: ({ tty, shell, writeStdout }) => {
    const installedCount = packageRegistry.listInstalled().length;
    const mins = Math.max(1, Math.floor(performance.now() / 60000) + 14);
    const G = ANSI.green;
    const Y = ANSI.yellow;
    const R = ANSI.red;
    const M = ANSI.magenta;
    const B = ANSI.blue;
    const C = ANSI.cyan;
    const W = ANSI.brightWhite;
    const D = ANSI.brightBlack;
    const Z = ANSI.reset;

    const logo = [
      `                    ${G}c.'${Z}           `,
      `                 ${G},xNMM.${Z}           `,
      `               ${G}.OMMMMo${Z}            `,
      `               ${G}lMM"${Z}               `,
      `     ${G}.;loddo:.  .olloddol;.${Z}       `,
      `   ${G}cKMMMMMMMMMMNWMMMMMMMMMM0:${Z}     `,
      ` ${Y}.KMMMMMMMMMMMMMMMMMMMMMMMWd.${Z}     `,
      ` ${Y}XMMMMMMMMMMMMMMMMMMMMMMMX.${Z}       `,
      `${R};MMMMMMMMMMMMMMMMMMMMMMMM:${Z}        `,
      `${R}:MMMMMMMMMMMMMMMMMMMMMMMM:${Z}        `,
      `${M}.MMMMMMMMMMMMMMMMMMMMMMMMX.${Z}       `,
      ` ${M}kMMMMMMMMMMMMMMMMMMMMMMMMWd.${Z}     `,
      ` ${B}'XMMMMMMMMMMMMMMMMMMMMMMMMMMk${Z}    `,
      `  ${B}'XMMMMMMMMMMMMMMMMMMMMMMMMK.${Z}    `,
      `    ${B}kMMMMMMMMMMMMMMMMMMMMMMd${Z}      `,
      `     ${B};KMMMMMMMWXXWMMMMMMMk.${Z}       `,
      `       ${B}"cooc*"    "*coo'"${Z}        `,
    ];

    const swatches1 = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${ANSI.bg256(i)}   `).join('') + Z;
    const swatches2 = [8, 9, 10, 11, 12, 13, 14, 15].map((i) => `${ANSI.bg256(i)}   `).join('') + Z;

    const info = [
      `${ANSI.bold}${C}${shell.env.USER ?? 'pogs'}${W}@${C}mac.local${Z}`,
      `${D}───────────────────────────────${Z}`,
      `${ANSI.bold}${C}OS${Z}: macOS Sequoia 15.2 arm64`,
      `${ANSI.bold}${C}Host${Z}: Mac (Apple Silicon)`,
      `${ANSI.bold}${C}Kernel${Z}: Darwin 24.2.0`,
      `${ANSI.bold}${C}Uptime${Z}: ${mins} mins`,
      `${ANSI.bold}${C}Packages${Z}: ${installedCount} (brew)`,
      `${ANSI.bold}${C}Shell${Z}: zsh 5.9`,
      `${ANSI.bold}${C}TTY${Z}: ${tty.path} (${tty.cols}x${tty.rows})`,
      `${ANSI.bold}${C}Terminal${Z}: MacTerm.app`,
      `${ANSI.bold}${C}TERM${Z}: ${shell.env.TERM ?? 'xterm-256color'}`,
      `${ANSI.bold}${C}COLORTERM${Z}: ${shell.env.COLORTERM ?? 'truecolor'}`,
      `${ANSI.bold}${C}Font${Z}: JetBrains Mono / SF Mono`,
      `${ANSI.bold}${C}Memory${Z}: 1842MiB / 36864MiB`,
      ``,
      swatches1,
      swatches2,
    ];

    writeStdout('\n');
    for (let i = 0; i < Math.max(logo.length, info.length); i++) {
      const l = logo[i] ?? '                                  ';
      const r = info[i] ?? '';
      writeStdout(`${l}  ${r}\n`);
    }
    writeStdout('\n');
    return 0;
  },

  fastfetch: (ctx) => ttyAnsiCommands.neofetch(ctx),

  sl: async ({ tty, signal }) => {
    const train = [
      '      ====        ________                ___________ ',
      '  _D _|  |_______/        \\__I_I_____===__|_________| ',
      '   |(_)---  |   H\\________/ |   |        =|___ ___|   ',
      '   /     |  |   H  |  |     |   |         ||_| |_||   ',
      '  |      |  |   H  |__--------------------| [___] |   ',
      '  | ________|___H__/__|_____/[][]~\\_______|       |   ',
      '  |/ |   |-----------I_____I [][] []  D   |=======|__ ',
      '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ',
      ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ',
      '  \\_/      \\O=====O=====O=====O_/      \\_/            ',
    ];
    const trainWidth = train[0].length;
    tty.setRawMode(true);
    tty.write(ANSI.altScreenOn + ANSI.hideCursor);
    const startRow = Math.max(2, Math.floor((tty.rows - train.length) / 2));

    for (let x = tty.cols; x >= -trainWidth; x -= 2) {
      if (signal.aborted) break;
      let frame = ANSI.clearScreen;
      for (let r = 0; r < train.length; r++) {
        const line = train[r];
        let visible = '';
        if (x >= 0) {
          const pad = ' '.repeat(x);
          visible = (pad + line).slice(0, tty.cols);
        } else {
          visible = line.slice(-x, -x + tty.cols);
        }
        frame += `${ANSI.moveTo(startRow + r, 1)}${ANSI.brightWhite}${visible}${ANSI.reset}`;
      }
      tty.write(frame);
      await new Promise((r) => setTimeout(r, 32));
    }

    tty.write(ANSI.showCursor + ANSI.altScreenOff);
    tty.setRawMode(false);
    return signal.aborted ? 130 : 0;
  },
};
