import { ANSI, hslToRgb } from '../tty';
import type { CommandContext, CommandHandler } from '../types';
import { processManager } from '../process';
import { packageRegistry } from '../packages';
import { vfs } from '../vfs';

function runInteractiveLoop(
  ctx: CommandContext,
  opts: {
    onKey: (key: string, exit: (code?: number) => void) => void;
    onRender: () => void;
    intervalMs?: number;
    hideCursor?: boolean;
  },
): Promise<number> {
  return new Promise((resolve) => {
    let closed = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let unsubData: (() => void) | null = null;
    let unsubResize: (() => void) | null = null;

    const cleanup = (code = 0) => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      unsubData?.();
      unsubResize?.();
      ctx.tty.write(ANSI.reset + ANSI.showCursor + ANSI.altScreenOff);
      ctx.tty.setRawMode(false);
      resolve(code);
    };

    ctx.tty.setRawMode(true);
    ctx.tty.write(ANSI.altScreenOn + (opts.hideCursor !== false ? ANSI.hideCursor : ANSI.showCursor));

    unsubData = ctx.tty.onData((data) => {
      if (data === '\x03') {
        cleanup(130);
        return;
      }
      opts.onKey(data, cleanup);
    });

    unsubResize = ctx.tty.onResize(() => {
      opts.onRender();
    });

    ctx.signal.addEventListener('abort', () => cleanup(130), { once: true });

    opts.onRender();
    if (opts.intervalMs) {
      timer = setInterval(() => {
        if (!closed) opts.onRender();
      }, opts.intervalMs);
    }
  });
}

