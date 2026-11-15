export type ProcessState = 'R' | 'S' | 'T';

export interface VirtualProcess {
  pid: number;
  ppid: number;
  tty: string;
  user: string;
  state: ProcessState;
  cpu: number;
  mem: number;
  command: string;
  startedAt: number;
  kill?: (signal?: string) => void;
}

class ProcessManager {
  private nextPid = 310;
  private processes = new Map<number, VirtualProcess>();
  private listeners = new Set<() => void>();

  constructor() {
    const boot = Date.now() - 480_000;
    this.processes.set(1, {
      pid: 1,
      ppid: 0,
      tty: '??',
      user: 'root',
      state: 'S',
      cpu: 0.1,
      mem: 0.4,
      command: '/sbin/launchd',
      startedAt: boot,
    });
    this.processes.set(102, {
      pid: 102,
      ppid: 1,
      tty: '??',
      user: 'pogs',
      state: 'S',
      cpu: 0.8,
      mem: 2.1,
      command: '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
      startedAt: boot + 5000,
    });
    this.processes.set(204, {
      pid: 204,
      ppid: 1,
      tty: '??',
      user: 'pogs',
      state: 'S',
      cpu: 0.2,
      mem: 0.6,
      command: '/usr/local/bin/tty-daemon --utf8 --truecolor',
      startedAt: boot + 8000,
    });
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  public spawn(opts: {
    ppid: number;
    tty: string;
    user?: string;
    command: string;
    state?: ProcessState;
    cpu?: number;
    mem?: number;
    kill?: (signal?: string) => void;
  }): VirtualProcess {
    const pid = this.nextPid++;
    const proc: VirtualProcess = {
      pid,
      ppid: opts.ppid,
      tty: opts.tty,
      user: opts.user ?? 'pogs',
      state: opts.state ?? 'R',
      cpu: opts.cpu ?? Number((0.4 + Math.random() * 2.5).toFixed(1)),
      mem: opts.mem ?? Number((0.3 + Math.random() * 1.4).toFixed(1)),
      command: opts.command,
      startedAt: Date.now(),
      kill: opts.kill,
    };
    this.processes.set(pid, proc);
    this.notify();
    return proc;
  }

  public exit(pid: number): void {
    if (pid <= 204) return;
    this.processes.delete(pid);
    this.notify();
  }

  public update(pid: number, patch: Partial<VirtualProcess>): void {
    const proc = this.processes.get(pid);
    if (!proc) return;
    Object.assign(proc, patch);
    this.notify();
  }

  public kill(pid: number, signal = 'TERM'): boolean {
    const proc = this.processes.get(pid);
    if (!proc || pid === 1) return false;
    if (proc.kill) {
      proc.kill(signal);
    }
    if (pid > 204) {
      this.processes.delete(pid);
      this.notify();
    }
    return true;
  }

  public list(): VirtualProcess[] {
    return Array.from(this.processes.values()).sort((a, b) => a.pid - b.pid);
  }
}

export const processManager = new ProcessManager();
