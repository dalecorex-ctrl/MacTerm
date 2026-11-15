import { ANSI, TtyDevice } from './tty';
import type { CommandContext, CommandHandler, ShellState } from './types';
import { parseCommandLine, type Pipeline } from './shellParser';
import { coreutilsCommands } from './commands/coreutils';
import { ttyAnsiCommands } from './commands/ttyAnsi';
import { tuiAppCommands } from './commands/tuiApps';
import { devToolsCommands } from './commands/devTools';
import { agentCoderCommands } from './commands/agentCoder';
import { processManager } from './process';
import { packageRegistry } from './packages';
import { vfs } from './vfs';
import {
  loadPersistedPaneSession,
  removePersistedPaneSession,
  savePersistedPaneSession,
} from './sessionStorage';
import { haptics } from './haptics';
import { soundEffects } from './audio';

const COMMAND_MAP: Record<string, CommandHandler> = {
  ...coreutilsCommands,
  ...ttyAnsiCommands,
  ...tuiAppCommands,
  ...devToolsCommands,
  ...agentCoderCommands,
};

let nextTtyIndex = 0;

export class ShellSession {
  public readonly tty: TtyDevice;
  public readonly state: ShellState;
  private readonly paneId?: string;
  private buffer = '';
  private cursor = 0;
  private historyIdx = -1;
  private isExecuting = false;
  private activeAbort: AbortController | null = null;
  private reverseSearchMode = false;
  private reverseSearchQuery = '';
  private disposed = false;
  private restoredSession = false;
  private unsubTtyData: (() => void) | null = null;
  private unloadHandler: (() => void) | null = null;
  private onTitleChange?: (title: string) => void;
  private onExitSession?: () => void;

  constructor(opts?: { paneId?: string; onTitleChange?: (title: string) => void; onExitSession?: () => void }) {
    const ttyIdx = nextTtyIndex++;
    this.paneId = opts?.paneId;
    this.tty = new TtyDevice(ttyIdx);
    vfs.registerTtyDevice(this.tty.id);

    const shellProc = processManager.spawn({
      ppid: 102,
      tty: this.tty.id,
      user: 'pogs',
      state: 'S',
      command: '-zsh',
    });

    const histRaw = vfs.readFile('/Users/pogs/.zsh_history') ?? '';
    const defaultHist = histRaw.split('\n').map((s) => s.trim()).filter(Boolean);

    const saved = this.paneId ? loadPersistedPaneSession(this.paneId) : null;
    const validCwd = saved && vfs.getNode(saved.cwd)?.type === 'dir' ? saved.cwd : '/Users/pogs';
    const validPrevCwd = saved && vfs.getNode(saved.prevCwd)?.type === 'dir' ? saved.prevCwd : validCwd;
    if (saved) {
      this.restoredSession = true;
    }

    const defaultEnv: Record<string, string> = {
      HOME: '/Users/pogs',
      USER: 'pogs',
      LOGNAME: 'pogs',
      SHELL: '/bin/zsh',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TTY: this.tty.path,
      PWD: validCwd,
      OLDPWD: validPrevCwd,
    };

    this.state = {
      cwd: validCwd,
      prevCwd: validPrevCwd,
      env: {
        ...defaultEnv,
        ...(saved?.envOverrides ?? {}),
        TTY: this.tty.path,
        PWD: validCwd,
        OLDPWD: validPrevCwd,
      },
      aliases: {
        ll: 'ls -la',
        la: 'ls -A',
        l: 'ls -CF',
        cls: 'clear',
        pkg: 'brew',
        ...(saved?.aliases ?? {}),
      },
      history: saved && Array.isArray(saved.history) && saved.history.length > 0 ? [...saved.history] : defaultHist,
      lastExitCode: 0,
      shellPid: shellProc.pid,
    };

    this.onTitleChange = opts?.onTitleChange;
    this.onExitSession = opts?.onExitSession;

    this.unsubTtyData = this.tty.onData((data) => this.handleInput(data));
    this.unloadHandler = () => this.persistSession();
    window.addEventListener('beforeunload', this.unloadHandler);
    window.addEventListener('pagehide', this.unloadHandler);

    this.persistSession();
    this.printWelcome();
    this.renderPrompt();
    this.updateTitle('zsh');
  }

