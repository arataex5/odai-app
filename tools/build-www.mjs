#!/usr/bin/env node
/* Capacitor 用の webDir（www/）を作る。
   リポジトリ直下の Web アセットだけをコピーする（android/ node_modules/ download/ は含めない）。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'www');
const ITEMS = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'data', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
for (const item of ITEMS) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.error(`  ! 見つかりません: ${item}`);
    process.exitCode = 1;
    continue;
  }
  fs.cpSync(src, path.join(OUT, item), { recursive: true });
  n++;
}
console.log(`www/ を作成しました（${n} 項目）`);
