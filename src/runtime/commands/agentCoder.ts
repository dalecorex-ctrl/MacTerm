import { ANSI, stripAnsi } from '../tty';
import type { CommandContext, CommandHandler } from '../types';
import { packageRegistry } from '../packages';
import { vfs } from '../vfs';
import { soundEffects } from '../audio';

interface AgentAction {
  thought: string;
  tool: 'list_dir' | 'read_file' | 'edit_file' | 'write_file' | 'search_files' | 'run_command' | 'done';
  path?: string;
  oldText?: string;
  newText?: string;
  content?: string;
  query?: string;
  command?: string;
  message?: string;
}

interface AgentHistoryEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

interface SessionDiff {
  path: string;
  before: string;
  after: string;
}

interface PersonaMeta {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
}

const CORAL = ANSI.fgRgb(255, 123, 84);
const TEAL = ANSI.fgRgb(86, 212, 221);
const MUTED = ANSI.fgRgb(126, 156, 168);
const BORDER = ANSI.fgRgb(74, 102, 116);
const GREEN = ANSI.fgRgb(74, 222, 128);
const RED = ANSI.fgRgb(248, 113, 113);
const AMBER = ANSI.fgRgb(251, 191, 36);
const MAC_RED = ANSI.fgRgb(255, 95, 86);
const MAC_YELLOW = ANSI.fgRgb(255, 189, 46);
const MAC_GREEN = ANSI.fgRgb(39, 201, 63);
const DIFF_ADD_BG = ANSI.bgRgb(18, 52, 36);
const DIFF_DEL_BG = ANSI.bgRgb(58, 22, 26);

function getPersona(cmd: string): PersonaMeta {
  switch (cmd) {
    case 'claude':
      return {
        id: 'claude',
        title: 'Claude Code',
        subtitle: 'v2.1.0 · Agentic Coding CLI',
        accent: CORAL,
      };
    case 'gemini':
      return {
        id: 'gemini',
        title: 'Gemini CLI',
        subtitle: 'v2.1.0 · gemini-4-hydrogen',
        accent: TEAL,
      };
    case 'agy':
      return {
        id: 'agy',
        title: 'Antigravity (agy)',
        subtitle: 'v2.1.0 · Autonomous Workspace Agent',
        accent: AMBER,
      };
    default:
      return {
        id: cmd,
        title: 'Code Agent',
        subtitle: 'v2.1.0 · claude / gemini / agy compatible',
        accent: CORAL,
      };
  }
}

function formatCwdShort(cwd: string, home: string): string {
  if (cwd === home) return '~';
  if (cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length);
  return cwd;
}

function boxWidth(cols: number): number {
  return Math.max(44, Math.min(84, cols - 4));
}

function padLineToWidth(styled: string, width: number): string {
  const visibleLen = stripAnsi(styled).length;
  const pad = Math.max(0, width - visibleLen);
  return styled + ' '.repeat(pad);
}

function printAgentBanner(ctx: CommandContext, persona: PersonaMeta, thinking: 'low' | 'high', autoApprove: boolean): void {
  const home = ctx.shell.env.HOME ?? '/Users/pogs';
  const cwdShort = formatCwdShort(ctx.shell.cwd, home);
  const w = boxWidth(ctx.tty.cols);
  const inner = w - 2;
  const lights = `${MAC_RED}●${ANSI.reset} ${MAC_YELLOW}●${ANSI.reset} ${MAC_GREEN}●${ANSI.reset}`;
  const headerLeft = ` ${lights}  ${ANSI.bold}${ANSI.brightWhite}${persona.title}${ANSI.reset} ${MUTED}— ${persona.subtitle}${ANSI.reset}`;
  const permBadge = autoApprove ? `${GREEN}auto-approve${ANSI.reset}` : `${AMBER}ask-first${ANSI.reset}`;
  const metaLine = ` ${persona.accent}⌘${ANSI.reset} ${ANSI.brightWhite}${cwdShort}${ANSI.reset}  ${MUTED}·${ANSI.reset}  ${MUTED}think:${ANSI.reset} ${TEAL}${thinking}${ANSI.reset}  ${MUTED}·${ANSI.reset}  ${MUTED}perms:${ANSI.reset} ${permBadge}`;
  const tipsLine = ` ${MUTED}@file attach context  ·  /init  ·  /diff  ·  /auto  ·  /help${ANSI.reset}`;

  ctx.tty.writeln('');
  ctx.tty.writeln(`  ${BORDER}╭${'─'.repeat(inner)}╮${ANSI.reset}`);
  ctx.tty.writeln(`  ${BORDER}│${ANSI.reset}${padLineToWidth(headerLeft, inner)}${BORDER}│${ANSI.reset}`);
  ctx.tty.writeln(`  ${BORDER}├${'─'.repeat(inner)}┤${ANSI.reset}`);
  ctx.tty.writeln(`  ${BORDER}│${ANSI.reset}${padLineToWidth(metaLine, inner)}${BORDER}│${ANSI.reset}`);
  ctx.tty.writeln(`  ${BORDER}│${ANSI.reset}${padLineToWidth(tipsLine, inner)}${BORDER}│${ANSI.reset}`);
  ctx.tty.writeln(`  ${BORDER}╰${'─'.repeat(inner)}╯${ANSI.reset}`);
  ctx.tty.writeln('');
}

