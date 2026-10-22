/* =========================================================
   ワードっち
   流れ：基準選択（親だけ・2つから1つ）→ 暫定チャンピオン選択（3つから1つ）
        → お題画面（チャンピオン＋挑戦ワード＋タイマー）→ 文字入力（決戦）→ 正解判定（親が優勝ワードを選ぶ）
   遊び方：① お題だけ表示（基準 → チャンピオン → お題画面 →「次のお題」）
           ② クイックスタート（点数なし・親は順番に交代）
           ③ フルゲーム（優勝ワードを出した人に 1pt。〇点先取）
   使用済みになるのは、選ばれた基準・ワードのみ。チェンジボタンはなし
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;

  var st = {
    mode: 'quick', q: 1,
    kijunCands: [], kijun: null, wordCands: [], champPick: -1,
    champ: '', swaps: 0, log: [], answers: [], list: null, timer: null,
    winner: -1, decided: false
  };

  function M(ctx) { return ctx.match(); }
  function parentName(ctx) { return st.mode === 'topic' ? '' : ctx.turn().name; }
  function children(ctx) {
    var m = M(ctx), p = ctx.turn().idx, out = [];
    for (var i = 1; i < m.n; i++) out.push((p + i) % m.n);
    return out;
  }

  function choiceList(ctx, box, items, label, onPick, picked) {
    box.innerHTML = '';
    items.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (picked === i ? ' on' : '');
      b.innerHTML = '<span class="ch-no">' + label + ' ' + (i + 1) + '</span>' + esc(t.text);
      b.addEventListener('click', function () {
        ctx.$$('.choice', box).forEach(function (c, k) { c.classList.toggle('on', k === i); });
        onPick(i);
      });
      box.appendChild(b);
    });
  }

  function startRound(ctx) {
    var r = ctx.draw('kijun', 2);
    if (r.items.length < 2) { ctx.toast('基準が2つ以上必要です。お題を追加してください', 2400); return; }
    if (r.relaxed) ctx.toast('抽出できる基準が足りないため、使用済みからも選んでいます', 2600);
    st.kijunCands = r.items; st.kijun = null;
    st.wordCands = []; st.champPick = -1; st.champ = ''; st.swaps = 0; st.log = [];
    st.answers = []; st.winner = -1; st.decided = false;
    if (st.timer) { st.timer.destroy(); st.timer = null; }
    var pName = parentName(ctx);
    var pick = -1;
    ctx.reveal({
      items: [{
        name: pName,
        render: function (body, api) {
          body.innerHTML = '<p class="rv-title">あなたは <b>親</b> です。<br>2つの基準から <b>1つ</b> 選んでください（子には秘密）</p><div class="choice-list"></div>';
          api.ready(false);
          choiceList(ctx, body.querySelector('.choice-list'), st.kijunCands, '基準', function (i) { pick = i; api.ready(true); }, -1);
        }
      }],
      intro: function () {
        return pName ? '親は <span class="who">' + esc(pName) + '</span> さん<br>親だけ画面を見てください' : '<span class="who">親</span>だけ画面を見てください';
      },
      confirm: !!pName,
      lastLabel: 'この基準に決定',
      onDone: function () {
        st.kijun = st.kijunCands[pick];
        ctx.markUsed('kijun', st.kijun.uid);     // 選ばれた基準だけを使用済みにする
        var w = ctx.draw('words', 3);
        st.wordCands = w.items; st.champPick = -1;
        if (w.relaxed) ctx.toast('抽出できるワードが足りないため、使用済みからも選んでいます', 2600);
        ctx.show('champ', { resetStack: true });
      }
    });
  }

  /* ---------------- 暫定チャンピオン選択 ---------------- */
  function renderChamp(ctx) {
    var sc = ctx.screen('champ');
    var pn = parentName(ctx);
    sc.querySelector('.wd-who').innerHTML = pn ? '親：<b>' + esc(pn) + '</b> さん' : '親が選んでください';
    choiceList(ctx, sc.querySelector('.choice-list'), st.wordCands, 'ワード', function (i) {
      st.champPick = i;
      sc.querySelector('.wd-decide').disabled = false;
    }, st.champPick);
    sc.querySelector('.wd-decide').disabled = st.champPick < 0;
  }

  /* ---------------- お題画面 ---------------- */
  function renderTalk(ctx) {
    var sc = ctx.screen('talk');
    var pn = parentName(ctx);
    sc.querySelector('.wd-round').textContent = st.mode === 'topic' ? '第' + st.q + '問' : '第' + (M(ctx).round + 1) + 'ラウンド';
    sc.querySelector('.wd-who').innerHTML = pn ? '親：<b>' + esc(pn) + '</b> さん' : '';
    var w = sc.querySelector('.champ-word');
    w.textContent = st.champ;
    ctx.fitText(w, 34, 16);
    sc.querySelector('.champ-by').textContent = st.swaps ? ('挑戦で交代 ' + st.swaps + '回目') : '最初の暫定チャンピオン';
    var log = sc.querySelector('.log');
    log.innerHTML = st.log.slice().reverse().map(function (l) {
      return '<li><span class="lg-w">' + esc(l.word) + '</span><span class="lg-r ' + (l.win ? 'win' : 'lose') + '">' + (l.win ? '勝ち → 新チャンピオン' : '負け') + '</span></li>';
    }).join('');
    sc.querySelector('.wd-log-title').hidden = !st.log.length;
    sc.querySelector('.wd-final').textContent = st.mode === 'topic' ? '次のお題へ' : '決戦へ（ワード入力）';
  }
  function challenge(ctx, win) {
    var sc = ctx.screen('talk');
    var inp = sc.querySelector('.wd-ch');
    var word = inp.value.trim();
    if (!word) { ctx.toast('挑戦するワードを入力してください', 1400); inp.focus(); return; }
    st.log.push({ word: word, win: win });
    if (win) { st.champ = word; st.swaps++; }
    inp.value = '';
    renderTalk(ctx);
    ctx.toast(win ? '「' + word + '」が新しい暫定チャンピオン！' : '「' + word + '」は負け', 1500);
  }

  /* ---------------- 正解判定 ---------------- */
  function renderJudge(ctx) {
    var sc = ctx.screen('judge');
    var ids = children(ctx), m = M(ctx);
    var head = sc.querySelector('.wd-head');
    if (!st.decided) {
      head.innerHTML = '<div class="lead-box">親の <b>' + esc(parentName(ctx)) + '</b> さんは、基準に一番ふさわしい<b>優勝ワード</b>を1つ選んでください。<br><small>暫定チャンピオン：' + esc(st.champ) + '</small></div>';
    } else {
      var wn = st.winner >= 0 ? m.names[ids[st.winner]] : '';
      head.innerHTML =
        '<div class="kijun-reveal"><div class="kr-label">今回の基準</div><div class="kr-text">' + esc(st.kijun.text) + '</div></div>' +
        (wn ? '<div class="result-headline win">🏆 ' + esc(wn) + ' さんの優勝！</div>' : '');
    }
    var box = sc.querySelector('.jd-list');
    box.innerHTML = '';
    ids.forEach(function (pi, k) {
      var ans = st.answers[k] || '';
      var row = document.createElement('div');
      row.className = 'jd-row' + (st.winner === k ? ' win' : '');
      row.innerHTML =
        '<span class="jd-name">' + esc(m.names[pi]) + '</span>' +
        '<span class="jd-ans' + (ans ? '' : ' empty') + '">' + (ans ? esc(ans) : '（未入力）') + '</span>' +
        (st.decided ? (st.winner === k ? '<span class="jd-pick" style="display:flex;align-items:center">🏆 優勝</span>' : '')
                    : '<button class="jd-pick">' + (st.winner === k ? '✓ 優勝' : 'これ！') + '</button>');
      var b = row.querySelector('button.jd-pick');
      if (b) b.addEventListener('click', function () {
        if (!ans) { ctx.toast('未入力のワードは選べません', 1300); return; }
        st.winner = k; renderJudge(ctx);
      });
      box.appendChild(row);
    });
    sc.querySelector('.wd-bar-pick').hidden = st.decided;
    sc.querySelector('.wd-bar-next').hidden = !st.decided;
    sc.querySelector('.wd-again').textContent = st.mode === 'full' ? 'ポイント結果へ' : '次のラウンドへ';
  }

  /* ---------------- ルール説明のイラスト ---------------- */
  function rulesIll(ctx) {
    var I = ctx.ill;
    var s1 = I.svg(320, 150,
      I.person(48, 136, { c: 3, hand: 'right', label: '親' }) +
      I.card(84, 16, 96, 36, '切ないもの', { sub: '基準 1', size: 11, stroke: '#ff3d8b' }) +
      I.card(84, 62, 96, 36, '強そうなもの', { sub: '基準 2', size: 11, stroke: 'currentColor' }) +
      I.mark(192, 34, true, 7) +
      I.arrow(204, 40, 226, 58) +
      I.card(212, 62, 100, 40, '夕焼け', { sub: '暫定チャンピオン', size: 13, fill: '#ffd23f', color: '#1b1320', stroke: '#1b1320' }) +
      I.text(262, 120, '3つのワードから1つ選ぶ', { size: 9.5, cls: 'il-dim' }),
      '親は基準を秘密で選び、暫定チャンピオンを決める');
    var s2 = I.svg(320, 176,
      I.card(14, 8, 112, 46, '夕焼け', { sub: '👑 チャンピオン', size: 14, fill: '#ffd23f', color: '#1b1320', stroke: '#1b1320' }) +
      I.text(160, 38, 'VS', { size: 20, weight: 900, color: '#ff3d8b' }) +
      I.card(194, 8, 112, 46, '初恋', { sub: '子の挑戦', size: 14 }) +
      I.person(40, 162, { c: 1, mouth: 'o' }) + I.say(40, 162, '？', { think: true, w: 34 }) +
      I.person(100, 162, { c: 2, eyes: 'happy' }) + I.say(100, 162, '初恋！', {}) +
      I.person(236, 162, { c: 3, label: '親（判定）' }) + I.say(236, 162, '「初恋」の勝ち！', { dx: 4 }),
      '子はワードを言って挑戦。親が基準で勝ち負けを判定');
    return { s1: s1, s2: s2 };
  }

  A.registerGame({
    id: 'wordcchi',
    name: 'ワードっち',
    mark: 'ワ',
    sub: '親だけが知る「基準」でワードを比べよう',
    color: { dark: ['#ff3d8b', '#ff7ab2'], light: ['#e41e72', '#ff3d8b'] },
    players: { min: 3, max: 10, def: 4 },
    sets: [
      { id: 'kijun', label: '基準', rev: 1, fields: [{ key: 'text', label: '基準', placeholder: '例：切ないもの' }] },
      { id: 'words', label: 'ワード', rev: 1, fields: [{ key: 'text', label: 'ワード', placeholder: '例：フリースタイル流しそうめん' }] }
    ],
    defaults: { timerOn: true, timerSec: 180, target: 3 },
    settings: [
      { key: 'timerOn', type: 'bool', label: 'お題画面にタイマーを表示する' },
      { key: 'timerSec', type: 'time', label: 'タイマーの時間', def: 180, showIf: 'timerOn', hint: '暫定チャンピオンを選んだ後のお題画面に表示されます。0秒になると音が鳴ります。' },
      { key: 'alarm', type: 'sound', label: 'アラーム音', showIf: 'timerOn' }
    ],
    logoHtml: function (ctx) {
      return '<div class="wd-hero"><span class="wd-burst" aria-hidden="true"></span>' + ctx.logo('wordcchi', 'gl-svg', 'ワードっち') +
        '<span class="wd-tagline">どっちが上？ 基準は親だけが知っている</span></div>';
    },

    title: function (ctx, box) {
      ctx.modeButtons(box, {
        topic: { sub: '基準とチャンピオンを出すだけ。判定・点数なし',
          fn: function () { st.mode = 'topic'; st.q = 1; ctx.startMatch('topic'); startRound(ctx); } },
        quick: { fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { sub: '優勝ワードで1pt。〇点先取で勝敗',
          fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
    },

    rules: function (ctx) {
      var il = rulesIll(ctx), I = ctx.ill;
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>親だけが知っている<b>基準</b>（例：「切ないもの」「つかんで投げたらよく飛びそうなもの」）を、ワードの勝ち負けから推理するゲームです。</p>' +
          I.fig(il.s1, '選んだ基準と、選んだワードだけが「使用済み」になります') +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>ゲームの流れ</h3>' +
          I.fig(il.s2, '勝ったワードが新しい暫定チャンピオンに') +
          '<ul>' +
            '<li><b>① 基準を選ぶ</b>：親だけが画面を見て、ランダムな2つの基準から1つを選びます。</li>' +
            '<li><b>② 暫定チャンピオン</b>：親はランダムな3つのワードから1つを選び、暫定チャンピオンにします。</li>' +
            '<li><b>③ 挑戦</b>：子は思いついたワードを自由に言います。親は基準に照らして、暫定チャンピオンに<b>勝ったか負けたか</b>を判定します（お題画面に入力して記録できます）。</li>' +
            '<li><b>④ 決戦</b>：親が区切ったら、子は「基準に一番合う」と思うワードを1人ずつ入力します。</li>' +
            '<li><b>⑤ 判定</b>：親が一番ふさわしい<b>優勝ワード</b>を選びます。最後に基準を公開します。</li>' +
          '</ul>' +
          '<p>勝ち負けの判定は世間一般の感覚ではなく<b>親の主観</b>でOK。親は毎ラウンド順番に交代します。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: '基準選び → 暫定チャンピオン → お題画面（タイマー）だけを使います。「次のお題へ」で次の基準選びへ。',
          quick: '点数なしで何回でも。決戦・優勝ワードの判定まで遊び、親は全員が1回ずつ担当したら最初から。',
          full: '優勝ワードを出した人に <b>1pt</b>。「〇点先取」で勝敗を決め、ラウンドごとにポイント結果、最後に勝利画面。'
        }) +
        '<div class="rule-sec"><h3><span class="badge">3</span>タイマー</h3>' +
          '<p>暫定チャンピオンを選んだ後のお題画面にタイマーが出ます（初期設定はあり・3分）。設定で なし／時間（分・秒）／アラーム音を変更できます。</p>' +
        '</div>';
    },

    screens: {
      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip wd-mode-title"></span>' }) +
          '<div class="scroll-area"><div class="wd-target"></div><div class="wd-players"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big wd-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          sc.querySelector('.wd-mode-title').textContent = st.mode === 'full' ? 'フルゲーム' : 'クイックスタート';
          var tg = sc.querySelector('.wd-target');
          tg.innerHTML = '';
          if (st.mode === 'full') ctx.targetCard(tg, { def: 3, hint: '優勝ワードを出した人に 1pt。' });
          ctx.playersCard(sc.querySelector('.wd-players'), {
            note: function (n) { return '親は <b class="c">順番どおりに交代</b>（子 ' + (n - 1) + '人）'; }
          });
          sc.querySelector('.wd-start').onclick = function () {
            ctx.startMatch(st.mode, { targetDef: 3, again: function () { ctx.show('setup', { resetStack: true }); } });
            startRound(ctx);
          };
        }
      },

      champ: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area">' +
            '<p class="who-line wd-who"></p>' +
            '<div class="lead-box" style="margin-top:8px">3つのワードから <b>暫定チャンピオン</b> を1つ選んでください。</div>' +
            '<div class="choice-list"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big wd-decide" disabled>暫定チャンピオンに決定</button></div>',
        enter: function (ctx) { renderChamp(ctx); }
      },

      talk: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count wd-round"></span><button class="chip wd-peek">基準</button>' }) +
          '<div class="scroll-area">' +
            '<p class="who-line wd-who"></p>' +
            '<div class="wd-timer timer-compact"></div>' +
            '<div class="champ"><div class="champ-label">暫定チャンピオン</div><div class="champ-word"></div><div class="champ-by"></div></div>' +
            '<div class="wd-vs" aria-hidden="true">' + (window.OdaiLogo ? window.OdaiLogo('vs', 'vs-svg', 'VS') : 'VS') + '</div>' +
            '<div class="challenger">' +
              '<p class="q-title">挑戦ワード（親が判定）</p>' +
              '<div class="challenge"><input type="text" class="wd-ch" maxlength="30" placeholder="子が言ったワード" enterkeyhint="done"></div>' +
              '<div class="btn-row"><button class="btn-mid acc wd-win">勝ち（交代）</button><button class="btn-mid wd-lose">負け</button></div>' +
            '</div>' +
            '<p class="q-title wd-log-title" style="margin-top:14px">挑戦の記録</p>' +
            '<ul class="log" style="margin-top:6px"></ul>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big wd-final">決戦へ（ワード入力）</button></div>',
        enter: function (ctx, opts) {
          var sc = ctx.screen('talk');
          if (!opts.back) {
            if (st.timer) { st.timer.destroy(); st.timer = null; }
            var gs = ctx.settings(), box = sc.querySelector('.wd-timer');
            box.hidden = !gs.timerOn;
            if (gs.timerOn) st.timer = ctx.timer(box, gs.timerSec || 180);
          }
          renderTalk(ctx);
        }
      },

      input: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="lead-box wd-lead"></div><div class="ans-list"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big sub wd-back" style="flex:0 0 34%">‹ お題画面</button><button class="btn-big wd-go">優勝ワードの判定へ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('input');
          sc.querySelector('.wd-lead').innerHTML = '子は、親の基準に<b>一番ふさわしい</b>と思うワードを1つずつ入力してください。<br><small>暫定チャンピオン：' + esc(st.champ) + '</small>';
          st.list = ctx.answerList(sc.querySelector('.ans-list'), children(ctx).map(function (i) { return { name: M(ctx).names[i] }; }), st.answers, {
            noun: 'ワード', placeholder: '基準に一番合うワード'
          });
        }
      },

      judge: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="wd-head"></div><div class="jd-list"></div></div>' +
          '<div class="bottom-bar wd-bar-pick"><button class="btn-big sub wd-jback" style="flex:0 0 34%">‹ 入力へ</button><button class="btn-big wd-decide2">優勝ワードに決定</button></div>' +
          '<div class="bottom-bar wd-bar-next" hidden><button class="btn-big wd-again">次のラウンドへ</button></div>',
        enter: function (ctx) { renderJudge(ctx); }
      }
    },

    init: function (ctx) {
      var ch = ctx.screen('champ');
      ch.querySelector('.wd-decide').addEventListener('click', function () {
        if (st.champPick < 0) return;
        var w = st.wordCands[st.champPick];
        ctx.markUsed('words', w.uid);           // 選ばれたワードだけを使用済みにする
        st.champ = w.text; st.swaps = 0;
        ctx.show('talk', { resetStack: true });
      });

      var tk = ctx.screen('talk');
      tk.querySelector('.wd-peek').addEventListener('click', function () {
        var show = function () {
          ctx.info('今回の基準（親だけ見てください）', '<p style="font-size:22px;font-weight:900;text-align:center;margin:6px 0">' + esc(st.kijun.text) + '</p>');
        };
        var pn = parentName(ctx);
        ctx.confirm((pn ? '親の' + pn + 'さんですか？' : '親ですか？') + '\n（基準が表示されます）', show);
      });
      tk.querySelector('.wd-win').addEventListener('click', function () { challenge(ctx, true); });
      tk.querySelector('.wd-lose').addEventListener('click', function () { challenge(ctx, false); });
      tk.querySelector('.wd-ch').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); this.blur(); } });
      tk.querySelector('.wd-final').addEventListener('click', function () {
        if (st.mode === 'topic') {
          ctx.confirm('次のお題（基準選び）へ進みますか？\n今回の基準：' + st.kijun.text, function () { st.q++; startRound(ctx); });
          return;
        }
        ctx.confirm('挑戦を終えて、決戦（ワード入力）へ進みますか？', function () { ctx.show('input'); });
      });

      var ip = ctx.screen('input');
      ip.querySelector('.wd-back').addEventListener('click', function () { ctx.show('talk', { replace: true, back: true }); });
      ip.querySelector('.wd-go').addEventListener('click', function () {
        if (st.list && !st.list.filled()) ctx.confirm('まだ入力していない人がいますが、判定へ進みますか？', function () { ctx.show('judge'); });
        else ctx.show('judge');
      });

      var jd = ctx.screen('judge');
      jd.querySelector('.wd-jback').addEventListener('click', function () { ctx.show('input', { replace: true }); });
      jd.querySelector('.wd-decide2').addEventListener('click', function () {
        if (st.winner < 0) { ctx.toast('優勝ワードを選んでください', 1400); return; }
        ctx.confirm('「' + st.answers[st.winner] + '」を優勝ワードにしますか？', function () {
          st.decided = true;
          renderJudge(ctx);
        });
      });
      jd.querySelector('.wd-again').addEventListener('click', function () {
        if (st.mode === 'full') {
          var ids = children(ctx), m = M(ctx);
          var pts = m.names.map(function () { return 0; });
          var wi = ids[st.winner];
          pts[wi] = 1;
          ctx.roundResult({
            pts: pts,
            head: '<div class="rr-topic">基準：<b>' + esc(st.kijun.text) + '</b></div>' +
              '<p>優勝ワード「<b>' + esc(st.answers[st.winner]) + '</b>」 → ' + esc(m.names[wi]) + ' さん <b class="pt">+1pt</b></p>',
            onNext: function () { startRound(ctx); }
          });
          return;
        }
        ctx.nextTurn(); startRound(ctx);
      });

      window.addEventListener('odai:resize', function () {
        if (tk.classList.contains('active')) ctx.fitText(tk.querySelector('.champ-word'), 34, 16);
      });
    }
  });
})();
