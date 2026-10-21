/* =========================================================
   ぴったんこはんはん
   画面：お題画面のみ（テーマ＋質問例）。チェンジ／一つ戻す／一つ進む あり
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'themes';
  var st = { k: 0, slot: null };

  function render(ctx) {
    var e = st.slot && st.slot.current();
    if (!e) return;
    var sc = ctx.screen('play');
    sc.querySelector('.pt-k').textContent = 'テーマ ' + st.k;
    var t = sc.querySelector('.odai-text');
    t.textContent = e.topic.text;
    ctx.fitText(t, 46, 20);
    var x = e.topic.x || {};
    var qs = [x.q1, x.q2, x.q3].filter(function (q) { return q && String(q).trim(); });
    sc.querySelector('.q-list').innerHTML = qs.length
      ? qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('')
      : '<li>（質問例なし）このテーマで自由に質問を考えよう</li>';
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
    logoHtml: function (ctx) {
      return '<div class="pt-hero">' +
        ctx.logo('pittanko', 'gl-svg', 'ぴったんこはんはん', { split: ['var(--yes)', 'var(--no)'] }) +
        '<div class="pt-yn" aria-hidden="true"><span class="y">YES</span><span class="n">NO</span></div></div>';
    },

    title: function (ctx, box) {
      var row = document.createElement('div');
      row.className = 'mode-row';
      row.innerHTML = '<button class="btn-mode">ゲームスタート</button>';
      row.querySelector('button').addEventListener('click', function () {
        var e = ctx.drawEntry(SID, []);
        if (!e) { ctx.toast('テーマがありません。お題を追加してください', 2400); return; }
        st.k = 1;
        st.slot.start(e);
        ctx.show('play', { resetStack: true });
      });
      box.appendChild(row);
    },

    rules: function (ctx) {
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>出題者がテーマに沿った<b>YES／NOで答えられる質問</b>をして、みんなの答えが<b>ちょうど半分ずつ</b>（はんはん）になれば成功です。</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['テーマ', '質問', '回答', '半々？'], ['お題画面', '出題者が出す', 'YES/NO', '半々で成功']) + '</div>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>遊び方</h3>' +
          '<ul>' +
            '<li><b>① テーマ</b>：お題画面に「ゲーム」「占い・オカルト」のような大きなテーマが表示されます。</li>' +
            '<li><b>② 質問</b>：出題者はテーマに沿った質問を考えて読み上げます。下の<b>質問例</b>をそのまま使ってもOK。</li>' +
            '<li><b>③ 回答</b>：ほかの人は正直に YES か NO で答えます（指で出す・手を挙げるなど）。</li>' +
            '<li><b>④ 判定</b>：YES と NO がちょうど同じ数になれば成功！出題者を交代して「次のテーマ」へ。</li>' +
          '</ul>' +
          '<p>テーマが合わないときは「チェンジ」。チェンジした後は「一つ戻す／一つ進む」で前のテーマと行き来できます。</p>' +
          '<p>回答者が奇数のときは、出題者も答えに加わるなど、人数に合わせて調整してください。</p>' +
        '</div>';
    },

    screens: {
      play: {
        html: T({ back: 'title', right: '<span class="tb-count pt-k"></span>' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="odai-card theme-card"><span class="pt-half" aria-hidden="true">½</span><div class="odai-text"></div></div>' +
            '<p class="q-title">質問例</p>' +
            '<ul class="q-list"></ul>' +
            '<p class="odai-note pt-goal"><span class="y">YES</span> と <span class="n">NO</span> がちょうど半分ずつになる質問をしよう</p>' +
            '<div class="pt-chg"></div>' +
          '</div></div>' +
          '<div class="bottom-bar"><button class="btn-big pt-next">次のテーマ</button></div>',
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
        var c = st.slot.current();
        var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
        if (!e) { ctx.toast('テーマがありません', 1600); return; }
        st.k++;
        st.slot.start(e);
      });
      window.addEventListener('odai:resize', function () {
        if (sc.classList.contains('active')) ctx.fitText(sc.querySelector('.odai-text'), 46, 20);
      });
    }
  });
})();
