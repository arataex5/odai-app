#!/usr/bin/env python3
"""data/<ゲームID>/<セットID>.csv をすべて読み、js/embedded-data.js を作り直す。

CSV を追加・編集したら:
    python tools/embed_csv.py
を実行してください（file:// / APK 実行時のフォールバックが同期されます）。
新しいゲームの CSV も自動で取り込まれます。
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(ROOT, 'js', 'embedded-data.js')


def main():
    entries = {}
    for path in sorted(glob.glob(os.path.join(DATA, '*', '*.csv'))):
        gid = os.path.basename(os.path.dirname(path))
        sid = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding='utf-8-sig') as f:
            text = f.read().replace('\r\n', '\n').replace('\r', '\n').strip('\n')
        entries[gid + '/' + sid] = text
    lines = [
        '/* =========================================================',
        '   embedded-data.js  -  お題データの埋め込みコピー（自動生成・手で編集しない）',
        '   data/（ゲームID）/（セットID）.csv から tools/embed_csv.py で生成します。',
        '   CSV を読めない環境（file:// など）ではこちらが使われます。',
        '   ========================================================= */',
        'window.ODAI_EMBEDDED = {',
    ]
    keys = list(entries.keys())
    for i, k in enumerate(keys):
        comma = ',' if i < len(keys) - 1 else ''
        lines.append('  ' + json.dumps(k, ensure_ascii=False) + ': ' +
                     json.dumps(entries[k], ensure_ascii=False) + comma)
    lines.append('};')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    for k in keys:
        print('  %-22s %4d 行' % (k, entries[k].count('\n')))
    print('js/embedded-data.js を作成しました（%d セット）' % len(keys))
    return 0


if __name__ == '__main__':
    sys.exit(main())
