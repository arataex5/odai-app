#!/usr/bin/env python3
"""ゲームのロゴ文字を SVG（パス）に変換して js/core/logos.js を作る（任意のツール）。

フォントファイルをアプリに同梱しないので、オフラインでもロゴの書体が崩れません。
ロゴを変えたい／ゲームを追加したときだけ実行します。

準備（初回のみ。tools フォルダの外に一時的に入れます）:
    npm install --no-save @fontsource/kiwi-maru @fontsource/m-plus-rounded-1c \
        @fontsource/dela-gothic-one @fontsource/mochiy-pop-one \
        @fontsource/yuji-syuku @fontsource/zen-antique
    pip install fonttools brotli
実行:
    python tools/make_logos.py
フォントはすべて SIL Open Font License（Google Fonts / Fontsource 配布）。
"""
import glob
import json
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NM = os.environ.get('FONTSOURCE_DIR') or os.path.join(ROOT, 'node_modules', '@fontsource')
OUT = os.path.join(ROOT, 'js', 'core', 'logos.js')

# キー: (フォント, ウェイト, 文字列（\n で改行）, 字間(em), 行間(em))
LOGOS = {
    'hodoyoku':       ('kiwi-maru', 500, 'ほどよく', 0.02, 1.2),
    'awaseyou':       ('m-plus-rounded-1c', 800, '答えを\n合わせよう', 0.0, 1.12),
    'awaseyou-wolf':  ('zen-antique', 400, '答えを\n合わせよう', 0.02, 1.15),
    'wordcchi':       ('dela-gothic-one', 400, 'ワードっち', -0.02, 1.2),
    'pittanko':       ('mochiy-pop-one', 400, 'ぴったんこ\nはんはん', 0.0, 1.12),
    'katakanashi':    ('yuji-syuku', 400, 'カタカナーシ', 0.0, 1.2),
    # ゲーム選択画面のカード用（1行）
    'name-hodoyoku':    ('kiwi-maru', 500, 'ほどよく', 0.02, 1.2),
    'name-awaseyou':    ('m-plus-rounded-1c', 800, '答えを合わせよう', 0.0, 1.2),
    'name-wordcchi':    ('dela-gothic-one', 400, 'ワードっち', 0.0, 1.2),
    'name-pittanko':    ('mochiy-pop-one', 400, 'ぴったんこはんはん', 0.0, 1.2),
    'name-katakanashi': ('yuji-syuku', 400, 'カタカナーシ', 0.0, 1.2),
    # 飾り文字
    'kin':            ('yuji-syuku', 400, '禁', 0.0, 1.0),
    'vs':             ('dela-gothic-one', 400, 'VS', 0.0, 1.0),
}

_cache = {}


def load_family(fam, weight):
    key = (fam, weight)
    if key in _cache:
        return _cache[key]
    files = sorted(glob.glob(os.path.join(NM, fam, 'files', '%s-*-%d-normal.woff2' % (fam, weight))))
    files += sorted(glob.glob(os.path.join(NM, fam, 'files', '%s-japanese-%d-normal.woff2' % (fam, weight))))
    files += sorted(glob.glob(os.path.join(NM, fam, 'files', '%s-latin-%d-normal.woff2' % (fam, weight))))
    if not files:
        sys.exit('フォントが見つかりません: %s %d（準備の npm install を確認）' % (fam, weight))
    fonts = []
    for f in files:
        try:
            fonts.append(TTFont(f))
        except Exception:
            pass
    _cache[key] = fonts
    return fonts


def glyph_for(fonts, ch):
    for ft in fonts:
        cmap = ft.getBestCmap()
        if cmap and ord(ch) in cmap:
            return ft, cmap[ord(ch)]
    return None, None