export const tuiAppCommands: Record<string, CommandHandler> = {
  htop: async (ctx) => {
    let selectedIdx = 0;
    let tick = 0;
    let statusMsg = '';

    const render = () => {
      tick++;
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(14, ctx.tty.rows);
      const procs = processManager.list();
      if (selectedIdx >= procs.length) selectedIdx = Math.max(0, procs.length - 1);

      const cpuLoad = Math.min(96, 12 + Math.round(Math.sin(tick * 0.4) * 6 + procs.length * 1.4));
      const memUsed = Math.min(92, 24 + procs.length * 1.1);
      const barWidth = Math.max(10, Math.min(34, Math.floor(cols / 2) - 18));

      const makeBar = (pct: number, color: string) => {
        const filled = Math.round((pct / 100) * barWidth);
        return `${ANSI.bold}[${color}${'|'.repeat(filled)}${ANSI.brightBlack}${' '.repeat(barWidth - filled)}${ANSI.reset}${ANSI.bold} ${String(pct.toFixed(1)).padStart(5)}%${ANSI.reset}]`;
      };

      let out = ANSI.moveTo(1, 1) + ANSI.clearScreen;
      out += `${ANSI.bold}${ANSI.cyan}  CPU ${makeBar(cpuLoad, ANSI.green)}   Tasks: ${ANSI.brightWhite}${procs.length}${ANSI.reset}\r\n`;
      out += `${ANSI.bold}${ANSI.cyan}  Mem ${makeBar(memUsed, ANSI.yellow)}   TTY: ${ANSI.brightWhite}${ctx.tty.path} (${cols}x${rows})${ANSI.reset}\r\n`;
      out += `\r\n`;

      const header = `  ${'PID'.padStart(5)} ${'USER'.padEnd(8)} ${'TTY'.padEnd(8)} ${'S'.padEnd(2)} ${'CPU%'.padStart(5)} ${'MEM%'.padStart(5)}  COMMAND`;
      out += `${ANSI.bgGreen}${ANSI.black}${header.padEnd(cols).slice(0, cols)}${ANSI.reset}\r\n`;

      const maxRows = Math.max(3, rows - 6);
      const startIdx = Math.max(0, selectedIdx - maxRows + 1);
      const visible = procs.slice(startIdx, startIdx + maxRows);

      visible.forEach((p, i) => {
        const realIdx = startIdx + i;
        const isSel = realIdx === selectedIdx;
        const line = `  ${String(p.pid).padStart(5)} ${p.user.padEnd(8)} ${p.tty.padEnd(8)} ${p.state.padEnd(2)} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}  ${p.command}`;
        const truncated = line.padEnd(cols).slice(0, cols);
        if (isSel) {
          out += `${ANSI.bgCyan}${ANSI.black}${truncated}${ANSI.reset}\r\n`;
        } else {
          out += `${truncated}\r\n`;
        }
      });

      const footer = statusMsg
        ? ` ${statusMsg}`
        : ` [↑/↓] Select  [k] Kill Process  [r] Refresh  [q] Quit`;
      out += ANSI.moveTo(rows, 1) + `${ANSI.bgWhite}${ANSI.black}${footer.padEnd(cols).slice(0, cols)}${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 900,
      onRender: render,
      onKey: (key, exit) => {
        const procs = processManager.list();
        if (key === 'q' || key === 'Q') {
          exit(0);
          return;
        }
        if (key === '\x1b[A' || key === 'k' && false) {
          selectedIdx = Math.max(0, selectedIdx - 1);
          statusMsg = '';
        } else if (key === '\x1b[B') {
          selectedIdx = Math.min(procs.length - 1, selectedIdx + 1);
          statusMsg = '';
        } else if (key === 'k' || key === '\x1b[20~') {
          const target = procs[selectedIdx];
          if (target) {
            if (target.pid <= 204 || target.pid === ctx.shell.shellPid) {
              statusMsg = `Cannot kill protected system process PID ${target.pid}`;
            } else {
              processManager.kill(target.pid, 'SIGKILL');
              statusMsg = `Sent SIGKILL to PID ${target.pid}`;
            }
          }
        }
        render();
      },
    });
  },

  top: (ctx) => tuiAppCommands.htop(ctx),

  nano: async (ctx) => {
    const home = ctx.shell.env.HOME ?? '/Users/pogs';
    const fileArg = ctx.args[0] ?? 'untitled.txt';
    const absPath = vfs.resolvePath(fileArg, ctx.shell.cwd, home);
    const existing = vfs.readFile(absPath);
    let lines = existing !== null ? existing.split('\n') : [''];
    if (lines.length === 0) lines = [''];
    let curRow = 0;
    let curCol = 0;
    let scrollTop = 0;
    let modified = false;
    let notice = existing === null ? '[ New File ]' : `[ Read ${lines.length} lines ]`;

    const render = () => {
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(10, ctx.tty.rows);
      const bodyHeight = rows - 4;
      if (curRow < scrollTop) scrollTop = curRow;
      if (curRow >= scrollTop + bodyHeight) scrollTop = curRow - bodyHeight + 1;

      let out = ANSI.hideCursor + ANSI.moveTo(1, 1);
      const title = `  GNU nano 8.1`;
      const fname = `File: ${fileArg}${modified ? ' *' : ''}`;
      const padMid = Math.max(1, Math.floor((cols - title.length - fname.length) / 2));
      const headerLine = (title + ' '.repeat(padMid) + fname).padEnd(cols).slice(0, cols);
      out += `${ANSI.bgWhite}${ANSI.black}${headerLine}${ANSI.reset}\r\n`;

      for (let i = 0; i < bodyHeight; i++) {
        const lineIdx = scrollTop + i;
        const text = lineIdx < lines.length ? lines[lineIdx] : '';
        out += `${ANSI.clearLine}${text.slice(0, cols - 1)}\r\n`;
      }

      const noticePad = Math.max(0, Math.floor((cols - notice.length) / 2));
      out += ANSI.moveTo(rows - 2, 1) + ANSI.clearLine;
      if (notice) {
        out += ' '.repeat(noticePad) + `${ANSI.inverse} ${notice} ${ANSI.reset}`;
      }

      const help1 = `${ANSI.inverse}^O${ANSI.reset} Write Out   ${ANSI.inverse}^K${ANSI.reset} Cut Line   ${ANSI.inverse}^G${ANSI.reset} Help`;
      const help2 = `${ANSI.inverse}^X${ANSI.reset} Exit        ${ANSI.inverse}^U${ANSI.reset} Uncut      ${ANSI.inverse}^C${ANSI.reset} Cancel`;
      out += ANSI.moveTo(rows - 1, 1) + ANSI.clearLine + help1;
      out += ANSI.moveTo(rows, 1) + ANSI.clearLine + help2;

      const screenRow = 2 + (curRow - scrollTop);
      const screenCol = Math.min(cols, curCol + 1);
      out += ANSI.moveTo(screenRow, screenCol) + ANSI.showCursor;
      ctx.tty.write(out);
    };

    let cutBuffer = '';

    return runInteractiveLoop(ctx, {
      hideCursor: false,
      onRender: render,
      onKey: (key, exit) => {
        notice = '';
        if (key === '\x18') {
          // Ctrl+X
          exit(0);
          return;
        }
        if (key === '\x0f') {
          // Ctrl+O Write Out
          vfs.writeFile(absPath, lines.join('\n'));
          modified = false;
          notice = `Wrote ${lines.length} lines to ${fileArg}`;
          render();
          return;
        }
        if (key === '\x0b') {
          // Ctrl+K Cut line
          cutBuffer = lines[curRow] ?? '';
          lines.splice(curRow, 1);
          if (lines.length === 0) lines.push('');
          curRow = Math.min(curRow, lines.length - 1);
          curCol = Math.min(curCol, lines[curRow].length);
          modified = true;
          render();
          return;
        }
        if (key === '\x15') {
          // Ctrl+U Uncut
          lines.splice(curRow, 0, cutBuffer);
          modified = true;
          render();
          return;
        }
        if (key === '\x1b[A') {
          curRow = Math.max(0, curRow - 1);
          curCol = Math.min(curCol, lines[curRow].length);
        } else if (key === '\x1b[B') {
          curRow = Math.min(lines.length - 1, curRow + 1);
          curCol = Math.min(curCol, lines[curRow].length);
        } else if (key === '\x1b[D') {
          if (curCol > 0) curCol--;
          else if (curRow > 0) {
            curRow--;
            curCol = lines[curRow].length;
          }
        } else if (key === '\x1b[C') {
          if (curCol < lines[curRow].length) curCol++;
          else if (curRow < lines.length - 1) {
            curRow++;
            curCol = 0;
          }
        } else if (key === '\r' || key === '\n') {
          const rest = lines[curRow].slice(curCol);
          lines[curRow] = lines[curRow].slice(0, curCol);
          lines.splice(curRow + 1, 0, rest);
          curRow++;
          curCol = 0;
          modified = true;
        } else if (key === '\x7f' || key === '\b') {
          if (curCol > 0) {
            lines[curRow] = lines[curRow].slice(0, curCol - 1) + lines[curRow].slice(curCol);
            curCol--;
            modified = true;
          } else if (curRow > 0) {
            const prevLen = lines[curRow - 1].length;
            lines[curRow - 1] += lines[curRow];
            lines.splice(curRow, 1);
            curRow--;
            curCol = prevLen;
            modified = true;
          }
        } else if (key.length === 1 && key >= ' ') {
          lines[curRow] = lines[curRow].slice(0, curCol) + key + lines[curRow].slice(curCol);
          curCol++;
          modified = true;
        }
        render();
      },
    });
  },

  vi: async (ctx) => {
    const home = ctx.shell.env.HOME ?? '/Users/pogs';
    const fileArg = ctx.args[0] ?? 'untitled.txt';
    const absPath = vfs.resolvePath(fileArg, ctx.shell.cwd, home);
    const existing = vfs.readFile(absPath);
    let lines = existing !== null ? existing.split('\n') : [''];
    if (lines.length === 0) lines = [''];

    let mode: 'NORMAL' | 'INSERT' | 'COMMAND' = 'NORMAL';
    let cmdBuf = '';
    let statusMsg = existing === null ? `"${fileArg}" [New File]` : `"${fileArg}" ${lines.length}L`;
    let curRow = 0;
    let curCol = 0;
    let scrollTop = 0;
    let pendingD = false;

    const render = () => {
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(10, ctx.tty.rows);
      const bodyHeight = rows - 2;
      if (curRow < scrollTop) scrollTop = curRow;
      if (curRow >= scrollTop + bodyHeight) scrollTop = curRow - bodyHeight + 1;

      let out = ANSI.hideCursor + ANSI.moveTo(1, 1);
      for (let i = 0; i < bodyHeight; i++) {
        const lineIdx = scrollTop + i;
        out += ANSI.clearLine;
        if (lineIdx < lines.length) {
          out += `${ANSI.brightBlack}${String(lineIdx + 1).padStart(3)} ${ANSI.reset}${lines[lineIdx].slice(0, cols - 5)}\r\n`;
        } else {
          out += `${ANSI.blue}~${ANSI.reset}\r\n`;
        }
      }

      const modeBadge = mode === 'INSERT' ? '-- INSERT --' : `"${fileArg}"`;
      const posBadge = `${curRow + 1},${curCol + 1}`;
      const statusText = mode === 'COMMAND' ? `:${cmdBuf}` : statusMsg || modeBadge;
      const barPad = Math.max(1, cols - statusText.length - posBadge.length - 2);
      out += ANSI.moveTo(rows - 1, 1) + `${ANSI.inverse} ${fileArg.padEnd(cols - 15).slice(0, cols - 15)} ${posBadge.padStart(12)} ${ANSI.reset}`;
      out += ANSI.moveTo(rows, 1) + ANSI.clearLine + statusText + ' '.repeat(Math.max(0, barPad));

      if (mode === 'COMMAND') {
        out += ANSI.moveTo(rows, 2 + cmdBuf.length) + ANSI.showCursor;
      } else {
        out += ANSI.moveTo(1 + (curRow - scrollTop), Math.min(cols, 5 + curCol)) + ANSI.showCursor;
      }
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      hideCursor: false,
      onRender: render,
      onKey: (key, exit) => {
        if (mode === 'COMMAND') {
          if (key === '\x1b') {
            mode = 'NORMAL';
            cmdBuf = '';
            statusMsg = '';
          } else if (key === '\r' || key === '\n') {
            const cmd = cmdBuf.trim();
            mode = 'NORMAL';
            cmdBuf = '';
            if (cmd === 'q' || cmd === 'q!') {
              exit(0);
              return;
            } else if (cmd === 'w') {
              vfs.writeFile(absPath, lines.join('\n'));
              statusMsg = `"${fileArg}" ${lines.length}L written`;
            } else if (cmd === 'wq' || cmd === 'x') {
              vfs.writeFile(absPath, lines.join('\n'));
              exit(0);
              return;
            } else {
              statusMsg = `E492: Not an editor command: ${cmd}`;
            }
          } else if (key === '\x7f' || key === '\b') {
            if (cmdBuf.length === 0) mode = 'NORMAL';
            else cmdBuf = cmdBuf.slice(0, -1);
          } else if (key.length === 1 && key >= ' ') {
            cmdBuf += key;
          }
          render();
          return;
        }

        if (mode === 'INSERT') {
          if (key === '\x1b') {
            mode = 'NORMAL';
            statusMsg = '';
            curCol = Math.max(0, curCol - 1);
          } else if (key === '\r' || key === '\n') {
            const rest = lines[curRow].slice(curCol);
            lines[curRow] = lines[curRow].slice(0, curCol);
            lines.splice(curRow + 1, 0, rest);
            curRow++;
            curCol = 0;
          } else if (key === '\x7f' || key === '\b') {
            if (curCol > 0) {
              lines[curRow] = lines[curRow].slice(0, curCol - 1) + lines[curRow].slice(curCol);
              curCol--;
            } else if (curRow > 0) {
              const prevLen = lines[curRow - 1].length;
              lines[curRow - 1] += lines[curRow];
              lines.splice(curRow, 1);
              curRow--;
              curCol = prevLen;
            }
          } else if (key === '\x1b[A') curRow = Math.max(0, curRow - 1);
          else if (key === '\x1b[B') curRow = Math.min(lines.length - 1, curRow + 1);
          else if (key === '\x1b[D') curCol = Math.max(0, curCol - 1);
          else if (key === '\x1b[C') curCol = Math.min(lines[curRow].length, curCol + 1);
          else if (key.length === 1 && key >= ' ') {
            lines[curRow] = lines[curRow].slice(0, curCol) + key + lines[curRow].slice(curCol);
            curCol++;
          }
          curCol = Math.min(curCol, lines[curRow].length);
          render();
          return;
        }

        // NORMAL mode
        statusMsg = '';
        if (key === 'd') {
          if (pendingD) {
            lines.splice(curRow, 1);
            if (lines.length === 0) lines.push('');
            curRow = Math.min(curRow, lines.length - 1);
            curCol = 0;
            pendingD = false;
          } else {
            pendingD = true;
          }
          render();
          return;
        }
        pendingD = false;

        if (key === 'i') {
          mode = 'INSERT';
          statusMsg = '-- INSERT --';
        } else if (key === 'a') {
          mode = 'INSERT';
          statusMsg = '-- INSERT --';
          curCol = Math.min(lines[curRow].length, curCol + 1);
        } else if (key === 'o') {
          mode = 'INSERT';
          statusMsg = '-- INSERT --';
          lines.splice(curRow + 1, 0, '');
          curRow++;
          curCol = 0;
        } else if (key === ':') {
          mode = 'COMMAND';
          cmdBuf = '';
        } else if (key === 'x') {
          if (lines[curRow].length > 0) {
            lines[curRow] = lines[curRow].slice(0, curCol) + lines[curRow].slice(curCol + 1);
            curCol = Math.min(curCol, Math.max(0, lines[curRow].length - 1));
          }
        } else if (key === 'h' || key === '\x1b[D') {
          curCol = Math.max(0, curCol - 1);
        } else if (key === 'l' || key === '\x1b[C') {
          curCol = Math.min(Math.max(0, lines[curRow].length - 1), curCol + 1);
        } else if (key === 'k' || key === '\x1b[A') {
          curRow = Math.max(0, curRow - 1);
          curCol = Math.min(curCol, Math.max(0, lines[curRow].length - 1));
        } else if (key === 'j' || key === '\x1b[B') {
          curRow = Math.min(lines.length - 1, curRow + 1);
          curCol = Math.min(curCol, Math.max(0, lines[curRow].length - 1));
        }
        render();
      },
    });
  },

  vim: (ctx) => tuiAppCommands.vi(ctx),

  ranger: async (ctx) => {
    let currentDir = ctx.shell.cwd;
    let selected = 0;

    const render = () => {
      const cols = Math.max(50, ctx.tty.cols);
      const rows = Math.max(12, ctx.tty.rows);
      const entries = vfs.readdir(currentDir) ?? [];
      if (selected >= entries.length) selected = Math.max(0, entries.length - 1);

      const leftW = Math.floor(cols * 0.44);
      const rightW = cols - leftW - 3;
      const bodyH = rows - 3;

      const selectedNode = entries[selected];
      let previewLines: string[] = [];
      if (selectedNode) {
        const selPath = `${currentDir === '/' ? '' : currentDir}/${selectedNode.name}`;
        if (selectedNode.type === 'dir') {
          const sub = vfs.readdir(selPath) ?? [];
          previewLines = sub.map((s) => `${s.type === 'dir' ? '📁' : '📄'} ${s.name}`);
          if (previewLines.length === 0) previewLines = ['(empty directory)'];
        } else {
          const text = vfs.readFile(selPath) ?? '(binary/device)';
          previewLines = text.split('\n');
        }
      }

      let out = ANSI.moveTo(1, 1) + ANSI.clearScreen;
      out += `${ANSI.bold}${ANSI.brightGreen}pogs@mac${ANSI.reset}:${ANSI.bold}${ANSI.brightBlue}${currentDir}${ANSI.reset}\r\n`;

      const startIdx = Math.max(0, selected - bodyH + 1);
      for (let i = 0; i < bodyH; i++) {
        const idx = startIdx + i;
        const entry = entries[idx];
        let leftCell = '';
        if (entry) {
          const label = (entry.type === 'dir' ? `/${entry.name}` : ` ${entry.name}`).slice(0, leftW - 1).padEnd(leftW);
          if (idx === selected) {
            leftCell = `${ANSI.bgBlue}${ANSI.brightWhite}${label}${ANSI.reset}`;
          } else if (entry.type === 'dir') {
            leftCell = `${ANSI.bold}${ANSI.brightBlue}${label}${ANSI.reset}`;
          } else {
            leftCell = label;
          }
        } else {
          leftCell = ' '.repeat(leftW);
        }

        const rightRaw = (previewLines[i] ?? '').replace(/\t/g, '  ').slice(0, rightW);
        out += `${leftCell} ${ANSI.brightBlack}│${ANSI.reset} ${rightRaw}\r\n`;
      }

      const footer = selectedNode
        ? ` ${selectedNode.mode}  ${selectedNode.owner}:${selectedNode.group}  ${selectedNode.size}B   |  [↑/↓] Move  [→/Enter] Open  [←] Parent  [q] Quit`
        : ` (empty)  |  [←] Parent  [q] Quit`;
      out += ANSI.moveTo(rows, 1) + `${ANSI.bgWhite}${ANSI.black}${footer.padEnd(cols).slice(0, cols)}${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      onRender: render,
      onKey: (key, exit) => {
        const entries = vfs.readdir(currentDir) ?? [];
        if (key === 'q' || key === 'Q') {
          exit(0);
          return;
        }
        if (key === '\x1b[A' || key === 'k') {
          selected = Math.max(0, selected - 1);
        } else if (key === '\x1b[B' || key === 'j') {
          selected = Math.min(Math.max(0, entries.length - 1), selected + 1);
        } else if (key === '\x1b[D' || key === 'h' || key === '\x7f') {
          if (currentDir !== '/') {
            const parts = currentDir.split('/').filter(Boolean);
            parts.pop();
            currentDir = '/' + parts.join('/');
            selected = 0;
          }
        } else if (key === '\x1b[C' || key === 'l' || key === '\r') {
          const item = entries[selected];
          if (item && item.type === 'dir') {
            currentDir = `${currentDir === '/' ? '' : currentDir}/${item.name}`;
            selected = 0;
          }
        }
        render();
      },
    });
  },

  cmatrix: async (ctx) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=-';
    let drops: number[] = [];

    const render = () => {
      const cols = Math.max(20, ctx.tty.cols);
      const rows = Math.max(10, ctx.tty.rows);
      if (drops.length !== cols) {
        drops = Array.from({ length: cols }, () => Math.floor(Math.random() * rows));
      }

      let out = '';
      for (let x = 0; x < cols; x++) {
        const y = drops[x];
        if (y >= 1 && y <= rows) {
          const ch = chars[Math.floor(Math.random() * chars.length)];
          out += `${ANSI.moveTo(y, x + 1)}${ANSI.bold}${ANSI.brightWhite}${ch}${ANSI.reset}`;
        }
        if (y - 1 >= 1 && y - 1 <= rows) {
          const ch = chars[Math.floor(Math.random() * chars.length)];
          out += `${ANSI.moveTo(y - 1, x + 1)}${ANSI.green}${ch}${ANSI.reset}`;
        }
        const tail = y - 10;
        if (tail >= 1 && tail <= rows) {
          out += `${ANSI.moveTo(tail, x + 1)} `;
        }
        drops[x] = y > rows + 10 ? 0 : y + 1;
      }
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim}${ANSI.green} cmatrix — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 65,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },

  pipes: async (ctx) => {
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
    ];
    const glyphs: Record<string, string> = {
      '0-0': '━', '2-2': '━', '1-1': '┃', '3-3': '┃',
      '0-1': '┓', '3-2': '┓', '0-3': '┛', '1-2': '┛',
      '2-1': '┏', '3-0': '┏', '2-3': '┗', '1-0': '┗',
    };
    let x = Math.floor((ctx.tty.cols || 80) / 2);
    let y = Math.floor((ctx.tty.rows || 24) / 2);
    let dir = 0;
    let color = 1;
    let steps = 0;

    const render = () => {
      const cols = Math.max(20, ctx.tty.cols);
      const rows = Math.max(10, ctx.tty.rows);
      if (steps === 0) ctx.tty.write(ANSI.clearScreen);
      let out = '';
      for (let i = 0; i < 4; i++) {
        let nextDir = dir;
        if (Math.random() < 0.25) {
          nextDir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
        }
        const ch = glyphs[`${dir}-${nextDir}`] ?? '━';
        out += `${ANSI.moveTo(y, x)}${ANSI.bold}\x1b[3${color}m${ch}${ANSI.reset}`;
        dir = nextDir;
        x += dirs[dir].dx;
        y += dirs[dir].dy;
        if (x < 1 || x > cols || y < 1 || y >= rows) {
          x = Math.max(1, Math.min(cols, Math.floor(Math.random() * cols) + 1));
          y = Math.max(1, Math.min(rows - 1, Math.floor(Math.random() * (rows - 1)) + 1));
          color = (color % 6) + 1;
        }
        steps++;
        if (steps > 900) {
          steps = 0;
          out += ANSI.clearScreen;
          break;
        }
      }
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim} pipes.sh — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 45,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },

  asciiquarium: async (ctx) => {
    if (!packageRegistry.isBinaryAvailable('asciiquarium')) {
      ctx.writeStderr(`zsh: command not found: asciiquarium (install with: brew install asciiquarium)\n`);
      return 127;
    }
    const fish = [
      { x: 5, y: 6, speed: 1, sprite: '><(((º>', color: ANSI.brightYellow },
      { x: 40, y: 11, speed: -1, sprite: '<º)))><', color: ANSI.brightCyan },
      { x: 18, y: 15, speed: 1, sprite: '><(((*>', color: ANSI.brightMagenta },
      { x: 55, y: 8, speed: -1, sprite: '<°)))><', color: ANSI.brightRed },
    ];
    let frameCount = 0;

    const render = () => {
      frameCount++;
      const cols = Math.max(30, ctx.tty.cols);
      const rows = Math.max(12, ctx.tty.rows);
      let out = ANSI.moveTo(1, 1) + ANSI.clearScreen;

      // Water surface
      let wave = '';
      for (let c = 0; c < cols; c++) {
        wave += (c + frameCount) % 4 < 2 ? '~' : '≈';
      }
      out += `${ANSI.moveTo(3, 1)}${ANSI.brightBlue}${wave}${ANSI.reset}`;

      // Seaweed at bottom
      for (let c = 4; c < cols - 4; c += 11) {
        const sway = (frameCount + c) % 2 === 0 ? '(' : ')';
        for (let h = 0; h < 4; h++) {
          out += `${ANSI.moveTo(rows - 2 - h, c)}${ANSI.green}${sway}${ANSI.reset}`;
        }
      }

      // Fish
      for (const f of fish) {
        f.x += f.speed;
        if (f.x > cols + 2) f.x = -f.sprite.length;
        if (f.x < -f.sprite.length - 2) f.x = cols;
        const row = Math.min(rows - 4, Math.max(4, f.y));
        const col = Math.max(1, Math.round(f.x));
        if (col < cols - 1) {
          out += `${ANSI.moveTo(row, col)}${f.color}${f.sprite.slice(0, cols - col)}${ANSI.reset}`;
        }
      }

      // Sand floor
      out += `${ANSI.moveTo(rows - 1, 1)}${ANSI.yellow}${'░'.repeat(cols)}${ANSI.reset}`;
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim} asciiquarium — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 110,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },

  nyancat: async (ctx) => {
    if (!packageRegistry.isBinaryAvailable('nyancat')) {
      ctx.writeStderr(`zsh: command not found: nyancat (install with: brew install nyancat)\n`);
      return 127;
    }
    let tick = 0;
    const rainbow = [196, 208, 226, 46, 39, 129];

    const render = () => {
      tick++;
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(14, ctx.tty.rows);
      const midY = Math.floor(rows / 2) - 3;
      const catX = Math.max(18, Math.floor(cols / 2) - 6);

      let out = ANSI.moveTo(1, 1) + ANSI.clearScreen;
      // Stars
      for (let s = 0; s < 16; s++) {
        const sx = ((s * 37 - tick * 2) % cols + cols) % cols + 1;
        const sy = (s * 13) % (rows - 2) + 1;
        out += `${ANSI.moveTo(sy, sx)}${ANSI.brightWhite}${(s + tick) % 2 === 0 ? '+' : '*'}${ANSI.reset}`;
      }

      // Rainbow trail
      for (let r = 0; r < 6; r++) {
        const y = midY + r;
        const wave = Math.sin(tick * 0.5 + r) > 0 ? 1 : 0;
        let trail = '';
        for (let x = 1; x < catX; x++) {
          trail += `${ANSI.bg256(rainbow[r])} `;
        }
        out += `${ANSI.moveTo(y + wave, 1)}${trail}${ANSI.reset}`;
      }

      // Cat sprite
      const cat = [
        `${ANSI.fg256(218)}╭──────╮  ${ANSI.reset}`,
        `${ANSI.fg256(218)}│ ░░░░ │${ANSI.brightWhite}/\\_/\\${ANSI.reset}`,
        `${ANSI.fg256(218)}│ ░░░░ │${ANSI.brightWhite}( ^ω^)${ANSI.reset}`,
        `${ANSI.fg256(218)}╰──────╯${ANSI.brightWhite} づ  ${ANSI.reset}`,
        `  ${ANSI.brightWhite}${tick % 2 === 0 ? '▀ ▀  ▀ ▀' : ' ▀ ▀  ▀ '}${ANSI.reset}`,
      ];
      cat.forEach((line, idx) => {
        out += `${ANSI.moveTo(midY + idx, catX)}${line}`;
      });
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim} nyancat — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 110,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },

  'tty-clock': async (ctx) => {
    if (!packageRegistry.isBinaryAvailable('tty-clock')) {
      ctx.writeStderr(`zsh: command not found: tty-clock (install with: brew install tty-clock)\n`);
      return 127;
    }
    const digits: Record<string, string[]> = {
      '0': ['███', '█ █', '█ █', '█ █', '███'],
      '1': ['  █', '  █', '  █', '  █', '  █'],
      '2': ['███', '  █', '███', '█  ', '███'],
      '3': ['███', '  █', '███', '  █', '███'],
      '4': ['█ █', '█ █', '███', '  █', '  █'],
      '5': ['███', '█  ', '███', '  █', '███'],
      '6': ['███', '█  ', '███', '█ █', '███'],
      '7': ['███', '  █', '  █', '  █', '  █'],
      '8': ['███', '█ █', '███', '█ █', '███'],
      '9': ['███', '█ █', '███', '  █', '███'],
      ':': ['   ', ' █ ', '   ', ' █ ', '   '],
    };

    const render = () => {
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(12, ctx.tty.rows);
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      const dateStr = now.toDateString();

      const blockRows = ['', '', '', '', ''];
      for (const ch of timeStr) {
        const g = digits[ch] ?? digits[':'];
        for (let r = 0; r < 5; r++) blockRows[r] += g[r] + ' ';
      }

      const startY = Math.max(2, Math.floor((rows - 7) / 2));
      const startX = Math.max(2, Math.floor((cols - blockRows[0].length) / 2));

      let out = ANSI.moveTo(1, 1) + ANSI.clearScreen;
      blockRows.forEach((line, idx) => {
        out += `${ANSI.moveTo(startY + idx, startX)}${ANSI.bold}${ANSI.brightCyan}${line}${ANSI.reset}`;
      });
      const dateX = Math.max(2, Math.floor((cols - dateStr.length) / 2));
      out += `${ANSI.moveTo(startY + 6, dateX)}${ANSI.brightWhite}${dateStr}${ANSI.reset}`;
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim} tty-clock — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 500,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },

  donut: async (ctx) => {
    if (!packageRegistry.isBinaryAvailable('donut')) {
      ctx.writeStderr(`zsh: command not found: donut (install with: brew install donut)\n`);
      return 127;
    }
    let A = 0;
    let B = 0;

    const render = () => {
      const cols = Math.max(40, ctx.tty.cols);
      const rows = Math.max(16, ctx.tty.rows);
      const w = Math.min(cols, 76);
      const h = Math.min(rows - 2, 24);
      const b = new Array<string>(w * h).fill(' ');
      const z = new Array<number>(w * h).fill(0);

      for (let j = 0; j < 6.28; j += 0.1) {
        for (let i = 0; i < 6.28; i += 0.04) {
          const c = Math.sin(i);
          const d = Math.cos(j);
          const e = Math.sin(A);
          const f = Math.sin(j);
          const g = Math.cos(A);
          const hh = d + 2;
          const D = 1 / (c * hh * e + f * g + 5);
          const l = Math.cos(i);
          const m = Math.cos(B);
          const n = Math.sin(B);
          const t = c * hh * g - f * e;
          const x = Math.floor(w / 2 + 28 * D * (l * hh * m - t * n));
          const y = Math.floor(h / 2 + 12 * D * (l * hh * n + t * m));
          const o = x + w * y;
          const N = Math.floor(8 * ((f * e - c * d * g) * m - c * d * e - f * g - l * d * n));
          if (y >= 0 && y < h && x >= 0 && x < w && D > z[o]) {
            z[o] = D;
            b[o] = '.,-~:;=!*#$@'[N > 0 ? Math.min(11, N) : 0];
          }
        }
      }
      A += 0.06;
      B += 0.03;

      let out = ANSI.moveTo(1, 1);
      const padLeft = Math.max(0, Math.floor((cols - w) / 2));
      for (let r = 0; r < h; r++) {
        const line = b.slice(r * w, (r + 1) * w).join('');
        const [cr, cg, cb] = hslToRgb((r * 14 + A * 40) % 360, 0.85, 0.65);
        out += `${ANSI.clearLine}${' '.repeat(padLeft)}${ANSI.fgRgb(cr, cg, cb)}${line}${ANSI.reset}\r\n`;
      }
      out += `${ANSI.moveTo(rows, 1)}${ANSI.dim} donut — press q or Ctrl+C to exit ${ANSI.reset}`;
      ctx.tty.write(out);
    };

    return runInteractiveLoop(ctx, {
      intervalMs: 45,
      onRender: render,
      onKey: (key, exit) => {
        if (key === 'q' || key === 'Q') exit(0);
      },
    });
  },
};