function renderFormattedCliText(ctx: CommandContext, text: string, accent: string): void {
  const lines = text.split('\n');
  for (const raw of lines) {
    const trimmed = raw.trimEnd();
    if (!trimmed) {
      ctx.tty.writeln('');
      continue;
    }
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const heading = trimmed.replace(/^#{1,3}\s+/, '');
      ctx.tty.writeln(`  ${ANSI.bold}${accent}${heading}${ANSI.reset}`);
      continue;
    }
    const styled = trimmed
      .replace(/`([^`]+)`/g, `${TEAL}$1${ANSI.reset}`)
      .replace(/\*\*([^*]+)\*\*/g, `${ANSI.bold}${ANSI.brightWhite}$1${ANSI.reset}`)
      .replace(/^(\s*[-*])\s+/, `$1 ${accent}›${ANSI.reset} `);
    ctx.tty.writeln(`  ${styled}`);
  }
}

function renderUnifiedDiff(ctx: CommandContext, filePath: string, before: string, after: string): void {
  const oldLines = before === '' ? [] : before.split('\n');
  const newLines = after.split('\n');
  const w = boxWidth(ctx.tty.cols);
  const title = ` Diff · ${filePath} `;
  const rightRule = '─'.repeat(Math.max(4, w - 3 - title.length));
  ctx.tty.writeln(`  ${BORDER}╭─${ANSI.reset}${ANSI.bold}${ANSI.brightWhite}${title}${ANSI.reset}${BORDER}${rightRule}${ANSI.reset}`);
  const maxLines = Math.max(oldLines.length, newLines.length);
  let shown = 0;
  for (let i = 0; i < maxLines && shown < 22; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) continue;
    if (o !== undefined) {
      ctx.tty.writeln(`  ${BORDER}│${ANSI.reset} ${DIFF_DEL_BG}${RED} - ${String(i + 1).padStart(3)} ${o} ${ANSI.reset}`);
      shown++;
    }
    if (n !== undefined) {
      ctx.tty.writeln(`  ${BORDER}│${ANSI.reset} ${DIFF_ADD_BG}${GREEN} + ${String(i + 1).padStart(3)} ${n} ${ANSI.reset}`);
      shown++;
    }
  }
  if (shown === 0) {
    ctx.tty.writeln(`  ${BORDER}│${ANSI.reset} ${MUTED}(no line changes)${ANSI.reset}`);
  }
  ctx.tty.writeln(`  ${BORDER}╰${'─'.repeat(Math.max(12, w - 2))}${ANSI.reset}`);
}

function startSpinner(ctx: CommandContext, label: string, accent: string): () => void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let idx = 0;
  const draw = () => {
    ctx.tty.write(`\r${ANSI.clearToEnd}${accent}${frames[idx % frames.length]}${ANSI.reset} ${MUTED}${label} (esc/Ctrl+C to interrupt)${ANSI.reset}`);
    idx++;
  };
  draw();
  const timer = setInterval(draw, 85);
  return () => {
    clearInterval(timer);
    ctx.tty.write(`\r${ANSI.clearToEnd}`);
  };
}

function askApproval(
  ctx: CommandContext,
  promptLabel: string,
): Promise<'yes' | 'no' | 'always'> {
  return new Promise((resolve) => {
    ctx.tty.write(`  ${AMBER}?${ANSI.reset} ${promptLabel} ${MUTED}[y]es / [n]o / [a]lways:${ANSI.reset} `);
    let unsub: (() => void) | null = null;
    const finish = (choice: 'yes' | 'no' | 'always') => {
      unsub?.();
      ctx.tty.writeln(choice);
      resolve(choice);
    };
    unsub = ctx.tty.onData((data) => {
      const ch = data.toLowerCase();
      if (ch === 'y' || ch === '\r') finish('yes');
      else if (ch === 'a') finish('always');
      else if (ch === 'n' || ch === '\x1b' || ch === '\x03') finish('no');
    });
  });
}

function resolveAttachedFiles(prompt: string, cwd: string, home: string): Array<{ path: string; content: string }> {
  const matches = prompt.match(/@([A-Za-z0-9_./~-]+)/g) ?? [];
  const attached: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const rel = m.slice(1);
    const abs = vfs.resolvePath(rel, cwd, home);
    if (seen.has(abs)) continue;
    const content = vfs.readFile(abs);
    if (content !== null) {
      seen.add(abs);
      attached.push({ path: rel, content });
    }
  }
  return attached;
}

async function executeToolLocally(
  ctx: CommandContext,
  action: AgentAction,
  state: { autoApprove: boolean; diffs: SessionDiff[] },
): Promise<{ output: string; denied?: boolean }> {
  const home = ctx.shell.env.HOME ?? '/Users/pogs';

  if (action.tool === 'list_dir') {
    const abs = vfs.resolvePath(action.path || '.', ctx.shell.cwd, home);
    const entries = vfs.readdir(abs);
    if (!entries) return { output: `Error: directory not found: ${abs}` };
    const list = entries.map((e) => `${e.type === 'dir' ? '[DIR] ' : '[FILE]'} ${e.name} (${e.size}B)`).join('\n');
    return { output: list || '(empty directory)' };
  }

  if (action.tool === 'read_file') {
    const abs = vfs.resolvePath(action.path || '', ctx.shell.cwd, home);
    const content = vfs.readFile(abs);
    if (content === null) return { output: `Error: file not found: ${abs}` };
    return { output: content.slice(0, 6000) };
  }

  if (action.tool === 'search_files') {
    const base = vfs.resolvePath(action.path || '.', ctx.shell.cwd, home);
    const q = (action.query || '').toLowerCase();
    const hits: string[] = [];
    const walk = (dirPath: string) => {
      const entries = vfs.readdir(dirPath) ?? [];
      for (const e of entries) {
        const full = `${dirPath === '/' ? '' : dirPath}/${e.name}`;
        if (e.type === 'dir') walk(full);
        else {
          const content = vfs.readFile(full) ?? '';
          content.split('\n').forEach((line, idx) => {
            if (line.toLowerCase().includes(q)) {
              hits.push(`${full}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    };
    walk(base);
    return { output: hits.slice(0, 25).join('\n') || 'No matches found.' };
  }

  if (action.tool === 'edit_file') {
    const abs = vfs.resolvePath(action.path || '', ctx.shell.cwd, home);
    const before = vfs.readFile(abs);
    if (before === null) return { output: `Error: file not found: ${abs}` };
    if (!action.oldText || action.newText === undefined) {
      return { output: 'Error: edit_file requires oldText and newText.' };
    }
    if (!before.includes(action.oldText)) {
      return { output: `Error: oldText snippet not found in ${abs}.` };
    }
    const after = before.replace(action.oldText, action.newText);
    renderUnifiedDiff(ctx, action.path ?? abs, before, after);
    if (!state.autoApprove) {
      const choice = await askApproval(ctx, `Apply edit to ${action.path}?`);
      if (choice === 'no') return { output: 'User declined file edit.', denied: true };
      if (choice === 'always') state.autoApprove = true;
    }
    vfs.writeFile(abs, after, false);
    state.diffs.push({ path: abs, before, after });
    return { output: `Edited ${abs} (${after.length} bytes)` };
  }

  if (action.tool === 'write_file') {
    const abs = vfs.resolvePath(action.path || '', ctx.shell.cwd, home);
    if (!action.path || action.content === undefined) {
      return { output: 'Error: write_file requires path and content.' };
    }
    const before = vfs.readFile(abs) ?? '';
    renderUnifiedDiff(ctx, action.path, before, action.content);
    if (!state.autoApprove) {
      const choice = await askApproval(ctx, `Write ${action.path}?`);
      if (choice === 'no') return { output: 'User declined file write.', denied: true };
      if (choice === 'always') state.autoApprove = true;
    }
    const ok = vfs.writeFile(abs, action.content, false);
    if (ok) state.diffs.push({ path: abs, before, after: action.content });
    return { output: ok ? `Wrote ${action.content.length} bytes to ${abs}` : `Error: could not write ${abs}` };
  }

  if (action.tool === 'run_command') {
    const cmd = action.command || 'ls';
    if (!state.autoApprove) {
      const choice = await askApproval(ctx, `Run shell command "${cmd}"?`);
      if (choice === 'no') return { output: 'User declined shell command.', denied: true };
      if (choice === 'always') state.autoApprove = true;
    }
    const res = await ctx.runSubCommand(cmd);
    const out = res.stdout.trim();
    return { output: `exit=${res.exitCode}\n${out || '(no output)'}` };
  }

  return { output: 'Done.' };
}