def render(fam, weight, text, tracking, leading):
    fonts = load_family(fam, weight)
    upm = fonts[0]['head'].unitsPerEm
    asc = fonts[0]['hhea'].ascent
    lines = text.split('\n')
    lh = upm * leading
    widths, parts = [], []
    for li, line in enumerate(lines):
        x, gl = 0, []
        for ch in line:
            ft, gname = glyph_for(fonts, ch)
            if ft is None:
                print('  ! グリフなし: %r (%s)' % (ch, fam))
                x += upm * 0.5
                continue
            gl.append((ft, gname, x))
            x += ft['hmtx'][gname][0] + upm * tracking
        x -= upm * tracking
        widths.append(x)
        parts.append(gl)
    W = max(widths)
    d_all = []
    bounds = [1e9, 1e9, -1e9, -1e9]
    for li, gl in enumerate(parts):
        off = (W - widths[li]) / 2
        base = asc + li * lh
        for ft, gname, x in gl:
            gs = ft.getGlyphSet()
            pen = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
            tp = TransformPen(pen, (1, 0, 0, -1, off + x, base))
            gs[gname].draw(tp)
            bp = BoundsPen(gs)
            gs[gname].draw(TransformPen(bp, (1, 0, 0, -1, off + x, base)))
            if bp.bounds:
                b = bp.bounds
                bounds = [min(bounds[0], b[0]), min(bounds[1], b[1]), max(bounds[2], b[2]), max(bounds[3], b[3])]
            d = pen.getCommands()
            if d:
                d_all.append(d)
    pad = upm * 0.03
    return [round(bounds[0] - pad), round(bounds[1] - pad),
            round(bounds[2] - bounds[0] + pad * 2), round(bounds[3] - bounds[1] + pad * 2)], ''.join(d_all)


def main():
    out = {}
    for key, (fam, weight, text, tr, ld) in LOGOS.items():
        vb, d = render(fam, weight, text, tr, ld)
        out[key] = {'vb': ' '.join(str(v) for v in vb), 'd': d}
        print('  %-18s %-20s %5d x %-5d %6d bytes' % (key, fam, vb[2], vb[3], len(d)))
    lines = [
        '/* =========================================================',
        '   logos.js  -  ロゴ文字の SVG パス（tools/make_logos.py で自動生成・手で編集しない）',
        '   フォント：Kiwi Maru / M PLUS Rounded 1c / Zen Antique / Dela Gothic One /',
        '             Mochiy Pop One / Yuji Syuku（すべて SIL Open Font License）',
        '   ========================================================= */',
        '(function (g) {',
        "  'use strict';",
        '  var L = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';',
        '  var n = 0;',
        '  /* ロゴの SVG 文字列を返す。cls はクラス名、label は読み上げ用。',
        '     opts.split = [左の色, 右の色] で左右半分ずつ塗り分け（CSS 変数可） */',
        '  g.OdaiLogo = function (key, cls, label, opts) {',
        "    var o = L[key]; if (!o) return '';",
        "    var defs = '', fill = '';",
        '    if (opts && opts.split) {',
        "      var id = 'lg' + (++n);",
        "      defs = '<defs><linearGradient id=\"' + id + '\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"0\">' +",
        "        '<stop offset=\".5\" style=\"stop-color:' + opts.split[0] + '\"/><stop offset=\".5\" style=\"stop-color:' + opts.split[1] + '\"/>' +",
        "        '</linearGradient></defs>';",
        "      fill = ' style=\"fill:url(#' + id + ')\"';",
        '    }',
        "    return '<svg class=\"logo-svg ' + (cls || '') + '\" viewBox=\"' + o.vb + '\" role=\"img\" aria-label=\"' + (label || '') + '\">' +",
        "      defs + '<path d=\"' + o.d + '\"' + fill + '/></svg>';",
        '  };',
        '  g.OdaiLogo.has = function (key) { return !!L[key]; };',
        '})(window);',
    ]
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    print('js/core/logos.js を作成しました（%d KB）' % (os.path.getsize(OUT) // 1024))


if __name__ == '__main__':
    main()
