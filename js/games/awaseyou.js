/* =========================================================
   答えを合わせよう
   タイトルで「通常モード／人狼モード」を切り替え、遊び方を3つから選ぶ
   ① お題だけ表示：お題画面のみ（人狼モードでも同じ）
   ② クイックスタート：通常＝読み上げ役を順番に交代しながらお題を出す
                       人狼＝役職確認 → 話し合い → 結果発表 を何回でも
   ③ フルゲーム：通常＝協力。成功させる回数を決め、全員そろった回数が届いたらクリア（何回中何回成功かを表示）
               人狼＝〇点先取。お題ごとに役職を配り、せーので答える。そろえば市民陣営の勝ち。
                     そろわなければ多数決で投票し、人狼が最多票なら市民陣営、そうでなければ人狼陣営の勝ち（勝った陣営に 1pt）
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';

  var st = { mode: 'topic', q: 1, slot: null, wolves: [], wolfSees: 'none', topic: null, outcome: null, voted: -2,
    coop: { target: 5, rounds: 0, ok: 0, log: [] } };   // 通常モードのフルゲーム（協力）

  function isWolf(ctx) { return ctx.settings().mode === 'wolf'; }
  function maxWolves(n) { return Math.max(1, Math.min(3, Math.floor((n - 1) / 2))); }
  function M(ctx) { return ctx.match(); }

  var LABELS = {
    normal: {
      topic: { sub: 'お題を出すだけ。判定・点数なし' },
      quick: { sub: '点数なしで気軽に。読み上げ役は順番に交代' },
      full: { sub: 'みんなで協力。〇回そろえたらクリア' }
    },
    wolf: {
      topic: { sub: 'お題を出すだけ（人狼なし）' },
      quick: { sub: '役職確認→せーの→投票を何回でも' },
      full: { sub: '勝った陣営に1pt。〇点先取' }
    }
  };

  /* ---------------- 通常：お題画面 ---------------- */
  function nextTopic(ctx) {
    var c = st.slot.current();
    var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return false; }
    st.slot.start(e);
    return true;
  }
  function renderPlay(ctx) {
    var sc = ctx.screen('play');
    var e = st.slot && st.slot.current();
    if (!e) return;
    var who = sc.querySelector('.aw-who');
    if (st.mode === 'topic') {
      sc.querySelector('.aw-q').textContent = '第' + st.q + '問';
      who.hidden = true;
    } else {
      var t = ctx.turn();
      sc.querySelector('.aw-q').textContent = '第' + (M(ctx).round + 1) + '問';
      who.hidden = false;
      who.innerHTML = '読み上げ：<b>' + esc(t.name) + '</b> さん<span class="turn-pos">（' + t.pos + ' / ' + t.n + ' 人目）</span>';
    }
    var coop = st.mode === 'full';
    sc.querySelector('.aw-bar-one').hidden = coop;
    sc.querySelector('.aw-bar-coop').hidden = !coop;
    sc.querySelector('.aw-end').hidden = !coop;
    var pr = sc.querySelector('.aw-progress');
    pr.hidden = !coop;
    if (coop) {
      var c = st.coop, dots = '';
      for (var i = 0; i < c.target; i++) dots += '<i class="' + (i < c.ok ? 'on' : '') + '"></i>';
      pr.innerHTML = '<span class="ap-dots">' + dots + '</span><span class="ap-txt">成功 <b>' + c.ok + '</b> / ' + c.target + '　（' + (c.rounds + 1) + '回目）</span>';
    }
    var tx = sc.querySelector('.odai-text');
    tx.textContent = e.topic.text;
    ctx.fitText(tx, 44, 18);
  }

  /* ---------------- 通常：協力フルゲームの結果 ---------------- */
  function coopAnswer(ctx, ok) {
    var c = st.coop;
    c.rounds++;
    if (ok) c.ok++;
    c.log.push({ text: st.slot.current().topic.text, ok: ok });
    if (c.ok >= c.target) { var tt = document.getElementById('toast'); if (tt) tt.hidden = true; ctx.show('clear', { resetStack: true }); return; }
    ctx.toast(ok ? '🎉 そろった！ あと ' + (c.target - c.ok) + ' 回でクリア' : 'おしい！ 次はそろえよう', 1500);
    ctx.nextTurn();
    nextTopic(ctx);
  }
  function renderClear(ctx) {
    var sc = ctx.screen('clear'), c = st.coop;
    var cleared = c.ok >= c.target;
    sc.querySelector('.cl-title').textContent = cleared ? 'クリア！' : 'ゲーム終了';
    sc.querySelector('.cl-cup').textContent = cleared ? '🎉' : '🏁';
    sc.querySelector('.cl-main').innerHTML = '<b>' + c.rounds + '</b> 回やって <b>' + c.ok + '</b> 回成功！';
    sc.querySelector('.cl-sub').textContent = '目標 ' + c.target + ' 回' + (c.rounds ? '　／　成功率 ' + Math.round(c.ok / c.rounds * 100) + '%' : '') + (cleared ? '' : '（途中で終了）');
    sc.querySelector('.cl-log').innerHTML = c.log.map(function (l, i) {
      return '<li class="' + (l.ok ? 'ok' : 'ng') + '"><span class="cl-n">' + (i + 1) + '</span><span class="cl-t">' + esc(l.text) + '</span><span class="cl-r">' + (l.ok ? '○ そろった' : '× ズレた') + '</span></li>';
    }).join('');
  }

  /* ---------------- 人狼モード：投票 ---------------- */
  function renderVote(ctx) {
    var sc = ctx.screen('vote'), m = M(ctx);
    var box = sc.querySelector('.aw-v-list');
    box.innerHTML = '';
    m.names.forEach(function (nm, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'aw-pl vote' + (st.voted === i ? ' picked' : '');
      b.innerHTML = '<span class="aw-pl-name">' + esc(nm) + '</span><span class="aw-pl-state">' + (st.voted === i ? '✓ 最多票' : 'この人') + '</span>';
      b.addEventListener('click', function () { st.voted = i; renderVote(ctx); });
      box.appendChild(b);
    });
    sc.querySelector('.aw-v-tie').classList.toggle('acc', st.voted === -1);
    sc.querySelector('.aw-v-go').disabled = st.voted === -2;
  }

  /* ---------------- 人狼モード ---------------- */
  function startWolfGame(ctx) {
    var m = M(ctx), gs = ctx.settings();
    var wc = Math.min(gs.wolfCount || 1, maxWolves(m.n));
    st.wolfSees = gs.wolfSees || 'none';
    var c = st.topic;
    var e = ctx.drawEntry(SID, c ? [SID + '|' + c.uid] : []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
    st.topic = e.topic;
    ctx.markUsed(SID, st.topic.uid);
    var idx = []; for (var i = 0; i < m.n; i++) idx.push(i);
    st.wolves = ctx.shuffle(idx).slice(0, wc).sort(function (a, b) { return a - b; });
    var items = m.names.map(function (nm, i) {
      return {
        name: nm,
        render: function (body, api) {
          var wolf = st.wolves.indexOf(i) > -1;
          var mates = st.wolves.filter(function (w) { return w !== i; }).map(function (w) { return m.names[w] + 'さん'; });
          var showTopic = !wolf || st.wolfSees === 'same';
          body.innerHTML =
            '<div class="role-big ' + (wolf ? 'wolf' : 'villager') + '">' + (wolf ? '人狼' : '市民') + '</div>' +
            '<div class="role-topic"><span class="q">お題</span>' + (showTopic ? esc(st.topic.text) : '？？？') + '</div>' +
            '<p class="role-note">' + (wolf
              ? (st.wolfSees === 'same'
                  ? 'みんなの答えが<b>そろわないように</b>、こっそり答えをズラしましょう。人狼だとバレないように！'
                  : 'あなたには<b>お題が分かりません</b>。みんなの話し合いからお題を推理して、答えを合わせて正体を隠しましょう。')
                + (mates.length ? '<br>仲間の人狼：<b>' + esc(mates.join('、')) + '</b>' : '')
              : 'お題は<b>口に出さず</b>に、せーので答えを合わせましょう。そろわなかったら、人狼を探す投票へ！') + '</p>';
          api.fit(body.querySelector('.role-topic'), 40, 16);
        }
      };
    });
    ctx.reveal({
      items: items, progressLabel: '役職確認', lastLabel: 'せーので答えよう',
      onDone: function () { ctx.show('talk', { resetStack: true }); }
    });
  }

  /* ---------------- ルール説明のイラスト ---------------- */
  function rulesIll(ctx) {
    var I = ctx.ill;
    var ppl = '', xs = [46, 120, 194, 268], ans = ['大根', '大根', '大根', 'ちくわ'];
    xs.forEach(function (x, i) {
      var ok = i < 3;
      ppl += I.person(x, 156, { c: i, eyes: ok ? 'happy' : 'open', mouth: ok ? 'smile' : 'o' }) +
        I.say(x, 156, ans[i], { stroke: ok ? 'currentColor' : '#e5484d' }) + I.mark(x, 52, ok, 7);
    });
    var s1 = I.svg(320, 172,
      I.card(96, 4, 128, 28, 'おでんの具といえば？', { size: 10.5, r: 14 }) + ppl,
      '全員が同時に答えを言う。そろえば成功！');
    var s2 = I.svg(320, 160,
      I.person(50, 146, { c: 1, label: '市民' }) + I.person(120, 146, { c: 2, label: '市民' }) +
      I.person(190, 146, { c: 4, ears: true, mouth: 'flat', label: '人狼' }) + I.person(260, 146, { c: 3, label: '市民' }) +
      I.card(24, 14, 52, 40, 'お題', { size: 11, sub: '見える' }) + I.card(94, 14, 52, 40, 'お題', { size: 11, sub: '見える' }) +
      I.card(160, 14, 60, 40, '？？？', { size: 12, stroke: '#9b6bff', sub: '分からない' }) + I.card(234, 14, 52, 40, 'お題', { size: 11, sub: '見える' }),
      '人狼だけお題を知らない（設定で「見せる」にもできます）');
    return { s1: s1, s2: s2 };
  }

  A.registerGame({
    id: 'awaseyou',
    name: '答えを合わせよう',
    mark: '合',
    sub: '「〇〇といえば？」でみんなの答えをそろえよう',
    color: { dark: ['#1fae7a', '#5fe0ad'], light: ['#0d7d55', '#17a06e'] },
    theme: function (ctx) {
      return ctx.settings().mode === 'wolf'
        ? { cls: 'wolf', color: { dark: ['#7b55f0', '#b39bff'], light: ['#5b38d6', '#7b55f0'] } }
        : null;
    },
    players: { min: 3, max: 20, def: 5 },
    sets: [
      { id: SID, label: 'お題', rev: 1, fields: [{ key: 'text', label: 'お題', placeholder: '例：おでんの具といえば？', hint: '「〇〇といえば？」の形がおすすめです' }] }
    ],
    defaults: { mode: 'normal', wolfCount: 1, wolfSees: 'none', target: 5 },
    help: {
      wolf: ['人狼モード', 'お題ごとに役職（市民／人狼）を配ります。全員でせーので答えて、<b>そろえば市民陣営の勝ち</b>。そろわなかったら人狼はだれか話し合って<b>多数決</b>。人狼が最多票なら市民陣営、そうでなければ人狼陣営の勝ちです。'],
      sees: ['人狼に見せる内容', '<b>お題を見せない</b>：人狼はお題が分からないまま、みんなの話からお題を推理して答えを合わせます。<br><b>お題を見せる</b>：人狼もお題を知っていますが、目的は「みんなの答えがそろわないように、こっそりズラす」ことです。']
    },
    logoHtml: function (ctx) {
      var wolf = isWolf(ctx);
      return '<div class="aw-hero">' +
        '<svg class="aw-deco" viewBox="0 0 200 120" aria-hidden="true">' +
          '<circle class="b1" cx="78" cy="60" r="46"/><circle class="b2" cx="122" cy="60" r="46"/>' +
        '</svg><span class="aw-moon" aria-hidden="true"></span>' +
        '<div class="aw-logo-box">' + ctx.logo(wolf ? 'awaseyou-wolf' : 'awaseyou', 'gl-svg', '答えを合わせよう') + '</div>' +
        '<p class="aw-wolf-tag">人狼モード</p></div>';
    },

    title: function (ctx, box) {
      var gs = ctx.settings();
      var top = document.createElement('div');
      top.className = 'aw-switch-row';
      top.innerHTML = '<div class="mode-switch"><button data-val="normal">通常モード</button><button data-val="wolf" class="wolf">☾ 人狼モード</button></div>' +
        '<button class="btn-help aw-help" data-help="wolf" aria-label="人狼モードの説明">?</button>';
      box.appendChild(top);
      var list = ctx.modeButtons(box, {
        topic: { fn: function () {
          st.mode = 'topic'; st.q = 1;
          if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
        } },
        quick: { fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
      var paint = function () {
        var v = gs.mode === 'wolf' ? 'wolf' : 'normal';
        ctx.$$('.mode-switch button', top).forEach(function (b) { b.classList.toggle('on', b.dataset.val === v); });
        top.querySelector('.aw-help').classList.toggle('off', v !== 'wolf');     // 人狼モードの時だけ表示（場所は確保）
        ['topic', 'quick', 'full'].forEach(function (k) {
          list.querySelector('.mode-' + k + ' .bm-sub').textContent = LABELS[v][k].sub;
        });
        var logo = document.getElementById('title-logo');
        var lb = logo.querySelector('.aw-logo-box');
        if (lb) lb.innerHTML = ctx.logo(v === 'wolf' ? 'awaseyou-wolf' : 'awaseyou', 'gl-svg', '答えを合わせよう');
        ctx.refreshTheme();
      };
      top.querySelector('.mode-switch').addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        ctx.setSetting('mode', b.dataset.val); paint();
      });
      paint();
    },

    rules: function (ctx) {
      var il = rulesIll(ctx), I = ctx.ill;
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>「おでんの具といえば？」のようなお題に、全員で<b>同時に</b>答えます。目標は<b>全員の答えをそろえる</b>こと！</p>' +
          I.fig(il.s1, '自分の答えより「みんなが答えそうなもの」を考えるのがコツ') +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>通常モードの遊び方</h3>' +
          '<ul><li>お題を読み上げます（クイック・フルゲームでは読み上げ役が順番に交代）。</li>' +
          '<li>「せーの」で同時に答えを言い、全員そろえば成功です。</li>' +
          '<li>「チェンジ」でお題を変えられ、チェンジした後は「一つ戻す／一つ進む」で行き来できます。</li>' +
          '<li><b>フルゲーム（協力）</b>：はじめに「成功させる回数」を決めます。全員そろったら「全員そろった！」、ズレたら「ズレた…」をタップ。成功が目標に届いたらクリア！何回やって何回成功したかが表示されます。</li></ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>人狼モード</h3>' +
          '<p>タイトル画面のボタンで切り替えます。<b>お題ごとに</b>役職（市民／人狼）を配り直すので、陣営は毎回変わります。</p>' +
          I.fig(il.s2, '役職確認では、スマホを回して1人ずつ自分の画面を見ます') +
          '<div class="rule-fig">' + ctx.figFlow(['役職', 'せーの', 'そろった？', '投票', '勝敗'], ['1人ずつ確認', '全員で答える', 'そろえば市民勝ち', '多数決', '陣営に1pt']) + '</div>' +
          '<ul>' +
            '<li><b>① 役職確認</b>：1人ずつ自分の役職とお題を確認します。</li>' +
            '<li><b>② せーの</b>：お題に対して全員で同時に答えます。</li>' +
            '<li><b>③ そろった！</b>：全員の答えがそろったら<b>市民陣営の勝ち</b>。</li>' +
            '<li><b>④ 投票</b>：そろわなかったら、人狼はだれか話し合って<b>多数決</b>で投票します。<b>人狼が最多票</b>なら市民陣営の勝ち（人狼が複数いても、最多票が人狼ならOK）。最多票が市民、または同票で決まらなければ<b>人狼陣営の勝ち</b>。</li>' +
          '</ul>' +
          '<p><b>人狼に見せる内容</b>（ゲーム設定で選択）：「お題を見せない」＝人狼はお題を知らずに答えを合わせる／「お題を見せる」＝人狼は答えをこっそりズラすのが目的。</p>' +
          '<p><b>フルゲーム</b>：勝った陣営のメンバー全員に <b>+1pt</b>。〇点先取で勝敗を決めます。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: 'お題画面だけを使います。「次のお題」で次へ（人狼モードでも人狼なしのお題表示になります）。',
          quick: '点数なしで何回でも。通常は読み上げ役が順番に交代、人狼モードは役職確認→せーの→（投票）→結果発表をくり返します。',
          full: '通常モードは<b>みんなで協力</b>：成功させる回数を決めて挑戦し、クリアしたら「何回中何回成功」を表示。人狼モードは「〇点先取」の対決で、毎ラウンドのあとにポイント結果、最後に勝利画面。'
        });
    },

    screens: {
      play: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-q"></span><button class="chip aw-end" hidden>終了</button>' }) +
          '<div class="stage">' +
            '<div class="aw-progress" hidden></div>' +
            '<p class="who-line aw-who" hidden></p>' +
            '<div class="odai-card aw-bubble"><div class="odai-text"></div></div>' +
            '<p class="odai-note aw-sei">せーので答えを言おう！全員そろえば成功</p>' +
            '<div class="aw-chg"></div>' +
          '</div>' +
          '<div class="bottom-bar aw-bar-one"><button class="btn-big aw-next">次のお題</button></div>' +
          '<div class="bottom-bar aw-bar-coop" hidden><button class="btn-big sub aw-ng" style="flex:0 0 36%">ズレた…</button><button class="btn-big aw-ok">全員そろった！</button></div>',
        enter: function (ctx) { renderPlay(ctx); }
      },

      clear: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area">' +
            '<div class="vc-hero cl-hero"><div class="vc-confetti" aria-hidden="true"></div>' +
              '<div class="vc-cup cl-cup" aria-hidden="true">🎉</div>' +
              '<div class="vc-title cl-title"></div>' +
              '<p class="cl-main"></p><p class="vc-sub cl-sub"></p></div>' +
            '<p class="q-title">これまでのお題</p>' +
            '<ol class="cl-log"></ol>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-cl-title" style="flex:0 0 36%">タイトルへ</button><button class="btn-big aw-cl-again">もう一度遊ぶ</button></div>',
        enter: function (ctx) { renderClear(ctx); }
      },

      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip aw-mode-title"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="aw-target"></div>' +
            '<div class="card aw-wolf-card">' +
              '<div class="row-line"><label class="row-label nomb">人狼の人数</label><div class="aw-wc"></div></div>' +
              '<label class="row-label" style="margin-top:14px">人狼に見せる内容 <button class="btn-help sm" data-help="sees" aria-label="説明">?</button></label>' +
              '<div class="seg aw-sees"><button class="seg-btn" data-val="none">お題を見せない</button><button class="seg-btn" data-val="same">お題を見せる</button></div>' +
            '</div>' +
            '<div class="aw-players"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          var gs = ctx.settings(), wolf = isWolf(ctx);
          sc.querySelector('.aw-mode-title').textContent = (wolf ? '人狼・' : '') + (st.mode === 'full' ? 'フルゲーム' : 'クイックスタート');
          sc.querySelector('.aw-wolf-card').hidden = !wolf;
          sc.querySelector('.aw-start').textContent = wolf ? '役職確認画面へ' : 'ゲーム開始';
          var tg = sc.querySelector('.aw-target');
          tg.innerHTML = '';
          if (st.mode === 'full') {
            if (wolf) ctx.targetCard(tg, { def: 5, hint: '勝った陣営のメンバー全員に 1pt。陣営（役職）はお題ごとに変わります。' });
            else ctx.targetCard(tg, { key: 'coopTarget', def: 5, label: '成功させる回数', unit: '回', max: 50,
              hint: 'みんなで協力するモード。全員の答えがそろった回数が、この回数に届いたらクリア！' });
          }
          var paintWc = function () {
            var mx = maxWolves(ctx.playerCount());
            if (gs.wolfCount > mx) gs.wolfCount = mx;
            var box = sc.querySelector('.aw-wc');
            box.innerHTML = '<div class="counter"><button class="cbtn aw-m" aria-label="減らす">−</button>' +
              '<span class="cnum-input" style="display:flex;align-items:center;justify-content:center">' + gs.wolfCount + '</span>' +
              '<button class="cbtn aw-p" aria-label="増やす">＋</button></div>';
            box.querySelector('.aw-m').onclick = function () { ctx.setSetting('wolfCount', Math.max(1, gs.wolfCount - 1)); paintWc(); };
            box.querySelector('.aw-p').onclick = function () {
              if (gs.wolfCount >= mx) { ctx.toast(ctx.playerCount() + '人のときは人狼' + mx + '人までです', 1600); return; }
              ctx.setSetting('wolfCount', gs.wolfCount + 1); paintWc();
            };
          };
          var paintSees = function () {
            ctx.$$('.aw-sees .seg-btn', sc).forEach(function (b) { b.classList.toggle('on', b.dataset.val === gs.wolfSees); });
          };
          sc.querySelector('.aw-sees').onclick = function (ev) {
            var b = ev.target.closest('.seg-btn'); if (!b) return;
            ctx.setSetting('wolfSees', b.dataset.val); paintSees();
          };
          paintWc(); paintSees();
          ctx.playersCard(sc.querySelector('.aw-players'), {
            note: function (n) {
              if (!wolf) return '読み上げ役は <b class="c">順番どおりに交代</b>';
              var w = Math.min(gs.wolfCount, maxWolves(n));
              return '役職配分：<b class="c">市民 ' + (n - w) + '人</b> ／ <b class="s" style="color:#b98cff">人狼 ' + w + '人</b>（お題ごとに配り直し）';
            },
            onChange: function () { paintWc(); }
          });
          sc.querySelector('.aw-start').onclick = function () {
            ctx.startMatch(st.mode, { targetDef: 5, again: function () { ctx.show('setup', { resetStack: true }); } });
            if (wolf) { st.topic = null; startWolfGame(ctx); return; }
            st.coop = { target: gs.coopTarget || 5, rounds: 0, ok: 0, log: [] };
            if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
          };
        }
      },

      talk: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-wq"></span>' }) +
          '<div class="stage">' +
            '<div class="odai-card aw-night"><span class="odai-kicker">人狼モード</span>' +
              '<div class="odai-text" style="font-size:30px">せーので<br>答えよう！</div>' +
              '<p class="odai-note">お題は役職確認で見たものです（口に出さないでね）。<br>全員同時に答えを言って、そろったかどうかを選んでください。</p>' +
            '</div>' +
            '<p class="counter-pill aw-wc-note"></p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-w-ng" style="flex:0 0 36%">ズレた…</button><button class="btn-big aw-w-ok">全員そろった！</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('talk');
          sc.querySelector('.aw-wc-note').textContent = '人狼は ' + st.wolves.length + ' 人 ／ ' + M(ctx).n + ' 人中';
          sc.querySelector('.aw-wq').textContent = '第' + (M(ctx).round + 1) + 'ゲーム';
        }
      },

      vote: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count mode-chip">投票</span>' }) +
          '<div class="scroll-area">' +
            '<div class="lead-box">答えがそろいませんでした。<b>人狼はだれ？</b><br>話し合って多数決で投票し、<b>一番票が多かった人</b>を選んでください。</div>' +
            '<div class="aw-j-list aw-v-list"></div>' +
            '<button type="button" class="btn-mid aw-v-tie" style="width:100%;margin-top:10px">同票で決まらなかった</button>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-v-go" disabled>結果発表へ</button></div>',
        enter: function (ctx) { st.voted = -2; renderVote(ctx); }
      },

      result: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="aw-win"></div>' +
            '<div class="odai-card"><span class="odai-kicker">お題</span><div class="odai-text aw-topic"></div></div>' +
            '<div class="odai-card aw-night" style="min-height:0"><span class="odai-kicker">人狼は…</span>' +
              '<div class="wolf-list aw-wolves"></div></div>' +
          '</div></div>' +
          '<div class="bottom-bar aw-res-bar"><button class="btn-big sub aw-title" style="flex:0 0 34%">タイトルへ</button><button class="btn-big aw-again">次のお題へ</button></div>' +
          '<div class="bottom-bar aw-res-full" hidden><button class="btn-big aw-to-points">ポイント結果へ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('result'), m = M(ctx), o = st.outcome;
          var t = sc.querySelector('.aw-topic');
          t.textContent = st.topic.text;
          ctx.fitText(t, 34, 16);
          sc.querySelector('.aw-wolves').innerHTML = st.wolves.map(function (w) { return '<span>' + esc(m.names[w]) + '</span>'; }).join('');
          var why = o.how === 'match' ? '全員の答えがそろった！'
            : o.how === 'hit' ? '投票で人狼（' + esc(m.names[o.voted]) + ' さん）が最多票！'
            : o.how === 'miss' ? '最多票は ' + esc(m.names[o.voted]) + ' さん（市民）…人狼は逃げ切った！'
            : '同票で決まらず、人狼は逃げ切った！';
          sc.querySelector('.aw-win').innerHTML =
            '<div class="aw-win-box ' + (o.win === 'citizen' ? 'citizen' : 'wolf') + '">' +
              '<div class="aw-win-title">' + (o.win === 'citizen' ? '市民陣営の勝ち！' : '人狼陣営の勝ち！') + '</div>' +
              '<p class="aw-win-why">' + why + '</p>' +
              (st.mode === 'full' ? '<p class="aw-win-pt">勝った陣営のみんなに <b>+1pt</b></p>' : '') +
            '</div>';
          sc.querySelector('.aw-res-bar').hidden = st.mode === 'full';
          sc.querySelector('.aw-res-full').hidden = st.mode !== 'full';
        }
      }
    },

    init: function (ctx) {
      var pl = ctx.screen('play');
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return ctx.drawEntry(SID, avoid); },
        onShow: function () { renderPlay(ctx); }
      });
      ctx.changeBar(pl.querySelector('.aw-chg'), st.slot);
      pl.querySelector('.aw-next').addEventListener('click', function () {
        if (st.mode === 'quick') ctx.nextTurn(); else st.q++;
        nextTopic(ctx);
      });
      pl.querySelector('.aw-ok').addEventListener('click', function () { coopAnswer(ctx, true); });
      pl.querySelector('.aw-ng').addEventListener('click', function () { coopAnswer(ctx, false); });
      pl.querySelector('.aw-end').addEventListener('click', function () {
        ctx.confirm('ゲームを終了して結果を表示しますか？', function () { ctx.show('clear', { resetStack: true }); });
      });
      var cl = ctx.screen('clear');
      cl.querySelector('.aw-cl-title').addEventListener('click', function () { ctx.goTitle(); });
      cl.querySelector('.aw-cl-again').addEventListener('click', function () { ctx.show('setup', { resetStack: true }); });
      /* 人狼モード：せーの → そろった？ → （そろわなければ）投票 → 結果 */
      var finish = function (outcome) { st.outcome = outcome; ctx.show('result', { resetStack: true }); };
      var tk = ctx.screen('talk');
      tk.querySelector('.aw-w-ok').addEventListener('click', function () {
        ctx.confirm('全員の答えがそろいましたか？\n（市民陣営の勝ちになります）', function () { finish({ win: 'citizen', how: 'match' }); });
      });
      tk.querySelector('.aw-w-ng').addEventListener('click', function () { ctx.show('vote', { resetStack: true }); });
      var vt = ctx.screen('vote');
      vt.querySelector('.aw-v-tie').addEventListener('click', function () { st.voted = -1; renderVote(ctx); });
      vt.querySelector('.aw-v-go').addEventListener('click', function () {
        var m = M(ctx), v = st.voted;
        var msg = v === -1 ? '同票で決まらなかった、で結果発表しますか？' : '一番票が多かったのは ' + m.names[v] + ' さんですね？';
        ctx.confirm(msg, function () {
          if (v === -1) finish({ win: 'wolf', how: 'tie' });
          else if (st.wolves.indexOf(v) > -1) finish({ win: 'citizen', how: 'hit', voted: v });
          else finish({ win: 'wolf', how: 'miss', voted: v });
        });
      });
      var rs = ctx.screen('result');
      rs.querySelector('.aw-title').addEventListener('click', function () { ctx.goTitle(); });
      rs.querySelector('.aw-again').addEventListener('click', function () { ctx.nextTurn(); startWolfGame(ctx); });
      rs.querySelector('.aw-to-points').addEventListener('click', function () {
        var m = M(ctx), o = st.outcome;
        var pts = m.names.map(function (n, i) {
          var wolf = st.wolves.indexOf(i) > -1;
          return (o.win === 'wolf') === wolf ? 1 : 0;
        });
        var wn = st.wolves.map(function (w) { return m.names[w]; }).join('、');
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">お題：<b>' + esc(st.topic.text) + '</b></div>' +
            '<p>人狼：<b>' + esc(wn) + '</b></p>' +
            '<p>' + (o.win === 'citizen' ? '市民陣営の勝ち！ 市民のみんなに <b class="pt">+1pt</b>' : '人狼陣営の勝ち！ 人狼に <b class="pt">+1pt</b>') + '</p>',
          shareWin: true,
          onNext: function () { startWolfGame(ctx); }
        });
      });
      window.addEventListener('odai:resize', function () {
        if (pl.classList.contains('active')) ctx.fitText(pl.querySelector('.odai-text'), 44, 18);
      });
    }
  });
})();