  public persistSession(): void {
    if (!this.paneId) return;
    const baseKeys = new Set(['HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'COLORTERM', 'LANG', 'PATH', 'TTY', 'PWD', 'OLDPWD']);
    const envOverrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.state.env)) {
      if (!baseKeys.has(k) || k === 'PATH') {
        envOverrides[k] = v;
      }
    }
    savePersistedPaneSession(this.paneId, {
      cwd: this.state.cwd,
      prevCwd: this.state.prevCwd,
      history: this.state.history,
      envOverrides,
      aliases: this.state.aliases,
      updatedAt: Date.now(),
    });
  }

  public dispose(removePersistence = false): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.unloadHandler) {
      window.removeEventListener('beforeunload', this.unloadHandler);
      window.removeEventListener('pagehide', this.unloadHandler);
    }
    if (removePersistence && this.paneId) {
      removePersistedPaneSession(this.paneId);
    } else {
      this.persistSession();
    }
    this.activeAbort?.abort();
    this.unsubTtyData?.();
    processManager.exit(this.state.shellPid);
    vfs.removeTtyDevice(this.tty.id);
  }

  public updateTitle(procName = 'zsh'): void {
    const shortCwd = this.formatCwd();
    const title = `pogs@mac: ${shortCwd} — ${procName} — ${this.tty.cols}×${this.tty.rows}`;
    this.tty.setTitle(title);
    this.onTitleChange?.(title);
  }

  private formatCwd(): string {
    const home = this.state.env.HOME ?? '/Users/pogs';
    if (this.state.cwd === home) return '~';
    if (this.state.cwd.startsWith(home + '/')) {
      return '~' + this.state.cwd.slice(home.length);
    }
    return this.state.cwd;
  }

  private getPromptString(): string {
    const dir = this.formatCwd();
    const exitMark = this.state.lastExitCode !== 0 ? `${ANSI.brightRed}✘ ${this.state.lastExitCode} ${ANSI.reset}` : '';
    return `${exitMark}${ANSI.bold}${ANSI.brightGreen}pogs@mac${ANSI.reset} ${ANSI.bold}${ANSI.brightBlue}${dir}${ANSI.reset} ${ANSI.brightWhite}%${ANSI.reset} `;
  }

  private printWelcome(): void {
    const d = new Date();
    const stamp = d.toDateString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8);
    this.tty.writeln(`${ANSI.dim}Last login: ${stamp} on ${this.tty.id}${ANSI.reset}`);
    this.tty.writeln(
      `${ANSI.brightCyan}macOS Terminal${ANSI.reset} ${ANSI.dim}·${ANSI.reset} Darwin 24.2.0 arm64 ${ANSI.dim}·${ANSI.reset} ${packageRegistry.listInstalled().length} TTY/ANSI packages active`,
    );
    if (this.restoredSession) {
      this.tty.writeln(
        `${ANSI.dim}Restored pane session · cwd: ${this.formatCwd()} · ${this.state.history.length} history commands${ANSI.reset}`,
      );
    }
    this.tty.writeln(
      `${ANSI.dim}Try ${ANSI.reset}${ANSI.cyan}claude${ANSI.reset}${ANSI.dim}, ${ANSI.reset}${ANSI.cyan}gemini${ANSI.reset}${ANSI.dim}, ${ANSI.reset}${ANSI.cyan}agy${ANSI.reset}${ANSI.dim}, ${ANSI.reset}${ANSI.cyan}neofetch${ANSI.reset}${ANSI.dim}, ${ANSI.reset}${ANSI.cyan}htop${ANSI.reset}${ANSI.dim}, or ${ANSI.reset}${ANSI.cyan}help${ANSI.reset}${ANSI.dim}.${ANSI.reset}\r\n`,
    );
  }

  private renderPrompt(): void {
    this.tty.write('\r' + ANSI.clearToEnd + this.getPromptString() + this.buffer);
    const back = this.buffer.length - this.cursor;
    if (back > 0) {
      this.tty.write(ANSI.moveLeft(back));
    }
  }

  private renderReverseSearch(): void {
    const match = [...this.state.history].reverse().find((h) => h.includes(this.reverseSearchQuery)) ?? '';
    this.tty.write(`\r${ANSI.clearToEnd}(reverse-i-search)\`${this.reverseSearchQuery}': ${match}`);
  }

  public async runProgrammaticCommand(cmd: string): Promise<void> {
    if (this.isExecuting) return;
    this.buffer = cmd;
    this.cursor = cmd.length;
    this.renderPrompt();
    await this.submitLine();
  }

  private handleInput(data: string): void {
    // If a raw-mode foreground process is running, only intercept Ctrl+C if ISIG is enabled
    if (this.isExecuting) {
      if (!this.tty.termios.icanon) {
        // Raw TUI apps handle their own keys (including Ctrl+C) via tty.onData
        return;
      }
      if (data === '\x03') {
        this.tty.write('^C\r\n');
        this.activeAbort?.abort();
      }
      return;
    }

    if (this.reverseSearchMode) {
      if (data === '\r' || data === '\n') {
        const match = [...this.state.history].reverse().find((h) => h.includes(this.reverseSearchQuery)) ?? '';
        this.reverseSearchMode = false;
        this.buffer = match;
        this.cursor = match.length;
        this.submitLine();
        return;
      }
      if (data === '\x03' || data === '\x1b' || data === '\x07') {
        this.reverseSearchMode = false;
        this.reverseSearchQuery = '';
        this.tty.writeln('');
        this.renderPrompt();
        return;
      }
      if (data === '\x7f' || data === '\b') {
        this.reverseSearchQuery = this.reverseSearchQuery.slice(0, -1);
        this.renderReverseSearch();
        return;
      }
      if (data.length === 1 && data >= ' ') {
        this.reverseSearchQuery += data;
        this.renderReverseSearch();
      }
      return;
    }

    // Handle multi-byte escape sequences and single chars
    if (data === '\r' || data === '\n') {
      this.submitLine();
      return;
    }
    if (data === '\x03') {
      // Ctrl+C
      this.tty.write('^C\r\n');
      this.buffer = '';
      this.cursor = 0;
      this.historyIdx = -1;
      this.renderPrompt();
      return;
    }
    if (data === '\x04') {
      // Ctrl+D
      if (this.buffer.length === 0) {
        this.tty.writeln('logout');
        this.onExitSession?.();
      }
      return;
    }
    if (data === '\x0c') {
      // Ctrl+L
      this.tty.write(ANSI.clearScreen);
      this.renderPrompt();
      return;
    }
    if (data === '\x12') {
      // Ctrl+R
      this.reverseSearchMode = true;
      this.reverseSearchQuery = '';
      this.renderReverseSearch();
      return;
    }
    if (data === '\x01' || data === '\x1b[H') {
      // Ctrl+A / Home
      this.cursor = 0;
      this.renderPrompt();
      return;
    }
    if (data === '\x05' || data === '\x1b[F') {
      // Ctrl+E / End
      this.cursor = this.buffer.length;
      this.renderPrompt();
      return;
    }
    if (data === '\x15') {
      // Ctrl+U
      this.buffer = this.buffer.slice(this.cursor);
      this.cursor = 0;
      this.renderPrompt();
      return;
    }
    if (data === '\x0b') {
      // Ctrl+K
      this.buffer = this.buffer.slice(0, this.cursor);
      this.renderPrompt();
      return;
    }
    if (data === '\x17') {
      // Ctrl+W delete prev word
      const before = this.buffer.slice(0, this.cursor).replace(/\S+\s*$/, '');
      this.buffer = before + this.buffer.slice(this.cursor);
      this.cursor = before.length;
      this.renderPrompt();
      return;
    }
    if (data === '\t') {
      this.handleTabCompletion();
      return;
    }
    if (data === '\x7f' || data === '\b') {
      if (this.cursor > 0) {
        this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
        this.cursor--;
        this.renderPrompt();
      }
      return;
    }
    if (data === '\x1b[3~') {
      // Delete key
      if (this.cursor < this.buffer.length) {
        this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        this.renderPrompt();
      }
      return;
    }
    if (data === '\x1b[D') {
      if (this.cursor > 0) {
        this.cursor--;
        this.tty.write(ANSI.moveLeft(1));
      }
      return;
    }
    if (data === '\x1b[C') {
      if (this.cursor < this.buffer.length) {
        this.cursor++;
        this.tty.write(ANSI.moveRight(1));
      }
      return;
    }
    if (data === '\x1b[A') {
      // History Up
      if (this.state.history.length === 0) return;
      if (this.historyIdx === -1) this.historyIdx = this.state.history.length - 1;
      else if (this.historyIdx > 0) this.historyIdx--;
      this.buffer = this.state.history[this.historyIdx] ?? '';
      this.cursor = this.buffer.length;
      this.renderPrompt();
      return;
    }
    if (data === '\x1b[B') {
      // History Down
      if (this.historyIdx === -1) return;
      if (this.historyIdx < this.state.history.length - 1) {
        this.historyIdx++;
        this.buffer = this.state.history[this.historyIdx] ?? '';
      } else {
        this.historyIdx = -1;
        this.buffer = '';
      }
      this.cursor = this.buffer.length;
      this.renderPrompt();
      return;
    }

    // Printable characters (supports pasted multi-character chunks!)
    const cleaned = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (cleaned.includes('\n')) {
      const parts = cleaned.split('\n');
      this.buffer = this.buffer.slice(0, this.cursor) + parts[0] + this.buffer.slice(this.cursor);
      this.cursor += parts[0].length;
      this.submitLine();
      return;
    }
    const printable = cleaned.replace(/[\x00-\x1f\x7f]/g, '');
    if (printable.length > 0) {
      this.buffer = this.buffer.slice(0, this.cursor) + printable + this.buffer.slice(this.cursor);
      this.cursor += printable.length;
      this.renderPrompt();
    }
  }

  private handleTabCompletion(): void {
    const beforeCursor = this.buffer.slice(0, this.cursor);
    const match = beforeCursor.match(/(?:^|\s)([^\s]*)$/);
    const token = match ? match[1] : '';
    const isFirstWord = beforeCursor.trimStart() === token;

    let candidates: string[] = [];
    if (isFirstWord && !token.includes('/') && !token.startsWith('~')) {
      const allCmds = new Set([
        ...Object.keys(COMMAND_MAP),
        ...Object.keys(this.state.aliases),
        'exit',
      ]);
      candidates = Array.from(allCmds).filter((c) => c.startsWith(token)).sort();
    } else {
      const home = this.state.env.HOME ?? '/Users/pogs';
      const lastSlash = token.lastIndexOf('/');
      const dirPart = lastSlash >= 0 ? token.slice(0, lastSlash) || '/' : '.';
      const prefix = lastSlash >= 0 ? token.slice(lastSlash + 1) : token;
      const absDir = vfs.resolvePath(dirPart, this.state.cwd, home);
      const entries = vfs.readdir(absDir) ?? [];
      candidates = entries
        .filter((e) => e.name.startsWith(prefix))
        .map((e) => {
          const base = lastSlash >= 0 ? token.slice(0, lastSlash + 1) : '';
          return base + e.name + (e.type === 'dir' ? '/' : '');
        });
    }

    if (candidates.length === 0) {
      this.tty.write(ANSI.bell);
      return;
    }

    if (candidates.length === 1) {
      const completion = candidates[0].slice(token.length);
      const suffix = candidates[0].endsWith('/') ? '' : ' ';
      this.buffer = this.buffer.slice(0, this.cursor) + completion + suffix + this.buffer.slice(this.cursor);
      this.cursor += completion.length + suffix.length;
      this.renderPrompt();
      return;
    }

    // Longest common prefix
    let lcp = candidates[0];
    for (const c of candidates) {
      let i = 0;
      while (i < lcp.length && i < c.length && lcp[i] === c[i]) i++;
      lcp = lcp.slice(0, i);
    }
    if (lcp.length > token.length) {
      const add = lcp.slice(token.length);
      this.buffer = this.buffer.slice(0, this.cursor) + add + this.buffer.slice(this.cursor);
      this.cursor += add.length;
      this.renderPrompt();
      return;
    }

    this.tty.writeln('');
    this.tty.writeln(candidates.map((c) => c.split('/').filter(Boolean).pop() + (c.endsWith('/') ? '/' : '')).join('  '));
    this.renderPrompt();
  }

  private async submitLine(): Promise<void> {
    const line = this.buffer.trim();
    this.tty.writeln('');
    this.buffer = '';
    this.cursor = 0;
    this.historyIdx = -1;

    if (!line) {
      this.renderPrompt();
      return;
    }

    if (this.state.history[this.state.history.length - 1] !== line) {
      this.state.history.push(line);
      vfs.writeFile('/Users/pogs/.zsh_history', this.state.history.slice(-200).join('\n') + '\n');
    }
    this.persistSession();

    this.isExecuting = true;
    this.activeAbort = new AbortController();

    try {
      const res = await this.executeCommandLine(line, this.activeAbort.signal, false);
      this.state.lastExitCode = res.exitCode;
      if (res.exitCode !== 0 && res.exitCode !== 130) {
        haptics.commandError();
        soundEffects.error();
      }
    } finally {
      this.isExecuting = false;
      this.activeAbort = null;
      this.tty.setRawMode(false);
      this.persistSession();
      if (!this.disposed) {
        this.updateTitle('zsh');
        this.renderPrompt();
      }
    }
  }

  public async executeCommandLine(
    line: string,
    signal: AbortSignal,
    captureOutput = false,
  ): Promise<{ exitCode: number; stdout: string }> {
    const segments = parseCommandLine(line, this.state.env, this.state.lastExitCode, this.state.cwd);
    let lastCode = 0;
    let capturedAll = '';

    for (const seg of segments) {
      if (signal.aborted) {
        lastCode = 130;
        break;
      }
      if (seg.operator === '&&' && lastCode !== 0) continue;
      if (seg.operator === '||' && lastCode === 0) continue;

      const pipeResult = await this.executePipeline(seg.pipeline, signal, captureOutput);
      lastCode = pipeResult.exitCode;
      if (captureOutput) capturedAll += pipeResult.stdout;
    }

    return { exitCode: lastCode, stdout: capturedAll };
  }

  private async executePipeline(
    pipeline: Pipeline,
    signal: AbortSignal,
    captureOutput: boolean,
  ): Promise<{ exitCode: number; stdout: string }> {
    const cmds = pipeline.commands;
    if (cmds.length === 0) return { exitCode: 0, stdout: '' };

    const home = this.state.env.HOME ?? '/Users/pogs';
    let pipeBuffer = '';
    let lastCode = 0;

    for (let idx = 0; idx < cmds.length; idx++) {
      const cmdSpec = cmds[idx];
      if (cmdSpec.argv.length === 0) continue;

      // Expand alias on first word
      let argv = [...cmdSpec.argv];
      const aliasVal = this.state.aliases[argv[0]];
      if (aliasVal) {
        const aliasTokens = aliasVal.split(/\s+/);
        argv = [...aliasTokens, ...argv.slice(1)];
      }

      const cmdName = argv[0];
      const args = argv.slice(1);

      if (cmdName === 'exit') {
        this.tty.writeln('logout');
        this.onExitSession?.();
        return { exitCode: 0, stdout: '' };
      }

      // Handle stdin redirection <
      let stdinText = pipeBuffer;
      if (cmdSpec.stdinFile) {
        const absIn = vfs.resolvePath(cmdSpec.stdinFile, this.state.cwd, home);
        const content = vfs.readFile(absIn);
        if (content === null) {
          this.tty.writeln(`zsh: no such file or directory: ${cmdSpec.stdinFile}`);
          return { exitCode: 1, stdout: '' };
        }
        stdinText = content;
      }

      const isLastInPipe = idx === cmds.length - 1;
      const shouldCapture = !isLastInPipe || Boolean(cmdSpec.stdoutFile) || captureOutput;

      let outChunks = '';
      let errChunks = '';

      const writeStdout = (text: string) => {
        if (shouldCapture) {
          outChunks += text;
        } else {
          this.tty.write(text.replace(/\r?\n/g, '\r\n'));
        }
      };

      const writeStderr = (text: string) => {
        if (cmdSpec.stderrToStdout) {
          writeStdout(text);
        } else if (cmdSpec.stderrFile) {
          errChunks += text;
        } else {
          this.tty.write(text.replace(/\r?\n/g, '\r\n'));
        }
      };

      const proc = processManager.spawn({
        ppid: this.state.shellPid,
        tty: this.tty.id,
        user: this.state.env.USER ?? 'pogs',
        command: argv.join(' '),
        kill: () => {
          this.activeAbort?.abort();
        },
      });
      this.updateTitle(cmdName);

      try {
        // Handle local script execution (./script.sh or zsh script.sh)
        const handler = COMMAND_MAP[cmdName];
        if (handler) {
          const ctx: CommandContext = {
            args,
            rawCmd: cmdName,
            stdin: stdinText,
            isPipedOutput: !isLastInPipe || Boolean(cmdSpec.stdoutFile),
            tty: this.tty,
            shell: this.state,
            signal,
            writeStdout,
            writeStderr,
            setActiveProcessName: (name) => this.updateTitle(name),
            runSubCommand: (subLine) => this.executeCommandLine(subLine, signal, true),
          };
          lastCode = await handler(ctx);
        } else if ((cmdName === 'zsh' || cmdName === 'sh' || cmdName === 'bash') && args[0]) {
          const absScript = vfs.resolvePath(args[0], this.state.cwd, home);
          const scriptText = vfs.readFile(absScript);
          if (scriptText === null) {
            writeStderr(`${cmdName}: can't open input file: ${args[0]}\n`);
            lastCode = 127;
          } else {
            for (const rawLine of scriptText.split('\n')) {
              const l = rawLine.trim();
              if (!l || l.startsWith('#')) continue;
              const sub = await this.executeCommandLine(l, signal, shouldCapture);
              lastCode = sub.exitCode;
              if (shouldCapture) outChunks += sub.stdout;
            }
          }
        } else if (cmdName.startsWith('./') || cmdName.startsWith('/')) {
          const absScript = vfs.resolvePath(cmdName, this.state.cwd, home);
          const node = vfs.getNode(absScript);
          if (!node) {
            writeStderr(`zsh: no such file or directory: ${cmdName}\n`);
            lastCode = 127;
          } else if (node.type === 'dir') {
            writeStderr(`zsh: permission denied: ${cmdName}\n`);
            lastCode = 126;
          } else {
            const scriptText = vfs.readFile(absScript) ?? '';
            for (const rawLine of scriptText.split('\n')) {
              const l = rawLine.trim();
              if (!l || l.startsWith('#')) continue;
              const sub = await this.executeCommandLine(l, signal, shouldCapture);
              lastCode = sub.exitCode;
              if (shouldCapture) outChunks += sub.stdout;
            }
          }
        } else {
          const pkgOwner = packageRegistry.findOwnerPackage(cmdName);
          if (pkgOwner && !pkgOwner.installed) {
            writeStderr(`zsh: command not found: ${cmdName}\n${ANSI.dim}Formula '${pkgOwner.name}' provides '${cmdName}'. Install it with:${ANSI.reset} brew install ${pkgOwner.name}\n`);
          } else {
            writeStderr(`zsh: command not found: ${cmdName}\n`);
          }
          lastCode = 127;
        }
      } finally {
        processManager.exit(proc.pid);
      }

      if (cmdSpec.stderrFile && errChunks) {
        const absErr = vfs.resolvePath(cmdSpec.stderrFile, this.state.cwd, home);
        vfs.writeFile(absErr, errChunks, false);
      }

      if (cmdSpec.stdoutFile) {
        const absOut = vfs.resolvePath(cmdSpec.stdoutFile, this.state.cwd, home);
        vfs.writeFile(absOut, outChunks, Boolean(cmdSpec.stdoutAppend));
        pipeBuffer = '';
      } else {
        pipeBuffer = outChunks;
      }
    }

    return { exitCode: lastCode, stdout: pipeBuffer };
  }
}
