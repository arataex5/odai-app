/* =========================================================
   答えを合わせよう
   タイトルで「通常モード／人狼モード」を切り替え、遊び方を3つから選ぶ
   ① お題だけ表示：お題画面のみ（人狼モードでも同じ）
   ② クイックスタート：通常＝読み上げ役を順番に交代しながらお題を出す
                       人狼＝役職確認 → 話し合い → 結果発表 を何回でも
   ③ フルゲーム（〇点先取）：通常＝答え合わせでズレた人を選ぶ（そろった人 +1pt）
                           人狼＝結果発表で「見つけた／逃げ切った」を選ぶ（村人 +1pt ／ 人狼 +2pt）
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';

  var st = { mode: 'topic', q: 1, slot: null, wolves: [], wolfSees: 'none', topic: null, diff: [] };

  function isWolf(ctx) { return ctx.settings().mode === 'wolf'; }
  function maxWolves(n) { return Math.max(1, Math.min(3, Math.floor((n - 1) / 2))); }
  function M(ctx) { return ctx.match(); }

  var LABELS = {
    normal: {
      topic: { sub: 'お題を出すだけ。判定・点数なし' },
      quick: { sub: '点数なしで気軽に。読み上げ役は順番に交代' },
      full: { sub: 'ズレなかった人に1pt。〇点先取で勝敗' }
    },
    wolf: {
      topic: { sub: 'お題を出すだけ（人狼なし）' },
      quick: { sub: '役職確認→話し合い→結果発表を何回でも' },
      full: { sub: '人狼を当てて〇点先取。村人と人狼の対決' }
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
    sc.querySelector('.aw-next').textContent = st.mode === 'full' ? '答え合わせへ' : '次のお題';
    var tx = sc.querySelector('.odai-text');
    tx.textContent = e.topic.text;
    ctx.fitText(tx, 44, 18);
  }

  /* ---------------- 通常：答え合わせ（フルゲーム） ---------------- */
  function renderAwJudge(ctx) {
    var sc = ctx.screen('judge');
    var m = M(ctx);
    sc.querySelector('.aw-j-topic').textContent = st.slot.current().topic.text;
    var box = sc.querySelector('.aw-j-list');
    box.innerHTML = '';
    m.names.forEach(function (nm, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'aw-pl' + (st.diff[i] ? ' diff' : '');
      b.innerHTML = '<span class="aw-pl-name">' + esc(nm) + '</span><span class="aw-pl-state">' + (st.diff[i] ? '× ズレた' : '○ そろった') + '</span>';
      b.addEventListener('click', function () { st.diff[i] = !st.diff[i]; renderAwJudge(ctx); });
      box.appendChild(b);
    });
    var ok = m.names.filter(function (n, i) { return !st.diff[i]; }).length;
    sc.querySelector('.aw-j-sum').innerHTML = ok === m.n ? '🎉 <b>全員そろった！</b>' : 'そろった人 <b>' + ok + '</b> 人 ／ ' + m.n + ' 人';
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
            '<div class="role-big ' + (wolf ? 'wolf' : 'villager') + '">' + (wolf ? '人狼' : '村人') + '</div>' +
            '<div class="role-topic"><span class="q">お題</span>' + (showTopic ? esc(st.topic.text) : '？？？') + '</div>' +
            '<p class="role-note">' + (wolf
              ? (st.wolfSees === 'same'
                  ? 'みんなの答えが<b>そろわないように</b>、こっそり答えをズラしましょう。人狼だとバレないように！'
                  : 'あなたには<b>お題が分かりません</b>。みんなの話し合いからお題を推理して、答えを合わせて正体を隠しましょう。')
                + (mates.length ? '<br>仲間の人狼：<b>' + esc(mates.join('、')) + '</b>' : '')
              : 'お題は<b>口に出さず</b>に話し合って、みんなと答えを合わせましょう。人狼に気をつけて！') + '</p>';
          api.fit(body.querySelector('.role-topic'), 40, 16);
        }
      };
    });
    ctx.reveal({
      items: items, progressLabel: '役職確認', lastLabel: '話し合いへ',
      onDone: function () { ctx.show('talk', { resetStack: true }); }
    });
  }

  /* ---------------- ルール説明のイラスト ---------------- */
  function rulesIll(ctx) {
    var I = ctx.ill;
    var s1 = I.svg(320, 150,
      I.card(110, 4, 100, 26, 'おでんの具といえば？', { size: 9.5, r: 13 }) +
      I.person(50, 136, { c: 0, eyes: 'happy' }) + I.person(120, 136, { c: 1, eyes: 'happy' }) +
      I.person(200, 136, { c: 2, eyes: 'happy' }) + I.person(270, 136, { c: 3, mouth: 'o' }) +
      I.bubble(22, 52, 56, 24, '大根', 'b') + I.bubble(92, 52, 56, 24, '大根', 'b') + I.bubble(172, 52, 56, 24, '大根', 'b') +
      I.bubble(242, 52, 56, 24, 'ちくわ', 'b', { stroke: '#e5484d' }) +
      I.mark(50, 44, true, 6) + I.mark(120, 44, true, 6) + I.mark(200, 44, true, 6) + I.mark(270, 44, false, 6),
      '全員が同時に答えを言う。そろえば成功！');
    var s2 = I.svg(320, 150,
      '<circle cx="292" cy="22" r="13" fill="#f3d36b"/><circle cx="299" cy="17" r="12" style="fill:var(--bg2)"/>' +
      I.person(60, 136, { c: 1, label: '村人' }) + I.person(130, 136, { c: 2, label: '村人' }) +
      I.person(200, 136, { c: 4, ears: true, mouth: 'flat', label: '人狼' }) + I.person(270, 136, { c: 3, label: '村人' }) +
      I.card(34, 40, 52, 30, 'お題', { size: 10, sub: '見える' }) + I.card(104, 40, 52, 30, 'お題', { size: 10, sub: '見える' }) +
      I.card(174, 40, 52, 30, '？？？', { size: 11, stroke: '#9b6bff', sub: '分からない' }) + I.card(244, 40, 52, 30, 'お題', { size: 10, sub: '見える' }),
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
      wolf: ['人狼モード', 'プレイヤーの中に<b>人狼</b>がまぎれ込みます。役職確認画面で1人ずつ自分の役職とお題を確認し、話し合ってから一斉に答えを言います。最後に誰が人狼かを当てましょう。'],
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
          '<li><b>フルゲーム</b>：答え合わせで、ほかの人と答えが<b>ズレた人</b>をタップ。ズレなかった人が <b>+1pt</b>。</li></ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>人狼モード</h3>' +
          '<p>タイトル画面のボタンで切り替えます。プレイヤーの中に<b>人狼</b>がまぎれ込みます。</p>' +
          I.fig(il.s2, '役職確認では、スマホを回して1人ずつ自分の画面を見ます') +
          '<ul>' +
            '<li><b>① 役職確認</b>：1人ずつ自分の役職（村人／人狼）とお題を確認します。</li>' +
            '<li><b>② 話し合い</b>：お題そのものは口に出さずに、答えをそろえるための相談をします。</li>' +
            '<li><b>③ せーの</b>：全員同時に答えを言います。</li>' +
            '<li><b>④ 人狼さがし</b>：だれが人狼かを話し合って指名し、「結果発表」で人狼とお題を公開します。</li>' +
          '</ul>' +
          '<p><b>人狼に見せる内容</b>（ゲーム設定で選択）：「お題を見せない」＝人狼は話し合いからお題を推理する／「お題を見せる」＝人狼は答えをこっそりズラすのが目的。</p>' +
          '<p><b>フルゲーム</b>：人狼を見つけたら村人全員 <b>+1pt</b>、逃げ切ったら人狼 <b>+2pt</b>。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: 'お題画面だけを使います。「次のお題」で次へ（人狼モードでも人狼なしのお題表示になります）。',
          quick: '点数なしで何回でも。通常は読み上げ役が順番に交代、人狼モードは役職確認→話し合い→結果発表をくり返します。',
          full: '「〇点先取」で勝敗を決めます。毎ラウンドのあとにポイント結果、目標に届いたら最終結果（勝利画面）。'
        });
    },

    screens: {
      play: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-q"></span>' }) +
          '<div class="stage">' +
            '<p class="who-line aw-who" hidden></p>' +
            '<div class="odai-card aw-bubble"><div class="odai-text"></div></div>' +
            '<p class="odai-note aw-sei">せーので答えを言おう！全員そろえば成功</p>' +
            '<div class="aw-chg"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-next">次のお題</button></div>',
        enter: function (ctx) { renderPlay(ctx); }
      },

      judge: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count mode-chip">答え合わせ</span>' }) +
          '<div class="scroll-area">' +
            '<div class="odai-card aw-bubble" style="min-height:0"><div class="odai-text aw-j-topic" style="font-size:24px"></div></div>' +
            '<div class="lead-box">答えがほかの人と<b>ズレた人</b>をタップしてください。ズレなかった人に <b>+1pt</b>。</div>' +
            '<div class="aw-j-list"></div>' +
            '<p class="score-line aw-j-sum"></p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-j-next">ポイント結果へ</button></div>',
        enter: function (ctx) { renderAwJudge(ctx); }
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
          if (st.mode === 'full') ctx.targetCard(tg, { def: 5,
            hint: wolf ? '人狼を見つけたら村人全員 +1pt、逃げ切ったら人狼 +2pt。' : '答えがズレなかった人に +1pt。' });
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
              return '役職配分：<b class="c">村人 ' + (n - w) + '人</b> ／ <b class="s" style="color:#b98cff">人狼 ' + w + '人</b>';
            },
            onChange: function () { paintWc(); }
          });
          sc.querySelector('.aw-start').onclick = function () {
            ctx.startMatch(st.mode, { targetDef: 5, again: function () { ctx.show('setup', { resetStack: true }); } });
            if (wolf) { st.topic = null; startWolfGame(ctx); }
            else if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
          };
        }
      },

      talk: {
        html: T({ back: 'title-confirm' }) +
          '<div class="stage">' +
            '<div class="odai-card aw-night"><span class="odai-kicker">人狼モード</span>' +
              '<div class="odai-text" style="font-size:28px">話し合って<br>答えを合わせよう</div>' +
              '<p class="odai-note">お題は役職確認で見たものです（口に出さないでね）。<br>相談が終わったら「せーの」で同時に答えを言い、<br>誰が人狼かを話し合って指名しましょう。</p>' +
            '</div>' +
            '<p class="counter-pill aw-wc-note"></p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-result">結果発表へ</button></div>',
        enter: function (ctx) {
          ctx.screen('talk').querySelector('.aw-wc-note').textContent = '人狼は ' + st.wolves.length + ' 人 ／ ' + M(ctx).n + ' 人中';
        }
      },

      result: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="odai-card"><span class="odai-kicker">お題</span><div class="odai-text aw-topic"></div></div>' +
            '<div class="odai-card aw-night" style="min-height:0"><span class="odai-kicker">人狼は…</span>' +
              '<div class="wolf-list aw-wolves"></div></div>' +
            '<div class="aw-verdict" hidden><p class="q-title">人狼を見つけられた？</p>' +
              '<div class="btn-row"><button class="btn-mid acc aw-found">見つけた！<small>村人 +1pt</small></button>' +
              '<button class="btn-mid aw-escaped">逃げ切られた<small>人狼 +2pt</small></button></div></div>' +
          '</div></div>' +
          '<div class="bottom-bar aw-res-bar"><button class="btn-big sub aw-title" style="flex:0 0 34%">タイトルへ</button><button class="btn-big aw-again">次のゲームへ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('result');
          var t = sc.querySelector('.aw-topic');
          t.textContent = st.topic.text;
          ctx.fitText(t, 34, 16);
          sc.querySelector('.aw-wolves').innerHTML = st.wolves.map(function (w) { return '<span>' + esc(M(ctx).names[w]) + '</span>'; }).join('');
          sc.querySelector('.aw-verdict').hidden = st.mode !== 'full';
          sc.querySelector('.aw-res-bar').hidden = st.mode === 'full';
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
        if (st.mode === 'full') { st.diff = M(ctx).names.map(function () { return false; }); ctx.show('judge'); return; }
        if (st.mode === 'quick') ctx.nextTurn(); else st.q++;
        nextTopic(ctx);
      });
      var jd = ctx.screen('judge');
      jd.querySelector('.aw-j-next').addEventListener('click', function () {
        var m = M(ctx);
        var pts = m.names.map(function (n, i) { return st.diff[i] ? 0 : 1; });
        var ok = pts.filter(Boolean).length;
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">お題：<b>' + esc(st.slot.current().topic.text) + '</b></div>' +
            '<p>' + (ok === m.n ? '🎉 全員そろった！ 全員 <b class="pt">+1pt</b>' : 'そろった人 ' + ok + ' 人に <b class="pt">+1pt</b>') + '</p>',
          onNext: function () { if (nextTopic(ctx)) ctx.show('play', { resetStack: true }); }
        });
      });
      ctx.screen('talk').querySelector('.aw-result').addEventListener('click', function () {
        ctx.confirm('結果を発表しますか？\n（人狼とお題が表示されます）', function () { ctx.show('result'); });
      });
      var rs = ctx.screen('result');
      rs.querySelector('.aw-title').addEventListener('click', function () { ctx.goTitle(); });
      rs.querySelector('.aw-again').addEventListener('click', function () { ctx.nextTurn(); startWolfGame(ctx); });
      var verdict = function (found) {
        var m = M(ctx);
        var pts = m.names.map(function (n, i) {
          var wolf = st.wolves.indexOf(i) > -1;
          return found ? (wolf ? 0 : 1) : (wolf ? 2 : 0);
        });
        var wn = st.wolves.map(function (w) { return m.names[w]; }).join('、');
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">お題：<b>' + esc(st.topic.text) + '</b></div>' +
            '<p>人狼：<b>' + esc(wn) + '</b></p>' +
            '<p>' + (found ? '人狼を見つけた！ 村人全員 <b class="pt">+1pt</b>' : '人狼が逃げ切った！ 人狼 <b class="pt">+2pt</b>') + '</p>',
          onNext: function () { startWolfGame(ctx); }
        });
      };
      rs.querySelector('.aw-found').addEventListener('click', function () { verdict(true); });
      rs.querySelector('.aw-escaped').addEventListener('click', function () { verdict(false); });
      window.addEventListener('odai:resize', function () {
        if (pl.classList.contains('active')) ctx.fitText(pl.querySelector('.odai-text'), 44, 18);
      });
    }
  });
})();
