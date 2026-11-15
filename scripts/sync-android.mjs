import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const targetDir = path.resolve('android/app/src/main/assets/public');

// The web download of the APK must not be packaged inside the APK itself.
const EXCLUDED = new Set(['app-debug.apk', 'apk-metadata.json']);

if (!fs.existsSync(distDir)) {
  console.error('dist/ directory not found. Run `npm run build` first.');
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(distDir, targetDir, {
  recursive: true,
  filter: (source) => !EXCLUDED.has(path.basename(source)),
});

console.log(`Synced ${distDir} -> ${targetDir}`);
