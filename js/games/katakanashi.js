/* =========================================================
   カタカナーシ
   遊び方：① お題だけ表示（カタカナのお題。説明する人だけが見る）
           ② クイックスタート（説明する人を順番に交代。点数なし）
           ③ フルゲーム（当たったら説明した人と当てた人に 1pt ずつ。〇点先取）
   チェンジ／一つ戻す／一つ進む あり
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';
  var st = { mode: 'topic', q: 1, slot: null, shown: false };

  function M(ctx) { return ctx.match(); }
  function stamp() { return window.OdaiLogo ? window.OdaiLogo('kin', 'kin-svg', '禁') : '禁'; }

  function nextTopic(ctx) {
    var c = st.slot.current();
    var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return false; }
    st.shown = false;
    st.slot.start(e);
    return true;
  }

  function render(ctx) {
    var e = st.slot && st.slot.current();
    if (!e) return;
    var sc = ctx.screen('play');
    var who = sc.querySelector('.kn-who'), name = '';
    if (st.mode === 'topic') {
      sc.querySelector('.kn-q').textContent = '第' + st.q + '問';
      who.hidden = true;
    } else {
      var t = ctx.turn();
      name = t.name;
      sc.querySelector('.kn-q').textContent = '第' + (M(ctx).round + 1) + 'ラウンド';
      who.hidden = false;
      who.innerHTML = '説明する人：<b>' + esc(t.name) + '</b> さん<span class="turn-pos">（' + t.pos + ' / ' + t.n + ' 人目）</span>';
    }
    var card = sc.querySelector('.kn-card');
    if (!st.shown) {
      card.className = 'odai-card kn-card cover';
      card.innerHTML = '<div class="cover-msg">' + (name ? '<b>' + esc(name) + '</b> さんだけ' : '説明する人だけ') +
        '<br>画面を見てください<small>タップでお題を表示</small></div>';
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
    sc.querySelector('.kn-bar-one').hidden = st.mode === 'full';
    sc.querySelector('.kn-bar-full').hidden = st.mode !== 'full';
    sc.querySelector('.kn-next').textContent = st.mode === 'quick' ? '次の人へ' : '次のお題';
  }

  /* 当てた人を選ぶ（フルゲーム） */
  function renderGuess(ctx) {
    var sc = ctx.screen('guess'), m = M(ctx), t = ctx.turn();
    sc.querySelector('.kn-g-topic').textContent = st.slot.current().topic.text;
    var box = sc.querySelector('.kn-g-list');
    box.innerHTML = '';
    m.names.forEach(function (nm, i) {
      if (i === t.idx) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'aw-pl';
      b.innerHTML = '<span class="aw-pl-name">' + esc(nm) + '</span><span class="aw-pl-state">当てた！</span>';
      b.addEventListener('click', function () {
        var pts = m.names.map(function (n, k) { return (k === i || k === t.idx) ? 1 : 0; });
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">お題：<b>' + esc(st.slot.current().topic.text) + '</b></div>' +
            '<p>説明 ' + esc(t.name) + ' さん <b class="pt">+1pt</b> ／ 正解 ' + esc(nm) + ' さん <b class="pt">+1pt</b></p>',
          onNext: function () { if (nextTopic(ctx)) ctx.show('play', { resetStack: true }); }
        });
      });
      box.appendChild(b);
    });
  }

  function rulesIll(ctx) {
    var I = ctx.ill;
    var s1 = I.svg(320, 182,
      I.phone(6, 30, 52, 62, I.card(10, 44, 44, 38, 'エレベーター', { size: 6.8, stroke: 'var(--shu)', r: 3, sub: 'お題' })) +
      I.text(64, 16, '✗「ドアが開いて…」→「ドア」はカタカナでアウト！', { anchor: 'start', size: 9, color: '#e5484d' }) +
      I.person(70, 166, { c: 0, eyes: 'happy', label: '説明する人' }) +
      I.say(70, 166, '上や下の階へ運ぶ箱！', { dx: 70, dy: -34, mark: true }) +
      I.person(224, 166, { c: 1, hand: 'up', eyes: 'happy' }) + I.say(224, 166, 'エレベーター？', {}) +
      I.person(292, 166, { c: 2, mouth: 'o' }),
      'ひらがな・漢字の言葉だけで説明する');
    return { s1: s1 };
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
    defaults: { target: 5 },
    logoHtml: function (ctx) {
      return '<div class="kn-hero">' + ctx.logo('katakanashi', 'gl-svg', 'カタカナーシ') +
        '<span class="kn-hanko" aria-hidden="true">' + stamp() + '</span>' +
        '<p class="kn-motto">カタカナ、使ったらアウト。</p></div>';
    },

    title: function (ctx, box) {
      ctx.modeButtons(box, {
        topic: { fn: function () { st.mode = 'topic'; st.q = 1; if (nextTopic(ctx)) ctx.show('play', { resetStack: true }); } },
        quick: { sub: '点数なしで気軽に。説明する人は順番に交代', fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { sub: '当てた人と説明した人に1pt。〇点先取', fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
    },

    rules: function (ctx) {
      var il = rulesIll(ctx), I = ctx.ill;
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>カタカナで書くお題（例：エレベーター）を、<b>カタカナの言葉を一切使わずに</b>説明して、ほかの人に当ててもらうゲームです。</p>' +
          I.fig(il.s1, '英単語やアルファベットもカタカナと同じ扱いでアウト') +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>遊び方</h3>' +
          '<ul>' +
            '<li><b>① お題を見る</b>：説明する人だけがお題画面をタップしてお題を見ます（もう一度タップで隠せます）。</li>' +
            '<li><b>② 説明する</b>：ひらがな・漢字の言葉だけで説明します。「ドア」「テレビ」などカタカナ語を言ったらアウト！</li>' +
            '<li><b>③ 当てる</b>：ほかの人は分かったらどんどん答えます。</li>' +
          '</ul>' +
          '<p>お題が難しすぎるときは「チェンジ」。チェンジした後は「一つ戻す／一つ進む」で前のお題と行き来できます。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: 'お題画面だけを使います。「次のお題」で次へ。説明する人は自由に交代してください。',
          quick: '説明する人が順番に交代します（全員が1回ずつ担当したら最初から）。点数なしで何回でも。',
          full: '当たったら<b>説明した人と当てた人に 1pt ずつ</b>。「パス」は0pt。「〇点先取」で勝敗を決め、最後に勝利画面。'
        }) +
        '<div class="rule-sec"><h3><span class="badge">3</span>こんな説明はOK？</h3>' +
          '<ul><li>身ぶり手ぶり・効果音：みんなで決めてOK（禁止にするとむずかしくなります）。</li>' +
          '<li>お題の言葉の一部を言う：アウト。</li>' +
          '<li>アルファベットを読み上げる：カタカナ語と同じなのでアウト。</li></ul>' +
        '</div>';
    },

    screens: {
      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip kn-mode-title"></span>' }) +
          '<div class="scroll-area"><div class="kn-target"></div><div class="kn-players"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big kn-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          sc.querySelector('.kn-mode-title').textContent = st.mode === 'full' ? 'フルゲーム' : 'クイックスタート';
          var tg = sc.querySelector('.kn-target');
          tg.innerHTML = '';
          if (st.mode === 'full') ctx.targetCard(tg, { def: 5, hint: '当たったら、説明した人と当てた人に 1pt ずつ。' });
          ctx.playersCard(sc.querySelector('.kn-players'), {
            note: function () { return '説明する人は <b class="c">順番どおりに交代</b>'; }
          });
          sc.querySelector('.kn-start').onclick = function () {
            ctx.startMatch(st.mode, { targetDef: 5, again: function () { ctx.show('setup', { resetStack: true }); } });
            if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
          };
        }
      },

      play: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count kn-q"></span>' }) +
          '<div class="stage">' +
            '<p class="who-line kn-who" hidden></p>' +
            '<div class="odai-card kn-card"></div>' +
            '<div class="kn-chg" hidden></div>' +
          '</div>' +
          '<div class="bottom-bar kn-bar-one"><button class="btn-big kn-next">次のお題</button></div>' +
          '<div class="bottom-bar kn-bar-full" hidden><button class="btn-big sub kn-pass" style="flex:0 0 36%">パス</button><button class="btn-big kn-ok">当たった！</button></div>',
        enter: function (ctx) { render(ctx); }
      },

      guess: {
        html: T({ back: 'back', title: 'だれが当てた？' }) +
          '<div class="scroll-area">' +
            '<div class="odai-card kn-card" style="min-height:0;padding:16px"><div class="odai-text kn-g-topic" style="font-size:30px"></div></div>' +
            '<div class="lead-box" style="margin-top:12px">当てた人をタップしてください。説明した人と当てた人に <b>1pt</b> ずつ入ります。</div>' +
            '<div class="aw-j-list kn-g-list"></div>' +
          '</div>',
        enter: function (ctx) { renderGuess(ctx); }
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
        if (st.mode === 'quick') ctx.nextTurn(); else st.q++;
        nextTopic(ctx);
      });
      sc.querySelector('.kn-ok').addEventListener('click', function () { ctx.show('guess'); });
      sc.querySelector('.kn-pass').addEventListener('click', function () {
        ctx.confirm('パスしますか？（このラウンドは 0pt）', function () {
          var m = M(ctx);
          ctx.roundResult({
            pts: m.names.map(function () { return 0; }),
            head: '<div class="rr-topic">お題：<b>' + esc(st.slot.current().topic.text) + '</b></div><p>パス（0pt）</p>',
            onNext: function () { if (nextTopic(ctx)) ctx.show('play', { resetStack: true }); }
          });
        });
      });
      window.addEventListener('odai:resize', function () {
        if (sc.classList.contains('active') && st.shown) ctx.fitText(sc.querySelector('.odai-text'), 52, 20);
      });
    }
  });
})();
