import { ANSI } from '../tty';
import type { CommandContext, CommandHandler } from '../types';
import { packageRegistry } from '../packages';
import { processManager } from '../process';
import { vfs } from '../vfs';
import { cloneRepository } from '../repoRunner';

function runRepl(
  ctx: CommandContext,
  opts: {
    banner: string;
    prompt: string;
    evaluate: (code: string) => void;
  },
): Promise<number> {
  return new Promise((resolve) => {
    let buffer = '';
    ctx.tty.setRawMode(true);
    ctx.tty.writeln(opts.banner);
    ctx.tty.write(opts.prompt);

    let unsub: (() => void) | null = null;
    const finish = (code = 0) => {
      unsub?.();
      ctx.tty.setRawMode(false);
      resolve(code);
    };

    unsub = ctx.tty.onData((data) => {
      if (data === '\x03') {
        ctx.tty.write('^C\r\n');
        finish(130);
        return;
      }
      if (data === '\x04' && buffer.length === 0) {
        ctx.tty.writeln('');
        finish(0);
        return;
      }
      if (data === '\r' || data === '\n') {
        ctx.tty.writeln('');
        const line = buffer.trim();
        buffer = '';
        if (line === '.exit' || line === 'exit()' || line === 'quit()') {
          finish(0);
          return;
        }
        if (line) {
          opts.evaluate(line);
        }
        ctx.tty.write(opts.prompt);
        return;
      }
      if (data === '\x7f' || data === '\b') {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          ctx.tty.write('\b \b');
        }
        return;
      }
      if (data.length === 1 && data >= ' ') {
        buffer += data;
        ctx.tty.write(data);
      }
    });

    ctx.signal.addEventListener('abort', () => finish(130), { once: true });
  });
}

