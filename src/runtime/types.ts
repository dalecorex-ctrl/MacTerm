import type { TtyDevice } from './tty';

export interface ShellState {
  cwd: string;
  prevCwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  history: string[];
  lastExitCode: number;
  shellPid: number;
}

export interface CommandContext {
  args: string[];
  rawCmd: string;
  stdin: string;
  isPipedOutput: boolean;
  tty: TtyDevice;
  shell: ShellState;
  signal: AbortSignal;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  setActiveProcessName: (name: string) => void;
  runSubCommand: (cmdLine: string) => Promise<{ exitCode: number; stdout: string }>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<number> | number;
