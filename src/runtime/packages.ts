import { vfs } from './vfs';

export interface PackageInfo {
  name: string;
  version: string;
  category: 'ai' | 'tty' | 'ansi' | 'tui' | 'core' | 'dev';
  description: string;
  binaries: string[];
  sizeKb: number;
  installed: boolean;
  preinstalled?: boolean;
  demoCmd: string;
}

const STORAGE_KEY = 'macos_terminal_pkgs_v3';

const DEFAULT_PACKAGES: PackageInfo[] = [
  {
    name: 'zsh',
    version: '5.9',
    category: 'core',
    description: 'Z shell with interactive line editing, pipelines, history search, and tab completion.',
    binaries: ['zsh', 'sh'],
    sizeKb: 1420,
    installed: true,
    preinstalled: true,
    demoCmd: 'echo $SHELL && history | tail -n 5',
  },
  {
    name: 'coreutils',
    version: '9.5',
    category: 'core',
    description: 'GNU/BSD POSIX file, text, and stream utilities (ls, grep, sed, awk, find, xxd, jq).',
    binaries: ['ls', 'cat', 'grep', 'find', 'sed', 'awk', 'sort', 'uniq', 'wc', 'head', 'tail', 'xxd', 'base64', 'shasum'],
    sizeKb: 3840,
    installed: true,
    preinstalled: true,
    demoCmd: 'ls -la ~/Projects/tty-lab',
  },
  {
    name: 'ncurses',
    version: '6.5',
    category: 'tty',
    description: 'Terminal screen-handling library, terminfo database, tput, tty, and stty line discipline.',
    binaries: ['tput', 'tty', 'stty', 'clear', 'reset'],
    sizeKb: 1180,
    installed: true,
    preinstalled: true,
    demoCmd: 'tty && stty -a && tput colors',
  },
  {
    name: 'ansi-tools',
    version: '2.4.1',
    category: 'ansi',
    description: '16-color, 256-color, and 24-bit RGB truecolor ANSI diagnostic and sparkline utilities.',
    binaries: ['colortest', 'truecolor', '256colors', 'ansi-art', 'spark'],
    sizeKb: 420,
    installed: true,
    preinstalled: true,
    demoCmd: 'colortest && truecolor',
  },
  {
    name: 'neofetch',
    version: '7.1.0',
    category: 'ansi',
    description: 'Fast, customizable macOS Darwin ANSI system information display.',
    binaries: ['neofetch', 'fastfetch'],
    sizeKb: 310,
    installed: true,
    preinstalled: true,
    demoCmd: 'neofetch',
  },
  {
    name: 'htop',
    version: '3.3.0',
    category: 'tui',
    description: 'Interactive alternate-screen TTY process viewer and signal controller.',
    binaries: ['htop', 'top'],
    sizeKb: 680,
    installed: true,
    preinstalled: true,
    demoCmd: 'htop',
  },
  {
    name: 'nano',
    version: '8.1',
    category: 'tui',
    description: 'Friendly full-screen TTY text editor with live VFS persistence.',
    binaries: ['nano'],
    sizeKb: 540,
    installed: true,
    preinstalled: true,
    demoCmd: 'nano ~/Projects/tty-lab/README.md',
  },
  {
    name: 'vim',
    version: '9.1',
    category: 'tui',
    description: 'Classic modal terminal editor supporting Normal, Insert, and Ex command modes.',
    binaries: ['vi', 'vim'],
    sizeKb: 2200,
    installed: true,
    preinstalled: true,
    demoCmd: 'vi ~/Documents/notes.txt',
  },
  {
    name: 'ranger',
    version: '1.9.3',
    category: 'tui',
    description: 'Dual-pane terminal file manager with live file preview and keyboard navigation.',
    binaries: ['ranger'],
    sizeKb: 790,
    installed: true,
    preinstalled: true,
    demoCmd: 'ranger',
  },
  {
    name: 'figlet',
    version: '2.2.5',
    category: 'ansi',
    description: 'Render large ASCII & ANSI block banners in standard, slant, and mini fonts.',
    binaries: ['figlet', 'toilet'],
    sizeKb: 390,
    installed: true,
    preinstalled: true,
    demoCmd: 'figlet "macOS TTY" | lolcat',
  },
  {
    name: 'lolcat',
    version: '100.0.1',
    category: 'ansi',
    description: '24-bit RGB rainbow ANSI gradient filter for text and piped terminal streams.',
    binaries: ['lolcat'],
    sizeKb: 180,
    installed: true,
    preinstalled: true,
    demoCmd: 'cowsay "Full ANSI 24-bit RGB" | lolcat',
  },
  {
    name: 'cowsay',
    version: '3.04',
    category: 'ansi',
    description: 'Configurable ASCII art speaking cow, tux, and Mac buddy generator.',
    binaries: ['cowsay'],
    sizeKb: 140,
    installed: true,
    preinstalled: true,
    demoCmd: 'cowsay "Welcome to macOS Terminal"',
  },
  {
    name: 'tree',
    version: '2.1.3',
    category: 'tty',
    description: 'Recursive directory listing with ANSI color coding and box-drawing glyphs.',
    binaries: ['tree'],
    sizeKb: 165,
    installed: true,
    preinstalled: true,
    demoCmd: 'tree ~',
  },
  {
    name: 'cmatrix',
    version: '2.0',
    category: 'tui',
    description: 'Animated alternate-screen ANSI cascading digital rain.',
    binaries: ['cmatrix'],
    sizeKb: 210,
    installed: true,
    preinstalled: true,
    demoCmd: 'cmatrix',
  },
  {
    name: 'pipes',
    version: '1.3.0',
    category: 'tui',
    description: 'Animated ANSI Unicode box-drawing pipes terminal screensaver.',
    binaries: ['pipes'],
    sizeKb: 120,
    installed: true,
    preinstalled: true,
    demoCmd: 'pipes',
  },
  {
    name: 'sl',
    version: '5.05',
    category: 'ansi',
    description: 'Steam locomotive ANSI animation when you mistype ls.',
    binaries: ['sl'],
    sizeKb: 110,
    installed: true,
    preinstalled: true,
    demoCmd: 'sl',
  },
  {
    name: 'jq',
    version: '1.7.1',
    category: 'dev',
    description: 'Command-line JSON processor with ANSI syntax highlighting.',
    binaries: ['jq'],
    sizeKb: 860,
    installed: true,
    preinstalled: true,
    demoCmd: 'cat ~/Projects/tty-lab/config.json | jq .',
  },
  {
    name: 'git',
    version: '2.46.0',
    category: 'dev',
    description: 'Local VFS distributed version control system (init, status, add, commit, log).',
    binaries: ['git'],
    sizeKb: 4120,
    installed: true,
    preinstalled: true,
    demoCmd: 'git --version',
  },
  {
    name: 'node',
    version: '22.9.0',
    category: 'dev',
    description: 'Local JavaScript runtime & REPL bridged to VFS fs and TTY stdout.',
    binaries: ['node'],
    sizeKb: 6400,
    installed: true,
    preinstalled: true,
    demoCmd: 'node ~/Projects/tty-lab/hello.js',
  },
  {
    name: 'python3',
    version: '3.12.6',
    category: 'dev',
    description: 'Local Python interpreter & interactive REPL.',
    binaries: ['python3', 'python'],
    sizeKb: 5800,
    installed: true,
    preinstalled: true,
    demoCmd: 'python3 ~/Projects/tty-lab/fibonacci.py',
  },
  {
    name: 'claude-code',
    version: '2.1.0',
    category: 'ai',
    description: 'Claude Code CLI coding agent with @file context, unified diffs, /init, and tool approvals.',
    binaries: ['claude'],
    sizeKb: 1480,
    installed: true,
    preinstalled: true,
    demoCmd: 'claude',
  },
  {
    name: 'gemini-cli',
    version: '2.1.0',
    category: 'ai',
    description: 'Gemini CLI autonomous coding agent powered by gemini-4-hydrogen with workspace tools.',
    binaries: ['gemini'],
    sizeKb: 1420,
    installed: true,
    preinstalled: true,
    demoCmd: 'gemini',
  },
  {
    name: 'antigravity',
    version: '2.1.0',
    category: 'ai',
    description: 'Antigravity (agy) workspace coding CLI agent with multi-turn memory and shell execution.',
    binaries: ['agy'],
    sizeKb: 1390,
    installed: true,
    preinstalled: true,
    demoCmd: 'agy',
  },
  {
    name: 'code-agent',
    version: '2.1.0',
    category: 'ai',
    description: 'Unified agentic coding CLI aliases (coder / agent) for file tools and shell automation.',
    binaries: ['coder', 'agent'],
    sizeKb: 1620,
    installed: true,
    preinstalled: true,
    demoCmd: 'coder',
  },
  // Pre-downloaded extra TTY & ANSI stack (also manageable via `brew`)
  {
    name: 'asciiquarium',
    version: '1.1',
    category: 'tui',
    description: 'Animated ANSI underwater aquarium with swimming fish, seaweed, and bubbles.',
    binaries: ['asciiquarium'],
    sizeKb: 245,
    installed: true,
    preinstalled: true,
    demoCmd: 'asciiquarium',
  },
  {
    name: 'nyancat',
    version: '1.5.2',
    category: 'tui',
    description: '256-color ANSI animated Nyan Cat flying across a starry terminal.',
    binaries: ['nyancat'],
    sizeKb: 195,
    installed: true,
    preinstalled: true,
    demoCmd: 'nyancat',
  },
  {
    name: 'bat',
    version: '0.24.0',
    category: 'ansi',
    description: 'A cat(1) clone with ANSI syntax highlighting, line numbers, and frame borders.',
    binaries: ['bat'],
    sizeKb: 1450,
    installed: true,
    preinstalled: true,
    demoCmd: 'bat ~/Projects/tty-lab/hello.js',
  },
  {
    name: 'tty-clock',
    version: '2.3',
    category: 'tui',
    description: 'Full-screen centered 7-segment ANSI digital clock for TTY sessions.',
    binaries: ['tty-clock'],
    sizeKb: 160,
    installed: true,
    preinstalled: true,
    demoCmd: 'tty-clock',
  },
  {
    name: 'donut',
    version: '1.0.4',
    category: 'tui',
    description: 'Real-time rotating 3D ASCII/ANSI shaded torus renderer.',
    binaries: ['donut'],
    sizeKb: 98,
    installed: true,
    preinstalled: true,
    demoCmd: 'donut',
  },
  {
    name: 'fortune',
    version: '3.22.0',
    category: 'ansi',
    description: 'Print a random Unix, systems engineering, or terminal epigram.',
    binaries: ['fortune'],
    sizeKb: 280,
    installed: true,
    preinstalled: true,
    demoCmd: 'fortune | cowsay | lolcat',
  },
  {
    name: 'boxes',
    version: '2.2.1',
    category: 'ansi',
    description: 'Draws Unicode & ASCII art borders around text or piped output.',
    binaries: ['boxes'],
    sizeKb: 220,
    installed: true,
    preinstalled: true,
    demoCmd: 'echo "macOS TTY Runtime" | boxes',
  },
];

