import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

console.log('=== Producing Android Debug APK ===');

const projectRoot = process.cwd();
const androidDir = path.join(projectRoot, 'android');
const appDir = path.join(androidDir, 'app');
const srcMain = path.join(appDir, 'src', 'main');
const javaSrc = path.join(srcMain, 'java');
const resDir = path.join(srcMain, 'res');
const manifestPath = path.join(srcMain, 'AndroidManifest.xml');
const assetsDir = path.join(srcMain, 'assets');
const outputDir = path.join(appDir, 'build', 'outputs', 'apk', 'debug');
const publicDir = path.join(projectRoot, 'public');
const distDir = path.join(projectRoot, 'dist');
const tmpBuildDir = path.join(projectRoot, '.tmp_apk_build');
const classesDir = path.join(tmpBuildDir, 'classes');
const keystorePath = path.join(androidDir, 'debug.keystore');

// 1. Build web app and sync assets
console.log('1. Building web app and syncing Android assets...');
execSync('npm run build', { stdio: 'inherit' });
execSync('node scripts/sync-android.mjs', { stdio: 'inherit' });

// 2. Prepare directories
fs.rmSync(tmpBuildDir, { recursive: true, force: true });
fs.mkdirSync(classesDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const androidJar = '/usr/lib/android-sdk/platforms/android-23/android.jar';
if (!fs.existsSync(androidJar)) {
  console.error(`Android framework jar not found at ${androidJar}`);
  process.exit(1);
}

// 3. Compile Java source to bytecode
console.log('2. Compiling Java sources...');
const javaFiles = [];
function findJavaFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJavaFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      javaFiles.push(full);
    }
  }
}
findJavaFiles(javaSrc);

if (javaFiles.length === 0) {
  console.error('No Java source files found to compile!');
  process.exit(1);
}

execSync(
  `javac -source 1.8 -target 1.8 -cp "${androidJar}" -d "${classesDir}" ${javaFiles.map(f => `"${f}"`).join(' ')}`,
  { stdio: 'inherit' }
);

// 4. Convert bytecode to Dalvik Executable (classes.dex)
console.log('3. Converting bytecode to classes.dex...');
const dexPath = path.join(tmpBuildDir, 'classes.dex');
execSync(`dalvik-exchange --dex --output="${dexPath}" "${classesDir}"`, { stdio: 'inherit' });

// 5. Package base APK resources & assets using aapt
console.log('4. Packaging resources and web assets with AAPT...');
const unalignedApk = path.join(tmpBuildDir, 'unaligned.apk');
execSync(
  `aapt package -f -M "${manifestPath}" -S "${resDir}" -I "${androidJar}" -F "${unalignedApk}" -A "${assetsDir}"`,
  { stdio: 'inherit' }
);

// 6. Inject classes.dex into unaligned.apk
console.log('5. Injecting classes.dex into APK package...');
execSync(`aapt add "${unalignedApk}" "classes.dex"`, { cwd: tmpBuildDir, stdio: 'inherit' });

// 7. Align APK on 4-byte boundaries using zipalign
console.log('6. Aligning APK with zipalign...');
const alignedApk = path.join(tmpBuildDir, 'aligned.apk');
execSync(`zipalign -f -p 4 "${unalignedApk}" "${alignedApk}"`, { stdio: 'inherit' });

// 8. Ensure debug keystore exists and sign APK with apksigner (v1, v2, v3)
console.log('7. Signing APK with apksigner (v1, v2, v3 schemes)...');
if (!fs.existsSync(keystorePath)) {
  execSync(
    `keytool -genkey -v -keystore "${keystorePath}" -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=PogsMac,C=US" -noprompt`,
    { stdio: 'inherit' }
  );
}

const finalApk = path.join(outputDir, 'app-debug.apk');
execSync(
  `apksigner sign --ks "${keystorePath}" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out "${finalApk}" "${alignedApk}"`,
  { stdio: 'inherit' }
);

// 9. Verify signed APK
console.log('8. Verifying APK signature...');
execSync(`apksigner verify --verbose "${finalApk}"`, { stdio: 'inherit' });

// 10. Copy final APK to public/ and dist/
const publicApk = path.join(publicDir, 'app-debug.apk');
const distApk = path.join(distDir, 'app-debug.apk');

fs.copyFileSync(finalApk, publicApk);
if (fs.existsSync(distDir)) {
  fs.copyFileSync(finalApk, distApk);
}

const stats = fs.statSync(finalApk);
const sizeKb = (stats.size / 1024).toFixed(1);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

const metadata = {
  filename: 'app-debug.apk',
  packageName: 'com.pogsmac.terminal',
  appName: 'Pogs Terminal macOS',
  version: '1.0.0',
  buildTimestamp: new Date().toISOString(),
  sizeBytes: stats.size,
  sizeFormatted: `${sizeMb} MB (${sizeKb} KB)`,
  signatures: ['v1', 'v2', 'v3'],
  verified: true
};

fs.writeFileSync(path.join(publicDir, 'apk-metadata.json'), JSON.stringify(metadata, null, 2));
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'apk-metadata.json'), JSON.stringify(metadata, null, 2));
}

// Clean up temp build folder
fs.rmSync(tmpBuildDir, { recursive: true, force: true });

console.log(`\n======================================================`);
console.log(`SUCCESS: Android Debug APK Successfully Produced!`);
console.log(`Location: ${finalApk}`);
console.log(`Web Download: /app-debug.apk`);
console.log(`Package: com.pogsmac.terminal`);
console.log(`Size: ${metadata.sizeFormatted}`);
console.log(`Signatures: v1, v2, v3 (verified)`);
console.log(`======================================================\n`);