async function runOfflineAgentFallback(
  ctx: CommandContext,
  goal: string,
  persona: PersonaMeta,
  state: { autoApprove: boolean; diffs: SessionDiff[] },
): Promise<void> {
  const home = ctx.shell.env.HOME ?? '/Users/pogs';
  const lower = goal.toLowerCase();
  const entries = (vfs.readdir(ctx.shell.cwd) ?? []).map((e) => e.name);

  const stopSpin = startSpinner(ctx, 'Inspecting workspace locally', persona.accent);
  await new Promise((r) => setTimeout(r, 220));
  stopSpin();

  ctx.tty.writeln(`${TEAL}●${ANSI.reset} ${ANSI.bold}list_dir${ANSI.reset}(${MUTED}"${formatCwdShort(ctx.shell.cwd, home)}"${ANSI.reset})`);
  ctx.tty.writeln(`${MUTED}  └─ ${entries.length} entries: ${entries.slice(0, 8).join(', ') || '(empty)'}${ANSI.reset}`);

  if (lower.includes('init') || lower.includes('agents.md') || lower.includes('claude.md')) {
    const targetName = persona.id === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
    const content = `# Workspace Guide (${formatCwdShort(ctx.shell.cwd, home)})\n\n## Files\n${entries.map((e) => `- \`${e}\``).join('\n')}\n\n## Run Commands\n- \`node hello.js\`\n- \`python3 fibonacci.py\`\n`;
    const res = await executeToolLocally(ctx, { thought: 'Create workspace guide', tool: 'write_file', path: targetName, content }, state);
    ctx.tty.writeln(`\n${GREEN}✓${ANSI.reset} ${res.denied ? 'Skipped' : `Generated ${targetName}`}.`);
    return;
  }

  if (lower.includes('test') || lower.includes('audit') || lower.includes('check') || lower.includes('coverage') || lower.includes('run')) {
    const jsFiles = entries.filter((f) => f.endsWith('.js'));
    const pyFiles = entries.filter((f) => f.endsWith('.py'));
    for (const f of jsFiles.slice(0, 2)) {
      ctx.tty.writeln(`${TEAL}●${ANSI.reset} ${ANSI.bold}run_command${ANSI.reset}(${MUTED}"node ${f}"${ANSI.reset})`);
      const res = await ctx.runSubCommand(`node ${f}`);
      const preview = res.stdout.trim().split('\n')[0] ?? 'ok';
      ctx.tty.writeln(`${MUTED}  └─ exit=${res.exitCode} · ${preview}${ANSI.reset}`);
    }
    for (const f of pyFiles.slice(0, 2)) {
      ctx.tty.writeln(`${TEAL}●${ANSI.reset} ${ANSI.bold}run_command${ANSI.reset}(${MUTED}"python3 ${f}"${ANSI.reset})`);
      const res = await ctx.runSubCommand(`python3 ${f}`);
      const preview = res.stdout.trim().split('\n')[0] ?? 'ok';
      ctx.tty.writeln(`${MUTED}  └─ exit=${res.exitCode} · ${preview}${ANSI.reset}`);
    }
    ctx.tty.writeln(`\n${GREEN}✓${ANSI.reset} Audited ${entries.length} workspace entries in ${formatCwdShort(ctx.shell.cwd, home)} (${jsFiles.length} JS, ${pyFiles.length} Python checked).`);
    return;
  }

  if (lower.includes('create') || lower.includes('write') || lower.includes('script') || lower.includes('add') || lower.includes('fix')) {
    const filename = lower.includes('py') ? 'agent_script.py' : 'agent_script.js';
    const content = lower.includes('py')
      ? `# Created by ${persona.title}\ndef main():\n    for i in range(5):\n        print(f"item {i}")\n\nmain()\n`
      : `// Created by ${persona.title}\nconst nums = [2, 4, 6, 8];\nconsole.log('Result:', nums.reduce((a, b) => a + b, 0));\n`;
    const res = await executeToolLocally(ctx, { thought: `Create ${filename}`, tool: 'write_file', path: filename, content }, state);
    if (!res.denied) {
      const runner = filename.endsWith('.py') ? `python3 ${filename}` : `node ${filename}`;
      ctx.tty.writeln(`${TEAL}●${ANSI.reset} ${ANSI.bold}run_command${ANSI.reset}(${MUTED}"${runner}"${ANSI.reset})`);
      const runRes = await ctx.runSubCommand(runner);
      ctx.tty.writeln(`${MUTED}  └─ ${runRes.stdout.trim()}${ANSI.reset}`);
      ctx.tty.writeln(`\n${GREEN}✓${ANSI.reset} Created and verified ${ANSI.bold}${filename}${ANSI.reset}.`);
    }
    return;
  }

  ctx.tty.writeln(`\n${GREEN}✓${ANSI.reset} Local workspace ready (${entries.length} items). Add ${ANSI.bold}GEMINI_API_KEY${ANSI.reset} in Settings > Secrets for full LLM reasoning, or ask to audit, test, or create JS/Python scripts locally.`);
}