class PackageRegistry {
  private packages: Map<string, PackageInfo>;
  private listeners = new Set<() => void>();

  constructor() {
    this.packages = this.load();
  }

  private load(): Map<string, PackageInfo> {
    const map = new Map<string, PackageInfo>();
    for (const p of DEFAULT_PACKAGES) {
      map.set(p.name, { ...p });
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const installedNames = JSON.parse(raw) as string[];
        for (const pkg of map.values()) {
          if (!['zsh', 'coreutils', 'ncurses'].includes(pkg.name)) {
            pkg.installed = installedNames.includes(pkg.name);
          }
        }
      }
    } catch {
      // ignore
    }
    return map;
  }

  private save(): void {
    try {
      const installed = Array.from(this.packages.values())
        .filter((p) => p.installed)
        .map((p) => p.name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(installed));
    } catch {
      // ignore
    }
    for (const fn of this.listeners) fn();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public list(): PackageInfo[] {
    return Array.from(this.packages.values());
  }

  public listInstalled(): PackageInfo[] {
    return this.list().filter((p) => p.installed);
  }

  public get(name: string): PackageInfo | undefined {
    return this.packages.get(name);
  }

  public isBinaryAvailable(binName: string): boolean {
    for (const pkg of this.packages.values()) {
      if (pkg.installed && pkg.binaries.includes(binName)) {
        return true;
      }
    }
    return false;
  }

  public findOwnerPackage(binName: string): PackageInfo | undefined {
    for (const pkg of this.packages.values()) {
      if (pkg.binaries.includes(binName)) return pkg;
    }
    return undefined;
  }

  public install(name: string): { ok: boolean; pkg?: PackageInfo; error?: string } {
    const pkg = this.packages.get(name);
    if (!pkg) return { ok: false, error: `Error: No available formula with the name "${name}".` };
    if (pkg.installed) return { ok: true, pkg };
    pkg.installed = true;
    for (const bin of pkg.binaries) {
      vfs.registerBinary(bin, `${pkg.name} ${pkg.version}`);
    }
    this.save();
    return { ok: true, pkg };
  }

  public uninstall(name: string): { ok: boolean; error?: string } {
    const pkg = this.packages.get(name);
    if (!pkg) return { ok: false, error: `Error: No such keg: /usr/local/Cellar/${name}` };
    if (pkg.preinstalled && ['zsh', 'coreutils', 'ncurses'].includes(pkg.name)) {
      return { ok: false, error: `Error: Refusing to uninstall critical system formula '${pkg.name}'.` };
    }
    pkg.installed = false;
    for (const bin of pkg.binaries) {
      vfs.removeBinary(bin);
    }
    this.save();
    return { ok: true };
  }

  public installAll(): PackageInfo[] {
    const newlyInstalled: PackageInfo[] = [];
    for (const pkg of this.packages.values()) {
      if (!pkg.installed) {
        pkg.installed = true;
        for (const bin of pkg.binaries) {
          vfs.registerBinary(bin, `${pkg.name} ${pkg.version}`);
        }
        newlyInstalled.push(pkg);
      }
    }
    this.save();
    return newlyInstalled;
  }

  public reset(): void {
    for (const pkg of this.packages.values()) {
      pkg.installed = !!pkg.preinstalled;
      for (const bin of pkg.binaries) {
        if (pkg.installed) vfs.registerBinary(bin, `${pkg.name} ${pkg.version}`);
        else vfs.removeBinary(bin);
      }
    }
    this.save();
  }
}

export const packageRegistry = new PackageRegistry();
