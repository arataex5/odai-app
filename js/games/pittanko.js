/* =========================================================
   ぴったんこはんはん
   遊び方：① お題だけ表示（テーマ＋質問例）
           ② クイックスタート（出題者を順番に交代。点数なし）
           ③ フルゲーム（はんはん成功で出題者に 1pt。〇点先取）
   チェンジ／一つ戻す／一つ進む あり
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'themes';
  var st = { mode: 'topic', k: 1, slot: null };

  function M(ctx) { return ctx.match(); }

  function nextTheme(ctx) {
    var c = st.slot.current();
    var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
    if (!e) { ctx.toast('テーマがありません。お題を追加してください', 2400); return false; }
    st.slot.start(e);
    return true;
  }

  function render(ctx) {
    var e = st.slot && st.slot.current();
    if (!e) return;
    var sc = ctx.screen('play');
    var who = sc.querySelector('.pt-who');
    if (st.mode === 'topic') {
      sc.querySelector('.pt-k').textContent = 'テーマ ' + st.k;
      who.hidden = true;
    } else {
      var t = ctx.turn();
      sc.querySelector('.pt-k').textContent = '第' + (M(ctx).round + 1) + 'ラウンド';
      who.hidden = false;
      who.innerHTML = '出題者：<b>' + esc(t.name) + '</b> さん<span class="turn-pos">（' + t.pos + ' / ' + t.n + ' 人目）</span>';
    }
    sc.querySelector('.pt-bar-one').hidden = st.mode === 'full';
    sc.querySelector('.pt-bar-full').hidden = st.mode !== 'full';
    sc.querySelector('.pt-next').textContent = st.mode === 'quick' ? '次の出題者へ' : '次のテーマ';
    var t2 = sc.querySelector('.odai-text');
    t2.textContent = e.topic.text;
    ctx.fitText(t2, 46, 20);
    var x = e.topic.x || {};
    var qs = [x.q1, x.q2, x.q3].filter(function (q) { return q && String(q).trim(); });
    sc.querySelector('.q-list').innerHTML = qs.length
      ? qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('')
      : '<li>（質問例なし）このテーマで自由に質問を考えよう</li>';
  }

  function rulesIll(ctx) {
    var I = ctx.ill;
    var yes = 'var(--yes)', no = 'var(--no)';
    var s1 = I.svg(320, 160,
      I.person(40, 146, { c: 4, hand: 'right', label: '出題者' }) +
      I.bubble(8, 6, 168, 28, 'Q. 朝ごはんはパン派だ', 'bl', { size: 11 }) +
      I.person(130, 146, { c: 2, hand: 'up', eyes: 'happy' }) + I.person(180, 146, { c: 2, hand: 'up', eyes: 'happy' }) +
      I.person(240, 146, { c: 3, mouth: 'flat' }) + I.person(290, 146, { c: 3, mouth: 'flat' }) +
      I.badge(155, 62, 'YES 2', '#3d8bff') + I.badge(265, 62, 'NO 2', '#ff6b5b') +
      '<path d="M210 50 V150" stroke="currentColor" stroke-dasharray="4 4" opacity=".35"/>' +
      I.text(258, 26, 'はんはん！', { size: 14, weight: 900, color: 'var(--accent2)' }),
      'YES と NO がちょうど同じ数になれば成功');
    return { s1: s1 };
  }

  A.registerGame({
    id: 'pittanko',
    name: 'ぴったんこはんはん',
    mark: '½',
    sub: 'YESとNOがちょうど半分になる質問をしよう',
    color: { dark: ['#3d8bff', '#7db4ff'], light: ['#1f68d6', '#3d8bff'] },
    players: { min: 3, max: 20, def: 4 },
    sets: [
      { id: SID, label: 'テーマ', rev: 1,
        fields: [
          { key: 'text', label: 'テーマ', placeholder: '例：ゲーム' },
          { key: 'q1', label: '質問例1', placeholder: '例：ゲームセンターでお金を使いすぎたことがある', maxLength: 80 },
          { key: 'q2', label: '質問例2', maxLength: 80 },
          { key: 'q3', label: '質問例3', maxLength: 80 }
        ],
        sub: function (t) { var x = t.x || {}; return [x.q1, x.q2, x.q3].filter(Boolean).join(' ／ '); } }
    ],
    defaults: { target: 3 },
    logoHtml: function (ctx) {
      return '<div class="pt-hero">' +
        ctx.logo('pittanko', 'gl-svg', 'ぴったんこはんはん', { split: ['var(--yes)', 'var(--no)'] }) +
        '<div class="pt-yn" aria-hidden="true"><span class="y">YES</span><span class="n">NO</span></div></div>';
    },

    title: function (ctx, box) {
      ctx.modeButtons(box, {
        topic: { sub: 'テーマと質問例を出すだけ。判定・点数なし',
          fn: function () { st.mode = 'topic'; st.k = 1; if (nextTheme(ctx)) ctx.show('play', { resetStack: true }); } },
        quick: { fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { sub: 'はんはん成功で出題者に1pt。〇点先取',
          fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
    },

    rules: function (ctx) {
      var il = rulesIll(ctx), I = ctx.ill;
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>出題者がテーマに沿った<b>YES／NOで答えられる質問</b>をして、みんなの答えが<b>ちょうど半分ずつ</b>（はんはん）になれば成功です。</p>' +
          I.fig(il.s1, '回答者が4人なら、YES 2人・NO 2人で成功') +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>遊び方</h3>' +
          '<ul>' +
            '<li><b>① テーマ</b>：お題画面に「ゲーム」「占い・オカルト」のような大きなテーマが表示されます。</li>' +
            '<li><b>② 質問</b>：出題者はテーマに沿った質問を考えて読み上げます。下の<b>質問例</b>をそのまま使ってもOK。</li>' +
            '<li><b>③ 回答</b>：ほかの人は正直に YES か NO で答えます（指で出す・手を挙げるなど）。</li>' +
            '<li><b>④ 判定</b>：YES と NO がちょうど同じ数になれば成功！</li>' +
          '</ul>' +
          '<p>テーマが合わないときは「チェンジ」。チェンジした後は「一つ戻す／一つ進む」で前のテーマと行き来できます。回答者が奇数のときは、出題者も答えに加わるなど人数に合わせて調整してください。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: 'テーマと質問例を表示するだけ。「次のテーマ」で次へ。',
          quick: '出題者が順番に交代します（全員が1回ずつ担当したら最初から）。点数なしで何回でも。',
          full: 'はんはん成功で出題者に <b>1pt</b>。「〇点先取」で勝敗を決め、ラウンドごとにポイント結果、最後に勝利画面。'
        });
    },

    screens: {
      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip pt-mode-title"></span>' }) +
          '<div class="scroll-area"><div class="pt-target"></div><div class="pt-players"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big pt-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          sc.querySelector('.pt-mode-title').textContent = st.mode === 'full' ? 'フルゲーム' : 'クイックスタート';
          var tg = sc.querySelector('.pt-target');
          tg.innerHTML = '';
          if (st.mode === 'full') ctx.targetCard(tg, { def: 3, hint: 'はんはんに成功したら出題者に 1pt。' });
          ctx.playersCard(sc.querySelector('.pt-players'), {
            note: function () { return '出題者は <b class="c">順番どおりに交代</b>'; }
          });
          sc.querySelector('.pt-start').onclick = function () {
            ctx.startMatch(st.mode, { targetDef: 3, again: function () { ctx.show('setup', { resetStack: true }); } });
            if (nextTheme(ctx)) ctx.show('play', { resetStack: true });
          };
        }
      },

      play: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count pt-k"></span>' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<p class="who-line pt-who" hidden></p>' +
            '<div class="odai-card theme-card"><span class="pt-half" aria-hidden="true">½</span><div class="odai-text"></div></div>' +
            '<p class="q-title">質問例</p>' +
            '<ul class="q-list"></ul>' +
            '<p class="odai-note pt-goal"><span class="y">YES</span> と <span class="n">NO</span> がちょうど半分ずつになる質問をしよう</p>' +
            '<div class="pt-chg"></div>' +
          '</div></div>' +
          '<div class="bottom-bar pt-bar-one"><button class="btn-big pt-next">次のテーマ</button></div>' +
          '<div class="bottom-bar pt-bar-full" hidden><button class="btn-big sub pt-fail" style="flex:0 0 36%">失敗</button><button class="btn-big pt-ok">はんはん成功！</button></div>',
        enter: function (ctx) { render(ctx); }
      }
    },

    init: function (ctx) {
      var sc = ctx.screen('play');
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return ctx.drawEntry(SID, avoid); },
        onShow: function () { render(ctx); }
      });
      ctx.changeBar(sc.querySelector('.pt-chg'), st.slot);
      sc.querySelector('.pt-next').addEventListener('click', function () {
        if (st.mode === 'quick') ctx.nextTurn(); else st.k++;
        nextTheme(ctx);
      });
      var result = function (ok) {
        var m = M(ctx), t = ctx.turn();
        var pts = m.names.map(function (n, i) { return ok && i === t.idx ? 1 : 0; });
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">テーマ：<b>' + esc(st.slot.current().topic.text) + '</b></div>' +
            '<p>' + (ok ? '出題者 ' + esc(t.name) + ' さん、はんはん成功！ <b class="pt">+1pt</b>' : '出題者 ' + esc(t.name) + ' さん、残念！（0pt）') + '</p>',
          onNext: function () { if (nextTheme(ctx)) ctx.show('play', { resetStack: true }); }
        });
      };
      sc.querySelector('.pt-ok').addEventListener('click', function () { result(true); });
      sc.querySelector('.pt-fail').addEventListener('click', function () { result(false); });
      window.addEventListener('odai:resize', function () {
        if (sc.classList.contains('active')) ctx.fitText(sc.querySelector('.odai-text'), 46, 20);
      });
    }
  });
})();
