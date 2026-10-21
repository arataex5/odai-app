/* =========================================================
   ワードっち
   画面：ゲーム設定 → 基準選択（親だけ・2つから1つ）→ 暫定チャンピオン選択（3つから1つ）
         → お題画面（チャンピオン＋挑戦ワード＋タイマー）→ 文字入力（決戦）→ 正解判定（親が優勝ワードを選ぶ）
   使用済みになるのは、選ばれた基準・ワードのみ
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;

  var st = {
    round: 0, n: 0, names: [], wins: [],
    kijunCands: [], kijun: null, wordCands: [], champPick: -1,
    champ: '', swaps: 0, log: [], answers: [], list: null, timer: null,
    winner: -1, decided: false
  };

  function parent() { return st.round % st.n; }
  function children() {
    var out = [];
    for (var i = 1; i < st.n; i++) out.push((parent() + i) % st.n);
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
    var pName = st.names[parent()];
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
      intro: function () { return '親は <span class="who">' + esc(pName) + '</span> さん<br>親だけ画面を見てください'; },
      lastLabel: 'この基準に決定',
      onDone: function () {
        st.kijun = st.kijunCands[pick];
        ctx.markUsed('kijun', st.kijun.uid);     // 選ばれた基準だけを使用済みにする
        drawWords(ctx);
        ctx.show('champ', { resetStack: true });
      }
    });
  }

  function drawWords(ctx, avoid) {
    var r = ctx.draw('words', 3, avoid || []);
    st.wordCands = r.items; st.champPick = -1;
    if (r.relaxed) ctx.toast('抽出できるワードが足りないため、使用済みからも選んでいます', 2600);
  }

  /* ---------------- 暫定チャンピオン選択 ---------------- */
  function renderChamp(ctx) {
    var sc = ctx.screen('champ');
    sc.querySelector('.wd-who').innerHTML = '親：<b>' + esc(st.names[parent()]) + '</b> さん';
    choiceList(ctx, sc.querySelector('.choice-list'), st.wordCands, 'ワード', function (i) {
      st.champPick = i;
      sc.querySelector('.wd-decide').disabled = false;
    }, st.champPick);
    sc.querySelector('.wd-decide').disabled = st.champPick < 0;
  }

  /* ---------------- お題画面 ---------------- */
  function renderTalk(ctx) {
    var sc = ctx.screen('talk');
    sc.querySelector('.wd-round').textContent = '第' + (st.round + 1) + 'ラウンド';
    sc.querySelector('.wd-who').innerHTML = '親：<b>' + esc(st.names[parent()]) + '</b> さん';
    var w = sc.querySelector('.champ-word');
    w.textContent = st.champ;
    ctx.fitText(w, 34, 16);
    sc.querySelector('.champ-by').textContent = st.swaps ? ('挑戦で交代 ' + st.swaps + '回目') : '最初の暫定チャンピオン';
    var log = sc.querySelector('.log');
    log.innerHTML = st.log.slice().reverse().map(function (l) {
      return '<li><span class="lg-w">' + esc(l.word) + '</span><span class="lg-r ' + (l.win ? 'win' : 'lose') + '">' + (l.win ? '勝ち → 新チャンピオン' : '負け') + '</span></li>';
    }).join('');
    sc.querySelector('.wd-log-title').hidden = !st.log.length;
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
    var ids = children();
    var head = sc.querySelector('.wd-head');
    if (!st.decided) {
      head.innerHTML = '<div class="lead-box">親の <b>' + esc(st.names[parent()]) + '</b> さんは、基準に一番ふさわしい<b>優勝ワード</b>を1つ選んでください。<br><small>暫定チャンピオン：' + esc(st.champ) + '</small></div>';
    } else {
      var wn = st.winner >= 0 ? st.names[ids[st.winner]] : '';
      head.innerHTML =
        '<div class="kijun-reveal"><div class="kr-label">今回の基準</div><div class="kr-text">' + esc(st.kijun.text) + '</div></div>' +
        (wn ? '<div class="result-headline win">🏆 ' + esc(wn) + ' さんの勝利！</div>' : '');
    }
    var box = sc.querySelector('.jd-list');
    box.innerHTML = '';
    ids.forEach(function (pi, k) {
      var ans = st.answers[k] || '';
      var row = document.createElement('div');
      row.className = 'jd-row' + (st.winner === k ? ' win' : '');
      row.innerHTML =
        '<span class="jd-name">' + esc(st.names[pi]) + '</span>' +
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
    var wins = sc.querySelector('.wins');
    wins.hidden = !st.decided;
    if (st.decided) {
      wins.innerHTML = st.names.map(function (nm, i) { return '<span>' + esc(nm) + '<b>' + (st.wins[i] || 0) + '勝</b></span>'; }).join('');
    }
    sc.querySelector('.wd-bar-pick').hidden = st.decided;
    sc.querySelector('.wd-bar-next').hidden = !st.decided;
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
    defaults: { timerOn: true, timerSec: 180 },
    settings: [
      { key: 'timerOn', type: 'bool', label: 'お題画面にタイマーを表示する' },
      { key: 'timerSec', type: 'time', label: 'タイマーの時間', def: 180, showIf: 'timerOn', hint: '暫定チャンピオンを選んだ後のお題画面に表示されます。0秒になると音が鳴ります。' }
    ],
    logoHtml: function (ctx) {
      return '<div class="wd-hero"><span class="wd-burst" aria-hidden="true"></span>' + ctx.logo('wordcchi', 'gl-svg', 'ワードっち') +
        '<span class="wd-tagline">どっちが上？ 基準は親だけが知っている</span></div>';
    },

    title: function (ctx, box) {
      var row = document.createElement('div');
      row.className = 'mode-row';
      row.innerHTML = '<button class="btn-mode">ゲームスタート</button>';
      row.querySelector('button').addEventListener('click', function () { ctx.show('setup', { resetStack: true }); });
      box.appendChild(row);
    },

    rules: function (ctx) {
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>親だけが知っている<b>基準</b>（例：「切ないもの」「つかんで投げたらよく飛びそうなもの」）を、ワードの勝ち負けから推理するゲームです。</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['基準', '暫定1位', '挑戦', '決戦', '判定'], ['親が選ぶ', '3つから', 'ワードで勝負', '1人1つ', '優勝ワード']) + '</div>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>ゲームの流れ</h3>' +
          '<ul>' +
            '<li><b>① 基準を選ぶ</b>：親だけが画面を見て、ランダムな2つの基準から1つを選びます（選んだ基準だけが「使用済み」になります）。</li>' +
            '<li><b>② 暫定チャンピオン</b>：親はランダムな3つのワードから1つを選び、暫定チャンピオン（暫定1位）にします。</li>' +
            '<li><b>③ 挑戦</b>：子は思いついたワードを自由に言います。親は基準に照らして、暫定チャンピオンに<b>勝ったか負けたか</b>を判定します。勝ったワードが新しい暫定チャンピオンです（お題画面に入力して記録できます）。</li>' +
            '<li><b>④ 決戦</b>：親が区切ったら、子は「基準に一番合う」と思うワードを1人ずつ入力します。</li>' +
            '<li><b>⑤ 判定</b>：親が一番ふさわしい<b>優勝ワード</b>を選びます。優勝ワードを出した人の勝ち！最後に基準を公開します。</li>' +
          '</ul>' +
          '<p>勝ち負けの判定は世間一般の感覚ではなく<b>親の主観</b>でOK。親は毎ラウンド順番に交代します。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>タイマー</h3>' +
          '<p>暫定チャンピオンを選んだ後のお題画面にタイマーが出ます（初期設定はあり・3分）。設定で なし／時間（分・秒）を変更できます。0秒になると音が鳴ります。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">4</span>お題について</h3>' +
          '<p>基準・ワードともに突拍子もないものがそろっています。セリフや造語もあり！お題リストから追加・除外ができます。</p>' +
        '</div>';
    },

    screens: {
      setup: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area"><div class="wd-players"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big wd-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          ctx.playersCard(sc.querySelector('.wd-players'), {
            note: function (n) { return '親は <b class="c">順番どおりに交代</b>（子 ' + (n - 1) + '人）'; }
          });
          sc.querySelector('.wd-start').onclick = function () {
            st.n = ctx.playerCount(); st.names = ctx.playerNames(); st.round = 0;
            st.wins = st.names.map(function () { return 0; });
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
          st.list = ctx.answerList(sc.querySelector('.ans-list'), children().map(function (i) { return { name: st.names[i] }; }), st.answers, {
            noun: 'ワード', placeholder: '基準に一番合うワード'
          });
        }
      },

      judge: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="wd-head"></div><div class="jd-list"></div><div class="wins" hidden></div></div>' +
          '<div class="bottom-bar wd-bar-pick"><button class="btn-big sub wd-jback" style="flex:0 0 34%">‹ 入力へ</button><button class="btn-big wd-decide2">優勝ワードに決定</button></div>' +
          '<div class="bottom-bar wd-bar-next" hidden><button class="btn-big sub wd-title" style="flex:0 0 34%">タイトルへ</button><button class="btn-big wd-again">次のラウンドへ</button></div>',
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
        ctx.confirm('親の' + st.names[parent()] + 'さんですか？\n（基準が表示されます）', function () {
          ctx.info('今回の基準（親だけ見てください）', '<p style="font-size:22px;font-weight:900;text-align:center;margin:6px 0">' + esc(st.kijun.text) + '</p>');
        });
      });
      tk.querySelector('.wd-win').addEventListener('click', function () { challenge(ctx, true); });
      tk.querySelector('.wd-lose').addEventListener('click', function () { challenge(ctx, false); });
      tk.querySelector('.wd-ch').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); this.blur(); } });
      tk.querySelector('.wd-final').addEventListener('click', function () {
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
        var ids = children();
        ctx.confirm('「' + st.answers[st.winner] + '」を優勝ワードにしますか？', function () {
          st.decided = true;
          st.wins[ids[st.winner]] = (st.wins[ids[st.winner]] || 0) + 1;
          renderJudge(ctx);
        });
      });
      jd.querySelector('.wd-title').addEventListener('click', function () { ctx.goTitle(); });
      jd.querySelector('.wd-again').addEventListener('click', function () { st.round++; startRound(ctx); });

      window.addEventListener('odai:resize', function () {
        if (tk.classList.contains('active')) ctx.fitText(tk.querySelector('.champ-word'), 34, 16);
      });
    }
  });
})();
