import { ANSI, stripAnsi } from '../tty';
import type { CommandHandler } from '../types';
import { vfs, type VfsNode } from '../vfs';
import { packageRegistry } from '../packages';

function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, ' ');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day} ${hh}:${mm}`;
}

function colorizeName(node: VfsNode, colorize: boolean): string {
  if (!colorize) return node.name;
  if (node.type === 'dir') return `${ANSI.bold}${ANSI.brightBlue}${node.name}${ANSI.reset}`;
  if (node.type === 'dev') return `${ANSI.yellow}${node.name}${ANSI.reset}`;
  if (node.mode.includes('x')) return `${ANSI.brightRed}${node.name}${ANSI.reset}`;
  if (node.name.endsWith('.json') || node.name.endsWith('.md')) return `${ANSI.cyan}${node.name}${ANSI.reset}`;
  if (node.name.endsWith('.js') || node.name.endsWith('.py') || node.name.endsWith('.sh')) return `${ANSI.brightGreen}${node.name}${ANSI.reset}`;
  return node.name;
}

function getInputText(args: string[], stdin: string, cwd: string, home: string): { text: string; error?: string } {
  const files = args.filter((a) => !a.startsWith('-'));
  if (files.length === 0) return { text: stdin };
  let out = '';
  for (const f of files) {
    const abs = vfs.resolvePath(f, cwd, home);
    const content = vfs.readFile(abs);
    if (content === null) {
      return { text: '', error: `${f}: No such file or directory` };
    }
    out += content;
  }
  return { text: out };
}

export const coreutilsCommands: Record<string, CommandHandler> = {
  pwd: ({ shell, writeStdout }) => {
    writeStdout(shell.cwd + '\n');
    return 0;
  },

  cd: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const targetArg = args[0] ?? home;
    const target = targetArg === '-' ? shell.prevCwd : vfs.resolvePath(targetArg, shell.cwd, home);
    const node = vfs.getNode(target);
    if (!node) {
      writeStderr(`cd: no such file or directory: ${targetArg}\n`);
      return 1;
    }
    if (node.type !== 'dir') {
      writeStderr(`cd: not a directory: ${targetArg}\n`);
      return 1;
    }
    shell.prevCwd = shell.cwd;
    shell.cwd = target;
    shell.env.PWD = target;
    shell.env.OLDPWD = shell.prevCwd;
    return 0;
  },

  ls: ({ args, shell, isPipedOutput, tty, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let showAll = false;
    let longFmt = false;
    let human = false;
    const paths: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('-') && arg.length > 1) {
        if (arg === '--color' || arg === '--color=auto') continue;
        for (const ch of arg.slice(1)) {
          if (ch === 'a' || ch === 'A') showAll = true;
          else if (ch === 'l') longFmt = true;
          else if (ch === 'h') human = true;
        }
      } else {
        paths.push(arg);
      }
    }

    if (paths.length === 0) paths.push('.');
    const useColor = !isPipedOutput;
    let exitCode = 0;

    for (let idx = 0; idx < paths.length; idx++) {
      const p = paths[idx];
      const abs = vfs.resolvePath(p, shell.cwd, home);
      const node = vfs.getNode(abs);
      if (!node) {
        writeStderr(`ls: ${p}: No such file or directory\n`);
        exitCode = 1;
        continue;
      }

      if (node.type !== 'dir') {
        if (longFmt) {
          const sizeStr = (human ? formatBytesHuman(node.size) : String(node.size)).padStart(6);
          writeStdout(`${node.mode}  1 ${node.owner.padEnd(5)} ${node.group.padEnd(5)} ${sizeStr} ${formatDateShort(node.mtime)} ${colorizeName(node, useColor)}\n`);
        } else {
          writeStdout(`${colorizeName(node, useColor)}\n`);
        }
        continue;
      }

      if (paths.length > 1) {
        if (idx > 0) writeStdout('\n');
        writeStdout(`${p}:\n`);
      }

      let entries = vfs.readdir(abs) ?? [];
      if (!showAll) {
        entries = entries.filter((e) => !e.name.startsWith('.'));
      }

      if (longFmt) {
        writeStdout(`total ${entries.length * 8}\n`);
        for (const e of entries) {
          const sizeStr = (human ? formatBytesHuman(e.size) : String(e.size)).padStart(6);
          writeStdout(`${e.mode}  1 ${e.owner.padEnd(5)} ${e.group.padEnd(5)} ${sizeStr} ${formatDateShort(e.mtime)} ${colorizeName(e, useColor)}\n`);
        }
      } else if (entries.length > 0) {
        if (isPipedOutput) {
          for (const e of entries) writeStdout(e.name + '\n');
        } else {
          const maxLen = Math.max(...entries.map((e) => e.name.length)) + 2;
          const cols = Math.max(1, Math.floor((tty.cols || 80) / Math.max(maxLen, 12)));
          let line = '';
          entries.forEach((e, i) => {
            const colored = colorizeName(e, true);
            const pad = ' '.repeat(Math.max(1, maxLen - e.name.length));
            line += colored + pad;
            if ((i + 1) % cols === 0 || i === entries.length - 1) {
              writeStdout(line.trimEnd() + '\n');
              line = '';
            }
          });
        }
      }
    }
    return exitCode;
  },

  mkdir: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const recursive = args.includes('-p');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      writeStderr('usage: mkdir [-p] directory_name\n');
      return 1;
    }
    let code = 0;
    for (const t of targets) {
      const abs = vfs.resolvePath(t, shell.cwd, home);
      if (vfs.exists(abs)) {
        if (!recursive) {
          writeStderr(`mkdir: ${t}: File exists\n`);
          code = 1;
        }
        continue;
      }
      if (!vfs.mkdir(abs, recursive)) {
        writeStderr(`mkdir: ${t}: No such file or directory\n`);
        code = 1;
      }
    }
    return code;
  },

  rmdir: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      writeStderr('usage: rmdir directory ...\n');
      return 1;
    }
    let code = 0;
    for (const t of targets) {
      const abs = vfs.resolvePath(t, shell.cwd, home);
      const node = vfs.getNode(abs);
      if (!node) {
        writeStderr(`rmdir: ${t}: No such file or directory\n`);
        code = 1;
      } else if (node.type !== 'dir') {
        writeStderr(`rmdir: ${t}: Not a directory\n`);
        code = 1;
      } else if (node.children && Object.keys(node.children).length > 0) {
        writeStderr(`rmdir: ${t}: Directory not empty\n`);
        code = 1;
      } else {
        vfs.rm(abs, true);
      }
    }
    return code;
  },

  touch: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      writeStderr('usage: touch file ...\n');
      return 1;
    }
    for (const t of targets) {
      const abs = vfs.resolvePath(t, shell.cwd, home);
      if (!vfs.touch(abs)) {
        writeStderr(`touch: ${t}: No such file or directory\n`);
        return 1;
      }
    }
    return 0;
  },

  rm: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let recursive = false;
    let force = false;
    const targets: string[] = [];
    for (const a of args) {
      if (a.startsWith('-')) {
        if (a.includes('r') || a.includes('R')) recursive = true;
        if (a.includes('f')) force = true;
      } else {
        targets.push(a);
      }
    }
    if (targets.length === 0 && !force) {
      writeStderr('usage: rm [-rf] file ...\n');
      return 1;
    }
    let code = 0;
    for (const t of targets) {
      const abs = vfs.resolvePath(t, shell.cwd, home);
      const res = vfs.rm(abs, recursive);
      if (!res.ok && !force) {
        writeStderr((res.error ?? `rm: cannot remove ${t}`) + '\n');
        code = 1;
      }
    }
    return code;
  },

  cp: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const recursive = args.some((a) => a.startsWith('-') && (a.includes('r') || a.includes('R')));
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length < 2) {
      writeStderr('usage: cp [-R] source target\n');
      return 1;
    }
    const src = vfs.resolvePath(paths[0], shell.cwd, home);
    const dst = vfs.resolvePath(paths[1], shell.cwd, home);
    const res = vfs.cp(src, dst, recursive);
    if (!res.ok) {
      writeStderr((res.error ?? 'cp: error') + '\n');
      return 1;
    }
    return 0;
  },

  mv: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length < 2) {
      writeStderr('usage: mv source target\n');
      return 1;
    }
    const src = vfs.resolvePath(paths[0], shell.cwd, home);
    const dst = vfs.resolvePath(paths[1], shell.cwd, home);
    const res = vfs.mv(src, dst);
    if (!res.ok) {
      writeStderr((res.error ?? 'mv: error') + '\n');
      return 1;
    }
    return 0;
  },

  chmod: ({ args, shell, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    if (args.length < 2) {
      writeStderr('usage: chmod mode file ...\n');
      return 1;
    }
    const mode = args[0];
    for (const f of args.slice(1)) {
      const abs = vfs.resolvePath(f, shell.cwd, home);
      if (!vfs.chmod(abs, mode)) {
        writeStderr(`chmod: ${f}: No such file or directory\n`);
        return 1;
      }
    }
    return 0;
  },

  stat: ({ args, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    if (args.length === 0) {
      writeStderr('usage: stat file ...\n');
      return 1;
    }
    for (const f of args) {
      const abs = vfs.resolvePath(f, shell.cwd, home);
      const node = vfs.getNode(abs);
      if (!node) {
        writeStderr(`stat: ${f}: No such file or directory\n`);
        return 1;
      }
      writeStdout(`  File: ${abs}\n`);
      writeStdout(`  Size: ${node.size}\t\tType: ${node.type}\tMode: ${node.mode}\n`);
      writeStdout(` Owner: ${node.owner}:${node.group}\tModified: ${new Date(node.mtime).toISOString()}\n`);
    }
    return 0;
  },

  cat: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const numbered = args.includes('-n');
    const files = args.filter((a) => !a.startsWith('-'));
    const printText = (text: string) => {
      if (!numbered) {
        writeStdout(text);
        return;
      }
      const lines = text.split('\n');
      lines.forEach((l, idx) => {
        if (idx === lines.length - 1 && l === '') return;
        writeStdout(`${String(idx + 1).padStart(6)}  ${l}\n`);
      });
    };

    if (files.length === 0) {
      printText(stdin);
      return 0;
    }
    let code = 0;
    for (const f of files) {
      const abs = vfs.resolvePath(f, shell.cwd, home);
      const node = vfs.getNode(abs);
      if (!node) {
        writeStderr(`cat: ${f}: No such file or directory\n`);
        code = 1;
      } else if (node.type === 'dir') {
        writeStderr(`cat: ${f}: Is a directory\n`);
        code = 1;
      } else {
        printText(vfs.readFile(abs) ?? '');
      }
    }
    return code;
  },

  bat: ({ args, stdin, shell, tty, writeStdout, writeStderr }) => {
    if (!packageRegistry.isBinaryAvailable('bat')) {
      writeStderr(`zsh: command not found: bat (install with: brew install bat)\n`);
      return 127;
    }
    const home = shell.env.HOME ?? '/Users/pogs';
    const files = args.filter((a) => !a.startsWith('-'));
    const width = Math.min(tty.cols || 80, 96);
    const bar = '─'.repeat(Math.max(10, width - 8));
    const render = (label: string, content: string) => {
      writeStdout(`${ANSI.brightBlack}───────┬${bar}${ANSI.reset}\n`);
      writeStdout(`${ANSI.brightBlack}       │ ${ANSI.bold}${ANSI.brightWhite}File: ${label}${ANSI.reset}\n`);
      writeStdout(`${ANSI.brightBlack}───────┼${bar}${ANSI.reset}\n`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (idx === lines.length - 1 && line === '') return;
        const highlighted = line
          .replace(/(\/\/.*$|#.*$)/g, `${ANSI.brightBlack}$1${ANSI.reset}`)
          .replace(/\b(const|let|var|def|function|return|import|export|for|if|else|print|console)\b/g, `${ANSI.magenta}$1${ANSI.reset}`)
          .replace(/(['"`][^'"`]*['"`])/g, `${ANSI.green}$1${ANSI.reset}`);
        writeStdout(`${ANSI.brightBlack}${String(idx + 1).padStart(6)} │ ${ANSI.reset}${highlighted}\n`);
      });
      writeStdout(`${ANSI.brightBlack}───────┴${bar}${ANSI.reset}\n`);
    };

    if (files.length === 0) {
      render('STDIN', stdin);
      return 0;
    }
    for (const f of files) {
      const abs = vfs.resolvePath(f, shell.cwd, home);
      const content = vfs.readFile(abs);
      if (content === null) {
        writeStderr(`bat: ${f}: No such file or directory\n`);
        return 1;
      }
      render(f, content);
    }
    return 0;
  },

  head: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let count = 10;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1]) {
        count = parseInt(args[++i], 10) || 10;
      } else if (/^-\d+$/.test(args[i])) {
        count = parseInt(args[i].slice(1), 10) || 10;
      } else {
        files.push(args[i]);
      }
    }
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`head: ${error}\n`);
      return 1;
    }
    const lines = text.split('\n').slice(0, count);
    writeStdout(lines.join('\n') + (text.endsWith('\n') && lines.length > 0 ? '\n' : ''));
    return 0;
  },

  tail: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let count = 10;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1]) {
        count = parseInt(args[++i], 10) || 10;
      } else if (/^-\d+$/.test(args[i])) {
        count = parseInt(args[i].slice(1), 10) || 10;
      } else if (args[i] !== '-f') {
        files.push(args[i]);
      }
    }
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`tail: ${error}\n`);
      return 1;
    }
    const rawLines = text.split('\n');
    if (rawLines[rawLines.length - 1] === '') rawLines.pop();
    const sliced = rawLines.slice(-count);
    writeStdout(sliced.join('\n') + (sliced.length > 0 ? '\n' : ''));
    return 0;
  },

  wc: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const onlyLines = args.includes('-l');
    const onlyWords = args.includes('-w');
    const onlyChars = args.includes('-c') || args.includes('-m');
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`wc: ${error}\n`);
      return 1;
    }
    const lines = (text.match(/\n/g) ?? []).length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    if (onlyLines) writeStdout(`${lines}\n`);
    else if (onlyWords) writeStdout(`${words}\n`);
    else if (onlyChars) writeStdout(`${chars}\n`);
    else writeStdout(`  ${String(lines).padStart(5)}  ${String(words).padStart(5)}  ${String(chars).padStart(5)}${files[0] ? ' ' + files[0] : ''}\n`);
    return 0;
  },

  grep: ({ args, stdin, shell, isPipedOutput, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let ignoreCase = false;
    let invert = false;
    let lineNums = false;
    let countOnly = false;
    const positional: string[] = [];

    for (const a of args) {
      if (a.startsWith('-') && !a.startsWith('--')) {
        for (const ch of a.slice(1)) {
          if (ch === 'i') ignoreCase = true;
          else if (ch === 'v') invert = true;
          else if (ch === 'n') lineNums = true;
          else if (ch === 'c') countOnly = true;
        }
      } else if (!a.startsWith('--')) {
        positional.push(a);
      }
    }

    const pattern = positional[0];
    if (!pattern) {
      writeStderr('usage: grep [-invcr] pattern [file ...]\n');
      return 2;
    }
    const files = positional.slice(1);
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`grep: ${error}\n`);
      return 2;
    }

    const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    let matches = 0;

    lines.forEach((line, idx) => {
      const plain = stripAnsi(line);
      regex.lastIndex = 0;
      const matched = regex.test(plain);
      if (matched !== invert) {
        matches++;
        if (!countOnly) {
          let outLine = line;
          if (!invert && !isPipedOutput) {
            regex.lastIndex = 0;
            outLine = plain.replace(regex, (m) => `${ANSI.bold}${ANSI.brightRed}${m}${ANSI.reset}`);
          }
          const prefix = lineNums ? `${ANSI.green}${idx + 1}${ANSI.cyan}:${ANSI.reset}` : '';
          writeStdout(`${prefix}${outLine}\n`);
        }
      }
    });
    if (countOnly) writeStdout(`${matches}\n`);
    return matches > 0 ? 0 : 1;
  },

  find: ({ args, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const rootArg = args[0] && !args[0].startsWith('-') ? args[0] : '.';
    const absRoot = vfs.resolvePath(rootArg, shell.cwd, home);
    const startNode = vfs.getNode(absRoot);
    if (!startNode) {
      writeStderr(`find: ${rootArg}: No such file or directory\n`);
      return 1;
    }
    let nameFilter: RegExp | null = null;
    const nameIdx = args.indexOf('-name');
    if (nameIdx !== -1 && args[nameIdx + 1]) {
      const pat = args[nameIdx + 1].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      nameFilter = new RegExp(`^${pat}$`);
    }
    let typeFilter: string | null = null;
    const typeIdx = args.indexOf('-type');
    if (typeIdx !== -1 && args[typeIdx + 1]) {
      typeFilter = args[typeIdx + 1];
    }

    const walk = (node: VfsNode, displayPath: string) => {
      const typeMatch = !typeFilter || (typeFilter === 'd' && node.type === 'dir') || (typeFilter === 'f' && node.type === 'file');
      const nameMatch = !nameFilter || nameFilter.test(node.name);
      if (typeMatch && nameMatch) {
        writeStdout(displayPath + '\n');
      }
      if (node.type === 'dir' && node.children) {
        for (const child of Object.values(node.children)) {
          const nextDisplay = displayPath === '/' ? `/${child.name}` : `${displayPath}/${child.name}`;
          walk(child, nextDisplay);
        }
      }
    };
    walk(startNode, rootArg === '.' ? '.' : rootArg.replace(/\/$/, '') || '/');
    return 0;
  },

  tree: ({ args, shell, isPipedOutput, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const showAll = args.includes('-a');
    const targetArg = args.find((a) => !a.startsWith('-')) ?? '.';
    const abs = vfs.resolvePath(targetArg, shell.cwd, home);
    const root = vfs.getNode(abs);
    if (!root || root.type !== 'dir') {
      writeStderr(`tree: ${targetArg}: Not a directory\n`);
      return 1;
    }
    let dirCount = 0;
    let fileCount = 0;
    const useColor = !isPipedOutput;
    writeStdout(`${useColor ? ANSI.bold + ANSI.brightBlue : ''}${targetArg}${useColor ? ANSI.reset : ''}\n`);

    const walk = (node: VfsNode, prefix: string) => {
      const children = Object.values(node.children ?? {})
        .filter((c) => showAll || !c.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      children.forEach((child, idx) => {
        const isLast = idx === children.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        writeStdout(`${ANSI.brightBlack}${prefix}${connector}${ANSI.reset}${colorizeName(child, useColor)}\n`);
        if (child.type === 'dir') {
          dirCount++;
          walk(child, prefix + (isLast ? '    ' : '│   '));
        } else {
          fileCount++;
        }
      });
    };
    walk(root, '');
    writeStdout(`\n${dirCount} directories, ${fileCount} files\n`);
    return 0;
  },

  sort: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const reverse = args.includes('-r');
    const numeric = args.includes('-n');
    const unique = args.includes('-u');
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`sort: ${error}\n`);
      return 1;
    }
    let lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    lines.sort((a, b) => (numeric ? (parseFloat(a) || 0) - (parseFloat(b) || 0) : a.localeCompare(b)));
    if (reverse) lines.reverse();
    if (unique) lines = Array.from(new Set(lines));
    if (lines.length > 0) writeStdout(lines.join('\n') + '\n');
    return 0;
  },

  uniq: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const count = args.includes('-c');
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`uniq: ${error}\n`);
      return 1;
    }
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    let prev: string | null = null;
    let streak = 0;
    const flush = () => {
      if (prev === null) return;
      writeStdout(count ? `${String(streak).padStart(4)} ${prev}\n` : `${prev}\n`);
    };
    for (const l of lines) {
      if (l === prev) streak++;
      else {
        flush();
        prev = l;
        streak = 1;
      }
    }
    flush();
    return 0;
  },

  cut: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let delim = '\t';
    let field = 1;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-d' && args[i + 1]) delim = args[++i];
      else if (args[i].startsWith('-d')) delim = args[i].slice(2);
      else if (args[i] === '-f' && args[i + 1]) field = parseInt(args[++i], 10) || 1;
      else if (args[i].startsWith('-f')) field = parseInt(args[i].slice(2), 10) || 1;
      else files.push(args[i]);
    }
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`cut: ${error}\n`);
      return 1;
    }
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const l of lines) {
      const parts = l.split(delim);
      writeStdout((parts[field - 1] ?? '') + '\n');
    }
    return 0;
  },

  tr: ({ args, stdin, writeStdout }) => {
    const positional = args.filter((a) => !a.startsWith('-'));
    const del = args.includes('-d');
    const set1 = positional[0] ?? '';
    const set2 = positional[1] ?? '';
    let out = stdin;
    if (del) {
      const chars = new Set(set1.split(''));
      out = out.split('').filter((c) => !chars.has(c)).join('');
    } else if (set1 === '[:lower:]' && set2 === '[:upper:]') {
      out = out.toUpperCase();
    } else if (set1 === '[:upper:]' && set2 === '[:lower:]') {
      out = out.toLowerCase();
    } else if (set1 && set2) {
      const map = new Map<string, string>();
      for (let i = 0; i < set1.length; i++) {
        map.set(set1[i], set2[Math.min(i, set2.length - 1)]);
      }
      out = out.split('').map((c) => map.get(c) ?? c).join('');
    }
    writeStdout(out);
    return 0;
  },

  sed: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const expr = args[0] ?? '';
    const files = args.slice(1);
    const match = expr.match(/^s(.)(.*?)\1(.*?)\1([gi]*)$/);
    if (!match) {
      writeStderr(`sed: unsupported expression '${expr}' (supports s/pat/rep/[gi])\n`);
      return 1;
    }
    const [, , pat, rep, flags] = match;
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`sed: ${error}\n`);
      return 1;
    }
    const regex = new RegExp(pat, flags);
    const out = text
      .split('\n')
      .map((l) => l.replace(regex, rep))
      .join('\n');
    writeStdout(out);
    return 0;
  },

  awk: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    let sep = /\s+/;
    const positional: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-F' && args[i + 1]) sep = new RegExp(args[++i]);
      else positional.push(args[i]);
    }
    const program = positional[0] ?? '{print $0}';
    const files = positional.slice(1);
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`awk: ${error}\n`);
      return 1;
    }
    const fieldMatch = program.match(/\$(\d+)/);
    const fieldIdx = fieldMatch ? parseInt(fieldMatch[1], 10) : 0;
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const l of lines) {
      if (fieldIdx === 0) {
        writeStdout(l + '\n');
      } else {
        const cols = l.trim().split(sep);
        writeStdout((cols[fieldIdx - 1] ?? '') + '\n');
      }
    }
    return 0;
  },

  echo: ({ args, writeStdout }) => {
    let newline = true;
    let interpret = false;
    let idx = 0;
    while (idx < args.length && (args[idx] === '-n' || args[idx] === '-e' || args[idx] === '-ne' || args[idx] === '-en')) {
      if (args[idx].includes('n')) newline = false;
      if (args[idx].includes('e')) interpret = true;
      idx++;
    }
    let out = args.slice(idx).join(' ');
    if (interpret) {
      out = out
        .replace(/\\x1b/gi, '\x1b')
        .replace(/\\033/g, '\x1b')
        .replace(/\\e/g, '\x1b')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
    }
    writeStdout(out + (newline ? '\n' : ''));
    return 0;
  },

  printf: ({ args, writeStdout }) => {
    if (args.length === 0) return 0;
    let fmt = args[0]
      .replace(/\\x1b/gi, '\x1b')
      .replace(/\\033/g, '\x1b')
      .replace(/\\e/g, '\x1b')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
    let argIdx = 1;
    fmt = fmt.replace(/%([sd])/g, (_, spec) => {
      const val = args[argIdx++] ?? '';
      return spec === 'd' ? String(parseInt(val, 10) || 0) : val;
    });
    writeStdout(fmt);
    return 0;
  },

  tee: ({ args, stdin, shell, writeStdout }) => {
    const home = shell.env.HOME ?? '/Users/pogs';
    const append = args.includes('-a');
    for (const f of args.filter((a) => !a.startsWith('-'))) {
      const abs = vfs.resolvePath(f, shell.cwd, home);
      vfs.writeFile(abs, stdin, append);
    }
    writeStdout(stdin);
    return 0;
  },

  jq: ({ args, stdin, shell, isPipedOutput, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    const query = args.find((a) => !a.startsWith('-')) ?? '.';
    const fileArg = args.filter((a) => !a.startsWith('-'))[1];
    let raw = stdin;
    if (fileArg) {
      const abs = vfs.resolvePath(fileArg, shell.cwd, home);
      const content = vfs.readFile(abs);
      if (content === null) {
        writeStderr(`jq: error: Could not open file ${fileArg}\n`);
        return 2;
      }
      raw = content;
    }
    try {
      let data = JSON.parse(raw);
      if (query !== '.') {
        const parts = query.replace(/^\./, '').split('.').filter(Boolean);
        for (const p of parts) {
          data = data?.[p];
        }
      }
      const pretty = JSON.stringify(data, null, 2);
      if (isPipedOutput) {
        writeStdout(pretty + '\n');
      } else {
        const colored = pretty
          .replace(/"([^"]+)":/g, `${ANSI.bold}${ANSI.brightBlue}"$1"${ANSI.reset}:`)
          .replace(/: "([^"]*)"/g, `: ${ANSI.green}"$1"${ANSI.reset}`)
          .replace(/: (\d+(\.\d+)?)/g, `: ${ANSI.yellow}$1${ANSI.reset}`)
          .replace(/: (true|false|null)/g, `: ${ANSI.magenta}$1${ANSI.reset}`);
        writeStdout(colored + '\n');
      }
      return 0;
    } catch (e) {
      writeStderr(`jq: parse error: ${(e as Error).message}\n`);
      return 4;
    }
  },

  xxd: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`xxd: ${error}\n`);
      return 1;
    }
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < bytes.length; i += 16) {
      const slice = bytes.slice(i, i + 16);
      const hexPairs: string[] = [];
      for (let j = 0; j < 16; j += 2) {
        const b1 = j < slice.length ? slice[j].toString(16).padStart(2, '0') : '  ';
        const b2 = j + 1 < slice.length ? slice[j + 1].toString(16).padStart(2, '0') : '  ';
        hexPairs.push(b1 + b2);
      }
      const ascii = Array.from(slice)
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
        .join('');
      writeStdout(`${ANSI.cyan}${i.toString(16).padStart(8, '0')}:${ANSI.reset} ${hexPairs.join(' ')}  ${ANSI.green}${ascii}${ANSI.reset}\n`);
    }
    return 0;
  },

  base64: ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    const decode = args.includes('-d') || args.includes('--decode');
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`base64: ${error}\n`);
      return 1;
    }
    try {
      if (decode) {
        const bin = atob(text.trim());
        writeStdout(bin + (bin.endsWith('\n') ? '' : '\n'));
      } else {
        writeStdout(btoa(unescape(encodeURIComponent(text))) + '\n');
      }
      return 0;
    } catch {
      writeStderr('base64: invalid input\n');
      return 1;
    }
  },

  shasum: async ({ args, stdin, shell, writeStdout, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    const files = args.filter((a) => !a.startsWith('-'));
    const { text, error } = getInputText(files, stdin, shell.cwd, home);
    if (error) {
      writeStderr(`shasum: ${error}\n`);
      return 1;
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    writeStdout(`${hex}  ${files[0] ?? '-'}\n`);
    return 0;
  },

  bc: ({ args, stdin, writeStdout, writeStderr }) => {
    const expr = (args.filter((a) => !a.startsWith('-')).join(' ') || stdin).trim();
    if (!expr) return 0;
    try {
      if (!/^[0-9+\-*/().%\s^]+$/.test(expr)) {
        writeStderr('bc: invalid expression\n');
        return 1;
      }
      const jsExpr = expr.replace(/\^/g, '**');
      const result = Function(`"use strict"; return (${jsExpr})`)();
      writeStdout(`${result}\n`);
      return 0;
    } catch {
      writeStderr('bc: syntax error\n');
      return 1;
    }
  },

  du: ({ args, shell, writeStdout }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    const human = args.includes('-h');
    const targetArg = args.find((a) => !a.startsWith('-')) ?? '.';
    const abs = vfs.resolvePath(targetArg, shell.cwd, home);
    const node = vfs.getNode(abs);
    if (!node) return 1;
    const calcSize = (n: VfsNode): number => {
      if (n.type !== 'dir') return n.size || 0;
      return Object.values(n.children ?? {}).reduce((sum, c) => sum + calcSize(c), 64);
    };
    const total = calcSize(node);
    writeStdout(`${human ? formatBytesHuman(total) : Math.ceil(total / 512)}\t${targetArg}\n`);
    return 0;
  },

  df: ({ args, writeStdout }) => {
    const human = args.includes('-h');
    const stats = vfs.getStats();
    const usedKb = Math.max(128, Math.ceil(stats.bytes / 1024) + 18420);
    const totalKb = 5242880; // 5 GB local virtual quota
    const availKb = totalKb - usedKb;
    const pct = Math.max(1, Math.round((usedKb / totalKb) * 100));
    writeStdout(`Filesystem     ${human ? 'Size   Used  Avail' : '1K-blocks    Used Available'} Capacity  Mounted on\n`);
    if (human) {
      writeStdout(`/dev/disk3s1   5.0G  ${(usedKb / 1024).toFixed(1)}M   4.9G       ${pct}%  /\n`);
    } else {
      writeStdout(`/dev/disk3s1   ${totalKb}   ${usedKb}   ${availKb}       ${pct}%  /\n`);
    }
    return 0;
  },

  uname: ({ args, writeStdout }) => {
    const all = args.includes('-a');
    if (all) {
      writeStdout('Darwin mac.local 24.2.0 Darwin Kernel Version 24.2.0: arm64 RELEASE_ARM64_T8122\n');
    } else if (args.includes('-m')) {
      writeStdout('arm64\n');
    } else if (args.includes('-r')) {
      writeStdout('24.2.0\n');
    } else if (args.includes('-n')) {
      writeStdout('MacBook-Pro.local\n');
    } else {
      writeStdout('Darwin\n');
    }
    return 0;
  },

  whoami: ({ shell, writeStdout }) => {
    writeStdout((shell.env.USER ?? 'pogs') + '\n');
    return 0;
  },

  id: ({ shell, writeStdout }) => {
    const u = shell.env.USER ?? 'pogs';
    writeStdout(`uid=501(${u}) gid=20(staff) groups=20(staff),12(everyone),61(localaccounts),80(admin)\n`);
    return 0;
  },

  hostname: ({ writeStdout }) => {
    writeStdout('mac.local\n');
    return 0;
  },

  date: ({ writeStdout }) => {
    writeStdout(new Date().toString() + '\n');
    return 0;
  },

  cal: ({ writeStdout }) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const header = `${monthNames[month]} ${year}`;
    const padLeft = Math.floor((20 - header.length) / 2);
    writeStdout(' '.repeat(Math.max(0, padLeft)) + `${ANSI.bold}${header}${ANSI.reset}\n`);
    writeStdout('Su Mo Tu We Th Fr Sa\n');
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let line = '   '.repeat(firstDay);
    for (let d = 1; d <= daysInMonth; d++) {
      const s = String(d).padStart(2, ' ');
      line += d === today ? `${ANSI.inverse}${s}${ANSI.reset} ` : `${s} `;
      if ((firstDay + d) % 7 === 0 || d === daysInMonth) {
        writeStdout(line.trimEnd() + '\n');
        line = '';
      }
    }
    return 0;
  },

  uptime: ({ writeStdout }) => {
    const mins = Math.max(1, Math.floor(performance.now() / 60000) + 14);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    writeStdout(` ${hh}:${mm}  up ${mins} mins, 2 users, load averages: 1.42 1.38 1.29\n`);
    return 0;
  },

  env: ({ shell, writeStdout }) => {
    for (const [k, v] of Object.entries(shell.env)) {
      writeStdout(`${k}=${v}\n`);
    }
    return 0;
  },

  export: ({ args, shell, writeStdout }) => {
    if (args.length === 0) {
      for (const [k, v] of Object.entries(shell.env)) {
        writeStdout(`export ${k}="${v}"\n`);
      }
      return 0;
    }
    for (const arg of args) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        const key = arg.slice(0, eq);
        const val = arg.slice(eq + 1);
        shell.env[key] = val;
      }
    }
    return 0;
  },

  unset: ({ args, shell }) => {
    for (const k of args) delete shell.env[k];
    return 0;
  },

  alias: ({ args, shell, writeStdout }) => {
    if (args.length === 0) {
      for (const [k, v] of Object.entries(shell.aliases)) {
        writeStdout(`${k}='${v}'\n`);
      }
      return 0;
    }
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        shell.aliases[a.slice(0, eq)] = a.slice(eq + 1);
      } else if (shell.aliases[a]) {
        writeStdout(`${a}='${shell.aliases[a]}'\n`);
      }
    }
    return 0;
  },

  unalias: ({ args, shell }) => {
    for (const a of args) delete shell.aliases[a];
    return 0;
  },

  which: ({ args, shell, writeStdout, writeStderr }) => {
    if (args.length === 0) return 1;
    let code = 0;
    for (const cmd of args) {
      if (shell.aliases[cmd]) {
        writeStdout(`${cmd}: aliased to ${shell.aliases[cmd]}\n`);
      } else if (vfs.exists(`/bin/${cmd}`)) {
        writeStdout(`/bin/${cmd}\n`);
      } else if (vfs.exists(`/usr/bin/${cmd}`)) {
        writeStdout(`/usr/bin/${cmd}\n`);
      } else if (vfs.exists(`/usr/local/bin/${cmd}`)) {
        writeStdout(`/usr/local/bin/${cmd}\n`);
      } else if (packageRegistry.isBinaryAvailable(cmd)) {
        writeStdout(`/usr/local/bin/${cmd}\n`);
      } else {
        writeStderr(`${cmd} not found\n`);
        code = 1;
      }
    }
    return code;
  },

  history: ({ shell, writeStdout }) => {
    shell.history.forEach((cmd, idx) => {
      writeStdout(`${String(idx + 1).padStart(5)}  ${cmd}\n`);
    });
    return 0;
  },

  clear: ({ tty }) => {
    tty.write(ANSI.clearScreen);
    return 0;
  },

  reset: ({ tty }) => {
    tty.setRawMode(false);
    tty.write(ANSI.reset + ANSI.showCursor + ANSI.altScreenOff + ANSI.clearScreen);
    return 0;
  },

  sleep: async ({ args, signal }) => {
    const secs = Math.max(0, parseFloat(args[0] ?? '1') || 0);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, secs * 1000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    return signal.aborted ? 130 : 0;
  },

  source: async ({ args, shell, runSubCommand, writeStderr }) => {
    const home = shell.env.HOME ?? '/Users/alex';
    if (!args[0]) {
      writeStderr('source: not enough arguments\n');
      return 1;
    }
    const abs = vfs.resolvePath(args[0], shell.cwd, home);
    const content = vfs.readFile(abs);
    if (content === null) {
      writeStderr(`source: no such file or directory: ${args[0]}\n`);
      return 1;
    }
    let lastCode = 0;
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const res = await runSubCommand(line);
      lastCode = res.exitCode;
    }
    return lastCode;
  },

  true: () => 0,
  false: () => 1,

  man: ({ args, writeStdout, writeStderr }) => {
    const topic = args[0];
    if (!topic) {
      writeStdout(`What manual page do you want?\nTry 'man neofetch', 'man stty', 'man brew', or 'help'.\n`);
      return 1;
    }
    const pkg = packageRegistry.findOwnerPackage(topic) ?? packageRegistry.get(topic);
    if (pkg) {
      writeStdout(`${ANSI.bold}${topic.toUpperCase()}(1)${ANSI.reset}                 macOS General Commands Manual                 ${ANSI.bold}${topic.toUpperCase()}(1)${ANSI.reset}\n\n`);
      writeStdout(`${ANSI.bold}NAME${ANSI.reset}\n     ${topic} — ${pkg.description}\n\n`);
      writeStdout(`${ANSI.bold}PACKAGE${ANSI.reset}\n     ${pkg.name} ${pkg.version} (${pkg.installed ? 'installed' : 'available via brew install ' + pkg.name})\n\n`);
      writeStdout(`${ANSI.bold}EXAMPLE${ANSI.reset}\n     ${pkg.demoCmd}\n\n`);
      return 0;
    }
    writeStderr(`No manual entry for ${topic}\n`);
    return 1;
  },

  help: ({ writeStdout }) => {
    writeStdout(`${ANSI.bold}${ANSI.brightCyan}macOS Terminal — Local TTY & ANSI Runtime${ANSI.reset}\n\n`);
    writeStdout(`${ANSI.bold}TTY & ANSI Packages:${ANSI.reset}\n`);
    writeStdout(`  neofetch      Darwin system & palette card      figlet / lolcat  24-bit RGB ASCII banners\n`);
    writeStdout(`  colortest     16/256/24-bit RGB ANSI matrix     tty / stty       TTY device & termios flags\n`);
    writeStdout(`  tput          Terminfo screen/color controls    cowsay / sl      Classic ANSI terminal art\n`);
    writeStdout(`  htop          Interactive live process viewer   ranger           Dual-pane TUI file manager\n`);
    writeStdout(`  nano / vi     Full-screen terminal editors      cmatrix / pipes  Animated ANSI TUI effects\n`);
    writeStdout(`\n${ANSI.bold}Homebrew & Developer Tools:${ANSI.reset}\n`);
    writeStdout(`  brew list     List installed TTY/ANSI pkgs      brew search      Browse installable packages\n`);
    writeStdout(`  brew install  Install e.g. asciiquarium, bat    claude / gemini / agy  CLI AI coding agents\n`);
    writeStdout(`  git           Local VFS git repository          coder / agent    Agentic coding CLI aliases\n`);
    writeStdout(`  jq / xxd      JSON highlight & hex dump         node / python3   Local JS & Python runtimes\n`);
    writeStdout(`\n${ANSI.bold}Shortcuts:${ANSI.reset}  Cmd/Ctrl+T New Tab  ·  Cmd/Ctrl+D Split  ·  Tab Complete  ·  Ctrl+R Search  ·  Ctrl+C Abort\n`);
    return 0;
  },
};
