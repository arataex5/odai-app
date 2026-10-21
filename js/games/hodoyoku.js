/* =========================================================
   ほどよく
   遊び方：① お題だけ表示（お題画面＋タイマーのみ）
           ② クイックスタート（お題 → 回答入力 → 正解判定。点数なし。親は順番に交代）
           ③ フルゲーム（〇点先取。正解判定 → ポイント結果 → … → 最終結果）
   お題：普通（決まったお題。自動判定）／スペシャル（カテゴリーから親が答えを決める。正解は親が判断）
   得点：正解者 +1pt。親は正解者がちょうど1人で +3pt、2人以上（全員正解を除く）で +1pt、全員正解・全員不正解は 0pt
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;

  var st = {
    mode: 'quick', q: 1, kind: 'mix', set: null, topic: null, shown: false,
    answers: [], judge: [], spAnswer: '', timer: null, list: null, slot: null
  };

  function M(ctx) { return ctx.match(); }
  function asker(ctx) { return ctx.turn().idx; }
  function answerers(ctx) {
    var m = M(ctx), out = [];
    for (var i = 1; i < m.n; i++) out.push((asker(ctx) + i) % m.n);
    return out;
  }
  function parentPoint(ok, n) {
    if (ok === 1 && n > 1) return 3;
    if (ok >= 2 && ok < n) return 1;
    return 0;
  }

  /* お題の抽選（開始・チェンジ・次のお題 共通）。ミックスはスペシャルが約3回に1回 */
  function drawEntry(ctx, avoid) {
    var kind = st.kind;
    var sid = kind === 'normal' ? 'normal' : kind === 'special' ? 'special' : (Math.random() < 1 / 3 ? 'special' : 'normal');
    var e = ctx.drawEntry(sid, avoid);
    if (!e && kind === 'mix') e = ctx.drawEntry(sid === 'normal' ? 'special' : 'normal', avoid);
    return e;
  }

  function startRound(ctx) {
    st.answers = []; st.judge = []; st.spAnswer = ''; st.shown = false;
    var c = st.slot.current();
    var e = drawEntry(ctx, c ? [c.set + '|' + c.topic.uid] : []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
    st.slot.start(e);
    ctx.show('topic', { resetStack: true });
  }

  /* ---------------- お題画面 ---------------- */
  function renderTopic(ctx) {
    var sc = ctx.screen('topic');
    var topicOnly = st.mode === 'topic';
    var who = topicOnly ? '' : ctx.turn();
    sc.querySelector('.hy-round').textContent = topicOnly ? '第' + st.q + '問' : '第' + (M(ctx).round + 1) + 'ラウンド';
    sc.querySelector('.hy-who').innerHTML = topicOnly ? '親だけ画面を見てください'
      : '親：<b>' + esc(who.name) + '</b> さん<span class="turn-pos">（' + who.pos + ' / ' + who.n + ' 人目）</span>';
    var card = sc.querySelector('.hy-card');
    var sp = (st.set === 'special');
    if (!st.shown) {
      card.className = 'odai-card hy-card cover';
      card.innerHTML =
        '<span class="hy-gauge" aria-hidden="true"><i></i></span>' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '普通') + '</span>' +
        '<div class="cover-msg">' + (topicOnly ? '親だけ' : '親の <b>' + esc(who.name) + '</b> さんだけ') +
        '<br>画面を見てください<small>タップでお題を表示</small></div>';
    } else {
      card.className = 'odai-card hy-card';
      card.innerHTML =
        '<span class="hy-gauge" aria-hidden="true"><i></i></span>' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '普通のお題') + '</span>' +
        '<div class="odai-text">' + esc(st.topic.text) + '</div>' +
        (sp ? '<p class="odai-note">このカテゴリーの中から、答えを<b>1つ自分で決めて</b>ください。</p>'
            : '<p class="odai-note">このお題が当てられるようにヒントを出しましょう。</p>') +
        '<span class="peek">タップで隠す</span>';
      ctx.fitText(card.querySelector('.odai-text'), 46, 18);
    }
    sc.querySelector('.hy-chg').hidden = !st.shown;
    sc.querySelector('.hy-next').textContent = topicOnly ? '次のお題' : '回答の入力へ';
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
        onEnd: function () { sc.querySelector('.hy-next').classList.add('pulse'); }
      });
    }
    renderTopic(ctx);
  }

  /* ---------------- 回答入力 ---------------- */
  function enterInput(ctx) {
    var sc = ctx.screen('input');
    sc.querySelector('.hy-lead').innerHTML =
      '親 <b>' + esc(ctx.turn().name) + '</b> さんのヒントから、お題だと思うものを1人ずつ入力してください。' +
      (st.set === 'special' ? '<br><small>スペシャル：親が決めた答えを当てます。</small>' : '');
    st.list = ctx.answerList(sc.querySelector('.ans-list'), answerers(ctx).map(function (i) { return { name: M(ctx).names[i] }; }), st.answers, {
      placeholder: 'お題だと思うもの'
    });
  }

  /* ---------------- 正解判定 ---------------- */
  function autoJudge(ctx, ans) {
    if (st.set !== 'normal') return null;            // スペシャルは親が判断する
    var a = ctx.normalize(ans);
    if (!a) return false;
    var keys = [st.topic.text];
    String(st.topic.x && st.topic.x.alt || '').split(/[\/／]/).forEach(function (s) { if (s.trim()) keys.push(s); });
    return keys.some(function (k) { return ctx.normalize(k) === a; });
  }
  function scoreRound(ctx) {
    var ids = answerers(ctx), ok = 0, pts = M(ctx).names.map(function () { return 0; });
    ids.forEach(function (pi, k) { if (st.judge[k] === true) { ok++; pts[pi] += 1; } });
    var pp = parentPoint(ok, ids.length);
    pts[asker(ctx)] += pp;
    return { pts: pts, ok: ok, m: ids.length, parent: pp };
  }
  function whyText(r) {
    return r.ok === 0 ? '全員不正解' : r.ok === r.m ? '全員正解' : r.ok === 1 ? '正解者がちょうど1人' : '正解者が2人以上';
  }

  function renderJudge(ctx) {
    var sc = ctx.screen('judge');
    var sp = (st.set === 'special');
    var head = sc.querySelector('.hy-answer');
    head.innerHTML =
      '<div class="odai-card" style="min-height:0">' +
        '<span class="hy-gauge" aria-hidden="true"><i></i></span>' +
        '<span class="odai-kicker' + (sp ? ' sp' : '') + '">' + (sp ? '★ スペシャル' : '正解（お題）') + '</span>' +
        '<div class="odai-text" style="font-size:34px">' + esc(st.topic.text) + '</div>' +
        (!sp && st.topic.x && st.topic.x.alt ? '<p class="odai-note">別解：' + esc(st.topic.x.alt) + '</p>' : '') +
        (sp ? '<div class="sp-answer" style="width:100%"><input type="text" class="hy-sp" maxlength="30" placeholder="親が決めた答え（みんなに見せる用）" value="' + esc(st.spAnswer) + '"></div>' +
              '<p class="odai-note">正解かどうかは<b>親が判断</b>して、○ か × をタップしてください。</p>'
            : '<p class="odai-note">自動で判定しました。○×はタップで変更できます。</p>') +
      '</div>';
    var inp = head.querySelector('.hy-sp');
    if (inp) inp.addEventListener('input', function () { st.spAnswer = this.value; });
    renderRows(ctx);
  }
  function renderRows(ctx) {
    var sc = ctx.screen('judge');
    var box = sc.querySelector('.jd-list');
    box.innerHTML = '';
    var ids = answerers(ctx), ok = 0;
    ids.forEach(function (pi, k) {
      var ans = st.answers[k] || '';
      var j = st.judge[k];
      if (j === true) ok++;
      var row = document.createElement('div');
      row.className = 'jd-row' + (j === true ? ' ok' : j === false ? ' ng' : '');
      row.innerHTML =
        '<span class="jd-name">' + esc(M(ctx).names[pi]) + '</span>' +
        '<span class="jd-ans' + (ans ? '' : ' empty') + '">' + (ans ? esc(ans) : '（未回答）') + '</span>' +
        '<span class="jd-btns"><button class="jd-btn ok' + (j === true ? ' on' : '') + '" aria-label="正解">○</button>' +
        '<button class="jd-btn ng' + (j === false ? ' on' : '') + '" aria-label="不正解">×</button></span>';
      row.querySelector('.ok').addEventListener('click', function () { st.judge[k] = true; renderRows(ctx); });
      row.querySelector('.ng').addEventListener('click', function () { st.judge[k] = false; renderRows(ctx); });
      box.appendChild(row);
    });
    var pending = ids.filter(function (pi, k) { return st.judge[k] !== true && st.judge[k] !== false; }).length;
    var line = '正解者 <b>' + ok + '</b> 人 ／ ' + ids.length + ' 人';
    if (st.mode === 'full') {
      var r = scoreRound(ctx);
      line += '<span class="hy-why">親（' + esc(ctx.turn().name) + '）：' + whyText(r) + ' → <b>+' + r.parent + 'pt</b></span>';
    }
    if (pending) line += '<small class="hy-pending">未判定 ' + pending + ' 人（○か×をタップ）</small>';
    sc.querySelector('.score-line').innerHTML = line;
  }
  function enterJudge(ctx, opts) {
    if (!opts.back) st.judge = answerers(ctx).map(function (pi, k) { return autoJudge(ctx, st.answers[k]); });
    ctx.screen('judge').querySelector('.hy-go-next').textContent = st.mode === 'full' ? 'ポイント結果へ' : '次のラウンドへ';
    renderJudge(ctx);
  }

  /* ---------------- ルール説明のイラスト ---------------- */
  function rulesIll(ctx) {
    var I = ctx.ill;
    var s1 = I.svg(320, 150,
      I.person(70, 132, { c: 0, hand: 'right', label: '親' }) +
      I.phone(84, 52, 34, 52, I.card(88, 64, 26, 28, 'カレー', { size: 7.5, r: 3 })) +
      I.bubble(16, 8, 112, 26, '黄色くてスパイシー！', 'br', { size: 10 }) +
      I.person(190, 132, { c: 1, mouth: 'o' }) + I.person(240, 132, { c: 2 }) + I.person(290, 132, { c: 3, mouth: 'flat' }) +
      I.bubble(166, 40, 48, 22, '？', 'b', { think: true }) + I.bubble(220, 30, 44, 22, '！', 'b', { think: true }) + I.bubble(268, 40, 44, 22, '？？', 'b', { think: true }),
      '親だけがお題を見てヒントを出す');
    var row = function (y, oks, pp, label) {
      var out = I.text(8, y + 4, label, { anchor: 'start', size: 10, cls: 'il-dim' });
      out += I.person(118, y + 16, { c: 0, s: 0.62 }) + I.badge(118, y - 30, pp + 'pt', pp === '0' ? '#8a8fa8' : '#d9a21b');
      oks.forEach(function (o, i) {
        var x = 172 + i * 46;
        out += I.person(x, y + 16, { c: i + 1, s: 0.62, eyes: o ? 'happy' : 'open', mouth: o ? 'smile' : 'sad' }) + I.mark(x, y - 30, o, 6);
      });
      return out;
    };
    var s2 = I.svg(320, 236,
      I.text(118, 14, '親', { size: 10, cls: 'il-dim' }) + I.text(218, 14, '回答者（当てたら +1pt）', { size: 10, cls: 'il-dim' }) +
      row(58, [true, false, false], '+3', 'ちょうど1人') +
      row(128, [true, true, false], '+1', '2人以上') +
      row(198, [true, true, true], '0', '全員正解'),
      '親の得点');
    return { s1: s1, s2: s2 };
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
    defaults: { kind: 'mix', timerOn: false, timerSec: 60, target: 10 },
    settings: [
      { key: 'kind', type: 'seg', label: 'お題の種類', options: [['normal', '普通のみ'], ['special', 'スペシャルのみ'], ['mix', 'ミックス']],
        hint: 'ミックスはスペシャルが約3回に1回出ます。' },
      { key: 'timerOn', type: 'bool', label: 'お題画面にタイマーを表示する' },
      { key: 'timerSec', type: 'time', label: 'タイマーの時間', def: 60, showIf: 'timerOn', hint: '0秒になると音が鳴ります。' },
      { key: 'alarm', type: 'sound', label: 'アラーム音', showIf: 'timerOn' }
    ],
    help: {
      kind: ['お題の種類', '<b>普通</b>：「アメリカ」「カレー」など、答えが決まっているお題。回答はアプリが自動で判定します（○×は変更可）。<br><b>スペシャル</b>：「アーティスト名」「料理名」など広めのカテゴリー。親がその中から答えを自分で決めます。<b>正解かどうかは親が判断します。</b><br><b>ミックス</b>：普通とスペシャルをランダムに出題します（スペシャルは約3回に1回）。']
    },
    logoHtml: function (ctx) {
      return '<div class="hy-hero">' + ctx.logo('hodoyoku', 'gl-svg', 'ほどよく') +
        '<div class="hy-meter" aria-hidden="true"><span class="hm-scale"></span><span class="hm-needle"></span></div></div>';
    },

    title: function (ctx, box) {
      ctx.modeButtons(box, {
        topic: { fn: function () { st.mode = 'topic'; st.q = 1; st.kind = ctx.settings().kind; ctx.startMatch('topic'); startRound(ctx); } },
        quick: { fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
    },

    rules: function (ctx) {
      var il = rulesIll(ctx), I = ctx.ill;
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>親だけがお題を見て、ヒントを出します。ほかのプレイヤーはヒントからお題を推理して、答えを入力します。</p>' +
          I.fig(il.s1, '親だけがお題を見て、みんなが当てられるようにヒントを出す') +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>お題の種類</h3>' +
          '<ul><li><b>普通</b>：「アメリカ」「カレー」など、答えが<b>すでに決まっている</b>お題。アプリが自動で判定します。</li>' +
          '<li><b>★スペシャル</b>：「アーティスト名」「料理名」など広めのカテゴリー。親がその中から<b>答えを自分で1つ決めます</b>。<b>正解かどうかは親が判断します。</b></li></ul>' +
          '<p>設定で「普通のみ／スペシャルのみ／ミックス」を選べます。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>ゲームの流れ</h3>' +
          '<div class="rule-fig">' + ctx.figFlow(['お題', 'ヒント', '回答', '判定'], ['親が確認', '親が出す', '1人ずつ入力', '答え合わせ']) + '</div>' +
          '<ul>' +
            '<li><b>① お題の確認</b>：親だけがお題画面をタップしてお題を見ます（もう一度タップで隠せます）。お題を見ている間は「チェンジ」で変えられ、チェンジした後は「一つ戻す／一つ進む」で行き来できます。</li>' +
            '<li><b>② ヒント</b>：親がヒントを出します。設定でタイマーを「あり」にすると、お題画面にタイマーが出ます。</li>' +
            '<li><b>③ 回答入力</b>：回答者全員がお題を予想し終わったら（タイマーありなら0秒になったら）、1人ずつ、ほかの人に見えないように答えを入力します。</li>' +
            '<li><b>④ 正解判定</b>：お題と全員の答えを公開して答え合わせ。親は毎ラウンド順番に交代します。</li>' +
          '</ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">4</span>得点（フルゲーム）</h3>' +
          I.fig(il.s2, 'だれか1人だけに伝わる「ほどよい」ヒントが一番おいしい') +
          '<table class="rule-tbl"><tr><th>だれ</th><th>条件</th><th>得点</th></tr>' +
          '<tr><td>回答者</td><td>お題を当てた</td><td class="c">+1pt</td></tr>' +
          '<tr><td rowspan="3">親</td><td>正解者がちょうど1人</td><td class="c">+3pt</td></tr>' +
          '<tr><td>正解者が2人以上（全員正解を除く）</td><td class="c">+1pt</td></tr>' +
          '<tr><td>全員不正解・全員正解</td><td>0pt</td></tr></table>' +
        '</div>' +
        ctx.modesRule({
          topic: 'お題画面だけを使います（タイマーありならタイマーも表示）。「次のお題」で次のお題へ。親は自由に交代してください。',
          quick: '点数なしで何回でも。お題 → 回答入力 → 正解判定 →「次のラウンドへ」。親は全員が1回ずつ担当したら最初から。',
          full: '「〇点先取」を決めて遊びます。正解判定のあとにポイント結果、だれかが目標に届いたら最終結果（勝利画面）。'
        }) +
        '<div class="rule-sec"><h3><span class="badge">5</span>タイマー</h3>' +
          '<p>設定 →「お題画面にタイマーを表示する」で使えます（初期設定はなし・1分）。時間は分・秒で変更でき、0秒になると選んだアラーム音が鳴ります。</p>' +
        '</div>';
    },

    screens: {
      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip hy-mode-title"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="hy-target"></div>' +
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
          sc.querySelector('.hy-mode-title').textContent = st.mode === 'full' ? 'フルゲーム' : 'クイックスタート';
          var tg = sc.querySelector('.hy-target');
          tg.innerHTML = '';
          if (st.mode === 'full') ctx.targetCard(tg, { def: 10, hint: '正解者 +1pt、親は正解者1人で +3pt／2人以上で +1pt。' });
          var paint = function () {
            ctx.$$('.hy-kind .seg-btn', sc).forEach(function (b) { b.classList.toggle('on', b.dataset.val === ctx.settings().kind); });
          };
          paint();
          sc.querySelector('.hy-kind').onclick = function (ev) {
            var b = ev.target.closest('.seg-btn'); if (!b) return;
            ctx.setSetting('kind', b.dataset.val); paint();
          };
          ctx.playersCard(sc.querySelector('.hy-players'), {
            note: function (n) { return '親は <b class="c">順番どおりに交代</b>（回答者 ' + (n - 1) + '人）'; }
          });
          sc.querySelector('.hy-start').onclick = function () {
            st.kind = ctx.settings().kind;
            ctx.startMatch(st.mode, { targetDef: 10, again: function () { ctx.show('setup', { resetStack: true }); } });
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
          '<div class="scroll-area"><div class="hy-answer answer-reveal"></div><div class="jd-list"></div><p class="score-line"></p></div>' +
          '<div class="bottom-bar"><button class="btn-big hy-go-next">次のラウンドへ</button></div>',
        enter: enterJudge
      }
    },

    init: function (ctx) {
      var tp = ctx.screen('topic');
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return drawEntry(ctx, avoid); },
        onShow: function (e) {
          st.set = e.set; st.topic = e.topic;
          if (st.slot && st.slot.changed()) st.shown = true;   // チェンジ・戻す・進むは親が見ている状態のまま
          renderTopic(ctx);
        }
      });
      ctx.changeBar(tp.querySelector('.hy-chg'), st.slot);
      tp.querySelector('.hy-card').addEventListener('click', function () {
        if (st.shown) { st.shown = false; renderTopic(ctx); return; }
        if (st.mode === 'topic') { st.shown = true; renderTopic(ctx); return; }
        ctx.confirm('あなたは親の' + ctx.turn().name + 'さんですか？', function () { st.shown = true; renderTopic(ctx); });
      });
      tp.querySelector('.hy-next').addEventListener('click', function () {
        if (st.mode === 'topic') { st.q++; startRound(ctx); return; }
        var go = function () { st.shown = false; ctx.show('input'); };
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
      jd.querySelector('.hy-go-next').addEventListener('click', function () {
        var ids = answerers(ctx);
        var pending = ids.filter(function (pi, k) { return st.judge[k] !== true && st.judge[k] !== false; }).length;
        var next = function () {
          if (st.mode === 'full') {
            var r = scoreRound(ctx);
            var corrects = ids.filter(function (pi, k) { return st.judge[k] === true; }).map(function (pi) { return M(ctx).names[pi]; });
            ctx.roundResult({
              pts: r.pts,
              head: '<div class="rr-topic">お題：<b>' + esc(st.topic.text) + '</b></div>' +
                '<p>親 <b>' + esc(ctx.turn().name) + '</b> さん：' + whyText(r) + ' → <b class="pt">+' + r.parent + 'pt</b></p>' +
                '<p>正解：' + (corrects.length ? esc(corrects.join('、')) + '（各 +1pt）' : 'なし') + '</p>',
              onNext: function () { startRound(ctx); }
            });
          } else { ctx.nextTurn(); startRound(ctx); }
        };
        if (pending) ctx.confirm('未判定の人が ' + pending + ' 人います。不正解として進みますか？', next);
        else next();
      });
      window.addEventListener('odai:resize', function () {
        if (st.shown) ctx.fitText(tp.querySelector('.odai-text'), 46, 18);
      });
    }
  });
})();