async function runAgentTask(
  ctx: CommandContext,
  goal: string,
  persona: PersonaMeta,
  session: {
    thinking: 'low' | 'high';
    autoApprove: boolean;
    history: AgentHistoryEntry[];
    diffs: SessionDiff[];
    toolCalls: number;
    turns: number;
  },
): Promise<number> {
  const home = ctx.shell.env.HOME ?? '/Users/pogs';
  const workspaceFiles = (vfs.readdir(ctx.shell.cwd) ?? []).map((e) => e.name);
  const attachedFiles = resolveAttachedFiles(goal, ctx.shell.cwd, home);
  if (attachedFiles.length > 0) {
    ctx.tty.writeln(`${MUTED}  Attached context: ${attachedFiles.map((f) => `@${f.path}`).join(', ')}${ANSI.reset}`);
  }

  session.turns++;
  session.history.push({ role: 'user', content: goal });

  const wasRaw = !ctx.tty.termios.icanon;
  if (!wasRaw) ctx.tty.setRawMode(true);

  const abortCtrl = new AbortController();
  const keyCancel = ctx.tty.onData((d) => {
    if (d === '\x1b' || d === '\x03') abortCtrl.abort();
  });
  const onParentAbort = () => abortCtrl.abort();
  ctx.signal.addEventListener('abort', onParentAbort, { once: true });

  const maxSteps = 7;

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (abortCtrl.signal.aborted) {
        ctx.tty.writeln(`\n${AMBER}!${ANSI.reset} Interrupted.`);
        return 130;
      }

      const stopSpin = startSpinner(ctx, step === 0 ? 'Thinking' : 'Analyzing tool output', persona.accent);
      let action: AgentAction | null = null;

      try {
        const resp = await fetch('/api/agent/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortCtrl.signal,
          body: JSON.stringify({
            goal,
            cwd: ctx.shell.cwd,
            persona: persona.id,
            thinking: session.thinking,
            workspaceFiles,
            attachedFiles,
            history: session.history.slice(-14),
          }),
        });
        stopSpin();

        if (!resp.ok) {
          if (resp.status === 503 || resp.status === 404) {
            await runOfflineAgentFallback(ctx, goal, persona, session);
            return 0;
          }
          const errData = (await resp.json().catch(() => ({}))) as { error?: string };
          ctx.tty.writeln(`${RED}Agent API error:${ANSI.reset} ${errData.error ?? resp.statusText}`);
          return 1;
        }

        action = (await resp.json()) as AgentAction;
      } catch {
        stopSpin();
        if (abortCtrl.signal.aborted) {
          ctx.tty.writeln(`\n${AMBER}!${ANSI.reset} Interrupted.`);
          return 130;
        }
        await runOfflineAgentFallback(ctx, goal, persona, session);
        return 0;
      }

      if (!action || !action.tool) break;

      if (action.thought) {
        ctx.tty.writeln(`  ${persona.accent}◆${ANSI.reset} ${MUTED}${action.thought}${ANSI.reset}`);
      }

      if (action.tool === 'done') {
        const summary = action.message ?? 'Task complete.';
        session.history.push({ role: 'assistant', content: summary });
        ctx.tty.writeln('');
        renderFormattedCliText(ctx, summary, persona.accent);
        ctx.tty.writeln(`\n  ${MAC_GREEN}●${ANSI.reset} ${GREEN}Done${ANSI.reset}`);
        soundEffects.alert();
        return 0;
      }

      session.toolCalls++;
      const argPreview = action.path ?? action.command ?? action.query ?? '';
      ctx.tty.writeln(`  ${TEAL}╭─ ● ${ANSI.bold}${action.tool}${ANSI.reset}${TEAL}(${MUTED}"${argPreview}"${TEAL})${ANSI.reset}`);

      const result = await executeToolLocally(ctx, action, session);
      const firstLine = result.output.split('\n')[0]?.slice(0, 92) ?? '';
      ctx.tty.writeln(`  ${TEAL}╰─${ANSI.reset} ${MUTED}${firstLine}${ANSI.reset}`);

      session.history.push({ role: 'assistant', content: JSON.stringify(action) });
      session.history.push({ role: 'tool', content: result.output.slice(0, 3500) });
    }

    ctx.tty.writeln(`\n${AMBER}!${ANSI.reset} Reached step budget (${maxSteps} steps).`);
    return 0;
  } finally {
    keyCancel();
    ctx.signal.removeEventListener('abort', onParentAbort);
    if (!wasRaw) ctx.tty.setRawMode(false);
  }
}

