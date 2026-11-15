/**
 * Hard integration & try-and-error stress test for pogs@mac Terminal runtime.
 * Run with: npx tsx scripts/hard-test.ts
 */

const memStore = new Map<string, string>();
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memStore.set(k, String(v));
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
  clear: () => {
    memStore.clear();
  },
};

const vibrateCalls: Array<number | number[]> = [];
const bridgeCalls: string[] = [];

try {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile',
      maxTouchPoints: 5,
      vibrate: (pattern: number | number[]) => {
        vibrateCalls.push(pattern);
        return true;
      },
    },
  });
} catch {
  // ignore if navigator cannot be redefined
}

(globalThis as Record<string, unknown>).window = {
  localStorage: (globalThis as Record<string, unknown>).localStorage,
  AndroidBridge: {
    hapticFeedback: (kind: string) => bridgeCalls.push(kind),
    hapticTap: () => bridgeCalls.push('tap'),
  },
  matchMedia: () => ({ matches: true }),
  addEventListener: (ev: string, fn: (...args: unknown[]) => void) => {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev)!.add(fn);
  },
  removeEventListener: (ev: string, fn: (...args: unknown[]) => void) => {
    listeners.get(ev)?.delete(fn);
  },
};

let passed = 0;
let failed = 0;

function assert(cond: unknown, label: string, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function run() {
  const { parseCommandLine } = await import('../src/runtime/shellParser');
  const { vfs } = await import('../src/runtime/vfs');
  const { packageRegistry } = await import('../src/runtime/packages');
  const { ShellSession } = await import('../src/runtime/shell');
  const {
    loadPersistedLayout,
    savePersistedLayout,
    loadPersistedPaneSession,
  } = await import('../src/runtime/sessionStorage');

  console.log('\n[1] Shell Parser Edge Cases');
  {
    const env = { HOME: '/Users/pogs', USER: 'pogs' };
    const p1 = parseCommandLine('echo "hello | world" && ls -la ~/Projects > out.txt; false || echo ok', env, 0, '/Users/pogs');
    assert(p1.length === 4, `Parses 4 chained entries across &&, ;, || (got ${p1.length})`);
    assert(p1[0].pipeline.commands[0].argv[1] === 'hello | world', 'Preserves pipe inside double quotes');
    assert(p1[1].pipeline.commands[0].stdoutFile === 'out.txt', 'Parses output redirection');
    assert(p1[1].pipeline.commands[0].argv[2] === '/Users/pogs/Projects', 'Expands unquoted ~/Projects');
    assert(p1[1].operator === '&&' && p1[2].operator === ';' && p1[3].operator === '||', 'Preserves segment operators');

    const p2 = parseCommandLine(`echo 'single $USER' | grep single | wc -l >> counts.txt`, env, 0, '/Users/pogs');
    assert(p2[0].pipeline.commands.length === 3, 'Parses 3-stage pipeline');
    assert(p2[0].pipeline.commands[0].argv[1] === 'single $USER', 'Does not expand $USER inside single quotes');
    assert(p2[0].pipeline.commands[2].stdoutAppend === true && p2[0].pipeline.commands[2].stdoutFile === 'counts.txt', 'Detects >> append redirection');
  }

  console.log('\n[2] VFS & Homebrew Stack Verification');
  {
    assert(vfs.getNode('/Users/pogs/Projects/tty-lab') !== null, 'Default project dir exists');
    for (const bin of ['claude', 'gemini', 'agy', 'coder', 'agent', 'asciiquarium', 'nyancat', 'bat', 'tty-clock', 'donut', 'fortune', 'boxes']) {
      assert(vfs.getNode(`/usr/local/bin/${bin}`) !== null, `Binary /usr/local/bin/${bin} exists`);
    }

    const allPkgs = packageRegistry.list();
    assert(allPkgs.length === 31, `Expected 31 Homebrew formulae, got ${allPkgs.length}`);
    assert(allPkgs.every((p) => p.installed), 'All 31 Homebrew formulae are pre-installed in default stack');

    const aiPkgs = allPkgs.filter((p) => p.category === 'ai').map((p) => p.name);
    assert(
      aiPkgs.includes('claude-code') && aiPkgs.includes('gemini-cli') && aiPkgs.includes('antigravity') && aiPkgs.includes('code-agent'),
      `AI formulae registered in Homebrew (${aiPkgs.join(', ')})`,
    );

    const coreRefuse = packageRegistry.uninstall('coreutils');
    assert(!coreRefuse.ok, 'Refuses uninstalling critical formula coreutils');

    const uninst = packageRegistry.uninstall('claude-code');
    assert(uninst.ok && !packageRegistry.isBinaryAvailable('claude'), 'Uninstalls claude-code & hides claude binary');
    assert(packageRegistry.isBinaryAvailable('gemini'), 'gemini-cli stays available independently');

    const reinst = packageRegistry.install('claude-code');
    assert(reinst.ok && packageRegistry.isBinaryAvailable('claude'), 'Re-installs claude-code & restores claude binary');
  }

  console.log('\n[3] Shell Execution, Pipelines, Redirection & Tools');
  {
    const paneId = 'pane-hard-test-1';
    const session = new ShellSession({ paneId });
    let captured = '';
    const detach = session.tty.attachOutput((chunk) => {
      captured += chunk;
    });

    const exec = async (cmd: string) => {
      captured = '';
      await session.runProgrammaticCommand(cmd);
      return captured;
    };

    const outPipe = await exec('echo "macOS TTY" | boxes | lolcat');
    assert(session.state.lastExitCode === 0 && outPipe.includes('macOS TTY'), 'Pipeline echo | boxes | lolcat succeeds');

    const outFortune = await exec('fortune | cowsay');
    assert(session.state.lastExitCode === 0 && outFortune.includes('('), 'Pipeline fortune | cowsay succeeds');

    const outJq = await exec('cat ~/Projects/tty-lab/config.json | jq .');
    assert(session.state.lastExitCode === 0 && outJq.includes('tty-lab'), 'jq parses config.json');

    await exec('cd ~/Projects/tty-lab && echo "alpha" > _t.txt && echo "beta" >> _t.txt');
    const txt = vfs.readFile('/Users/pogs/Projects/tty-lab/_t.txt') ?? '';
    assert(txt.includes('alpha') && txt.includes('beta'), 'Redirection > and >> write and append in VFS');
    await exec('rm _t.txt');

    await exec('false || echo "recovered"');
    assert(session.state.lastExitCode === 0 && captured.includes('recovered'), 'Short-circuit || executes fallback');

    await exec('definitely_missing_bin_123');
    assert(session.state.lastExitCode === 127, 'Unknown command returns exit code 127');

    const nodeOut = await exec('node -e "console.log(6 * 7)"');
    assert(session.state.lastExitCode === 0 && nodeOut.includes('42'), 'node -e evaluates JS in VFS runtime');

    const pyOut = await exec('python3 -c "print(sum(range(5)))"');
    assert(session.state.lastExitCode === 0 && pyOut.includes('10'), 'python3 -c evaluates Python');

    const batOut = await exec('bat ~/Projects/tty-lab/hello.js');
    assert(session.state.lastExitCode === 0 && batOut.includes('hello'), 'bat renders syntax-highlighted file');

    const brewOut = await exec('brew stack && brew doctor');
    assert(session.state.lastExitCode === 0 && brewOut.includes('31/31'), 'brew stack & doctor confirm 31/31 formulae');

    console.log('\n[4] Coding Agent Commands (claude / gemini / agy) & Interactive REPL');
    packageRegistry.uninstall('claude-code');
    const missingClaudeOut = await exec('claude "audit"');
    assert(session.state.lastExitCode === 127 && missingClaudeOut.includes('brew install claude-code'), 'Uninstalled claude points to brew install claude-code');
    packageRegistry.install('claude-code');

    // Test interactive REPL startup, slash commands, and /exit cleanly
    captured = '';
    const replPromise = session.runProgrammaticCommand('claude');
    await new Promise((r) => setTimeout(r, 60));
    session.tty.emitInput('/help\r');
    await new Promise((r) => setTimeout(r, 30));
    session.tty.emitInput('/think low\r');
    await new Promise((r) => setTimeout(r, 30));
    session.tty.emitInput('/auto\r');
    await new Promise((r) => setTimeout(r, 30));
    session.tty.emitInput('/tokens\r');
    await new Promise((r) => setTimeout(r, 30));
    session.tty.emitInput('/ls\r');
    await new Promise((r) => setTimeout(r, 30));
    session.tty.emitInput('/exit\r');
    await replPromise;
    assert(captured.includes('Claude Code') && captured.includes('Slash Commands') && session.tty.termios.icanon === true, 'claude interactive REPL executes slash commands and restores icanon on /exit');

    // Test one-shot offline fallback (or server call if running)
    const agyOneShot = await exec('agy "audit" --yolo');
    assert(session.state.lastExitCode === 0 && agyOneShot.length > 0, 'agy one-shot --yolo completes cleanly without hanging');

    console.log('\n[5] Session & Layout Persistence Across Refresh');
    await exec('export TEST_VAR=pogs123 && alias gs="git status"');
    session.dispose(false);

    const persisted = loadPersistedPaneSession(paneId);
    assert(
      persisted?.cwd === '/Users/pogs/Projects/tty-lab' &&
        persisted?.envOverrides?.TEST_VAR === 'pogs123' &&
        persisted?.aliases?.gs === 'git status',
      'Pane cwd, envOverrides, and aliases persisted to localStorage',
    );

    const restored = new ShellSession({ paneId });
    assert(
      restored.state.cwd === '/Users/pogs/Projects/tty-lab' &&
        restored.state.env.TEST_VAR === 'pogs123' &&
        restored.state.aliases.gs === 'git status' &&
        restored.state.history.length > 5,
      'New ShellSession restores cwd, env, aliases, and history from localStorage',
    );
    restored.dispose(true);
    assert(loadPersistedPaneSession(paneId) === null, 'dispose(true) removes closed pane persistence');

    savePersistedLayout(
      [{ id: 'tab-1', activePaneId: 'pane-1', root: { type: 'leaf', paneId: 'pane-1' } }],
      'tab-1',
    );
    const loadedLayout = loadPersistedLayout();
    assert(loadedLayout?.tabs.length === 1 && loadedLayout.activeTabId === 'tab-1', 'Layout round-trip persistence works');
    detach();
  }

  console.log('\n[6] Live HTTP Server & /api/agent/step Checks');
  try {
    const htmlRes = await fetch('http://127.0.0.1:3000/');
    const htmlText = await htmlRes.text();
    assert(htmlRes.status === 200 && htmlText.includes('pogs@mac'), 'GET / returns 200 with pogs@mac title');

    const badRes = await fetch('http://127.0.0.1:3000/api/agent/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(badRes.status === 400, `POST /api/agent/step without goal returns 400 (got ${badRes.status})`);

    const stepRes = await fetch('http://127.0.0.1:3000/api/agent/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'List files in current directory',
        cwd: '/Users/pogs/Projects/tty-lab',
        persona: 'claude',
        thinking: 'low',
        workspaceFiles: ['hello.js', 'config.json'],
        history: [],
      }),
    });
    assert(stepRes.status === 200 || stepRes.status === 503, `POST /api/agent/step responds cleanly (${stepRes.status})`);
    if (stepRes.status === 200) {
      const json = (await stepRes.json()) as { tool?: string; thought?: string };
      assert(Boolean(json.tool && json.thought), `Agent API returned structured tool action: ${json.tool}`);
    }
  } catch (err) {
    assert(false, 'Live HTTP server reachable on 127.0.0.1:3000', String(err));
  }

    console.log('\n[7] Web Vibration & Mobile APK Haptics Verification');
    const { haptics } = await import('../src/runtime/haptics');
    vibrateCalls.length = 0;
    bridgeCalls.length = 0;

    haptics.tabCreate();
    haptics.splitPane();
    haptics.copy();
    assert(
      vibrateCalls.length === 3 &&
        JSON.stringify(vibrateCalls[1]) === JSON.stringify([10, 28, 14]) &&
        bridgeCalls.join(',') === 'tab,split,copy',
      'Web Vibration API + AndroidBridge fire distinct patterns for tab, split, and copy',
    );

    const errBefore = bridgeCalls.filter((k) => k === 'error').length;
    const hPane = new ShellSession({ paneId: 'pane-haptics-test' });
    await hPane.runProgrammaticCommand('nonexistent_cmd_haptic_check');
    const errAfter = bridgeCalls.filter((k) => k === 'error').length;
    assert(errAfter === errBefore + 1, 'Shell execution failure triggers commandError haptic feedback');
    hPane.dispose(true);

    haptics.setEnabled(false);
    const disabledBefore = vibrateCalls.length;
    haptics.splitPane();
    assert(vibrateCalls.length === disabledBefore, 'Disabling haptics suppresses vibration cleanly');
    haptics.setEnabled(true);

    console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
