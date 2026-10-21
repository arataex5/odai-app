/* =========================================================
   app.js  -  お題ボックス 共通フレームワーク
   - ゲーム登録（OdaiApp.registerGame）と、ゲーム選択画面（ハブ）
   - 各ゲーム共通の画面：タイトル / ルール説明 / お題リスト / お題の追加・削除 / 履歴 / 設定
   - 共通部品：プレイヤー設定カード / 順番に画面を見せる / 文字入力シート / 回答リスト / タイマー
   ゲームの作り方は js/games/_template.js と README を参照
   ========================================================= */
(function (global) {
  'use strict';

  var S = global.OdaiStore;
  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var BRAND = { dark: ['#6a4cf0', '#8f74ff'], light: ['#5536d8', '#7357f0'] };

  var games = [];           // 登録順
  var byId = {};
  var cur = null;           // 選択中のゲーム
  var ctxs = {};            // gid -> ctx
  var nav = { current: null, stack: [] };
  var onEnter = {};
  var ui = {
    set: null, listFilter: 'all', listQuery: '',
    editMode: false, editingUid: null, editorSelected: [], historySelected: []
  };

  /* ------------------------- 汎用 ------------------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function showToast(msg, ms, actionLabel, onAction) {
    var t = $('toast');
    t.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'toast-text';
    span.textContent = msg;
    t.appendChild(span);
    if (actionLabel && onAction) {
      var b = document.createElement('button');
      b.className = 'toast-action';
      b.textContent = actionLabel;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation(); clearTimeout(t._tm); t.hidden = true; onAction();
      });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, ms || 1800);
  }
  var modalCb = { yes: null, no: null };
  function confirmDialog(text, onYes, onNo, labels) {
    $('modal-text').textContent = text;
    $('modal-yes').textContent = (labels && labels[0]) || 'はい';
    $('modal-no').textContent = (labels && labels[1]) || 'いいえ';
    modalCb.yes = onYes || null;
    modalCb.no = onNo || null;
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; modalCb.yes = modalCb.no = null; }
  function infoDialog(title, html) {
    $('info-title').textContent = title;
    $('info-text').innerHTML = html;
    $('info').hidden = false;
  }
  function closeInfo() { $('info').hidden = true; }

  /* 文字を枠に収める */
  function fitText(el, maxPx, minPx) {
    if (!el) return;
    requestAnimationFrame(function () {
      var max = maxPx || 44, min = minPx || 15;
      el.style.fontSize = max + 'px';
      var size = max, guard = 0;
      while (guard < 80 && size > min &&
             (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        size -= 1; guard++;
        el.style.fontSize = size + 'px';
      }
    });
  }

  /* ------------------------- テーマ・色 ------------------------- */
  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  /* ゲーム側の追加テーマ（例：人狼モードの夜テーマ）。game.theme(ctx) -> { cls, color } */
  var themeCls = '';
  function gameTheme() {
    if (!cur || nav.current === 'hub' || !cur.theme) return null;
    return cur.theme(ctxOf(cur)) || null;
  }
  function applyGameTheme() {
    if (themeCls) document.body.classList.remove(themeCls);
    themeCls = '';
    var t = gameTheme();
    if (t && t.cls) { themeCls = t.cls; document.body.classList.add(t.cls); }
  }
  function applyColors() {
    var light = (S.settings.theme === 'light');
    var t = gameTheme();
    var c = (t && t.color) ? t.color : (cur && nav.current !== 'hub' && cur.color) ? cur.color : BRAND;
    var pair = light ? (c.light || c.dark) : c.dark;
    var st = document.body.style;
    st.setProperty('--accent', pair[0]);
    st.setProperty('--accent-lt', pair[1]);
    var rgb = hexToRgb(pair[0]).join(',');
    st.setProperty('--accent-rgb', rgb);
    st.setProperty('--glow', 'rgba(' + rgb + ',' + (light ? '.22' : '.32') + ')');
  }
  function applyTheme() {
    var light = (S.settings.theme === 'light');
    document.body.classList.toggle('light', light);
    $$('.btn-theme').forEach(function (b) { b.textContent = light ? '🌙' : '☀'; });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f4f5fa' : '#0b0d1c');
    applyColors();
  }
  function toggleTheme() {
    S.settings.theme = (S.settings.theme === 'light') ? 'dark' : 'light';
    S.saveSettings();
    applyTheme();
  }

  /* ------------------------- 画面遷移 ------------------------- */
  function show(name, opts) {
    opts = opts || {};
    if (global.OdaiTimer) global.OdaiTimer.pauseAll();
    if (nav.current && !opts.replace && nav.current !== name) nav.stack.push(nav.current);
    if (opts.resetStack) nav.stack = [];
    var el = $('screen-' + name);
    if (!el) return;
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    el.classList.add('active');
    nav.current = name;
    document.body.classList.toggle('at-hub', name === 'hub');
    applyGameTheme();
    applyColors();
    var sc = el.querySelector('.scroll-area');
    if (sc && !opts.keepScroll) sc.scrollTop = 0;
    if (onEnter[name]) onEnter[name](opts);
  }
  function goBack() {
    var prev = nav.stack.pop() || 'title';
    if (!$('screen-' + prev)) prev = 'title';
    if (global.OdaiTimer) global.OdaiTimer.pauseAll();
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + prev).classList.add('active');
    nav.current = prev;
    document.body.classList.toggle('at-hub', prev === 'hub');
    applyGameTheme();
    applyColors();
    if (onEnter[prev]) onEnter[prev]({ back: true });
  }
  function goTitle() { show('title', { resetStack: true }); }
  function goHub() { show('hub', { resetStack: true }); }
  function isPlayScreen(name) {
    if (!name) return false;
    if (name === 'reveal') return true;
    return !!(cur && name.indexOf(cur.id + '-') === 0);
  }

  /* =========================================================
     ゲーム登録
     ========================================================= */
  function registerGame(def) {
    if (!def || !def.id || byId[def.id]) return;
    def.sets = def.sets || [];
    def.sets.forEach(function (s) {
      s.fields = s.fields || [{ key: 'text', label: 'お題' }];
      if (s.fields[0].key !== 'text') s.fields[0].key = 'text';
    });
    games.push(def);
    byId[def.id] = def;
  }

  function selectGame(gid) {
    var g = byId[gid];
    if (!g) return;
    cur = g;
    ui.set = g.sets.length ? g.sets[0].id : null;
    ui.listFilter = 'all'; ui.listQuery = '';
    S.settings.lastGame = gid; S.saveSettings();
    document.body.dataset.game = gid;
  }

  function buildGameScreens() {
    var host = $('game-screens');
    games.forEach(function (g) {
      Object.keys(g.screens || {}).forEach(function (name) {
        var sc = g.screens[name];
        var sec = document.createElement('section');
        sec.className = 'screen' + (sc.dark ? ' dark' : '') + (sc.cls ? ' ' + sc.cls : '');
        sec.id = 'screen-' + g.id + '-' + name;
        sec.innerHTML = sc.html || '';
        host.appendChild(sec);
        if (sc.enter) onEnter[g.id + '-' + name] = function (opts) { sc.enter(ctxOf(g), opts || {}); };
      });
    });
    games.forEach(function (g) { if (g.init) g.init(ctxOf(g)); });
  }

  /* 画面上部バー（ゲーム側の HTML 用） */
  function topbar(o) {
    o = o || {};
    var left = '';
    if (o.back === 'title-confirm') left = '<button class="chip back" data-title-confirm="1">‹ タイトルへ戻る</button>';
    else if (o.back === 'title') left = '<button class="chip back" data-title="1">‹ タイトルへ戻る</button>';
    else if (o.back === 'back') left = '<button class="chip back" data-back="1">‹ 戻る</button>';
    else if (o.backHtml) left = o.backHtml;
    return '<header class="topbar">' +
      '<div class="tb-left">' + left + '</div>' +
      (o.title ? '<div class="tb-title">' + o.title + '</div>' : '') +
      '<div class="tb-right">' + (o.right || '') + '<button class="chip icon-chip btn-orient" aria-label="画面の向き">⟳</button></div>' +
      '</header>';
  }

  /* ルール説明用の流れ図（ラベルの配列から SVG を作る） */
  function figFlow(labels, subs) {
    var n = labels.length, W = 320, step = W / n, h = 78;
    var out = '<svg viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="ゲームの流れ">';
    out += '<g font-size="11" font-weight="700" text-anchor="middle" fill="currentColor">';
    labels.forEach(function (lb, i) {
      var cx = step * i + step / 2, last = (i === n - 1);
      out += '<circle cx="' + cx + '" cy="28" r="21" fill="none" stroke-width="2" style="stroke:' +
        (last ? 'var(--accent)' : 'currentColor') + ';opacity:' + (last ? 1 : 0.45) + '"/>';
      out += '<text x="' + cx + '" y="32"' + (last ? ' style="fill:var(--accent-lt)"' : '') + '>' + esc(lb) + '</text>';
      if (subs && subs[i]) out += '<text x="' + cx + '" y="68" opacity=".6">' + esc(subs[i]) + '</text>';
      if (i < n - 1) out += '<path d="M' + (cx + 24) + ' 28 h' + (step - 48) + '" stroke="currentColor" stroke-width="2" opacity=".35"/>';
    });
    out += '</g></svg>';
    return out;
  }

  /* =========================================================
     数値入力 / 並べ替え（LINQ と同じ操作感）
     ========================================================= */
  function bindNumberField(el, opts) {
    if (!el) return;
    var min = opts.min, max = opts.max;
    function flagError() {
      el.classList.add('err');
      clearTimeout(el._errTm);
      el._errTm = setTimeout(function () { el.classList.remove('err'); }, 900);
      showToast(min + '〜' + max + ' の範囲で入力してください', 1500);
    }
    el.addEventListener('input', function () {
      var digits = el.value.replace(/[^0-9]/g, '');
      if (digits !== '' && parseInt(digits, 10) > max) { digits = String(opts.get()); flagError(); }
      el.value = digits;
    });
    function commit() {
      var v = parseInt(el.value, 10);
      if (isNaN(v)) v = opts.get();
      if (v < min || v > max) flagError();
      v = Math.max(min, Math.min(max, v));
      el.value = opts.format ? opts.format(v) : v;
      if (v !== opts.get()) opts.apply(v);
    }
    el.addEventListener('change', commit);
    el.addEventListener('blur', commit);
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } });
    el.addEventListener('focus', function () {
      var before = el.value;
      setTimeout(function () { if (document.activeElement === el && el.value === before) el.select(); }, 0);
    });
  }

  function bindDragHandle(handle, listEl, onDrop) {
    handle.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      var rows = Array.prototype.slice.call(listEl.children);
      var row = handle.closest('.pl-row');
      var from = rows.indexOf(row);
      if (from < 0 || rows.length < 2) return;
      var rects = rows.map(function (r) { return r.getBoundingClientRect(); });
      var axis = (Math.abs(rects[1].left - rects[0].left) > Math.abs(rects[1].top - rects[0].top)) ? 'x' : 'y';
      var centers = rects.map(function (r) { return axis === 'x' ? (r.left + r.width / 2) : (r.top + r.height / 2); });
      var to = from;
      row.classList.add('dragging');
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
      function move(e) {
        var pos = (axis === 'x') ? e.clientX : e.clientY;
        var best = 0, bestD = Infinity;
        for (var i = 0; i < centers.length; i++) {
          var d = Math.abs(pos - centers[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best !== to) {
          rows.forEach(function (r) { r.classList.remove('drop-target'); });
          to = best;
          if (to !== from && rows[to]) rows[to].classList.add('drop-target');
        }
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        row.classList.remove('dragging');
        rows.forEach(function (r) { r.classList.remove('drop-target'); });
        if (to !== from) onDrop(from, to);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function counterHtml(cls, aria, value) {
    return '<div class="counter">' +
      '<button type="button" class="cbtn ' + cls + '-minus" aria-label="' + aria + 'を減らす">−</button>' +
      '<input class="cnum-input ' + cls + '-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" aria-label="' + aria + '" value="' + value + '">' +
      '<button type="button" class="cbtn ' + cls + '-plus" aria-label="' + aria + 'を増やす">＋</button>' +
      '</div>';
  }
  function bindCounter(root, cls, o) {
    var inp = root.querySelector('.' + cls + '-input');
    root.querySelector('.' + cls + '-minus').addEventListener('click', function () {
      var v = o.get() - (o.step || 1);
      if (o.wrap && v < o.min) v = o.max - ((o.max - o.min) % (o.step || 1));
      o.apply(Math.max(o.min, v));
    });
    root.querySelector('.' + cls + '-plus').addEventListener('click', function () {
      var v = o.get() + (o.step || 1);
      if (o.wrap && v > o.max) v = o.min;
      o.apply(Math.min(o.max, v));
    });
    bindNumberField(inp, o);
  }

  /* =========================================================
     共通部品：プレイヤー設定カード
     opts: { min, max, note(n) -> html, label }
     ========================================================= */
  function playersCard(g, box, opts) {
    opts = opts || {};
    var min = opts.min || (g.players && g.players.min) || 2;
    var max = Math.min(S.maxPlayers, opts.max || (g.players && g.players.max) || 10);
    var gs = S.gs(g.id);
    if (!gs.playerCount) gs.playerCount = (g.players && g.players.def) || min;
    gs.playerCount = Math.max(min, Math.min(max, gs.playerCount));

    function render() {
      var n = gs.playerCount;
      box.innerHTML =
        '<div class="card">' +
          '<div class="players-head"><span class="ph-label">プレイヤー人数</span>' + counterHtml('pc', 'プレイヤー人数（' + min + '〜' + max + '）', n) + '</div>' +
          (opts.note ? '<p class="roles-line">' + opts.note(n) + '</p>' : '') +
          '<div class="pl-head"><span class="plh-no">' + (opts.orderLabel || '順番') + '</span><span class="plh-name">プレイヤー名</span>' +
            '<button type="button" class="chip mini" data-shuffle="1">順番をシャッフル</button></div>' +
          '<div class="pl-list"></div>' +
          '<p class="row-hint">番号をドラッグすると順番を入れ替えられます。プレイヤー名は全ゲーム共通で保存されます。</p>' +
        '</div>';
      var list = box.querySelector('.pl-list');
      for (var i = 0; i < n; i++) {
        (function (i) {
          var row = document.createElement('div');
          row.className = 'pl-row';
          row.innerHTML = '<div class="pl-no draggable">' + (i + 1) + '<span class="grip">⋮⋮</span></div>' +
            '<input class="pl-name" type="text" maxlength="12" placeholder="プレイヤー' + (i + 1) + '" value="' + esc(S.players.names[i] || '') + '">';
          row.querySelector('input').addEventListener('input', function () { S.setPlayerName(i, this.value); });
          bindDragHandle(row.querySelector('.pl-no'), list, function (from, to) { S.movePlayer(from, to); render(); });
          list.appendChild(row);
        })(i);
      }
      bindCounter(box, 'pc', {
        min: min, max: max,
        get: function () { return gs.playerCount; },
        apply: function (v) { gs.playerCount = v; S.saveSettings(); render(); if (opts.onChange) opts.onChange(v); }
      });
      box.querySelector('[data-shuffle]').addEventListener('click', function () {
        var head = S.shuffle(S.players.names.slice(0, n));
        for (var k = 0; k < n; k++) S.players.names[k] = head[k];
        S.savePlayers(); render();
        showToast('順番をシャッフルしました', 1200);
      });
    }
    render();
    return { count: function () { return gs.playerCount; }, names: function () { return S.playerNames(gs.playerCount); }, render: render };
  }

  /* =========================================================
     共通部品：順番に画面を見せる（役職・お題の確認）
     opts: {
       items: [{ name, render(bodyEl, api) }],   // name は確認する人
       intro(item, i) -> html  （省略時「〇〇さんにスマホを渡してください」）
       nextLabel, lastLabel, onDone(), progressLabel
     }
     render 内で api.ready(false) にすると「次へ」を押せなくなる（選択が必要な画面用）
     ========================================================= */
  var rv = { items: [], i: 0, revealed: false, opts: null };
  function startReveal(opts) {
    rv.items = opts.items || [];
    rv.i = 0; rv.revealed = false; rv.opts = opts;
    show('reveal', { resetStack: true });
  }
  function rvApi() {
    return {
      ready: function (on) { $('rv-next').disabled = !on; },
      next: function () { rvNext(); },
      fit: fitText
    };
  }
  function renderRevealStage() {
    var it = rv.items[rv.i], o = rv.opts;
    if (!it) return;
    $('rv-progress').textContent = rv.items.length > 1 ? ((o.progressLabel || '確認') + '\n' + (rv.i + 1) + ' / ' + rv.items.length) : '';
    $('rv-intro').hidden = rv.revealed;
    $('rv-reveal').hidden = !rv.revealed;
    var last = (rv.i >= rv.items.length - 1);
    $('rv-next').textContent = last ? (o.lastLabel || '次へ') : (o.nextLabel || '次の人へ');
    if (!rv.revealed) {
      $('rv-msg').innerHTML = o.intro ? o.intro(it, rv.i) :
        '<span class="who">' + esc(it.name) + '</span> さんに<br>スマホを渡してください';
      $('rv-body').innerHTML = '';
      $('rv-next').disabled = true;
    }
  }
  function revealNow() {
    var it = rv.items[rv.i];
    rv.revealed = true;
    renderRevealStage();
    $('rv-name').textContent = it.name ? (it.name + ' さん') : '';
    var body = $('rv-body');
    body.innerHTML = '';
    $('rv-next').disabled = false;
    if (it.render) it.render(body, rvApi());
  }
  function rvNext() {
    if (!rv.revealed) return;
    if (rv.i >= rv.items.length - 1) {
      var done = rv.opts.onDone;
      $('rv-body').innerHTML = '';
      if (done) done();
      return;
    }
    rv.i++;
    rv.revealed = false;
    renderRevealStage();
  }
  onEnter.reveal = function () { renderRevealStage(); };

  /* =========================================================
     共通部品：文字入力シート
     ========================================================= */
  var promptCb = null;
  function promptInput(o, cb) {
    o = o || {};
    $('input-title').textContent = o.title || '入力';
    $('input-lead').innerHTML = o.lead || '';
    var inp = $('input-text');
    inp.value = o.value || '';
    inp.placeholder = o.placeholder || '';
    inp.maxLength = o.maxLength || 40;
    promptCb = cb;
    $('input-sheet').hidden = false;
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
  }
  function closePrompt() { $('input-sheet').hidden = true; promptCb = null; try { $('input-text').blur(); } catch (e) {} }

  /* =========================================================
     共通部品：回答リスト（1人ずつ、他の人に見えないように入力）
     entries: [{ name }]、answers: 配列（entries と同じ順）
     ========================================================= */
  function answerList(box, entries, answers, o) {
    o = o || {};
    function render() {
      box.innerHTML = '';
      entries.forEach(function (en, i) {
        var has = !!(answers[i] && String(answers[i]).trim());
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'ans-row' + (has ? ' done' : '');
        row.innerHTML =
          '<span class="ans-no">' + (i + 1) + '</span>' +
          '<span class="ans-name">' + esc(en.name) + '</span>' +
          '<span class="ans-state">' + (has ? '<span class="dots">●●●</span>入力済み' : '未入力') + '</span>' +
          '<span class="ans-btn">' + (has ? '修正' : '入力') + '</span>';
        row.addEventListener('click', function () {
          var open = function () {
            promptInput({
              title: en.name + ' さんの' + (o.noun || '回答'),
              lead: o.lead || '他の人に見えないように入力してください。',
              value: answers[i] || '',
              placeholder: o.placeholder || '',
              maxLength: o.maxLength || 30
            }, function (v) {
              answers[i] = v.trim();
              render();
              if (o.onChange) o.onChange(answers);
              if (v.trim()) showToast(en.name + ' さんの' + (o.noun || '回答') + 'を受け付けました', 1200);
            });
          };
          if (has) confirmDialog(en.name + ' さんですか？\n（入力した内容が表示されます）', open);
          else open();
        });
        box.appendChild(row);
      });
    }
    render();
    return {
      render: render,
      filled: function () { return entries.every(function (e, i) { return answers[i] && String(answers[i]).trim(); }); }
    };
  }

  /* =========================================================
     共通部品：お題スロット（チェンジ・一つ戻す・一つ進む）
     o.draw(avoidKeys) -> { set, topic, relaxed } | null   （avoidKeys は 'セットID|uid' の配列）
     o.onShow(entry)   表示が変わったときに呼ばれる
     使用済みになるのは「いま表示しているお題」だけ（チェンジで戻した分は取り消し）
     ========================================================= */
  function makeSlot(g, o) {
    var s = { hist: [], i: -1, bars: [] };
    function mark(e) { S.markUsed(g.id, e.set, e.topic.uid); }
    function unmark(e) { S.unmarkLast(g.id, e.set, e.topic.uid); }
    function emit() {
      if (o.onShow) o.onShow(s.hist[s.i]);
      s.bars.forEach(function (fn) { fn(); });
    }
    function go(k) {
      var cur = s.hist[s.i];
      if (cur) unmark(cur);
      s.i = k;
      mark(s.hist[k]);
      emit();
    }
    var api = {
      start: function (entry) {
        if (!entry) return false;
        s.hist = [entry]; s.i = 0;
        mark(entry);
        if (entry.relaxed) showToast('抽出できるお題が足りないため、使用済みのお題からも選んでいます', 2600);
        emit();
        return true;
      },
      change: function () {
        var avoid = s.hist.map(function (e) { return e.set + '|' + e.topic.uid; });
        var e = o.draw(avoid);
        if (!e) { showToast('これ以上チェンジできるお題がありません', 2000); return false; }
        if (e.relaxed) showToast('抽出できるお題が足りないため、使用済みのお題からも選んでいます', 2600);
        s.hist.push(e);
        go(s.hist.length - 1);
        return true;
      },
      prev: function () { if (s.i > 0) go(s.i - 1); },
      next: function () { if (s.i < s.hist.length - 1) go(s.i + 1); },
      current: function () { return s.hist[s.i] || null; },
      changed: function () { return s.hist.length > 1; },
      pos: function () { return { i: s.i, n: s.hist.length }; },
      _bar: function (fn) { s.bars.push(fn); }
    };
    return api;
  }

  /* チェンジバー：［‹ 一つ戻す］［チェンジ］［一つ進む ›］（戻す・進むはチェンジ後のみ表示） */
  function changeBar(box, slot, o) {
    o = o || {};
    box.classList.add('chg-bar');
    box.innerHTML =
      '<button type="button" class="chg-side chg-prev" hidden aria-label="一つ戻す">‹ 一つ戻す</button>' +
      '<button type="button" class="chg-btn"><span class="chg-ico" aria-hidden="true">⟳</span>' + (o.label || 'チェンジ') +
        '<span class="chg-pos" hidden></span></button>' +
      '<button type="button" class="chg-side chg-next" hidden aria-label="一つ進む">一つ進む ›</button>';
    var prev = box.querySelector('.chg-prev'), next = box.querySelector('.chg-next'), pos = box.querySelector('.chg-pos');
    function paint() {
      var p = slot.pos(), on = slot.changed();
      prev.hidden = next.hidden = pos.hidden = !on;
      box.classList.toggle('changed', on);
      prev.disabled = p.i <= 0;
      next.disabled = p.i >= p.n - 1;
      pos.textContent = (p.i + 1) + ' / ' + p.n;
    }
    box.querySelector('.chg-btn').addEventListener('click', function () {
      if (o.confirm) confirmDialog(o.confirm, function () { slot.change(); });
      else slot.change();
    });
    prev.addEventListener('click', function () { slot.prev(); });
    next.addEventListener('click', function () { slot.next(); });
    slot._bar(paint);
    paint();
    return { paint: paint };
  }

  /* =========================================================
     ctx：ゲームに渡す道具箱
     ========================================================= */
  function ctxOf(g) {
    if (ctxs[g.id]) return ctxs[g.id];
    var c = {
      game: g, gid: g.id, store: S,
      $: $, $$: $$, esc: esc, shuffle: S.shuffle, fitText: fitText,
      toast: showToast, confirm: confirmDialog, info: infoDialog,
      show: function (name, opts) { show(g.id + '-' + name, opts); },
      screen: function (name) { return $('screen-' + g.id + '-' + name); },
      goTitle: goTitle, goHub: goHub,
      settings: function () { return S.gs(g.id); },
      setSetting: function (k, v) { S.setGs(g.id, k, v); },
      draw: function (sid, k, avoid) { return S.draw(g.id, sid, k, avoid); },
      drawOne: function (sid, avoid) { return S.drawOne(g.id, sid, avoid); },
      markUsed: function (sid, uid) { return S.markUsed(g.id, sid, uid); },
      unmarkLast: function (sid, uid) { return S.unmarkLast(g.id, sid, uid); },
      /* avoidKeys（'セットID|uid'）を避けて1件引く。スロットの draw 用 */
      drawEntry: function (sid, avoidKeys) {
        var avoid = (avoidKeys || []).filter(function (k) { return k.indexOf(sid + '|') === 0; })
          .map(function (k) { return k.slice(sid.length + 1); });
        var r = S.drawOne(g.id, sid, avoid);
        return r ? { set: sid, topic: r.topic, relaxed: r.relaxed } : null;
      },
      topicSlot: function (o) { return makeSlot(g, o); },
      changeBar: changeBar,
      refreshTheme: function () { applyGameTheme(); applyColors(); },
      logo: function (key, cls, label, opts) { return global.OdaiLogo ? global.OdaiLogo(key, cls, label, opts) : ''; },
      playerCount: function () { return S.gs(g.id).playerCount || (g.players && g.players.def) || 2; },
      playerNames: function () { return S.playerNames(c.playerCount()); },
      playersCard: function (box, opts) { return playersCard(g, box, opts); },
      reveal: startReveal,
      prompt: promptInput,
      answerList: answerList,
      timer: function (container, sec, opts) { return global.OdaiTimer.create(container, sec, opts); },
      figFlow: figFlow,
      topbar: topbar,
      normalize: normalize
    };
    ctxs[g.id] = c;
    return c;
  }

  /* 判定用の文字正規化（全角半角・カタカナ→ひらがな・空白や記号の除去・小文字化） */
  function normalize(s) {
    s = String(s || '');
    try { s = s.normalize('NFKC'); } catch (e) {}
    s = s.toLowerCase();
    s = s.replace(/[ァ-ヶ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0x60); });
    s = s.replace(/[\s・･\-‐ー－―~〜!！?？。、,.「」『』()（）]/g, function (ch) { return ch === 'ー' ? 'ー' : ''; });
    return s;
  }

  /* =========================================================
     ハブ（ゲーム選択）
     ========================================================= */
  function renderHub() {
    var box = $('hub-grid');
    box.innerHTML = '';
    var dark = S.settings.theme !== 'light';
    games.forEach(function (g) {
      var c = (dark ? g.color.dark : (g.color.light || g.color.dark));
      var b = document.createElement('button');
      b.className = 'hub-card g-' + g.id + (S.settings.lastGame === g.id ? ' last' : '');
      b.style.setProperty('--c1', c[0]);
      b.style.setProperty('--c2', c[1]);
      var pl = g.players ? (g.players.min + '〜' + g.players.max + '人') : '人数自由';
      b.innerHTML =
        '<span class="hc-band" aria-hidden="true">' + esc(g.mark || g.name.charAt(0)) + '</span>' +
        '<span class="hc-main"><span class="hc-name">' +
          (global.OdaiLogo && global.OdaiLogo.has('name-' + g.id) ? global.OdaiLogo('name-' + g.id, 'hc-logo', g.name) : esc(g.name)) + '</span>' +
        '<span class="hc-sub">' + esc(g.sub || '') + '</span></span>' +
        '<span class="hc-meta">' + (S.settings.lastGame === g.id ? '<span class="hc-last">前回</span>' : '') + esc(pl) + '</span>' +
        '<span class="hc-go" aria-hidden="true">›</span>';
      b.addEventListener('click', function () { selectGame(g.id); goTitle(); });
      box.appendChild(b);
    });
    var more = document.createElement('p');
    more.className = 'hub-note';
    more.textContent = 'ボードゲームは今後も追加できます';
    box.appendChild(more);
  }
  onEnter.hub = function () { renderHub(); };

  /* ------------------------- ゲームのタイトル ------------------------- */
  onEnter.title = function () {
    if (!cur) { goHub(); return; }
    var logo = $('title-logo');
    logo.innerHTML = cur.logoHtml ? cur.logoHtml(ctxOf(cur)) : '<span>' + esc(cur.name) + '</span>';
    $('title-sub').textContent = cur.sub || '';
    var box = $('title-modes');
    box.innerHTML = '';
    if (cur.title) cur.title(ctxOf(cur), box);
    var row = document.createElement('div');
    row.className = 'mode-row';
    row.innerHTML = '<button class="btn-mode ghost" data-go="rules">ルール説明</button>';
    box.appendChild(row);
  };

  /* ------------------------- ルール説明 ------------------------- */
  onEnter.rules = function () {
    var box = $('rules-scroll');
    box.innerHTML = cur && cur.rules ? cur.rules(ctxOf(cur)) : '';
  };

  /* =========================================================
     お題リスト / 追加・削除 / 履歴 / 設定（ゲームごと）
     ========================================================= */
  function curSet() { return S.setDef(cur.id, ui.set) || cur.sets[0]; }
  function renderSetTabs(id, onPick) {
    var box = $(id);
    box.innerHTML = '';
    box.hidden = cur.sets.length < 2;
    cur.sets.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'seg-btn' + (s.id === ui.set ? ' on' : '');
      b.textContent = s.label + '（' + S.list(cur.id, s.id).length + '）';
      b.addEventListener('click', function () { ui.set = s.id; onPick(); });
      box.appendChild(b);
    });
  }
  function subText(set, t) {
    if (set.sub) return set.sub(t);
    var parts = [];
    for (var i = 1; i < set.fields.length; i++) {
      var v = t.x && t.x[set.fields[i].key];
      if (v) parts.push(v);
    }
    return parts.join(' ／ ');
  }

  function filteredTopics() {
    var q = ui.listQuery.trim(), set = curSet();
    return S.list(cur.id, set.id).filter(function (t) {
      if (ui.listFilter === 'fav' && !t.fav) return false;
      if (ui.listFilter === 'ex' && !t.ex) return false;
      if (q && t.text.indexOf(q) < 0 && String(t.no).indexOf(q) < 0 && subText(set, t).indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderTopicList() {
    var set = curSet();
    renderSetTabs('list-tabs', renderTopicList);
    $('list-col-label').textContent = set.fields[0].label;
    var ul = $('topic-list');
    ul.innerHTML = '';
    var list = filteredTopics();
    $('btn-filter-fav').classList.toggle('on', ui.listFilter === 'fav');
    $('btn-filter-ex').classList.toggle('on', ui.listFilter === 'ex');
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = '該当するお題がありません。';
      ul.appendChild(p);
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'li' + (t.master ? ' master' : '');
      var sub = subText(set, t);
      li.innerHTML =
        '<button class="li-heart' + (t.fav ? ' on' : '') + '" aria-label="お気に入り">' + (t.fav ? '♥' : '♡') + '</button>' +
        '<span class="li-no">' + t.no + '</span>' +
        '<span class="li-main">' + esc(t.text) +
          (sub ? '<span class="li-sub">' + esc(sub) + '</span>' : '') +
          (t.used ? '<span class="li-sub used">使用済み</span>' : '') + '</span>' +
        '<label class="li-check"><input type="checkbox"' + (t.ex ? ' checked' : '') + '><span class="cbox"></span></label>';
      li.querySelector('.li-heart').addEventListener('click', function (ev) {
        ev.stopPropagation();
        S.toggleFav(cur.id, set.id, t.uid);
        this.classList.toggle('on', t.fav);
        this.textContent = t.fav ? '♥' : '♡';
        if (ui.listFilter === 'fav') renderTopicList();
      });
      li.querySelector('input[type="checkbox"]').addEventListener('change', function () {
        S.toggleEx(cur.id, set.id, t.uid);
        if (ui.listFilter === 'ex') renderTopicList();
      });
      frag.appendChild(li);
    });
    ul.appendChild(frag);
  }
  onEnter.list = function () { renderTopicList(); };

  function renderEditor() {
    var set = curSet();
    renderSetTabs('editor-tabs', function () { ui.editorSelected = []; closeAddForm(); renderEditor(); });
    var ul = $('editor-list');
    ul.innerHTML = '';
    $('btn-edit-mode').textContent = ui.editMode ? '完了' : '編集';
    $('btn-edit-mode').classList.toggle('on', ui.editMode);
    $('editor-delete-bar').hidden = !ui.editMode;
    var frag = document.createDocumentFragment();
    S.list(cur.id, set.id).forEach(function (t) {
      var li = document.createElement('li');
      var sel = ui.editorSelected.indexOf(t.uid) > -1;
      var sub = subText(set, t);
      li.className = 'li' + (t.master ? ' master' : '') + (sel ? ' sel' : '');
      li.innerHTML =
        (ui.editMode && !t.master ? '<span class="li-pick"></span>' : '<span class="li-no">' + t.no + '</span>') +
        '<span class="li-main">' + esc(t.text) + (sub ? '<span class="li-sub">' + esc(sub) + '</span>' : '') + '</span>' +
        (t.master ? '<span class="li-badge">標準</span>' : '<span class="li-badge used">追加</span>');
      li.addEventListener('click', function () {
        if (ui.editMode) {
          if (t.master) { showToast('標準のお題は削除できません', 1400); return; }
          var i = ui.editorSelected.indexOf(t.uid);
          if (i > -1) ui.editorSelected.splice(i, 1); else ui.editorSelected.push(t.uid);
          renderEditor();
        } else if (!t.master) openAddForm(t);
        else showToast('標準のお題は編集できません', 1400);
      });
      frag.appendChild(li);
    });
    ul.appendChild(frag);
  }
  function openAddForm(topic) {
    var set = curSet();
    ui.editingUid = topic ? topic.uid : null;
    $('af-title').textContent = (topic ? '編集' : '追加') + '：' + set.label;
    var box = $('af-fields');
    box.innerHTML = '';
    set.fields.forEach(function (f, i) {
      var val = topic ? (i === 0 ? topic.text : (topic.x && topic.x[f.key]) || '') : '';
      var lab = document.createElement('label');
      lab.className = 'af-label';
      lab.textContent = f.label + (i > 0 && !f.required ? '（任意）' : '');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = f.maxLength || 60;
      inp.dataset.key = f.key;
      inp.placeholder = f.placeholder || '';
      inp.value = val;
      box.appendChild(lab);
      box.appendChild(inp);
      if (f.hint) {
        var h = document.createElement('p');
        h.className = 'af-hint'; h.textContent = f.hint;
        box.appendChild(h);
      }
    });
    $('add-form').hidden = false;
    $('btn-add-open').hidden = true;
    setTimeout(function () {
      var first = box.querySelector('input');
      if (first) { try { first.focus(); } catch (e) {} }
      $('add-form').scrollIntoView({ block: 'nearest' });
    }, 50);
  }
  function closeAddForm() {
    ui.editingUid = null;
    $('add-form').hidden = true;
    $('btn-add-open').hidden = false;
  }
  onEnter.editor = function () { closeAddForm(); ui.editorSelected = []; renderEditor(); };

  function renderHistory() {
    var ul = $('history-list');
    ul.innerHTML = '';
    var hist = S.history[cur.id] || [];
    if (!hist.length) {
      var p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = 'まだ履歴がありません。\nゲームで使用したお題がここに表示されます。';
      ul.appendChild(p);
      return;
    }
    var multi = cur.sets.length > 1;
    hist.slice().reverse().forEach(function (h, ri) {
      var i = hist.length - 1 - ri;
      var id = String(h.ts) + '_' + i;
      var sel = ui.historySelected.indexOf(id) > -1;
      var d = new Date(h.ts || 0);
      var ds = isNaN(d.getTime()) ? '' :
        '<span class="ld-d">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
        '<span class="ld-t">' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</span>';
      var setDef = S.setDef(cur.id, h.set);
      var li = document.createElement('li');
      li.className = 'li' + (sel ? ' sel' : '');
      li.innerHTML =
        '<span class="li-pick"></span>' +
        '<span class="li-no">' + h.no + '</span>' +
        '<span class="li-main">' + esc(h.text) +
          (multi && setDef ? '<span class="li-sub">' + esc(setDef.label) + '</span>' : '') + '</span>' +
        '<span class="li-date">' + ds + '</span>';
      li.addEventListener('click', function () {
        var k = ui.historySelected.indexOf(id);
        if (k > -1) ui.historySelected.splice(k, 1); else ui.historySelected.push(id);
        li.classList.toggle('sel', k < 0);
      });
      ul.appendChild(li);
    });
  }
  onEnter.history = function () { ui.historySelected = []; renderHistory(); };

  /* ---------- 設定 ---------- */
  function updatePoolInfo() {
    var lines = cur.sets.map(function (s) {
      var all = S.list(cur.id, s.id);
      var used = all.filter(function (t) { return t.used; }).length;
      var fav = all.filter(function (t) { return t.fav; }).length;
      return (cur.sets.length > 1 ? '【' + s.label + '】' : '') +
        '抽出対象：' + S.pool(cur.id, s.id).length + ' 件 ／ 登録 ' + all.length + ' 件（使用済み ' + used + ' 件・お気に入り ' + fav + ' 件）';
    });
    $('pool-info').innerHTML = lines.map(esc).join('<br>');
  }
  function renderGameSettings() {
    var box = $('settings-game');
    var defs = cur.settings || [];
    box.hidden = !defs.length;
    box.innerHTML = '';
    var gs = S.gs(cur.id);
    defs.forEach(function (d) {
      if (d.showIf && !gs[d.showIf]) return;
      var row = document.createElement('div');
      row.className = 'set-row' + (d.showIf ? ' indent' : '');
      if (d.type === 'bool') {
        row.innerHTML = '<label class="check-row"><input type="checkbox"' + (gs[d.key] ? ' checked' : '') + '>' +
          '<span class="cbox"></span><span class="check-text">' + esc(d.label) + '</span></label>';
        row.querySelector('input').addEventListener('change', function () {
          S.setGs(cur.id, d.key, this.checked); renderGameSettings();
        });
      } else if (d.type === 'time') {
        var v = gs[d.key] || d.def || 60;
        var m = Math.floor(v / 60), s = v % 60;
        row.innerHTML = '<div class="row-line"><label class="row-label nomb">' + esc(d.label) + '</label>' +
          '<div class="time-set">' + counterHtml('tm-m', '分', m) + '<span class="unit">分</span>' +
          counterHtml('tm-s', '秒', ('0' + s).slice(-2)) + '<span class="unit">秒</span></div></div>';
        var apply = function (mm, ss) {
          var total = Math.max(5, Math.min(59 * 60 + 59, mm * 60 + ss));
          S.setGs(cur.id, d.key, total); renderGameSettings();
        };
        bindCounter(row, 'tm-m', { min: 0, max: 59, get: function () { return m; }, apply: function (x) { apply(x, s); } });
        bindCounter(row, 'tm-s', { min: 0, max: 59, step: 5, wrap: true, format: function (x) { return ('0' + x).slice(-2); },
          get: function () { return s; }, apply: function (x) { apply(m, x); } });
      } else if (d.type === 'seg') {
        var html = '<label class="row-label">' + esc(d.label) + '</label><div class="seg">';
        d.options.forEach(function (op) {
          html += '<button type="button" class="seg-btn' + (gs[d.key] === op[0] ? ' on' : '') + '" data-val="' + esc(op[0]) + '">' + esc(op[1]) + '</button>';
        });
        row.innerHTML = html + '</div>';
        row.querySelector('.seg').addEventListener('click', function (ev) {
          var b = ev.target.closest('.seg-btn'); if (!b) return;
          S.setGs(cur.id, d.key, b.dataset.val); renderGameSettings();
        });
      } else if (d.type === 'number') {
        row.innerHTML = '<div class="row-line"><label class="row-label nomb">' + esc(d.label) + '</label>' +
          counterHtml('nb', d.label, gs[d.key]) + '</div>';
        bindCounter(row, 'nb', { min: d.min, max: d.max, get: function () { return gs[d.key]; },
          apply: function (x) { S.setGs(cur.id, d.key, x); renderGameSettings(); } });
      }
      if (d.hint) {
        var hp = document.createElement('p');
        hp.className = 'row-hint'; hp.textContent = d.hint;
        row.appendChild(hp);
      }
      box.appendChild(row);
    });
  }
  onEnter.settings = function () {
    var gs = S.gs(cur.id);
    $('settings-title').textContent = '設定（' + cur.name + '）';
    renderGameSettings();
    $('set-exclude-used').checked = !!gs.excludeUsed;
    $('set-favorite-only').checked = !!gs.favoriteOnly;
    $('set-use-exclusion').checked = !!gs.useExclusion;
    updatePoolInfo();
    var src = cur.sets.every(function (s) { return S.source[cur.id + '/' + s.id] === 'csv'; }) ? 'CSV読込' : '内蔵データ';
    $('version-info').textContent = 'お題ボックス v' + (S.version || '-') + '　/　お題データ：' + src;
  };

  /* =========================================================
     イベント登録
     ========================================================= */
  function bind() {
    document.addEventListener('click', function (ev) {
      var help = ev.target.closest('[data-help]');
      if (help) {
        var h = cur && cur.help && cur.help[help.dataset.help];
        if (h) infoDialog(h[0], h[1]);
        return;
      }
      if (ev.target.closest('.btn-theme')) { toggleTheme(); if (nav.current === 'hub') renderHub(); return; }
      var go = ev.target.closest('[data-go]');
      if (go) { show(go.dataset.go); return; }
      if (ev.target.closest('[data-back]')) { goBack(); return; }
      if (ev.target.closest('[data-hub]')) { goHub(); return; }
      if (ev.target.closest('[data-title]')) { goTitle(); return; }
      if (ev.target.closest('[data-title-confirm]')) {
        confirmDialog('タイトルへ戻りますか？\n進行中のゲームは終了します。', goTitle);
        return;
      }
      if (ev.target.closest('.btn-orient')) {
        document.body.classList.toggle('rotated');
        showToast(document.body.classList.contains('rotated') ? '横画面レイアウト' : '縦画面レイアウト', 1200);
        setTimeout(function () { window.dispatchEvent(new Event('odai:resize')); }, 80);
        return;
      }
    });

    // モーダル
    $('modal-yes').addEventListener('click', function () { var cb = modalCb.yes; closeModal(); if (cb) cb(); });
    $('modal-no').addEventListener('click', function () { var cb = modalCb.no; closeModal(); if (cb) cb(); });
    $('modal').addEventListener('click', function (ev) { if (ev.target === this) { var cb = modalCb.no; closeModal(); if (cb) cb(); } });
    $('info-ok').addEventListener('click', closeInfo);
    $('info').addEventListener('click', function (ev) { if (ev.target === this) closeInfo(); });
    $('timeup-ok').addEventListener('click', function () { $('timeup').hidden = true; global.OdaiTimer.stopAlarm(); });

    // 入力シート
    $('input-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var cb = promptCb, v = $('input-text').value;
      closePrompt();
      if (cb) cb(v);
    });
    $('input-cancel').addEventListener('click', closePrompt);

    // 順番に画面を見せる
    $('rv-tap').addEventListener('click', function () {
      if (rv.revealed) return;
      var it = rv.items[rv.i];
      if (!it) return;
      if (it.name && rv.opts.confirm !== false) confirmDialog('あなたは' + it.name + 'さんですか？', revealNow);
      else revealNow();
    });
    $('rv-next').addEventListener('click', rvNext);

    // お題リスト
    $('btn-filter-fav').addEventListener('click', function () { ui.listFilter = (ui.listFilter === 'fav') ? 'all' : 'fav'; renderTopicList(); });
    $('btn-filter-ex').addEventListener('click', function () { ui.listFilter = (ui.listFilter === 'ex') ? 'all' : 'ex'; renderTopicList(); });
    $('list-search').addEventListener('input', function () { ui.listQuery = this.value; renderTopicList(); });

    // お題の追加・削除
    $('btn-edit-mode').addEventListener('click', function () {
      ui.editMode = !ui.editMode; ui.editorSelected = []; closeAddForm(); renderEditor();
    });
    $('btn-add-open').addEventListener('click', function () { openAddForm(null); });
    $('af-cancel').addEventListener('click', closeAddForm);
    $('add-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var set = curSet(), text = '', x = {};
      $$('#af-fields input').forEach(function (inp) {
        if (inp.dataset.key === 'text') text = inp.value.trim();
        else x[inp.dataset.key] = inp.value.trim();
      });
      if (!text) { showToast(set.fields[0].label + 'を入力してください', 1400); return; }
      var editing = !!ui.editingUid;
      if (editing) S.updateTopic(cur.id, set.id, ui.editingUid, text, x);
      else S.addTopic(cur.id, set.id, text, x);
      closeAddForm();
      renderEditor();
      showToast(editing ? '保存しました' : '追加しました', 1200);
    });
    $('btn-delete-selected').addEventListener('click', function () {
      if (!ui.editorSelected.length) { showToast('削除するお題を選んでください', 1400); return; }
      confirmDialog(ui.editorSelected.length + ' 件のお題を削除しますか？', function () {
        S.deleteTopics(cur.id, curSet().id, ui.editorSelected);
        ui.editorSelected = [];
        renderEditor();
        showToast('削除しました', 1200);
      });
    });

    // 履歴
    $('btn-history-clear').addEventListener('click', function () {
      if (!(S.history[cur.id] || []).length) { showToast('履歴はありません', 1200); return; }
      confirmDialog('履歴をすべて削除しますか？\n（使用済みの状態も解除されます）', function () {
        var gid = cur.id, removed = S.clearHistory(gid);
        renderHistory();
        showToast('履歴を全削除しました', 3000, '元に戻す', function () { S.restoreHistory(gid, removed); renderHistory(); });
      });
    });
    $('btn-history-trash').addEventListener('click', function () {
      if (!ui.historySelected.length) { showToast('削除する履歴を選んでください', 1400); return; }
      var gid = cur.id, removed = S.deleteHistory(gid, ui.historySelected.slice());
      ui.historySelected = [];
      renderHistory();
      showToast(removed.length + ' 件削除しました', 3000, '元に戻す', function () { S.restoreHistory(gid, removed); renderHistory(); });
    });

    // 設定
    $('set-exclude-used').addEventListener('change', function () { S.setGs(cur.id, 'excludeUsed', this.checked); updatePoolInfo(); });
    $('set-favorite-only').addEventListener('change', function () { S.setGs(cur.id, 'favoriteOnly', this.checked); updatePoolInfo(); });
    $('set-use-exclusion').addEventListener('change', function () { S.setGs(cur.id, 'useExclusion', this.checked); updatePoolInfo(); });

    // インストール導線
    $('btn-install-open').addEventListener('click', function () { $('install-sheet').hidden = false; });
    $('install-close').addEventListener('click', function () { $('install-sheet').hidden = true; });
    $('install-sheet').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });

    // リサイズ / 回転（ゲーム側は 'odai:resize' を受けて文字サイズを調整）
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { window.dispatchEvent(new Event('odai:resize')); }, 200);
    });

    // Android の戻るボタン（Capacitor / APK）
    try {
      var CapApp = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      if (CapApp && CapApp.addListener) {
        CapApp.addListener('backButton', function () {
          if (!$('timeup').hidden) { $('timeup').hidden = true; global.OdaiTimer.stopAlarm(); return; }
          if (!$('modal').hidden) { var cb = modalCb.no; closeModal(); if (cb) cb(); return; }
          if (!$('info').hidden) { closeInfo(); return; }
          if (!$('input-sheet').hidden) { closePrompt(); return; }
          if (!$('install-sheet').hidden) { $('install-sheet').hidden = true; return; }
          if (isPlayScreen(nav.current)) {
            confirmDialog('タイトルへ戻りますか？\n進行中のゲームは終了します。', goTitle);
            return;
          }
          if (nav.current === 'title') { goHub(); return; }
          if (nav.current && nav.current !== 'hub') { goBack(); return; }
          try { S.flush(); } catch (e) {}
          setTimeout(function () { if (CapApp.exitApp) CapApp.exitApp(); }, 180);
        });
      }
    } catch (e) {}

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { try { S.flush(); } catch (e) {} }
    });
    window.addEventListener('pagehide', function () { try { S.flush(); } catch (e) {} });

    // iOS のピンチ / ダブルタップズーム抑止
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (e) {
      document.addEventListener(e, function (ev) { ev.preventDefault(); }, { passive: false });
    });
    var lastTouch = 0;
    document.addEventListener('touchend', function (ev) {
      var now = Date.now();
      if (now - lastTouch <= 300 && !ev.target.closest('input,textarea')) ev.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  function initInstallButton() {
    var btn = $('btn-install-open');
    if (!btn) return;
    btn.hidden = true;
    var apk = (S.apk || { path: './download/odai-box.apk', mode: 'off' });
    var link = $('install-dl');
    if (link) link.setAttribute('href', apk.path);
    var ua = navigator.userAgent || '';
    var isNative = !!(global.Capacitor && (global.Capacitor.isNativePlatform
      ? global.Capacitor.isNativePlatform() : global.Capacitor.isNative));
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isNative || isIOS || apk.mode === 'off') return;
    var proto = (global.location && global.location.protocol) || '';
    if (proto !== 'http:' && proto !== 'https:') return;
    if (apk.mode === 'on') { btn.hidden = false; return; }
    try {
      fetch(apk.info, { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (info) {
          if (!info || !info.available) return;
          btn.hidden = false;
          if (link && info.file) link.setAttribute('href', apk.dir + info.file);
          var el = $('install-size');
          if (el && info.size > 0) {
            var mb = info.size / (1024 * 1024);
            el.textContent = '約' + (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + 'MB';
          }
          var v = $('install-version');
          if (v && info.version) v.textContent = 'アプリ版 v' + info.version;
        })
        .catch(function () {});
    } catch (e) {}
  }

  /* ------------------------- 起動 ------------------------- */
  function boot() {
    try {
      var raw = global.localStorage.getItem('odai.settings.v1');
      if (raw && JSON.parse(raw).theme === 'light') document.body.classList.add('light');
    } catch (e) {}
    buildGameScreens();
    bind();
    S.init(games).then(function () {
      applyTheme();
      initInstallButton();
      if (S.settings.lastGame && byId[S.settings.lastGame]) selectGame(S.settings.lastGame);
      goHub();
      if (S.resetSets.length) showToast('お題データを更新しました：' + S.resetSets.join('、') + '（お気に入り・除外・履歴はリセットされます）', 4200);
      else if (S.repaired) showToast('使用状況を修復しました（' + S.repaired + '件）', 3200);
    }).catch(function (e) {
      applyTheme();
      goHub();
      showToast('データの初期化に失敗しました');
      if (global.console) console.error(e);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);

  global.OdaiApp = {
    registerGame: registerGame,
    topbar: topbar,
    esc: esc,
    show: show,
    games: games,
    current: function () { return cur; },
    nav: nav,
    store: S
  };
})(window);