export const agentCoderCommands: Record<string, CommandHandler> = {
  coder: async (ctx) => {
    if (!packageRegistry.isBinaryAvailable(ctx.rawCmd)) {
      const owner = packageRegistry.findOwnerPackage(ctx.rawCmd)?.name ?? 'code-agent';
      ctx.writeStderr(`zsh: command not found: ${ctx.rawCmd} (install with: brew install ${owner})\n`);
      return 127;
    }

    const persona = getPersona(ctx.rawCmd);
    const autoFlag = ctx.args.includes('--yolo') || ctx.args.includes('--dangerously-skip-permissions');
    const cleanArgs = ctx.args.filter((a) => a !== '--yolo' && a !== '--dangerously-skip-permissions');

    const sessionState = {
      thinking: 'high' as 'low' | 'high',
      autoApprove: autoFlag,
      history: [] as AgentHistoryEntry[],
      diffs: [] as SessionDiff[],
      toolCalls: 0,
      turns: 0,
    };

    const inlineGoal = cleanArgs.join(' ').trim();
    if (inlineGoal) {
      return runAgentTask(ctx, inlineGoal, persona, sessionState);
    }

    const home = ctx.shell.env.HOME ?? '/Users/pogs';
    printAgentBanner(ctx, persona, sessionState.thinking, sessionState.autoApprove);

    return new Promise<number>((resolve) => {
      let buffer = '';
      let cursor = 0;
      let busy = false;
      const promptHistory: string[] = [];
      let histIdx = -1;

      ctx.tty.setRawMode(true);

      const drawInputBox = () => {
        const width = boxWidth(ctx.tty.cols);
        const inner = width - 2;
        const cwdShort = formatCwdShort(ctx.shell.cwd, home);
        const modeLabel = sessionState.autoApprove ? `${GREEN}auto${ANSI.reset}` : `${AMBER}ask${ANSI.reset}`;
        const headerTag = ` ${persona.accent}⌘${ANSI.reset} ${ANSI.bold}${cwdShort}${ANSI.reset} ${MUTED}· perms:${ANSI.reset} ${modeLabel} ${MUTED}· think:${ANSI.reset} ${TEAL}${sessionState.thinking}${ANSI.reset} `;
        const headerFill = Math.max(4, inner - stripAnsi(headerTag).length - 1);
        ctx.tty.writeln(`  ${BORDER}╭─${ANSI.reset}${headerTag}${BORDER}${'─'.repeat(headerFill)}${ANSI.reset}`);
        ctx.tty.writeln(`  ${BORDER}│${ANSI.reset} ${persona.accent}❯${ANSI.reset} ${ANSI.brightWhite}${buffer}${ANSI.reset}`);
        ctx.tty.write(`  ${BORDER}╰${'─'.repeat(inner)}${ANSI.reset}`);
        // Move cursor back up 1 line to the "  │ ❯ " line at exact column
        ctx.tty.write(`\x1b[1A\r\x1b[${6 + cursor}C`);
      };

      const redrawLine = () => {
        ctx.tty.write(`\r${ANSI.clearToEnd}  ${BORDER}│${ANSI.reset} ${persona.accent}❯${ANSI.reset} ${ANSI.brightWhite}${buffer}${ANSI.reset}`);
        const back = buffer.length - cursor;
        if (back > 0) ctx.tty.write(ANSI.moveLeft(back));
      };

      drawInputBox();

      let unsub: (() => void) | null = null;
      const cleanup = (code = 0) => {
        unsub?.();
        ctx.tty.setRawMode(false);
        resolve(code);
      };

      const SLASH_CMDS = ['/help', '/auto', '/think', '/diff', '/init', '/compact', '/tokens', '/ls', '/clear', '/exit'];

      const submitLine = async (rawLine: string) => {
        const line = rawLine.trim();
        buffer = '';
        cursor = 0;
        histIdx = -1;
        ctx.tty.write('\x1b[1B\r\n');

        if (!line) {
          drawInputBox();
          return;
        }
        if (promptHistory[promptHistory.length - 1] !== line) {
          promptHistory.push(line);
        }

        if (line === '/exit' || line === '/quit' || line === 'exit') {
          cleanup(0);
          return;
        }
        if (line === '/help') {
          ctx.tty.writeln(`${TEAL}Slash Commands:${ANSI.reset}`);
          ctx.tty.writeln(`  /auto          Toggle auto-approve edits & commands (${sessionState.autoApprove ? 'currently on' : 'currently off'})`);
          ctx.tty.writeln(`  /think [l|h]   Switch reasoning depth (low / high)`);
          ctx.tty.writeln(`  /init          Audit directory & create CLAUDE.md / AGENTS.md`);
          ctx.tty.writeln(`  /diff          Show unified diffs applied in this session`);
          ctx.tty.writeln(`  /tokens        Show turns, tool calls, and context size`);
          ctx.tty.writeln(`  /compact       Trim older conversation turns`);
          ctx.tty.writeln(`  /ls            List files in ${formatCwdShort(ctx.shell.cwd, home)}`);
          ctx.tty.writeln(`  /clear         Clear terminal & reset conversation context`);
          ctx.tty.writeln(`  /exit          Return to zsh shell`);
          ctx.tty.writeln(`${MUTED}Tip: Mention @filename (e.g. "explain @hello.js") to attach file context.${ANSI.reset}`);
          drawInputBox();
          return;
        }
        if (line === '/auto') {
          sessionState.autoApprove = !sessionState.autoApprove;
          ctx.tty.writeln(`${TEAL}Permissions:${ANSI.reset} ${sessionState.autoApprove ? 'auto-approve enabled' : 'ask before edits/commands'}`);
          drawInputBox();
          return;
        }
        if (line.startsWith('/think')) {
          const arg = line.split(/\s+/)[1]?.toLowerCase();
          if (arg === 'low' || arg === 'l') sessionState.thinking = 'low';
          else if (arg === 'high' || arg === 'h') sessionState.thinking = 'high';
          else sessionState.thinking = sessionState.thinking === 'high' ? 'low' : 'high';
          ctx.tty.writeln(`${TEAL}Thinking level:${ANSI.reset} ${sessionState.thinking}`);
          drawInputBox();
          return;
        }
        if (line === '/diff') {
          if (sessionState.diffs.length === 0) {
            ctx.tty.writeln(`${MUTED}No file edits made in this session yet.${ANSI.reset}`);
          } else {
            for (const d of sessionState.diffs) renderUnifiedDiff(ctx, d.path, d.before, d.after);
          }
          drawInputBox();
          return;
        }
        if (line === '/tokens') {
          const chars = sessionState.history.reduce((s, h) => s + h.content.length, 0);
          ctx.tty.writeln(`${TEAL}Session stats:${ANSI.reset} ${sessionState.turns} turns · ${sessionState.toolCalls} tool calls · ~${Math.ceil(chars / 4)} context tokens`);
          drawInputBox();
          return;
        }
        if (line === '/compact') {
          sessionState.history = sessionState.history.slice(-4);
          ctx.tty.writeln(`${GREEN}✓${ANSI.reset} Compacted conversation context to last 4 entries.`);
          drawInputBox();
          return;
        }
        if (line === '/clear') {
          sessionState.history = [];
          ctx.tty.write(ANSI.clearScreen);
          printAgentBanner(ctx, persona, sessionState.thinking, sessionState.autoApprove);
          drawInputBox();
          return;
        }
        if (line === '/ls') {
          const entries = (vfs.readdir(ctx.shell.cwd) ?? []).map((e) => (e.type === 'dir' ? `${e.name}/` : e.name));
          ctx.tty.writeln(entries.join('  ') || '(empty)');
          drawInputBox();
          return;
        }

        const effectiveGoal =
          line === '/init'
            ? 'Audit the current working directory and generate a concise AGENTS.md or CLAUDE.md project guide summarizing files and run commands.'
            : line;

        busy = true;
        try {
          await runAgentTask(ctx, effectiveGoal, persona, sessionState);
        } finally {
          busy = false;
          ctx.tty.writeln('');
          drawInputBox();
        }
      };

      unsub = ctx.tty.onData(async (data) => {
        if (busy) return;
        if (data === '\x03' || (data === '\x04' && buffer.length === 0)) {
          ctx.tty.write('\x1b[1B\r\n');
          cleanup(0);
          return;
        }

        if (data === '\r' || data === '\n') {
          await submitLine(buffer);
          return;
        }

        // Tab autocomplete for slash commands and @file mentions
        if (data === '\t') {
          const before = buffer.slice(0, cursor);
          if (before.startsWith('/')) {
            const match = SLASH_CMDS.find((c) => c.startsWith(before));
            if (match) {
              buffer = match + ' ';
              cursor = buffer.length;
              redrawLine();
            }
          } else {
            const atMatch = before.match(/@([^\s]*)$/);
            if (atMatch) {
              const prefix = atMatch[1];
              const entries = vfs.readdir(ctx.shell.cwd) ?? [];
              const found = entries.find((e) => e.name.startsWith(prefix));
              if (found) {
                const add = found.name.slice(prefix.length) + (found.type === 'dir' ? '/' : ' ');
                buffer = buffer.slice(0, cursor) + add + buffer.slice(cursor);
                cursor += add.length;
                redrawLine();
              }
            }
          }
          return;
        }

        if (data === '\x1b[D') {
          if (cursor > 0) {
            cursor--;
            ctx.tty.write(ANSI.moveLeft(1));
          }
          return;
        }
        if (data === '\x1b[C') {
          if (cursor < buffer.length) {
            cursor++;
            ctx.tty.write(ANSI.moveRight(1));
          }
          return;
        }
        if (data === '\x1b[A') {
          if (promptHistory.length === 0) return;
          if (histIdx === -1) histIdx = promptHistory.length - 1;
          else if (histIdx > 0) histIdx--;
          buffer = promptHistory[histIdx] ?? '';
          cursor = buffer.length;
          redrawLine();
          return;
        }
        if (data === '\x1b[B') {
          if (histIdx === -1) return;
          if (histIdx < promptHistory.length - 1) {
            histIdx++;
            buffer = promptHistory[histIdx] ?? '';
          } else {
            histIdx = -1;
            buffer = '';
          }
          cursor = buffer.length;
          redrawLine();
          return;
        }
        if (data === '\x15') {
          buffer = '';
          cursor = 0;
          redrawLine();
          return;
        }
        if (data === '\x7f' || data === '\b') {
          if (cursor > 0) {
            buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
            cursor--;
            redrawLine();
          }
          return;
        }

        const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (normalized.includes('\n')) {
          const first = normalized.split('\n')[0].replace(/[\x00-\x1f\x7f]/g, '');
          if (first) {
            buffer = buffer.slice(0, cursor) + first + buffer.slice(cursor);
            cursor += first.length;
          }
          await submitLine(buffer);
          return;
        }

        const clean = data.replace(/[\x00-\x1f\x7f]/g, '');
        if (clean) {
          buffer = buffer.slice(0, cursor) + clean + buffer.slice(cursor);
          cursor += clean.length;
          redrawLine();
        }
      });

      ctx.signal.addEventListener('abort', () => cleanup(130), { once: true });
    });
  },

  agent: (ctx) => agentCoderCommands.coder(ctx),
  claude: (ctx) => agentCoderCommands.coder(ctx),
  gemini: (ctx) => agentCoderCommands.coder(ctx),
  agy: (ctx) => agentCoderCommands.coder(ctx),
};
