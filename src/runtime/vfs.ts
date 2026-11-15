export type VfsNodeType = 'file' | 'dir' | 'dev';

export interface VfsNode {
  name: string;
  type: VfsNodeType;
  mode: string;
  owner: string;
  group: string;
  size: number;
  mtime: number;
  content?: string;
  children?: Record<string, VfsNode>;
}

const STORAGE_KEY = 'macos_terminal_vfs_v2';

function makeDir(name: string, owner = 'pogs', group = 'staff', mode = 'drwxr-xr-x'): VfsNode {
  return {
    name,
    type: 'dir',
    mode,
    owner,
    group,
    size: 64,
    mtime: Date.now(),
    children: {},
  };
}

function makeFile(
  name: string,
  content: string,
  owner = 'pogs',
  group = 'staff',
  mode = '-rw-r--r--',
): VfsNode {
  return {
    name,
    type: 'file',
    mode,
    owner,
    group,
    size: content.length,
    mtime: Date.now(),
    content,
  };
}

function makeExec(name: string, description: string): VfsNode {
  return makeFile(name, `#!/usr/bin/env zsh\n# Native macOS TTY runtime binary: ${description}\n`, 'root', 'wheel', '-rwxr-xr-x');
}

function createInitialTree(): VfsNode {
  const root = makeDir('/', 'root', 'wheel', 'drwxr-xr-x');
  const now = Date.now();

  const users = makeDir('Users', 'root', 'admin');
  const pogs = makeDir('pogs', 'pogs', 'staff');
  const desktop = makeDir('Desktop', 'pogs', 'staff');
  const documents = makeDir('Documents', 'pogs', 'staff');
  const downloads = makeDir('Downloads', 'pogs', 'staff');
  const projects = makeDir('Projects', 'pogs', 'staff');
  const ttyLab = makeDir('tty-lab', 'pogs', 'staff');

  ttyLab.children!['hello.js'] = makeFile(
    'hello.js',
    `// Run with: node ~/Projects/tty-lab/hello.js
const os = process.platform;
const tty = process.env.TTY || '/dev/ttys000';
console.log('\\x1b[1;36mHello from local Node runtime!\\x1b[0m');
console.log('Platform:', os, '| TTY:', tty, '| Cols:', process.stdout.columns);
`,
  );

  ttyLab.children!['fibonacci.py'] = makeFile(
    'fibonacci.py',
    `# Run with: python3 ~/Projects/tty-lab/fibonacci.py
def fib(n):
    a, b = 0, 1
    for i in range(n):
        print(f"F({i}) = {a}")
        a, b = b, a + b

fib(10)
`,
  );

  ttyLab.children!['ansi-demo.sh'] = makeFile(
    'ansi-demo.sh',
    `#!/bin/zsh
echo "=== macOS TTY & ANSI Demo ==="
tty
neofetch
figlet "macOS TTY" | lolcat
colortest
`,
    'pogs',
    'staff',
    '-rwxr-xr-x',
  );

  ttyLab.children!['config.json'] = makeFile(
    'config.json',
    JSON.stringify(
      {
        runtime: 'MacTerm Darwin Kernel',
        shell: '/bin/zsh',
        term: 'xterm-256color',
        colorterm: 'truecolor',
        tty: {
          icanon: true,
          echo: true,
          utf8: true,
        },
        packages: ['ncurses', 'figlet', 'lolcat', 'htop', 'neofetch', 'nano', 'vim', 'cmatrix', 'pipes'],
      },
      null,
      2,
    ) + '\n',
  );

  ttyLab.children!['README.md'] = makeFile(
    'README.md',
    `# Local macOS Terminal Runtime

Welcome to your local Darwin-style POSIX & ANSI workspace.

## Try these TTY & ANSI commands:
- \`neofetch\` — macOS Darwin system & palette card
- \`htop\` — Interactive live TUI process monitor
- \`nano README.md\` or \`vi README.md\` — Full-screen terminal editors
- \`ranger\` — Dual-pane TUI file manager
- \`figlet "Hello" | lolcat\` — 24-bit RGB ANSI rainbow banners
- \`colortest\` / \`truecolor\` — 16, 256 & 24-bit RGB ANSI palette test
- \`cmatrix\`, \`pipes\`, \`sl\` — Terminal animations
- \`brew list\` / \`brew search\` / \`brew install asciiquarium\` — Homebrew package manager
`,
  );

  projects.children!['tty-lab'] = ttyLab;

  documents.children!['notes.txt'] = makeFile(
    'notes.txt',
    `macOS Terminal Quick Notes
--------------------------
• Press Cmd+T (or Ctrl+T) to open a new terminal tab
• Press Cmd+D to split pane horizontally, Shift+Cmd+D vertically
• Press Tab for path and command completion
• Press Ctrl+R for reverse history search
• Run 'brew list' to inspect installed TTY & ANSI packages
`,
  );

  pogs.children!['Desktop'] = desktop;
  pogs.children!['Documents'] = documents;
  pogs.children!['Downloads'] = downloads;
  pogs.children!['Projects'] = projects;
  pogs.children!['.zshrc'] = makeFile(
    '.zshrc',
    `# ~/.zshrc — Z shell startup configuration
export SHELL="/bin/zsh"
export TERM="xterm-256color"
export COLORTERM="truecolor"
export LANG="en_US.UTF-8"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

alias ll="ls -la"
alias la="ls -A"
alias l="ls -CF"
alias cls="clear"
alias pkg="brew"
`,
  );
  pogs.children!['.zsh_history'] = makeFile(
    '.zsh_history',
    `neofetch\nls -la\nbrew list\nfiglet "pogs@mac" | lolcat\ncolortest\n`,
  );
  users.children!['pogs'] = pogs;

  const bin = makeDir('bin', 'root', 'wheel');
  for (const cmd of ['zsh', 'sh', 'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv', 'cat', 'echo', 'printf', 'ps', 'kill', 'sleep', 'date', 'uname', 'chmod']) {
    bin.children![cmd] = makeExec(cmd, `POSIX core binary ${cmd}`);
  }

  const usr = makeDir('usr', 'root', 'wheel');
  const usrBin = makeDir('bin', 'root', 'wheel');
  for (const cmd of ['grep', 'find', 'sort', 'uniq', 'wc', 'head', 'tail', 'cut', 'tr', 'sed', 'awk', 'tee', 'xargs', 'stat', 'du', 'df', 'whoami', 'id', 'hostname', 'uptime', 'cal', 'bc', 'xxd', 'base64', 'shasum', 'tty', 'stty', 'tput', 'clear', 'reset', 'which', 'man', 'vi', 'vim', 'git', 'curl']) {
    usrBin.children![cmd] = makeExec(cmd, `System utility ${cmd}`);
  }

  const usrLocal = makeDir('local', 'pogs', 'admin');
  const usrLocalBin = makeDir('bin', 'pogs', 'admin');
  for (const cmd of ['brew', 'pkg', 'neofetch', 'fastfetch', 'htop', 'nano', 'figlet', 'toilet', 'lolcat', 'cowsay', 'tree', 'ranger', 'cmatrix', 'pipes', 'sl', 'jq', 'node', 'python3', 'claude', 'gemini', 'agy', 'coder', 'agent', 'colortest', 'truecolor', '256colors', 'ansi-art', 'spark', 'asciiquarium', 'nyancat', 'bat', 'tty-clock', 'donut', 'fortune', 'boxes']) {
    usrLocalBin.children![cmd] = makeExec(cmd, `Homebrew TTY/ANSI package ${cmd}`);
  }
  const cellar = makeDir('Cellar', 'pogs', 'admin');
  usrLocal.children!['bin'] = usrLocalBin;
  usrLocal.children!['Cellar'] = cellar;
  usr.children!['bin'] = usrBin;
  usr.children!['local'] = usrLocal;

  const etc = makeDir('etc', 'root', 'wheel');
  etc.children!['os-release'] = makeFile(
    'os-release',
    `NAME="macOS Darwin"\nVERSION="15.2 (Sequoia)"\nID=darwin\nKERNEL="Darwin 24.2.0 arm64"\nSHELL="/bin/zsh"\n`,
    'root',
    'wheel',
  );
  etc.children!['shells'] = makeFile('shells', `/bin/sh\n/bin/bash\n/bin/zsh\n`, 'root', 'wheel');
  etc.children!['hosts'] = makeFile('hosts', `127.0.0.1\tlocalhost\n::1\t\tlocalhost\n127.0.0.1\tmac.local\n`, 'root', 'wheel');
  etc.children!['motd'] = makeFile('motd', `Darwin Kernel Version 24.2.0: arm64 RELEASE_ARM64_T8122\n`, 'root', 'wheel');

  const dev = makeDir('dev', 'root', 'wheel');
  dev.children!['null'] = { name: 'null', type: 'dev', mode: 'crw-rw-rw-', owner: 'root', group: 'wheel', size: 0, mtime: now };
  dev.children!['zero'] = { name: 'zero', type: 'dev', mode: 'crw-rw-rw-', owner: 'root', group: 'wheel', size: 0, mtime: now };
  dev.children!['urandom'] = { name: 'urandom', type: 'dev', mode: 'crw-rw-rw-', owner: 'root', group: 'wheel', size: 0, mtime: now };
  dev.children!['ttys000'] = { name: 'ttys000', type: 'dev', mode: 'crw--w----', owner: 'pogs', group: 'tty', size: 0, mtime: now };

  const tmp = makeDir('tmp', 'root', 'wheel', 'drwxrwxrwt');
  const varDir = makeDir('var', 'root', 'wheel');
  const varLog = makeDir('log', 'root', 'wheel');
  varLog.children!['system.log'] = makeFile(
    'system.log',
    `${new Date(now - 60000).toISOString()} mac kernel[0]: Darwin Kernel 24.2.0 initialized\n${new Date(now - 30000).toISOString()} mac Terminal[102]: PTY subsystem ready (/dev/ttys000)\n`,
    'root',
    'wheel',
  );
  varDir.children!['log'] = varLog;

  root.children!['Users'] = users;
  root.children!['bin'] = bin;
  root.children!['usr'] = usr;
  root.children!['etc'] = etc;
  root.children!['dev'] = dev;
  root.children!['tmp'] = tmp;
  root.children!['var'] = varDir;

  return root;
}

