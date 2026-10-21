/* =========================================================
   ほどよく
   画面：ゲーム設定 → お題画面（親だけ見る＋タイマー）→ 回答入力 → 正解判定
   お題：普通（決まったお題。自動判定）／スペシャル（カテゴリーから親が自分で決める。手動判定）
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;

  var st = {
    round: 0, n: 0, names: [], kind: 'mix',
    set: null, topic: null, shown: false,
    answers: [], judge: [], spAnswer: '', timer: null, list: null,
    total: [], committed: false
  };

  /* ---------------- 得点 ----------------
     回答者：お題を当てたら +1pt
     親　　：正解者がちょうど1人 → +3pt ／ 2人以上（全員正解を除く）→ +1pt ／ 全員不正解・全員正解 → 0pt
     未判定は不正解として数える */
  function parentPoint(ok, m) {
    if (ok === 1 && m > 1) return 3;
    if (ok >= 2 && ok < m) return 1;
    return 0;
  }
  function scoreRound() {
    var ids = answerers(), ok = 0, pts = [];
    for (var i = 0; i < st.n; i++) pts.push(0);
    ids.forEach(function (pi, k) { if (st.judge[k] === true) { ok++; pts[pi] += 1; } });
    var pp = parentPoint(ok, ids.length);
    pts[asker()] += pp;
    return { pts: pts, ok: ok, m: ids.length, parent: pp };
  }
  function commitRound() {
    if (st.committed) return;
    var r = scoreRound();
    r.pts.forEach(function (p, i) { st.total[i] = (st.total[i] || 0) + p; });
    st.committed = true;
  }

  function asker() { return st.round % st.n; }
  function answerers() {
    var out = [];
    for (var i = 1; i < st.n; i++) out.push((asker() + i) % st.n);
    return out;
  }

  /* お題の抽選（ゲーム開始・チェンジ共通）。ミックスはスペシャルが約3回に1回 */
  function drawEntry(ctx, avoid) {
    var kind = st.kind;
    var sid = kind === 'normal' ? 'normal' : kind === 'special' ? 'special' : (Math.random() < 1 / 3 ? 'special' : 'normal');
    var e = ctx.drawEntry(sid, avoid);
    if (!e && kind === 'mix') e = ctx.drawEntry(sid === 'normal' ? 'special' : 'normal', avoid);
    return e;
  }

  function startRound(ctx) {
    st.answers = []; st.judge = []; st.spAnswer = ''; st.shown = false; st.committed = false;
    var e = drawEntry(ctx, []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
    st.slot.start(e);
    ctx.show('topic', { resetStack: true });
  }

  /* ---------------- お題画面 ---------------- */
  function renderTopic(ctx) {
    var sc = ctx.screen('topic');
    sc.querySelector('.hy-round').textContent = '第' + (st.round + 1) + 'ラウンド';
    sc.querySelector('.hy-who').innerHTML = '親：<b>' + esc(st.names[asker()]) + '</b> さん';
    var card = sc.querySelector('.hy-card');
    var sp = (st.set === 'special');
    if (!st.shown) {
      card.className = 'odai-card hy-card cover';
      card.innerHTML =
        '<span class="hy-gauge" aria-hidden="true"><i></i></span>' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '普通') + '</span>' +
        '<div class="cover-msg">親の <b>' + esc(st.names[asker()]) + '</b> さんだけ<br>画面を見てください<small>タップでお題を表示</small></div>';
    } else {
      card.className = 'odai-card hy-card';
      card.innerHTML =
        '<span class="hy-gauge" aria-hidden="true"><i></i></span>' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '普通のお題') + '</span>' +
        '<div class="odai-text">' + esc(st.topic.text) + '</div>' +
        (sp ? '<p class="odai-note">このカテゴリーの中から、答えを<b>1つ自分で決めて</b>ください。<br>（決めた答えは判定画面で入力できます）</p>'
            : '<p class="odai-note">このお題が当てられるようにヒントを出しましょう。</p>') +
        '<span class="peek">タップで隠す</span>';
      ctx.fitText(card.querySelector('.odai-text'), 46, 18);
    }
    sc.querySelector('.hy-chg').hidden = !st.shown;
  }

  function enterTopic(ctx, opts) {
    var sc = ctx.screen('topic');
    if (!opts.back) {
      if (st.timer) { st.timer.destroy(); st.timer = null; }
      var gs = ctx.settings();
      var box = sc.querySelector('.hy-timer');
      box.hidden = !gs.timerOn;
      sc.querySelector('.hy-next').classList.remove('pulse');
      if (gs.timerOn) st.timer = ctx.timer(box, gs.timerSec || 60, {
        onEnd: function () { sc.querySelector('.hy-next').classList.add('pulse'); }   // 0秒 → 回答入力へ
      });
    }
    renderTopic(ctx);
  }

  /* ---------------- 回答入力 ---------------- */
  function enterInput(ctx) {
    var sc = ctx.screen('input');
    sc.querySelector('.hy-lead').innerHTML =
      '親 <b>' + esc(st.names[asker()]) + '</b> さんのヒントから、お題だと思うものを1人ずつ入力してください。' +
      (st.set === 'special' ? '<br><small>スペシャル：親が決めた答えを当てます。</small>' : '');
    var ids = answerers();
    st.list = ctx.answerList(sc.querySelector('.ans-list'), ids.map(function (i) { return { name: st.names[i] }; }), st.answers, {
      placeholder: 'お題だと思うもの'
    });
  }

  /* ---------------- 正解判定 ---------------- */
  function autoJudge(ctx, ans) {
    var a = ctx.normalize(ans);
    if (!a) return false;
    var keys = [];
    if (st.set === 'normal') {
      keys.push(st.topic.text);
      String(st.topic.x && st.topic.x.alt || '').split(/[\/／]/).forEach(function (s) { if (s.trim()) keys.push(s); });
    } else if (st.spAnswer.trim()) {
      st.spAnswer.split(/[\/／]/).forEach(function (s) { if (s.trim()) keys.push(s); });
    } else return null;
    return keys.some(function (k) { return ctx.normalize(k) === a; });
  }

  function renderJudge(ctx) {
    var sc = ctx.screen('judge');
    var sp = (st.set === 'special');
    var head = sc.querySelector('.hy-answer');
    head.innerHTML =
      '<div class="odai-card" style="min-height:0">' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '正解（お題）') + '</span>' +
        '<div class="odai-text" style="font-size:34px">' + esc(st.topic.text) + '</div>' +
        (!sp && st.topic.x && st.topic.x.alt ? '<p class="odai-note">別解：' + esc(st.topic.x.alt) + '</p>' : '') +
        (sp ? '<p class="odai-note">親が決めた答えを入力すると自動で判定します（○×はタップで変更できます）</p>' +
              '<div class="sp-answer" style="width:100%"><input type="text" class="hy-sp" maxlength="30" placeholder="親の答え" value="' + esc(st.spAnswer) + '"></div>'
            : '<p class="odai-note">自動で判定しました。○×はタップで変更できます。</p>') +
      '</div>';
    var inp = head.querySelector('.hy-sp');
    if (inp) {
      inp.addEventListener('change', function () {
        st.spAnswer = this.value;
        var ids = answerers();
        ids.forEach(function (pi, k) { st.judge[k] = autoJudge(ctx, st.answers[k]); });
        renderRows(ctx);
      });
    }
    renderRows(ctx);
  }
  function renderRows(ctx) {
    var sc = ctx.screen('judge');
    var box = sc.querySelector('.jd-list');
    box.innerHTML = '';
    var ids = answerers(), ok = 0;
    ids.forEach(function (pi, k) {
      var ans = st.answers[k] || '';
      var j = st.judge[k];
      if (j === true) ok++;
      var row = document.createElement('div');
      row.className = 'jd-row' + (j === true ? ' ok' : j === false ? ' ng' : '');
      row.innerHTML =
        '<span class="jd-name">' + esc(st.names[pi]) + '</span>' +
        '<span class="jd-ans' + (ans ? '' : ' empty') + '">' + (ans ? esc(ans) : '（未回答）') + '</span>' +
        '<span class="jd-btns"><button class="jd-btn ok' + (j === true ? ' on' : '') + '" aria-label="正解">○</button>' +
        '<button class="jd-btn ng' + (j === false ? ' on' : '') + '" aria-label="不正解">×</button></span>';
      row.querySelector('.ok').addEventListener('click', function () { st.judge[k] = true; renderRows(ctx); });
      row.querySelector('.ng').addEventListener('click', function () { st.judge[k] = false; renderRows(ctx); });
      box.appendChild(row);
    });
    var pending = st.judge.filter(function (x, k) { return k < ids.length && (x !== true && x !== false); }).length;
    var r = scoreRound();
    var why = r.ok === 0 ? '全員不正解' : r.ok === r.m ? '全員正解' : r.ok === 1 ? '正解者がちょうど1人' : '正解者が2人以上';
    sc.querySelector('.score-line').innerHTML = '正解者 <b>' + ok + '</b> 人 ／ ' + ids.length + ' 人' +
      '<span class="hy-why">親（' + esc(st.names[asker()]) + '）：' + why + ' → <b>+' + r.parent + 'pt</b></span>' +
      (pending ? '<small class="hy-pending">未判定 ' + pending + ' 人（○か×をタップ。未判定は不正解で集計）</small>' : '');
    renderBoard(ctx, r);
  }

  /* ポイント表（今回の獲得と合計） */
  function renderBoard(ctx, r) {
    var sc = ctx.screen('judge');
    var ids = answerers();
    var rows = st.names.map(function (nm, i) {
      var k = ids.indexOf(i);
      var mark = (i === asker()) ? '親' : (st.judge[k] === true ? '○' : '×');
      var base = (st.total[i] || 0) - (st.committed ? r.pts[i] : 0);
      return { i: i, nm: nm, mark: mark, pt: r.pts[i], total: base + r.pts[i] };
    });
    sc.querySelector('.hy-board').innerHTML =
      '<div class="sub-title">ポイント</div>' +
      '<div class="rs-head"><span class="rsh-rank">結果</span><span class="rsh-name">プレイヤー名</span><span class="rsh-pt">今回</span><span class="rsh-total">合計</span></div>' +
      '<div class="rs-list">' + rows.map(function (x) {
        return '<div class="rs-row' + (x.mark === '親' ? ' parent' : '') + '">' +
          '<span class="rs-rank">' + x.mark + '</span>' +
          '<span class="rs-name">' + esc(x.nm) + '</span>' +
          '<span class="rs-pt">+' + x.pt + '</span>' +
          '<span class="rs-total">' + x.total + '</span></div>';
      }).join('') + '</div>';
  }

  /* ---------------- 最終結果 ---------------- */
  function renderResult(ctx) {
    var sc = ctx.screen('result');
    var rows = st.names.map(function (nm, i) { return { nm: nm, total: st.total[i] || 0 }; });
    rows.sort(function (a, b) { return b.total - a.total; });
    var top = rows.length ? rows[0].total : 0;
    var winners = rows.filter(function (x) { return x.total === top; }).map(function (x) { return x.nm + 'さん'; });
    sc.querySelector('.hy-win').innerHTML = '🏆 ' + esc(winners.join('、')) + 'の勝利！';
    sc.querySelector('.hy-rounds').textContent = (st.round + 1) + 'ラウンド終了';
    var rank = 0, prev = null;
    sc.querySelector('.rs-list').innerHTML = rows.map(function (x, k) {
      if (x.total !== prev) { rank = k + 1; prev = x.total; }
      return '<div class="rs-row' + (rank === 1 ? ' top' : '') + '"><span class="rs-rank">' + rank + '位</span>' +
        '<span class="rs-name">' + esc(x.nm) + '</span><span class="rs-total">' + x.total + 'pt</span></div>';
    }).join('');
  }
  function enterJudge(ctx, opts) {
    if (!opts.back) {
      var ids = answerers();
      st.judge = ids.map(function (pi, k) {
        var r = autoJudge(ctx, st.answers[k]);
        return r;   // スペシャルで答え未入力のときは null（未判定）
      });
    }
    renderJudge(ctx);
  }

  /* ---------------- ゲーム定義 ---------------- */
  A.registerGame({
    id: 'hodoyoku',
    name: 'ほどよく',
    mark: 'ほ',
    sub: '親のヒントからお題を当てよう',
    color: { dark: ['#ef8a3c', '#ffb36b'], light: ['#cf5f17', '#ec8233'] },
    players: { min: 3, max: 20, def: 4 },
    sets: [
      { id: 'normal', label: '普通', rev: 1,
        fields: [
          { key: 'text', label: 'お題', placeholder: '例：アメリカ' },
          { key: 'alt', label: '別解', placeholder: '例：米国/USA', hint: '正解として扱う別の答え。/ で区切って複数書けます（ひらがな・カタカナの違いは自動で同じ扱いになります）' }
        ],
        sub: function (t) { return t.x && t.x.alt ? '別解：' + t.x.alt : ''; } },
      { id: 'special', label: 'スペシャル', rev: 1,
        fields: [{ key: 'text', label: 'カテゴリー', placeholder: '例：アーティスト名' }] }
    ],
    defaults: { kind: 'mix', timerOn: false, timerSec: 60 },
    settings: [
      { key: 'timerOn', type: 'bool', label: 'お題画面にタイマーを表示する' },
      { key: 'timerSec', type: 'time', label: 'タイマーの時間', def: 60, showIf: 'timerOn', hint: '0秒になると音が鳴ります。' }
    ],
    help: {
      kind: ['お題の種類', '<b>普通</b>：「アメリカ」「カレー」など、答えが決まっているお題。回答はアプリが自動で判定します。<br><b>スペシャル</b>：「アーティスト名」「料理名」など広めのカテゴリー。親がその中から答えを自分で決めます。正解かどうかはみんなで判断します。<br><b>ミックス</b>：普通とスペシャルをランダムに出題します（スペシャルは約3回に1回）。']
    },
    logoHtml: function (ctx) {
      return '<div class="hy-hero">' + ctx.logo('hodoyoku', 'gl-svg', 'ほどよく') +
        '<div class="hy-meter" aria-hidden="true"><span class="hm-scale"></span><span class="hm-needle"></span></div></div>';
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
          '<p>親だけがお題を見て、ヒントを出します。ほかのプレイヤーはヒントからお題を推理して、答えを入力します。</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['お題', 'ヒント', '回答', '判定'], ['親が確認', '親が出す', '1人ずつ入力', '答え合わせ']) + '</div>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>お題の種類</h3>' +
          '<ul><li><b>普通</b>：「アメリカ」「カレー」など、答えが<b>すでに決まっている</b>お題。</li>' +
          '<li><b>★スペシャル</b>：「アーティスト名」「料理名」など広めのカテゴリー。親がその中から<b>答えを自分で1つ決めます</b>。</li></ul>' +
          '<p>ゲーム設定で「普通のみ／スペシャルのみ／ミックス」を選べます。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>ゲームの流れ</h3>' +
          '<ul>' +
            '<li><b>① お題の確認</b>：親だけがお題画面をタップしてお題を見ます（もう一度タップで隠せます）。お題を見ている間は「チェンジ」で変えられ、チェンジした後は「一つ戻す／一つ進む」で行き来できます。</li>' +
            '<li><b>② ヒント</b>：親がヒントを出します。設定でタイマーを「あり」にすると、お題画面にタイマーが出ます。</li>' +
            '<li><b>③ 回答入力</b>：回答者全員がお題を予想し終わったら（タイマーありなら0秒になったら）、1人ずつ、ほかの人に見えないように答えを入力します。</li>' +
            '<li><b>④ 正解判定</b>：お題と全員の答えを公開して答え合わせ。ポイントを計算して、親は次のラウンドで順番に交代します。</li>' +
          '</ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">4</span>正解判定</h3>' +
          '<ul><li><b>普通</b>：アプリが自動で判定します（ひらがな・カタカナ・全角半角の違いは同じ扱い。「別解」に登録された答えも正解）。</li>' +
          '<li><b>スペシャル</b>：親が決めた答えを入力すると自動判定します。表記ゆれなどは<b>みんなで判断</b>して ○ × をタップしてください。</li>' +
          '<li>どちらの場合も、○ × はタップで変更できます。</li></ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">5</span>得点</h3>' +
          '<table class="rule-tbl"><tr><th>だれ</th><th>条件</th><th>得点</th></tr>' +
          '<tr><td>回答者</td><td>お題を当てた</td><td class="c">+1pt</td></tr>' +
          '<tr><td rowspan="3">親</td><td>正解者がちょうど1人</td><td class="c">+3pt</td></tr>' +
          '<tr><td>正解者が2人以上（全員正解を除く）</td><td class="c">+1pt</td></tr>' +
          '<tr><td>全員不正解・全員正解</td><td>0pt</td></tr></table>' +
          '<p>だれか1人だけに伝わる、<b>ほどよい</b>ヒントを出すのが親のコツ。正解判定画面で今回のポイントと合計が出ます。「ゲーム終了」で最終結果（順位）を表示します。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">6</span>タイマー</h3>' +
          '<p>設定 →「お題画面にタイマーを表示する」で使えます（初期設定はなし）。時間は分・秒で変更でき、初期値は1分です。0秒になると音が鳴ります。</p>' +
        '</div>';
    },

    screens: {
      setup: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area">' +
            '<div class="card"><label class="row-label">お題の種類 <button class="btn-help sm" data-help="kind" aria-label="お題の種類の説明">?</button></label>' +
              '<div class="seg hy-kind">' +
                '<button class="seg-btn" data-val="normal">普通のみ</button>' +
                '<button class="seg-btn" data-val="special">スペシャルのみ</button>' +
                '<button class="seg-btn" data-val="mix">ミックス</button>' +
              '</div></div>' +
            '<div class="hy-players"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big hy-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          var paint = function () {
            ctx.$$('.hy-kind .seg-btn', sc).forEach(function (b) { b.classList.toggle('on', b.dataset.val === ctx.settings().kind); });
          };
          paint();
          sc.querySelector('.hy-kind').onclick = function (ev) {
            var b = ev.target.closest('.seg-btn'); if (!b) return;
            ctx.setSetting('kind', b.dataset.val); paint();
          };
          ctx.playersCard(sc.querySelector('.hy-players'), {
            orderLabel: '順番',
            note: function (n) { return '親は <b class="c">順番どおりに交代</b>（回答者 ' + (n - 1) + '人）'; }
          });
          sc.querySelector('.hy-start').onclick = function () {
            st.n = ctx.playerCount(); st.names = ctx.playerNames();
            st.kind = ctx.settings().kind; st.round = 0;
            st.total = st.names.map(function () { return 0; });
            startRound(ctx);
          };
        }
      },

      topic: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count hy-round"></span>' }) +
          '<div class="stage">' +
            '<p class="who-line hy-who"></p>' +
            '<div class="odai-card hy-card"></div>' +
            '<div class="hy-chg" hidden></div>' +
            '<div class="hy-timer" hidden></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big hy-next">回答の入力へ</button></div>',
        enter: enterTopic
      },

      input: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="lead-box hy-lead"></div><div class="ans-list"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big sub hy-back" style="flex:0 0 34%">‹ お題画面</button><button class="btn-big hy-go">正解判定へ</button></div>',
        enter: enterInput
      },

      judge: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="hy-answer answer-reveal"></div><div class="jd-list"></div><p class="score-line"></p><div class="hy-board"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big sub hy-end" style="flex:0 0 36%">ゲーム終了</button><button class="btn-big hy-again">次のラウンドへ</button></div>',
        enter: enterJudge
      },

      result: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area">' +
            '<p class="who-line hy-rounds"></p>' +
            '<div class="result-headline win hy-win"></div>' +
            '<div class="rs-head"><span class="rsh-rank">順位</span><span class="rsh-name">プレイヤー名</span><span class="rsh-total">合計</span></div>' +
            '<div class="rs-list"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub hy-r-title" style="flex:0 0 36%">タイトルへ</button><button class="btn-big hy-r-again">もう一度遊ぶ</button></div>',
        enter: function (ctx) { renderResult(ctx); }
      }
    },

    init: function (ctx) {
      var tp = ctx.screen('topic');
      tp.querySelector('.hy-card').addEventListener('click', function () {
        if (st.shown) { st.shown = false; renderTopic(ctx); return; }
        ctx.confirm('あなたは親の' + st.names[asker()] + 'さんですか？', function () { st.shown = true; renderTopic(ctx); });
      });
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return drawEntry(ctx, avoid); },
        onShow: function (e) {
          st.set = e.set; st.topic = e.topic;
          if (st.slot && st.slot.changed()) st.shown = true;   // チェンジ・戻す・進むは親が見ている状態のまま
          renderTopic(ctx);
        }
      });
      ctx.changeBar(tp.querySelector('.hy-chg'), st.slot);
      tp.querySelector('.hy-next').addEventListener('click', function () {
        var go = function () {
          st.shown = false;
          ctx.show('input');
        };
        if (st.shown) ctx.confirm('お題を隠して回答の入力へ進みますか？', go);
        else go();
      });
      var ip = ctx.screen('input');
      ip.querySelector('.hy-back').addEventListener('click', function () { ctx.show('topic', { replace: true, back: true }); });
      ip.querySelector('.hy-go').addEventListener('click', function () {
        if (st.list && !st.list.filled()) ctx.confirm('まだ入力していない人がいますが、正解判定へ進みますか？', function () { ctx.show('judge'); });
        else ctx.show('judge');
      });
      var jd = ctx.screen('judge');
      var pendingCount = function () {
        return answerers().filter(function (pi, k) { return st.judge[k] !== true && st.judge[k] !== false; }).length;
      };
      var afterJudge = function (fn) {
        var p = pendingCount();
        if (p) ctx.confirm('未判定の人が ' + p + ' 人います。不正解として集計しますか？', fn);
        else fn();
      };
      jd.querySelector('.hy-again').addEventListener('click', function () {
        afterJudge(function () { commitRound(); st.round++; startRound(ctx); });
      });
      jd.querySelector('.hy-end').addEventListener('click', function () {
        afterJudge(function () {
          ctx.confirm('このラウンドまでの合計で結果を表示しますか？', function () { commitRound(); ctx.show('result', { resetStack: true }); });
        });
      });
      var rs = ctx.screen('result');
      rs.querySelector('.hy-r-title').addEventListener('click', function () { ctx.goTitle(); });
      rs.querySelector('.hy-r-again').addEventListener('click', function () { ctx.show('setup', { resetStack: true }); });
      window.addEventListener('odai:resize', function () {
        if (st.shown) ctx.fitText(tp.querySelector('.odai-text'), 46, 18);
      });
    }
  });
})();