export const devToolsCommands: Record<string, CommandHandler> = {
  ps: ({ args, writeStdout }) => {
    const procs = processManager.list();
    const full = args.includes('aux') || args.includes('-ef') || args.includes('-a');
    if (full) {
      writeStdout(`${ANSI.bold}USER       PID  PPID TTY      STAT  %CPU  %MEM  COMMAND${ANSI.reset}\n`);
      for (const p of procs) {
        writeStdout(
          `${p.user.padEnd(9)} ${String(p.pid).padStart(4)}  ${String(p.ppid).padStart(4)} ${p.tty.padEnd(8)} ${p.state.padEnd(5)} ${p.cpu.toFixed(1).padStart(4)}  ${p.mem.toFixed(1).padStart(4)}  ${p.command}\n`,
        );
      }
    } else {
      writeStdout(`${ANSI.bold}  PID TTY       TIME     CMD${ANSI.reset}\n`);
      for (const p of procs) {
        const secs = Math.floor((Date.now() - p.startedAt) / 1000);
        const mm = String(Math.floor(secs / 60)).padStart(2, '0');
        const ss = String(secs % 60).padStart(2, '0');
        writeStdout(`${String(p.pid).padStart(5)} ${p.tty.padEnd(9)} 00:${mm}:${ss} ${p.command}\n`);
      }
    }
    return 0;
  },

  kill: ({ args, writeStderr }) => {
    let sig = 'TERM';
    const pids: string[] = [];
    for (const a of args) {
      if (a.startsWith('-')) sig = a.slice(1);
      else pids.push(a);
    }
    if (pids.length === 0) {
      writeStderr('usage: kill [-s sigspec] pid ...\n');
      return 1;
    }
    let code = 0;
    for (const pStr of pids) {
      const pid = parseInt(pStr, 10);
      if (Number.isNaN(pid) || !processManager.kill(pid, sig)) {
        writeStderr(`kill: (${pStr}) - No such process or operation not permitted\n`);
        code = 1;
      }
    }
    return code;
  },

  brew: async ({ args, signal, writeStdout, writeStderr }) => {
    const sub = args[0] ?? 'help';
    const all = packageRegistry.list();

    if (sub === 'list' || sub === 'ls') {
      const installed = all.filter((p) => p.installed);
      writeStdout(`${ANSI.bold}==> Formulae (${installed.length} installed)${ANSI.reset}\n`);
      for (const p of installed) {
        writeStdout(`${ANSI.green}${p.name.padEnd(15)}${ANSI.reset} ${ANSI.dim}${p.version.padEnd(9)}${ANSI.reset} [${p.category}]  ${p.description}\n`);
      }
      return 0;
    }

    if (sub === 'search' || sub === 'avail' || sub === 'available') {
      const q = (args[1] ?? '').toLowerCase();
      const matches = all.filter((p) => !q || p.name.includes(q) || p.description.toLowerCase().includes(q));
      writeStdout(`${ANSI.bold}==> Formulae${ANSI.reset}\n`);
      for (const p of matches) {
        const badge = p.installed ? `${ANSI.green}✔ installed${ANSI.reset}` : `${ANSI.cyan}available${ANSI.reset}`;
        writeStdout(`  ${p.name.padEnd(15)} ${p.version.padEnd(9)} ${badge}  ${ANSI.dim}${p.description}${ANSI.reset}\n`);
      }
      return 0;
    }

    if (sub === 'info') {
      const name = args[1];
      const pkg = name ? packageRegistry.get(name) : undefined;
      if (!pkg) {
        writeStderr(`Error: No available formula with the name "${name ?? ''}".\n`);
        return 1;
      }
      writeStdout(`${ANSI.bold}==> ${pkg.name}: stable ${pkg.version}${ANSI.reset}\n`);
      writeStdout(`${pkg.description}\n`);
      writeStdout(`Status: ${pkg.installed ? `${ANSI.green}Installed${ANSI.reset}` : `${ANSI.yellow}Not installed${ANSI.reset}`}\n`);
      writeStdout(`Binaries: ${pkg.binaries.join(', ')}\n`);
      writeStdout(`Try: ${ANSI.cyan}${pkg.demoCmd}${ANSI.reset}\n`);
      return 0;
    }

    if (sub === 'bundle' || sub === 'stack' || (sub === 'install' && args.includes('--all'))) {
      const added = packageRegistry.installAll();
      if (added.length === 0) {
        writeStdout(`${ANSI.green}✔ Full pre-downloaded Homebrew stack active${ANSI.reset} (${all.length}/${all.length} formulae linked in /usr/local/bin).\n`);
      } else {
        for (const pkg of added) {
          writeStdout(`🍺  /usr/local/Cellar/${pkg.name}/${pkg.version}: linked (${pkg.binaries.join(', ')})\n`);
        }
        writeStdout(`${ANSI.green}✔ Synced ${added.length} formulae.${ANSI.reset} (${all.length}/${all.length} active)\n`);
      }
      return 0;
    }

    if (sub === 'install' || sub === 'add') {
      const targets = args.slice(1).filter((a) => !a.startsWith('-'));
      if (targets.length === 0) {
        writeStderr('Error: Specify a formula name, e.g.: brew install asciiquarium\n');
        return 1;
      }
      for (const name of targets) {
        const pkg = packageRegistry.get(name);
        if (!pkg) {
          writeStderr(`Error: No available formula with the name "${name}". Run 'brew search' to list formulae.\n`);
          return 1;
        }
        if (pkg.installed) {
          writeStdout(`${ANSI.yellow}Warning:${ANSI.reset} ${pkg.name} ${pkg.version} is already installed and up-to-date.\n`);
          continue;
        }
        writeStdout(`${ANSI.bold}${ANSI.blue}==>${ANSI.reset} ${ANSI.bold}Fetching ${pkg.name} (${pkg.version})${ANSI.reset}\n`);
        await new Promise((r) => setTimeout(r, 180));
        if (signal.aborted) return 130;
        writeStdout(`${ANSI.bold}${ANSI.blue}==>${ANSI.reset} ${ANSI.bold}Pouring ${pkg.name}--${pkg.version}.arm64_sequoia.bottle.tar.gz${ANSI.reset}\n`);
        await new Promise((r) => setTimeout(r, 220));
        if (signal.aborted) return 130;
        packageRegistry.install(name);
        writeStdout(`🍺  /usr/local/Cellar/${pkg.name}/${pkg.version}: ${pkg.binaries.length} binaries linked (${pkg.sizeKb} KB)\n`);
        writeStdout(`    Run ${ANSI.cyan}${pkg.demoCmd}${ANSI.reset} to launch.\n`);
      }
      return 0;
    }

    if (sub === 'uninstall' || sub === 'remove' || sub === 'rm') {
      const name = args[1];
      if (!name) {
        writeStderr('Error: Specify a formula to uninstall.\n');
        return 1;
      }
      const res = packageRegistry.uninstall(name);
      if (!res.ok) {
        writeStderr((res.error ?? 'Error uninstalling') + '\n');
        return 1;
      }
      writeStdout(`Uninstalling /usr/local/Cellar/${name}... done.\n`);
      return 0;
    }

    if (sub === 'update') {
      writeStdout(`${ANSI.bold}==> Updating Homebrew...${ANSI.reset}\n`);
      await new Promise((r) => setTimeout(r, 200));
      writeStdout(`Already up-to-date. (${all.length} formulae indexed locally)\n`);
      return 0;
    }

    if (sub === 'doctor') {
      writeStdout(`${ANSI.green}Your system is ready to brew.${ANSI.reset} (${all.filter((p) => p.installed).length}/${all.length} formulae active)\n`);
      return 0;
    }

    writeStdout(`${ANSI.bold}Homebrew Local TTY Package Manager${ANSI.reset}\n`);
    writeStdout(`  brew list             List installed TTY & ANSI packages\n`);
    writeStdout(`  brew stack            Ensure full pre-downloaded stack (${all.length} formulae) is linked\n`);
    writeStdout(`  brew search [query]   Browse formulae (asciiquarium, nyancat, bat, donut, claude, ...)\n`);
    writeStdout(`  brew install <pkg>    Install formula into /usr/local/bin (--all for full stack)\n`);
    writeStdout(`  brew uninstall <pkg>  Remove formula\n`);
    writeStdout(`  brew info <pkg>       Show package details and demo command\n`);
    writeStdout(`  brew doctor           Verify local TTY runtime health\n`);
    return 0;
  },

  pkg: (ctx) => devToolsCommands.brew(ctx),

  node: async (ctx) => {
    const home = ctx.shell.env.HOME ?? '/Users/pogs';
    const evalIdx = ctx.args.indexOf('-e');

    const runJs = (code: string) => {
      const logs: string[] = [];
      const mockConsole = {
        log: (...items: unknown[]) => logs.push(items.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
        error: (...items: unknown[]) => logs.push(items.map(String).join(' ')),
        warn: (...items: unknown[]) => logs.push(items.map(String).join(' ')),
      };
      const mockProcess = {
        platform: 'darwin',
        arch: 'arm64',
        version: 'v22.9.0',
        env: { ...ctx.shell.env, TTY: ctx.tty.path },
        cwd: () => ctx.shell.cwd,
        stdout: { columns: ctx.tty.cols, rows: ctx.tty.rows, write: (s: string) => ctx.writeStdout(s) },
      };
      const mockFs = {
        readFileSync: (p: string) => vfs.readFile(vfs.resolvePath(p, ctx.shell.cwd, home)),
        writeFileSync: (p: string, data: string) => vfs.writeFile(vfs.resolvePath(p, ctx.shell.cwd, home), data),
        readdirSync: (p: string) => (vfs.readdir(vfs.resolvePath(p, ctx.shell.cwd, home)) ?? []).map((n) => n.name),
      };
      try {
        const fn = new Function('console', 'process', 'fs', code);
        const result = fn(mockConsole, mockProcess, mockFs);
        for (const l of logs) ctx.writeStdout(l + '\n');
        return result;
      } catch (e) {
        ctx.writeStderr(`${ANSI.red}Uncaught ${(e as Error).name}: ${(e as Error).message}${ANSI.reset}\n`);
        return undefined;
      }
    };

    if (evalIdx !== -1 && ctx.args[evalIdx + 1]) {
      runJs(ctx.args[evalIdx + 1]);
      return 0;
    }

    if (ctx.args.includes('-v') || ctx.args.includes('--version')) {
      ctx.writeStdout('v22.9.0\n');
      return 0;
    }

    const fileArg = ctx.args.find((a) => !a.startsWith('-'));
    if (fileArg) {
      const abs = vfs.resolvePath(fileArg, ctx.shell.cwd, home);
      const code = vfs.readFile(abs);
      if (code === null) {
        ctx.writeStderr(`Error: Cannot find module '${abs}'\n`);
        return 1;
      }
      runJs(code);
      return 0;
    }

    return runRepl(ctx, {
      banner: `Welcome to Node.js v22.9.0 (darwin arm64 local runtime).\nType ".exit" or Ctrl+D to exit.`,
      prompt: '> ',
      evaluate: (line) => {
        const res = runJs(line);
        if (res !== undefined) ctx.tty.writeln(String(res));
      },
    });
  },

  python3: async (ctx) => {
    const home = ctx.shell.env.HOME ?? '/Users/pogs';
    if (ctx.args.includes('--version') || ctx.args.includes('-V')) {
      ctx.writeStdout('Python 3.12.6\n');
      return 0;
    }

    const envVars: Record<string, unknown> = {
      range: (start: number, stop?: number, step = 1) => {
        const s = stop === undefined ? 0 : start;
        const e = stop === undefined ? start : stop;
        const out: number[] = [];
        if (step > 0) for (let n = s; n < e; n += step) out.push(n);
        else if (step < 0) for (let n = s; n > e; n += step) out.push(n);
        return out;
      },
      sum: (arr: Iterable<number>, start = 0) => {
        let total = start;
        for (const v of arr) total += Number(v);
        return total;
      },
      len: (x: { length?: number; size?: number }) => x?.length ?? x?.size ?? Object.keys(x ?? {}).length,
      min: (...args: unknown[]) => Math.min(...(Array.isArray(args[0]) ? (args[0] as number[]) : (args as number[]))),
      max: (...args: unknown[]) => Math.max(...(Array.isArray(args[0]) ? (args[0] as number[]) : (args as number[]))),
      abs: Math.abs,
      round: (n: number, d = 0) => Number(n.toFixed(d)),
      str: String,
      int: (v: unknown) => parseInt(String(v), 10),
      float: (v: unknown) => parseFloat(String(v)),
      bool: Boolean,
      list: (v: Iterable<unknown>) => Array.from(v),
      sorted: (v: Iterable<unknown>) => Array.from(v).sort(),
      enumerate: (v: Iterable<unknown>, start = 0) => Array.from(v).map((item, idx) => [idx + start, item]),
      zip: (...arrs: unknown[][]) => {
        const minLen = Math.min(...arrs.map((a) => a.length));
        return Array.from({ length: minLen }, (_, i) => arrs.map((a) => a[i]));
      },
    };

    const evalPyLine = (rawLine: string): boolean => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return true;

      // print(...)
      const printMatch = line.match(/^print\((.*)\)$/);
      if (printMatch) {
        let inner = printMatch[1].trim();
        // f-string basic support: f"F({i}) = {a}"
        const fMatch = inner.match(/^f["'](.*)["']$/);
        if (fMatch) {
          const text = fMatch[1].replace(/\{([^}]+)\}/g, (_, expr) => {
            try {
              const keys = Object.keys(envVars);
              const vals = Object.values(envVars);
              return String(new Function(...keys, `return (${expr})`)(...vals));
            } catch {
              return `{${expr}}`;
            }
          });
          ctx.writeStdout(text + '\n');
          return true;
        }
        try {
          const keys = Object.keys(envVars);
          const vals = Object.values(envVars);
          const evaluated = new Function(...keys, `return (${inner})`)(...vals);
          ctx.writeStdout(String(evaluated) + '\n');
        } catch {
          ctx.writeStdout(inner.replace(/^["']|["']$/g, '') + '\n');
        }
        return true;
      }

      // Tuple / single assignment: a, b = b, a + b or x = 5
      const assignMatch = line.match(/^([A-Za-z_][A-Za-z0-9_,\s]*)\s*=\s*(.+)$/);
      if (assignMatch && !line.includes('==')) {
        const lhs = assignMatch[1].split(',').map((s) => s.trim());
        const rhs = assignMatch[2].split(',').map((s) => s.trim());
        try {
          const keys = Object.keys(envVars);
          const vals = Object.values(envVars);
          const evaluated = rhs.map((r) => new Function(...keys, `return (${r})`)(...vals));
          lhs.forEach((name, idx) => {
            envVars[name] = evaluated[idx];
          });
          return true;
        } catch (e) {
          ctx.writeStderr(`NameError/SyntaxError: ${(e as Error).message}\n`);
          return false;
        }
      }

      try {
        const keys = Object.keys(envVars);
        const vals = Object.values(envVars);
        const val = new Function(...keys, `return (${line})`)(...vals);
        if (val !== undefined) ctx.writeStdout(String(val) + '\n');
        return true;
      } catch (e) {
        ctx.writeStderr(`SyntaxError: ${(e as Error).message}\n`);
        return false;
      }
    };

    const runPyScript = (script: string) => {
      const lines = script.split('\n');
      const funcs: Record<string, { params: string[]; body: string[] }> = {};
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          i++;
          continue;
        }
        const defMatch = trimmed.match(/^def\s+([A-Za-z_]\w*)\(([^)]*)\):$/);
        if (defMatch) {
          const fname = defMatch[1];
          const params = defMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
          const body: string[] = [];
          i++;
          while (i < lines.length && (lines[i].startsWith('    ') || lines[i].trim() === '')) {
            if (lines[i].trim()) body.push(lines[i].slice(4));
            i++;
          }
          funcs[fname] = { params, body };
          continue;
        }
        const callMatch = trimmed.match(/^([A-Za-z_]\w*)\(([^)]*)\)$/);
        if (callMatch && funcs[callMatch[1]]) {
          const fn = funcs[callMatch[1]];
          const argsVals = callMatch[2].split(',').map((a) => Number(a.trim()) || a.trim());
          fn.params.forEach((p, idx) => { envVars[p] = argsVals[idx]; });
          // Execute simple function body with for-range loop support
          let bi = 0;
          while (bi < fn.body.length) {
            const bl = fn.body[bi];
            const forMatch = bl.trim().match(/^for\s+(\w+)\s+in\s+range\(([^)]+)\):$/);
            if (forMatch) {
              const loopVar = forMatch[1];
              const boundExpr = forMatch[2];
              const count = Number(envVars[boundExpr] ?? boundExpr) || 0;
              const loopBody: string[] = [];
              bi++;
              while (bi < fn.body.length && fn.body[bi].startsWith('    ')) {
                loopBody.push(fn.body[bi].trim());
                bi++;
              }
              for (let k = 0; k < count; k++) {
                envVars[loopVar] = k;
                for (const lb of loopBody) evalPyLine(lb);
              }
              continue;
            }
            evalPyLine(bl);
            bi++;
          }
          i++;
          continue;
        }
        evalPyLine(trimmed);
        i++;
      }
    };

    const cIdx = ctx.args.indexOf('-c');
    if (cIdx !== -1 && ctx.args[cIdx + 1]) {
      runPyScript(ctx.args[cIdx + 1]);
      return 0;
    }

    const fileArg = ctx.args.find((a) => !a.startsWith('-'));
    if (fileArg) {
      const abs = vfs.resolvePath(fileArg, ctx.shell.cwd, home);
      const code = vfs.readFile(abs);
      if (code === null) {
        ctx.writeStderr(`python3: can't open file '${fileArg}': [Errno 2] No such file or directory\n`);
        return 2;
      }
      runPyScript(code);
      return 0;
    }

    return runRepl(ctx, {
      banner: `Python 3.12.6 (local Darwin runtime)\nType "exit()" or Ctrl+D to exit.`,
      prompt: '>>> ',
      evaluate: (line) => {
        evalPyLine(line);
      },
    });
  },

  python: (ctx) => devToolsCommands.python3(ctx),

  git: async ({ args, shell, writeStdout, writeStderr }) => {
    const sub = args[0];
    if (!sub || sub === '--version') {
      writeStdout('git version 2.46.0 (Apple Git-150)\n');
      return 0;
    }

    if (sub === 'clone') {
      const repoUrl = args[1];
      if (!repoUrl) {
        writeStderr('fatal: you must specify a repository to clone\n');
        return 128;
      }
      writeStdout(`Cloning into repository ${repoUrl}...\n`);
      const home = shell.env.HOME ?? '/Users/pogs';
      const res = await cloneRepository(repoUrl, shell.cwd, home);
      writeStdout(`${res.message}\n`);
      writeStdout(`Now try: cd ${res.path} && ls -la\n`);
      return 0;
    }

    const gitDir = `${shell.cwd === '/' ? '' : shell.cwd}/.git`;
    const logPath = `${gitDir}/COMMIT_LOG.json`;
    const stagePath = `${gitDir}/STAGE.json`;

    if (sub === 'init') {
      vfs.mkdir(gitDir, true);
      if (!vfs.exists(logPath)) vfs.writeFile(logPath, '[]');
      if (!vfs.exists(stagePath)) vfs.writeFile(stagePath, '[]');
      writeStdout(`Initialized empty Git repository in ${gitDir}/\n`);
      return 0;
    }

    if (!vfs.exists(gitDir)) {
      writeStderr('fatal: not a git repository (or any of the parent directories): .git\n');
      return 128;
    }

    if (sub === 'status') {
      const staged: string[] = JSON.parse(vfs.readFile(stagePath) ?? '[]');
      writeStdout(`On branch main\n`);
      if (staged.length > 0) {
        writeStdout(`Changes to be committed:\n`);
        for (const f of staged) writeStdout(`  ${ANSI.green}modified:   ${f}${ANSI.reset}\n`);
      } else {
        writeStdout(`nothing to commit, working tree clean\n`);
      }
      return 0;
    }

    if (sub === 'add') {
      const target = args[1] ?? '.';
      const entries = vfs.readdir(shell.cwd) ?? [];
      const staged = entries.filter((e) => e.name !== '.git' && (target === '.' || e.name === target)).map((e) => e.name);
      vfs.writeFile(stagePath, JSON.stringify(staged));
      return 0;
    }

    if (sub === 'commit') {
      const mIdx = args.indexOf('-m');
      const msg = mIdx !== -1 ? args[mIdx + 1] : 'Update files';
      const logs = JSON.parse(vfs.readFile(logPath) ?? '[]') as Array<{ hash: string; msg: string; date: string }>;
      const hash = Math.random().toString(16).slice(2, 9);
      logs.unshift({ hash, msg, date: new Date().toISOString() });
      vfs.writeFile(logPath, JSON.stringify(logs, null, 2));
      vfs.writeFile(stagePath, '[]');
      writeStdout(`[main ${hash}] ${msg}\n`);
      return 0;
    }

    if (sub === 'log') {
      const logs = JSON.parse(vfs.readFile(logPath) ?? '[]') as Array<{ hash: string; msg: string; date: string }>;
      if (logs.length === 0) {
        writeStderr('fatal: your current branch \'main\' does not have any commits yet\n');
        return 128;
      }
      for (const c of logs) {
        writeStdout(`${ANSI.yellow}commit ${c.hash}${ANSI.reset}\nAuthor: pogs <pogs@mac.local>\nDate:   ${c.date}\n\n    ${c.msg}\n\n`);
      }
      return 0;
    }

    if (sub === 'branch') {
      writeStdout(`* ${ANSI.green}main${ANSI.reset}\n`);
      return 0;
    }

    writeStderr(`git: '${sub}' is not a git command. See 'git --version'.\n`);
    return 1;
  },

  curl: async ({ args, signal, writeStdout, writeStderr }) => {
    const headOnly = args.includes('-I') || args.includes('--head');
    const url = args.find((a) => !a.startsWith('-'));
    if (!url) {
      writeStderr('curl: try \'curl https://httpbin.org/json\'\n');
      return 2;
    }
    const normalized = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    try {
      const res = await fetch(normalized, { method: headOnly ? 'HEAD' : 'GET', signal });
      if (headOnly) {
        writeStdout(`HTTP/2 ${res.status} ${res.statusText}\n`);
        res.headers.forEach((v, k) => writeStdout(`${ANSI.cyan}${k}:${ANSI.reset} ${v}\n`));
      } else {
        const body = await res.text();
        writeStdout(body + (body.endsWith('\n') ? '' : '\n'));
      }
      return 0;
    } catch (e) {
      writeStderr(`curl: (7) Failed to connect to ${normalized}: ${(e as Error).message}\n`);
      return 7;
    }
  },

  apk: async ({ args, writeStdout, writeStderr }) => {
    const sub = args[0] || 'info';
    if (sub === 'help' || sub === '--help' || sub === '-h') {
      writeStdout(`${ANSI.bold}Pogs macOS Android APK Manager${ANSI.reset}\n`);
      writeStdout(`  apk info          Display current debug APK package status & signatures\n`);
      writeStdout(`  apk download      Trigger direct browser download of app-debug.apk\n`);
      writeStdout(`  apk build         Show how to build the Android APK\n`);
      writeStdout(`  apk adb           Show ADB sideload command\n`);
      writeStdout(`  apk run           Print Android intent launcher command\n`);
      return 0;
    }
    if (sub === 'download' || sub === 'get') {
      writeStdout(`Triggering Android Debug APK download in browser...\n`);
      try {
        const a = document.createElement('a');
        a.href = '/app-debug.apk';
        a.download = 'pogs-mac-terminal-debug.apk';
        document.body.appendChild(a);
        a.click();
        a.remove();
        writeStdout(`${ANSI.green}✔ Download started: /app-debug.apk${ANSI.reset}\n`);
        return 0;
      } catch (e) {
        writeStderr(`Download failed: ${(e as Error).message}\n`);
        return 1;
      }
    }
    if (sub === 'adb' || sub === 'install') {
      writeStdout(`${ANSI.bold}ADB Installation Instructions:${ANSI.reset}\n`);
      writeStdout(`1. Connect device via USB / Wi-Fi debugging (adb devices)\n`);
      writeStdout(`2. Sideload APK directly:\n`);
      writeStdout(`   ${ANSI.cyan}adb install -r android/app/build/outputs/apk/debug/app-debug.apk${ANSI.reset}\n`);
      writeStdout(`3. Launch MainActivity:\n`);
      writeStdout(`   ${ANSI.cyan}adb shell am start -n com.pogsmac.terminal/.MainActivity${ANSI.reset}\n`);
      return 0;
    }
    if (sub === 'build' || sub === 'produce') {
      writeStdout(`${ANSI.bold}Building the Android APK${ANSI.reset}\n`);
      writeStdout(`The APK is built with Gradle, outside this terminal:\n`);
      writeStdout(`  ${ANSI.cyan}npm run build:apk${ANSI.reset}          on a machine with JDK 17, Gradle and the Android SDK\n`);
      writeStdout(`  ${ANSI.cyan}Build Android APK${ANSI.reset}          GitHub Actions workflow (uploads the APK as an artifact)\n`);
      return 0;
    }

    // Default: info
    try {
      const res = await fetch('/api/apk/status');
      const data = await res.json();
      writeStdout(`${ANSI.bold}Android Native Debug APK Status${ANSI.reset}\n`);
      writeStdout(`  Package:     ${ANSI.cyan}${data.packageName || 'com.pogsmac.terminal'}${ANSI.reset}\n`);
      writeStdout(`  App Name:    Pogs Terminal macOS\n`);
      writeStdout(`  Version:     1.0.0 (Android 8.0+)\n`);
      writeStdout(`  Binary:      app-debug.apk\n`);
      writeStdout(`  Status:      ${data.exists ? `${ANSI.green}✔ Compiled & Signed${ANSI.reset}` : `${ANSI.yellow}Not built yet${ANSI.reset}`}\n`);
      if (data.exists) {
        writeStdout(`  Size:        ${data.sizeFormatted}\n`);
        writeStdout(`  Signing:     debug key\n`);
        writeStdout(`  Updated:     ${data.mtime ? new Date(data.mtime).toLocaleString() : 'recent'}\n`);
        writeStdout(`\n${ANSI.dim}Run ${ANSI.reset}${ANSI.cyan}apk download${ANSI.reset}${ANSI.dim} to download.${ANSI.reset}\n`);
      }
      return 0;
    } catch (e) {
      writeStderr(`Failed to query APK status: ${(e as Error).message}\n`);
      return 1;
    }
  },
};