class VirtualFileSystem {
  private root: VfsNode;
  private listeners = new Set<() => void>();

  constructor() {
    this.root = this.load();
  }

  private load(): VfsNode {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as VfsNode;
        if (parsed && parsed.type === 'dir' && parsed.children) {
          const binDir = parsed.children['usr']?.children?.['local']?.children?.['bin'];
          if (binDir && binDir.type === 'dir' && binDir.children) {
            for (const cmd of ['claude', 'gemini', 'agy', 'coder', 'agent', 'asciiquarium', 'nyancat', 'bat', 'tty-clock', 'donut', 'fortune', 'boxes']) {
              if (!binDir.children[cmd]) {
                binDir.children[cmd] = {
                  name: cmd,
                  type: 'file',
                  mode: '-rwxr-xr-x',
                  owner: 'pogs',
                  group: 'admin',
                  size: 48,
                  mtime: Date.now(),
                  content: `#!/usr/bin/env zsh\n# Homebrew TTY/ANSI package ${cmd}\n`,
                };
              }
            }
          }
          return parsed;
        }
      }
    } catch {
      // Ignore corrupt storage and fall back to fresh FS
    }
    return createInitialTree();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.root));
    } catch {
      // Ignore quota errors
    }
    for (const fn of this.listeners) fn();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public reset(): void {
    this.root = createInitialTree();
    this.save();
  }

  public resolvePath(input: string, cwd = '/Users/pogs', home = '/Users/pogs'): string {
    let p = input.trim();
    if (!p || p === '~') return home;
    if (p.startsWith('~/')) {
      p = home + p.slice(1);
    }
    const base = p.startsWith('/') ? p : `${cwd === '/' ? '' : cwd}/${p}`;
    const parts = base.split('/').filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return '/' + stack.join('/');
  }

  public getNode(absPath: string): VfsNode | null {
    if (absPath === '/') return this.root;
    const parts = absPath.split('/').filter(Boolean);
    let curr: VfsNode = this.root;
    for (const part of parts) {
      if (curr.type !== 'dir' || !curr.children || !curr.children[part]) {
        return null;
      }
      curr = curr.children[part];
    }
    return curr;
  }

  private getParentAndName(absPath: string): { parent: VfsNode; name: string } | null {
    if (absPath === '/') return null;
    const parts = absPath.split('/').filter(Boolean);
    const name = parts.pop()!;
    const parentPath = '/' + parts.join('/');
    const parent = this.getNode(parentPath);
    if (!parent || parent.type !== 'dir') return null;
    return { parent, name };
  }

  public exists(absPath: string): boolean {
    return this.getNode(absPath) !== null;
  }

  public readdir(absPath: string): VfsNode[] | null {
    const node = this.getNode(absPath);
    if (!node || node.type !== 'dir' || !node.children) return null;
    return Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
  }

  public readFile(absPath: string): string | null {
    if (absPath === '/dev/null') return '';
    if (absPath === '/dev/zero') return '\0'.repeat(64);
    if (absPath === '/dev/urandom') {
      let s = '';
      for (let i = 0; i < 64; i++) s += String.fromCharCode(33 + Math.floor(Math.random() * 90));
      return s;
    }
    const node = this.getNode(absPath);
    if (!node || node.type !== 'file') return null;
    return node.content ?? '';
  }

  public writeFile(absPath: string, content: string, append = false, mode = '-rw-r--r--'): boolean {
    if (absPath === '/dev/null') return true;
    const info = this.getParentAndName(absPath);
    if (!info) return false;
    const existing = info.parent.children![info.name];
    if (existing && existing.type === 'dir') return false;
    const nextContent = append && existing ? (existing.content ?? '') + content : content;
    info.parent.children![info.name] = {
      name: info.name,
      type: 'file',
      mode: existing?.mode ?? mode,
      owner: existing?.owner ?? 'pogs',
      group: existing?.group ?? 'staff',
      size: nextContent.length,
      mtime: Date.now(),
      content: nextContent,
    };
    info.parent.mtime = Date.now();
    this.save();
    return true;
  }

  public touch(absPath: string): boolean {
    const existing = this.getNode(absPath);
    if (existing) {
      existing.mtime = Date.now();
      this.save();
      return true;
    }
    return this.writeFile(absPath, '');
  }

  public mkdir(absPath: string, recursive = false): boolean {
    if (this.exists(absPath)) return false;
    const parts = absPath.split('/').filter(Boolean);
    if (recursive) {
      let curr = this.root;
      for (const part of parts) {
        if (!curr.children) return false;
        if (!curr.children[part]) {
          curr.children[part] = makeDir(part);
        } else if (curr.children[part].type !== 'dir') {
          return false;
        }
        curr = curr.children[part];
      }
      this.save();
      return true;
    }
    const info = this.getParentAndName(absPath);
    if (!info || !info.parent.children) return false;
    info.parent.children[info.name] = makeDir(info.name);
    info.parent.mtime = Date.now();
    this.save();
    return true;
  }

  public rm(absPath: string, recursive = false): { ok: boolean; error?: string } {
    if (absPath === '/') return { ok: false, error: 'rm: it is dangerous to operate recursively on /' };
    const node = this.getNode(absPath);
    if (!node) return { ok: false, error: `rm: ${absPath}: No such file or directory` };
    if (node.type === 'dir') {
      const hasChildren = node.children && Object.keys(node.children).length > 0;
      if (hasChildren && !recursive) {
        return { ok: false, error: `rm: ${absPath}: is a directory` };
      }
      if (!recursive) {
        return { ok: false, error: `rm: ${absPath}: is a directory` };
      }
    }
    const info = this.getParentAndName(absPath);
    if (!info || !info.parent.children) return { ok: false, error: 'Invalid path' };
    delete info.parent.children[info.name];
    info.parent.mtime = Date.now();
    this.save();
    return { ok: true };
  }

  public cp(srcPath: string, dstPath: string, recursive = false): { ok: boolean; error?: string } {
    const src = this.getNode(srcPath);
    if (!src) return { ok: false, error: `cp: ${srcPath}: No such file or directory` };
    if (src.type === 'dir' && !recursive) {
      return { ok: false, error: `cp: ${srcPath} is a directory (not copied).` };
    }
    let finalDst = dstPath;
    const dstNode = this.getNode(dstPath);
    if (dstNode && dstNode.type === 'dir') {
      finalDst = `${dstPath === '/' ? '' : dstPath}/${src.name}`;
    }
    const info = this.getParentAndName(finalDst);
    if (!info || !info.parent.children) {
      return { ok: false, error: `cp: ${finalDst}: No such file or directory` };
    }
    const clone = JSON.parse(JSON.stringify(src)) as VfsNode;
    clone.name = info.name;
    clone.mtime = Date.now();
    info.parent.children[info.name] = clone;
    this.save();
    return { ok: true };
  }

  public mv(srcPath: string, dstPath: string): { ok: boolean; error?: string } {
    const cpRes = this.cp(srcPath, dstPath, true);
    if (!cpRes.ok) return cpRes;
    const rmRes = this.rm(srcPath, true);
    return rmRes;
  }

  public chmod(absPath: string, modeStr: string): boolean {
    const node = this.getNode(absPath);
    if (!node) return false;
    if (modeStr === '+x') {
      const chars = node.mode.split('');
      chars[3] = 'x';
      chars[6] = 'x';
      chars[9] = 'x';
      node.mode = chars.join('');
    } else if (/^[0-7]{3}$/.test(modeStr)) {
      const map: Record<string, string> = {
        '0': '---', '1': '--x', '2': '-w-', '3': '-wx',
        '4': 'r--', '5': 'r-x', '6': 'rw-', '7': 'rwx',
      };
      const prefix = node.type === 'dir' ? 'd' : '-';
      node.mode = prefix + map[modeStr[0]] + map[modeStr[1]] + map[modeStr[2]];
    }
    this.save();
    return true;
  }

  public registerTtyDevice(ttyName: string): void {
    const dev = this.getNode('/dev');
    if (dev && dev.type === 'dir' && dev.children && !dev.children[ttyName]) {
      dev.children[ttyName] = {
        name: ttyName,
        type: 'dev',
        mode: 'crw--w----',
        owner: 'pogs',
        group: 'tty',
        size: 0,
        mtime: Date.now(),
      };
    }
  }

  public removeTtyDevice(ttyName: string): void {
    const dev = this.getNode('/dev');
    if (dev && dev.type === 'dir' && dev.children && dev.children[ttyName]) {
      delete dev.children[ttyName];
    }
  }

  public registerBinary(name: string, description: string): void {
    this.writeFile(`/usr/local/bin/${name}`, `#!/usr/bin/env zsh\n# ${description}\n`, false, '-rwxr-xr-x');
  }

  public removeBinary(name: string): void {
    this.rm(`/usr/local/bin/${name}`, false);
  }

  public importHomeSnapshot(snapshot: unknown): { files: number; dirs: number } {
    if (!snapshot || typeof snapshot !== 'object') return { files: 0, dirs: 0 };
    const root = snapshot as { children?: unknown[] };
    const home = this.getNode('/Users/pogs');
    if (!home || home.type !== 'dir' || !home.children || !Array.isArray(root.children)) {
      return { files: 0, dirs: 0 };
    }

    let files = 0;
    let dirs = 0;
    const merge = (parent: VfsNode, entries: unknown[], depth: number) => {
      if (depth > 12) return;
      for (const raw of entries) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as { name?: unknown; type?: unknown; content?: unknown; children?: unknown };
        if (typeof entry.name !== 'string' || !entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/')) continue;
        if (!parent.children) parent.children = {};
        if (entry.type === 'dir' && Array.isArray(entry.children)) {
          let node = parent.children[entry.name];
          if (!node || node.type !== 'dir') {
            node = makeDir(entry.name);
            parent.children[entry.name] = node;
          }
          dirs++;
          merge(node, entry.children, depth + 1);
        } else if (entry.type === 'file' && typeof entry.content === 'string') {
          parent.children[entry.name] = makeFile(entry.name, entry.content);
          files++;
        }
      }
    };

    merge(home, root.children, 0);
    home.mtime = Date.now();
    this.save();
    return { files, dirs };
  }

  public getStats(): { files: number; dirs: number; bytes: number } {
    let files = 0;
    let dirs = 0;
    let bytes = 0;
    const walk = (n: VfsNode) => {
      if (n.type === 'dir') {
        dirs++;
        if (n.children) {
          for (const child of Object.values(n.children)) walk(child);
        }
      } else {
        files++;
        bytes += n.size || 0;
      }
    };
    walk(this.root);
    return { files, dirs, bytes };
  }
}

export const vfs = new VirtualFileSystem();
