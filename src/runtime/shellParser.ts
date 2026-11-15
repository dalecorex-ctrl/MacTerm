import { vfs } from './vfs';

export interface SimpleCommand {
  argv: string[];
  stdinFile?: string;
  stdoutFile?: string;
  stdoutAppend?: boolean;
  stderrFile?: string;
  stderrToStdout?: boolean;
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface ConditionalSegment {
  operator: 'start' | '&&' | '||' | ';';
  pipeline: Pipeline;
  background?: boolean;
}

interface Token {
  type: 'word' | 'pipe' | 'and' | 'or' | 'semi' | 'bg' | 'redir_in' | 'redir_out' | 'redir_append' | 'redir_err' | 'redir_err_to_out';
  value: string;
  quoted?: boolean;
}

export function expandVariables(
  input: string,
  env: Record<string, string>,
  lastExitCode: number,
  cwd: string,
): string {
  return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*|\?)\}|\$([A-Za-z_][A-Za-z0-9_]*|\?)/g, (_, braced, plain) => {
    const key = braced ?? plain;
    if (key === '?') return String(lastExitCode);
    if (key === 'PWD') return cwd;
    return env[key] ?? '';
  });
}

function expandGlobs(pattern: string, cwd: string, home: string): string[] {
  if (!pattern.includes('*') && !pattern.includes('?')) return [pattern];
  const lastSlash = pattern.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? pattern.slice(0, lastSlash) || '/' : '.';
  const filePattern = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
  const absDir = vfs.resolvePath(dirPart, cwd, home);
  const entries = vfs.readdir(absDir);
  if (!entries) return [pattern];

  const regexStr =
    '^' +
    filePattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') +
    '$';
  const regex = new RegExp(regexStr);
  const matches = entries
    .filter((e) => (filePattern.startsWith('.') || !e.name.startsWith('.')) && regex.test(e.name))
    .map((e) => (lastSlash >= 0 ? `${pattern.slice(0, lastSlash + 1)}${e.name}` : e.name));

  return matches.length > 0 ? matches : [pattern];
}

export function tokenize(
  line: string,
  env: Record<string, string>,
  lastExitCode: number,
  cwd: string,
): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const ch = line[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '#') {
      break;
    }
    if (ch === '|') {
      if (line[i + 1] === '|') {
        tokens.push({ type: 'or', value: '||' });
        i += 2;
      } else {
        tokens.push({ type: 'pipe', value: '|' });
        i++;
      }
      continue;
    }
    if (ch === '&') {
      if (line[i + 1] === '&') {
        tokens.push({ type: 'and', value: '&&' });
        i += 2;
      } else {
        tokens.push({ type: 'bg', value: '&' });
        i++;
      }
      continue;
    }
    if (ch === ';') {
      tokens.push({ type: 'semi', value: ';' });
      i++;
      continue;
    }
    if (ch === '2' && line.slice(i, i + 4) === '2>&1') {
      tokens.push({ type: 'redir_err_to_out', value: '2>&1' });
      i += 4;
      continue;
    }
    if (ch === '2' && line[i + 1] === '>') {
      tokens.push({ type: 'redir_err', value: '2>' });
      i += 2;
      continue;
    }
    if (ch === '>') {
      if (line[i + 1] === '>') {
        tokens.push({ type: 'redir_append', value: '>>' });
        i += 2;
      } else {
        tokens.push({ type: 'redir_out', value: '>' });
        i++;
      }
      continue;
    }
    if (ch === '<') {
      tokens.push({ type: 'redir_in', value: '<' });
      i++;
      continue;
    }

    let word = '';
    let quoted = false;
    while (i < len) {
      const c = line[i];
      if (/\s/.test(c) || c === '|' || c === '&' || c === ';' || c === '>' || c === '<') {
        break;
      }
      if (c === "'") {
        quoted = true;
        i++;
        while (i < len && line[i] !== "'") {
          word += line[i++];
        }
        if (i < len) i++;
        continue;
      }
      if (c === '"') {
        quoted = true;
        i++;
        let inner = '';
        while (i < len && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < len) {
            const next = line[i + 1];
            if (next === '"' || next === '\\' || next === '$') {
              inner += next;
              i += 2;
              continue;
            }
          }
          inner += line[i++];
        }
        if (i < len) i++;
        word += expandVariables(inner, env, lastExitCode, cwd);
        continue;
      }
      if (c === '\\' && i + 1 < len) {
        word += line[i + 1];
        i += 2;
        continue;
      }
      let unquotedChunk = '';
      while (i < len) {
        const u = line[i];
        if (/\s/.test(u) || u === '|' || u === '&' || u === ';' || u === '>' || u === '<' || u === "'" || u === '"' || u === '\\') {
          break;
        }
        unquotedChunk += u;
        i++;
      }
      word += expandVariables(unquotedChunk, env, lastExitCode, cwd);
    }

    if (!quoted && (word.includes('*') || word.includes('?'))) {
      const expanded = expandGlobs(word, cwd, env.HOME ?? '/Users/pogs');
      for (const item of expanded) {
        tokens.push({ type: 'word', value: item, quoted: false });
      }
    } else {
      tokens.push({ type: 'word', value: word, quoted });
    }
  }

  return tokens;
}

