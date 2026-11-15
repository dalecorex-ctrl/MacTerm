// Builds the debug APK with Gradle and publishes it to public/ for the web download.
//
//   node scripts/produce-apk.mjs               build, then publish
//   node scripts/produce-apk.mjs --from <apk>  publish an APK that was built elsewhere (e.g. by CI)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = process.cwd();
const androidDir = path.join(projectRoot, 'android');
const publicDir = path.join(projectRoot, 'public');
const builtApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function buildWithGradle() {
  const gradle = fs.existsSync(path.join(androidDir, 'gradlew')) ? './gradlew' : 'gradle';

  try {
    execSync(`${gradle} --version`, { cwd: androidDir, stdio: 'ignore' });
  } catch {
    fail('Gradle was not found. Install JDK 17, Gradle 8.9+ and the Android SDK (platform 35), or run the "Build Android APK" GitHub workflow.');
  }

  execSync('npm run android:sync', { cwd: projectRoot, stdio: 'inherit' });
  execSync(`${gradle} assembleDebug --no-daemon`, { cwd: androidDir, stdio: 'inherit' });
  return builtApk;
}

function readVersionName() {
  const gradleFile = fs.readFileSync(path.join(androidDir, 'app', 'build.gradle'), 'utf8');
  return gradleFile.match(/versionName\s+"([^"]+)"/)?.[1] ?? 'unknown';
}

function publish(apkPath) {
  if (!fs.existsSync(apkPath)) {
    fail(`APK not found at ${apkPath}`);
  }

  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(apkPath, path.join(publicDir, 'MacTerm.apk'));

  const { size } = fs.statSync(apkPath);
  const metadata = {
    filename: 'MacTerm.apk',
    packageName: 'com.pogsmac.terminal',
    appName: 'Pogs Terminal macOS',
    version: readVersionName(),
    buildTimestamp: new Date().toISOString(),
    sizeBytes: size,
    sizeFormatted: `${(size / (1024 * 1024)).toFixed(2)} MB (${(size / 1024).toFixed(1)} KB)`,
  };
  fs.writeFileSync(path.join(publicDir, 'apk-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`Published ${apkPath} -> public/MacTerm.apk (${metadata.sizeFormatted})`);
}

const fromIndex = process.argv.indexOf('--from');
if (fromIndex !== -1) {
  const source = process.argv[fromIndex + 1];
  if (!source) fail('Usage: node scripts/produce-apk.mjs --from <path-to-apk>');
  publish(path.resolve(source));
} else {
  publish(buildWithGradle());
}
