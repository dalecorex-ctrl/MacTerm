import { vfs } from './vfs';

export interface GitHubRepoTemplate {
  name: string;
  owner: string;
  description: string;
  defaultBranch: string;
  files: Record<string, string>;
}

const POPULAR_TEMPLATES: Record<string, GitHubRepoTemplate> = {
  'pogs/react-starter': {
    name: 'react-starter',
    owner: 'pogs',
    description: 'Modern React SPA with Vite, Tailwind CSS, and local VFS storage.',
    defaultBranch: 'main',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'react-starter',
          version: '1.0.0',
          scripts: { dev: 'vite', build: 'vite build' },
          dependencies: { react: '^19.0.1', 'react-dom': '^19.0.1' },
        },
        null,
        2,
      ),
      'src/App.jsx': `export default function App() {\n  return <h1 className="text-xl font-bold">Hello from Cloned React Repo!</h1>;\n}\n`,
      'README.md': `# React Starter\nCloned and executed inside pogs@mac terminal runtime.\n`,
    },
  },
  'pogs/node-api': {
    name: 'node-api',
    owner: 'pogs',
    description: 'Lightweight Express REST API template with VFS persistence.',
    defaultBranch: 'main',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'node-api',
          version: '1.0.0',
          main: 'server.js',
          dependencies: { express: '^4.21.2' },
        },
        null,
        2,
      ),
      'server.js': `const express = require('express');\nconst app = express();\n\napp.get('/api/ping', (req, res) => res.json({ ok: true, message: 'pong' }));\napp.listen(3001, () => console.log('API server running on port 3001'));\n`,
      'README.md': `# Node API\nRun with: node server.js\n`,
    },
  },
  'pogs/python-ml-tools': {
    name: 'python-ml-tools',
    owner: 'pogs',
    description: 'Python scripts for numerical analysis and Fibonacci benchmarks.',
    defaultBranch: 'main',
    files: {
      'benchmark.py': `# Python Benchmark\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint("Fib(10) =", fib(10))\n`,
      'README.md': `# Python ML Tools\nRun with: python3 benchmark.py\n`,
    },
  },
};

export async function cloneRepository(repoInput: string, cwd: string, home: string): Promise<{ ok: boolean; path: string; message: string }> {
  const cleanInput = repoInput.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const parts = cleanInput.split('/').filter(Boolean);
  const repoName = parts[parts.length - 1] ?? 'cloned-repo';
  const targetDir = `${cwd === '/' ? '' : cwd}/${repoName}`;

  // Check if template exists
  const template = POPULAR_TEMPLATES[cleanInput] || POPULAR_TEMPLATES[`pogs/${repoName}`];
  if (template) {
    vfs.mkdir(targetDir, true);
    for (const [filePath, content] of Object.entries(template.files)) {
      vfs.writeFile(`${targetDir}/${filePath}`, content, true);
    }
    // Initialize git repo
    vfs.mkdir(`${targetDir}/.git`, true);
    vfs.writeFile(`${targetDir}/.git/COMMIT_LOG.json`, JSON.stringify([{ hash: 'a1b2c3d', msg: `Initial commit from ${cleanInput}`, date: new Date().toISOString() }]));
    vfs.writeFile(`${targetDir}/.git/STAGE.json`, '[]');
    return {
      ok: true,
      path: targetDir,
      message: `Cloned '${cleanInput}' into ${targetDir} (${Object.keys(template.files).length} files)`,
    };
  }

  // Try fetching public GitHub repo files via GitHub API if network permits
  try {
    const apiParts = parts.length >= 2 ? parts : ['pogs', repoName];
    const owner = apiParts[0];
    const repo = apiParts[1];
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (res.ok) {
      const data = (await res.json()) as { default_branch?: string };
      const branch = data.default_branch || 'main';
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      if (treeRes.ok) {
        const treeData = (await treeRes.json()) as { tree?: Array<{ path: string; type: string; url?: string }> };
        vfs.mkdir(targetDir, true);
        vfs.mkdir(`${targetDir}/.git`, true);
        vfs.writeFile(`${targetDir}/.git/COMMIT_LOG.json`, JSON.stringify([{ hash: 'deadbee', msg: `Cloned from https://github.com/${owner}/${repo}`, date: new Date().toISOString() }]));
        vfs.writeFile(`${targetDir}/.git/STAGE.json`, '[]');

        const items = (treeData.tree ?? []).filter((it) => it.type === 'blob').slice(0, 40);
        for (const item of items) {
          const fileRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`);
          if (fileRes.ok) {
            const text = await fileRes.text();
            vfs.writeFile(`${targetDir}/${item.path}`, text, true);
          }
        }
        return {
          ok: true,
          path: targetDir,
          message: `Successfully cloned https://github.com/${owner}/${repo} into ${targetDir} (${items.length} files)`,
        };
      }
    }
  } catch {
    // fallback
  }

  // Generic fallback clone
  vfs.mkdir(targetDir, true);
  vfs.writeFile(`${targetDir}/README.md`, `# ${repoName}\nCloned from ${repoInput}\n`);
  vfs.mkdir(`${targetDir}/.git`, true);
  vfs.writeFile(`${targetDir}/.git/COMMIT_LOG.json`, JSON.stringify([{ hash: 'b2c3d4e', msg: `Cloned ${repoInput}`, date: new Date().toISOString() }]));
  vfs.writeFile(`${targetDir}/.git/STAGE.json`, '[]');
  return {
    ok: true,
    path: targetDir,
    message: `Cloned ${repoInput} into ${targetDir} with README.md`,
  };
}

export function listPopularRepos(): Array<{ id: string; title: string; description: string }> {
  return [
    { id: 'pogs/react-starter', title: 'pogs/react-starter', description: 'React SPA with Vite & Tailwind' },
    { id: 'pogs/node-api', title: 'pogs/node-api', description: 'Express REST API template' },
    { id: 'pogs/python-ml-tools', title: 'pogs/python-ml-tools', description: 'Python benchmark & algorithm scripts' },
  ];
}