export function parseCommandLine(
  line: string,
  env: Record<string, string>,
  lastExitCode: number,
  cwd: string,
): ConditionalSegment[] {
  const tokens = tokenize(line, env, lastExitCode, cwd);
  if (tokens.length === 0) return [];

  const segments: ConditionalSegment[] = [];
  let currentOp: ConditionalSegment['operator'] = 'start';
  let currentPipeline: Pipeline = { commands: [] };
  let currentCmd: SimpleCommand = { argv: [] };

  const flushCmd = () => {
    if (currentCmd.argv.length > 0 || currentCmd.stdoutFile || currentCmd.stdinFile) {
      currentPipeline.commands.push(currentCmd);
      currentCmd = { argv: [] };
    }
  };

  const flushSegment = (nextOp: ConditionalSegment['operator'], background = false) => {
    flushCmd();
    if (currentPipeline.commands.length > 0) {
      segments.push({
        operator: currentOp,
        pipeline: currentPipeline,
        background,
      });
    }
    currentPipeline = { commands: [] };
    currentOp = nextOp;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    switch (tok.type) {
      case 'word':
        if (tok.value === '~' && !tok.quoted) {
          currentCmd.argv.push(env.HOME ?? '/Users/pogs');
        } else if (tok.value.startsWith('~/') && !tok.quoted) {
          currentCmd.argv.push((env.HOME ?? '/Users/pogs') + tok.value.slice(1));
        } else {
          currentCmd.argv.push(tok.value);
        }
        break;
      case 'pipe':
        flushCmd();
        break;
      case 'and':
        flushSegment('&&');
        break;
      case 'or':
        flushSegment('||');
        break;
      case 'semi':
        flushSegment(';');
        break;
      case 'bg':
        flushSegment(';', true);
        break;
      case 'redir_in':
        if (tokens[i + 1]?.type === 'word') {
          currentCmd.stdinFile = tokens[++i].value;
        }
        break;
      case 'redir_out':
        if (tokens[i + 1]?.type === 'word') {
          currentCmd.stdoutFile = tokens[++i].value;
          currentCmd.stdoutAppend = false;
        }
        break;
      case 'redir_append':
        if (tokens[i + 1]?.type === 'word') {
          currentCmd.stdoutFile = tokens[++i].value;
          currentCmd.stdoutAppend = true;
        }
        break;
      case 'redir_err':
        if (tokens[i + 1]?.type === 'word') {
          currentCmd.stderrFile = tokens[++i].value;
        }
        break;
      case 'redir_err_to_out':
        currentCmd.stderrToStdout = true;
        break;
    }
  }

  flushSegment('start', false);
  return segments;
}
