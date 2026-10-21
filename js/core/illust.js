/* =========================================================
   illust.js  -  ルール説明用のイラスト部品（SVG 文字列を返す）
   座標は viewBox（横 320）基準。色はテーマ（CSS 変数）に合わせて変わる
   例： I.svg(320, 150, I.person(60, 130, { c: 0 }) + I.bubble(...))
   ========================================================= */
(function (g) {
  'use strict';
  var COLORS = ['#ef8a3c', '#1fae7a', '#3d8bff', '#ff4f8f', '#9b6bff', '#d9a21b'];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function col(c) { return typeof c === 'number' ? COLORS[c % COLORS.length] : (c || COLORS[0]); }

  var I = {
    colors: COLORS,
    svg: function (w, h, inner, label) {
      return '<svg class="ill" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '">' + inner + '</svg>';
    },
    /* 人物。x = 中心、y = 足もと。o: { c, label, eyes:'open'|'closed'|'happy'|'sad', ears(人狼), crown, hand:'up'|'left'|'right', mouth:'smile'|'o'|'flat', s(倍率) } */
    person: function (x, y, o) {
      o = o || {};
      var s = o.s || 1, c = col(o.c), out = '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">';
      // 体
      out += '<path d="M-15 0 Q-15 -26 0 -26 Q15 -26 15 0 Z" fill="' + c + '"/>';
      // 手
      if (o.hand === 'up' || o.hand === 'right') out += '<path d="M10 -18 L20 -40" stroke="' + c + '" stroke-width="6" stroke-linecap="round"/><circle cx="20.5" cy="-41" r="4" class="il-skin"/>';
      if (o.hand === 'up' || o.hand === 'left') out += '<path d="M-10 -18 L-20 -40" stroke="' + c + '" stroke-width="6" stroke-linecap="round"/><circle cx="-20.5" cy="-41" r="4" class="il-skin"/>';
      // 頭
      if (o.ears) out += '<path d="M-11 -44 L-8 -58 L-2 -47 Z M11 -44 L8 -58 L2 -47 Z" fill="' + c + '"/>';
      out += '<circle cx="0" cy="-38" r="12" class="il-skin"/>';
      if (o.crown) out += '<path d="M-9 -49 L-9 -57 L-4.5 -52 L0 -59 L4.5 -52 L9 -57 L9 -49 Z" fill="#ffd23f" stroke="#a87a00" stroke-width="1"/>';
      // 顔
      var e = o.eyes || 'open';
      if (e === 'closed') out += '<path d="M-6.5 -39 h4 M2.5 -39 h4" class="il-face" stroke-width="1.6"/>';
      else if (e === 'happy') out += '<path d="M-7 -38 q2.5 -3 5 0 M2 -38 q2.5 -3 5 0" class="il-face" stroke-width="1.6" fill="none"/>';
      else out += '<circle cx="-4.5" cy="-39" r="1.7" class="il-eye"/><circle cx="4.5" cy="-39" r="1.7" class="il-eye"/>';
      var m = o.mouth || (e === 'sad' ? 'sad' : 'smile');
      if (m === 'o') out += '<circle cx="0" cy="-32.5" r="2" class="il-eye"/>';
      else if (m === 'flat') out += '<path d="M-3 -32.5 h6" class="il-face" stroke-width="1.5"/>';
      else if (m === 'sad') out += '<path d="M-3.5 -31 q3.5 -3 7 0" class="il-face" stroke-width="1.5" fill="none"/>';
      else out += '<path d="M-3.5 -33.5 q3.5 3.5 7 0" class="il-face" stroke-width="1.5" fill="none"/>';
      out += '</g>';
      if (o.label) out += '<text x="' + x + '" y="' + (y + 13 * s) + '" text-anchor="middle" class="il-cap" font-size="' + (10 * s) + '">' + esc(o.label) + '</text>';
      return out;
    },
    /* カード（お題札）。o: { fill, stroke, size, color, rot, sub } */
    card: function (x, y, w, h, text, o) {
      o = o || {};
      var out = '<g' + (o.rot ? ' transform="rotate(' + o.rot + ' ' + (x + w / 2) + ' ' + (y + h / 2) + ')"' : '') + '>';
      out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (o.r != null ? o.r : 7) + '" style="fill:' + (o.fill || 'var(--bg2)') + ';stroke:' + (o.stroke || 'var(--accent)') + '" stroke-width="' + (o.sw || 2) + '"/>';
      if (o.sub) out += '<text x="' + (x + w / 2) + '" y="' + (y + 13) + '" text-anchor="middle" font-size="8.5"' +
        (o.color ? ' style="fill:' + o.color + '" opacity=".7"' : ' class="il-dim"') + '>' + esc(o.sub) + '</text>';
      out += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + (o.sub ? 7 : 4)) + '" text-anchor="middle" font-weight="800" font-size="' + (o.size || 12) + '" style="fill:' + (o.color || 'currentColor') + '">' + esc(text) + '</text>';
      return out + '</g>';
    },
    /* スマホ */
    phone: function (x, y, w, h, inner) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" style="fill:var(--bg2);stroke:currentColor" stroke-width="2" opacity=".95"/>' +
        '<rect x="' + (x + w / 2 - 6) + '" y="' + (y + 3) + '" width="12" height="2.5" rx="1.2" style="fill:currentColor" opacity=".35"/>' + (inner || '');
    },
    /* 吹き出し。tail: 'bl' | 'br' | 'b' | 'l' | 'r'。o: { fill, stroke, size, color, think(考え中の泡) } */
    bubble: function (x, y, w, h, text, tail, o) {
      o = o || {};
      var fill = o.fill || 'var(--bg2)', st = o.stroke || 'currentColor';
      var out = '';
      if (o.think) {
        var tx = tail === 'br' ? x + w - 10 : x + 10;
        out += '<circle cx="' + tx + '" cy="' + (y + h + 6) + '" r="3" style="fill:' + fill + ';stroke:' + st + '" stroke-width="1.3" opacity=".9"/>';
        out += '<circle cx="' + (tx + (tail === 'br' ? 4 : -4)) + '" cy="' + (y + h + 12) + '" r="1.8" style="fill:' + fill + ';stroke:' + st + '" stroke-width="1.2" opacity=".9"/>';
      } else {
        var p = tail === 'br' ? [x + w - 18, y + h, x + w - 6, y + h + 9, x + w - 8, y + h]
          : tail === 'b' ? [x + w / 2 - 6, y + h, x + w / 2, y + h + 9, x + w / 2 + 6, y + h]
          : tail === 'l' ? [x, y + h / 2 - 5, x - 8, y + h / 2 + 2, x, y + h / 2 + 4]
          : tail === 'r' ? [x + w, y + h / 2 - 5, x + w + 8, y + h / 2 + 2, x + w, y + h / 2 + 4]
          : [x + 8, y + h, x + 6, y + h + 9, x + 18, y + h];
        out += '<path d="M' + p[0] + ' ' + p[1] + ' L' + p[2] + ' ' + p[3] + ' L' + p[4] + ' ' + p[5] + '" style="fill:' + fill + ';stroke:' + st + '" stroke-width="1.5" stroke-linejoin="round"/>';
      }
      out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(10, h / 2) + '" style="fill:' + fill + ';stroke:' + st + '" stroke-width="1.5"/>';
      if (!o.think && tail) {   // しっぽのつなぎ目を消す
        var cx = tail === 'br' ? x + w - 13 : tail === 'b' ? x + w / 2 : tail === 'l' ? x : tail === 'r' ? x + w : x + 13;
        var cy = (tail === 'l' || tail === 'r') ? y + h / 2 : y + h;
        out += (tail === 'l' || tail === 'r')
          ? '<rect x="' + (cx - 1.5) + '" y="' + (cy - 4) + '" width="3" height="7" style="fill:' + fill + '"/>'
          : '<rect x="' + (cx - 5) + '" y="' + (cy - 1.5) + '" width="10" height="3" style="fill:' + fill + '"/>';
      }
      out += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-weight="800" font-size="' + (o.size || 11) + '" style="fill:' + (o.color || 'currentColor') + '">' + esc(text) + '</text>';
      return out;
    },
    text: function (x, y, t, o) {
      o = o || {};
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.anchor || 'middle') + '" font-size="' + (o.size || 11) + '" font-weight="' + (o.weight || 700) + '"' +
        (o.cls ? ' class="' + o.cls + '"' : '') + ' style="fill:' + (o.color || 'currentColor') + '">' + esc(t) + '</text>';
    },
    /* ○ × マーク */
    mark: function (x, y, ok, r) {
      r = r || 8;
      return ok
        ? '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="#1aa9b8" stroke-width="3"/>'
        : '<path d="M' + (x - r * .8) + ' ' + (y - r * .8) + ' L' + (x + r * .8) + ' ' + (y + r * .8) + ' M' + (x + r * .8) + ' ' + (y - r * .8) + ' L' + (x - r * .8) + ' ' + (y + r * .8) + '" stroke="#e5484d" stroke-width="3" stroke-linecap="round"/>';
    },
    arrow: function (x1, y1, x2, y2, o) {
      o = o || {};
      var a = Math.atan2(y2 - y1, x2 - x1), L = 7;
      var h1 = [x2 - L * Math.cos(a - 0.5), y2 - L * Math.sin(a - 0.5)], h2 = [x2 - L * Math.cos(a + 0.5), y2 - L * Math.sin(a + 0.5)];
      return '<path d="M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' M' + h1[0] + ' ' + h1[1] + ' L' + x2 + ' ' + y2 + ' L' + h2[0] + ' ' + h2[1] + '" fill="none" style="stroke:' + (o.color || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="' + (o.op || 0.55) + '"' + (o.dash ? ' stroke-dasharray="4 3"' : '') + '/>';
    },
    /* 得点バッジ */
    badge: function (x, y, t, c) {
      var w = 10 + String(t).length * 7;
      return '<rect x="' + (x - w / 2) + '" y="' + (y - 9) + '" width="' + w + '" height="18" rx="9" fill="' + (c || '#d9a21b') + '"/>' +
        '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="10.5" font-weight="900" fill="#fff">' + esc(t) + '</text>';
    },
    /* 枠つきの図（説明文つき） */
    fig: function (svg, caption) {
      return '<figure class="ill-fig">' + svg + (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
    }
  };
  g.OdaiIllust = I;
})(window);
