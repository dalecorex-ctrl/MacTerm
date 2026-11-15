import { useState } from 'react';
import { Download, GitBranch, Github, Loader2, Play, Search, X } from 'lucide-react';
import { cloneRepository, listPopularRepos } from '../runtime/repoRunner';
import { haptics } from '../runtime/haptics';

interface RepoRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string) => void;
  cwd: string;
  home: string;
}

export function RepoRunnerModal({ isOpen, onClose, onRunCommand, cwd, home }: RepoRunnerModalProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const popular = listPopularRepos();

  const handleClone = async (repoName: string) => {
    if (!repoName.trim()) return;
    setLoading(true);
    setStatusMsg(`Cloning ${repoName}...`);
    haptics.tap();

    try {
      const res = await cloneRepository(repoName, cwd, home);
      setStatusMsg(res.message);
      haptics.copy();
      setTimeout(() => {
        setLoading(false);
        onClose();
        onRunCommand(`cd ${res.path} && ls -la`);
      }, 900);
    } catch (err) {
      setStatusMsg(`Error cloning repository: ${String(err)}`);
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="GitHub Repository Runner"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#141b22]/95 text-slate-100 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F56] text-[9px] font-bold text-black/70 hover:brightness-110"
            >
              ×
            </button>
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-semibold tracking-tight text-white">
                GitHub Repository Runner & Cloner
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6 text-xs leading-relaxed">
          <div className="space-y-2">
            <label className="block font-medium text-slate-300">
              Clone Public Repository URL or owner/repo
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleClone(inputUrl);
                  }}
                  placeholder="https://github.com/owner/repo or owner/repo"
                  className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={loading || !inputUrl.trim()}
                onClick={() => handleClone(inputUrl)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Clone & Run
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-slate-200">Popular Quick-Clone Repositories</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {popular.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  disabled={loading}
                  onClick={() => handleClone(repo.id)}
                  className="flex flex-col items-start justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.07] hover:border-sky-400/40"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-mono font-medium text-white">
                      <GitBranch className="h-3.5 w-3.5 text-sky-400" />
                      {repo.title}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{repo.description}</p>
                  </div>
                  <span className="mt-3 flex items-center gap-1 text-[11px] font-medium text-sky-400">
                    <Play className="h-3 w-3" /> Clone
                  </span>
                </button>
              ))}
            </div>
          </div>

          {statusMsg && (
            <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-3 font-mono text-[11px] text-sky-300">
              {statusMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
