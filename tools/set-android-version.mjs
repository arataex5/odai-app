#!/usr/bin/env node
/* sw.js の APP_VERSION を Android の versionName / versionCode に反映する。
   versionCode は major*10000 + minor*100 + patch（環境変数 VERSION_CODE で上書き可）。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const m = sw.match(/APP_VERSION\s*=\s*'([^']+)'/);
if (!m) { console.error('sw.js から APP_VERSION を取得できませんでした'); process.exit(1); }
const versionName = m[1];
const [maj = 0, min = 0, pat = 0] = versionName.split('.').map(n => parseInt(n, 10) || 0);
const versionCode = parseInt(process.env.VERSION_CODE || '', 10) || (maj * 10000 + min * 100 + pat);

const gradle = path.join(ROOT, 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradle)) { console.error('android/app/build.gradle がありません（先に cap add android）'); process.exit(1); }

let src = fs.readFileSync(gradle, 'utf8');
src = src.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
src = src.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
fs.writeFileSync(gradle, src);
console.log(`versionName=${versionName} / versionCode=${versionCode} を設定しました`);
