/* =========================================================
   カタカナーシ
   画面：お題画面のみ（カタカナのお題。説明する人だけが見る）。チェンジ／一つ戻す／一つ進む あり
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';
  var st = { q: 0, slot: null, shown: false };

  function stamp() { return window.OdaiLogo ? window.OdaiLogo('kin', 'kin-svg', '禁') : '禁'; }

  function render(ctx) {
    var e = st.slot && st.slot.current();
    if (!e) return;
    var sc = ctx.screen('play');
    sc.querySelector('.kn-q').textContent = '第' + st.q + '問';
    var card = sc.querySelector('.kn-card');
    if (!st.shown) {
      card.className = 'odai-card kn-card cover';
      card.innerHTML = '<div class="cover-msg">説明する人だけ<br>画面を見てください<small>タップでお題を表示</small></div>';
    } else {
      var g = e.topic.x && e.topic.x.genre;
      card.className = 'odai-card kn-card';
      card.innerHTML =
        '<span class="kn-stamp" aria-hidden="true">' + stamp() + '</span>' +
        (g ? '<span class="odai-kicker">' + esc(g) + '</span>' : '') +
        '<div class="odai-text">' + esc(e.topic.text) + '</div>' +
        '<p class="odai-note">この言葉を<b>カタカナを使わずに</b>説明しよう</p>' +
        '<span class="peek">タップで隠す</span>';
      ctx.fitText(card.querySelector('.odai-text'), 52, 20);
    }
    sc.querySelector('.kn-chg').hidden = !st.shown;
  }

  A.registerGame({
    id: 'katakanashi',
    name: 'カタカナーシ',
    mark: '禁',
    sub: 'カタカナ語をカタカナを使わずに説明しよう',
    color: { dark: ['#e2452f', '#ff7a5f'], light: ['#c4321d', '#e2452f'] },
    players: { min: 2, max: 20, def: 4 },
    sets: [
      { id: SID, label: 'お題', rev: 1,
        fields: [
          { key: 'text', label: 'お題（カタカナ）', placeholder: '例：エレベーター' },
          { key: 'genre', label: 'ジャンル', placeholder: '例：生活', maxLength: 12 }
        ],
        sub: function (t) { return t.x && t.x.genre ? t.x.genre : ''; } }
    ],
    logoHtml: function (ctx) {
      return '<div class="kn-hero">' + ctx.logo('katakanashi', 'gl-svg', 'カタカナーシ') +
        '<span class="kn-hanko" aria-hidden="true">' + stamp() + '</span>' +
        '<p class="kn-motto">カタカナ、使ったらアウト。</p></div>';
    },

    title: function (ctx, box) {
      var row = document.createElement('div');
      row.className = 'mode-row';
      row.innerHTML = '<button class="btn-mode">ゲームスタート</button>';
      row.querySelector('button').addEventListener('click', function () {
        var e = ctx.drawEntry(SID, []);
        if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
        st.q = 1; st.shown = false;
        st.slot.start(e);
        ctx.show('play', { resetStack: true });
      });
      box.appendChild(row);
    },

    rules: function (ctx) {
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>カタカナで書くお題（例：エレベーター）を、<b>カタカナの言葉を一切使わずに</b>説明して、ほかの人に当ててもらうゲームです。</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['お題', '説明', '回答', '正解！'], ['説明役が見る', 'カタカナ禁止', 'みんなで答える', '交代']) + '</div>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>遊び方</h3>' +
          '<ul>' +
            '<li><b>① お題を見る</b>：説明する人だけがお題画面をタップしてお題を見ます（もう一度タップで隠せます）。</li>' +
            '<li><b>② 説明する</b>：ひらがな・漢字の言葉だけで説明します。「ドア」「テレビ」などカタカナ語を言ったらアウト！英単語もカタカナ扱いです。</li>' +
            '<li><b>③ 当てる</b>：ほかの人は分かったらどんどん答えます。当たったら「次のお題」へ。</li>' +
            '<li><b>④ 交代</b>：説明する人を順番に交代して遊びます。</li>' +
          '</ul>' +
          '<p>お題が難しすぎるときは「チェンジ」。チェンジした後は「一つ戻す／一つ進む」で前のお題と行き来できます。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>こんな説明はOK？</h3>' +
          '<ul><li>身ぶり手ぶり・効果音：みんなで決めてOK（禁止にするとむずかしくなります）。</li>' +
          '<li>お題の言葉の一部を言う：アウト。</li>' +
          '<li>アルファベットを読み上げる：カタカナ語と同じなのでアウト。</li></ul>' +
        '</div>';
    },

    screens: {
      play: {
        html: T({ back: 'title', right: '<span class="tb-count kn-q"></span>' }) +
          '<div class="stage">' +
            '<div class="odai-card kn-card"></div>' +
            '<div class="kn-chg" hidden></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big kn-next">次のお題</button></div>',
        enter: function (ctx) { render(ctx); }
      }
    },

    init: function (ctx) {
      var sc = ctx.screen('play');
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return ctx.drawEntry(SID, avoid); },
        onShow: function () {
          if (st.slot && st.slot.changed()) st.shown = true;
          render(ctx);
        }
      });
      ctx.changeBar(sc.querySelector('.kn-chg'), st.slot);
      sc.querySelector('.kn-card').addEventListener('click', function () { st.shown = !st.shown; render(ctx); });
      sc.querySelector('.kn-next').addEventListener('click', function () {
        var c = st.slot.current();
        var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
        if (!e) { ctx.toast('お題がありません', 1600); return; }
        st.q++; st.shown = false;
        st.slot.start(e);
      });
      window.addEventListener('odai:resize', function () {
        if (sc.classList.contains('active') && st.shown) ctx.fitText(sc.querySelector('.odai-text'), 52, 20);
      });
    }
  });
})();
