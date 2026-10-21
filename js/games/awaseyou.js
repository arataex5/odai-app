/* =========================================================
   答えを合わせよう
   通常モード：お題画面のみ（〇〇といえば？）
   人狼モード：ゲーム設定 → 役職確認（1人ずつ）→ 話し合い → 結果発表
   タイトルの切り替えボタンでモードを変更
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';

  var st = { q: 0, topic: null, n: 0, names: [], wolves: [], wolfSees: 'none' };

  function maxWolves(n) { return Math.max(1, Math.min(3, Math.floor((n - 1) / 2))); }

  function draw(ctx, avoid) {
    var r = ctx.drawOne(SID, avoid ? [avoid] : []);
    if (!r) { ctx.toast('お題がありません。お題を追加してください', 2400); return false; }
    st.topic = r.topic;
    ctx.markUsed(SID, st.topic.uid);
    if (r.relaxed) ctx.toast('抽出できるお題が足りないため、使用済みのお題からも選んでいます', 2600);
    return true;
  }

  /* ---------------- 通常モード：お題画面 ---------------- */
  function renderPlay(ctx) {
    var sc = ctx.screen('play');
    var e = st.slot && st.slot.current();
    if (!e) return;
    sc.querySelector('.aw-q').textContent = '第' + st.q + '問';
    var t = sc.querySelector('.odai-text');
    t.textContent = e.topic.text;
    ctx.fitText(t, 44, 18);
  }

  /* ---------------- 人狼モード ---------------- */
  function startWolfGame(ctx) {
    st.n = ctx.playerCount(); st.names = ctx.playerNames();
    var gs = ctx.settings();
    var wc = Math.min(gs.wolfCount || 1, maxWolves(st.n));
    st.wolfSees = gs.wolfSees || 'none';
    if (!draw(ctx)) return;
    var idx = []; for (var i = 0; i < st.n; i++) idx.push(i);
    st.wolves = ctx.shuffle(idx).slice(0, wc).sort(function (a, b) { return a - b; });
    var items = st.names.map(function (nm, i) {
      return {
        name: nm,
        render: function (body, api) {
          var wolf = st.wolves.indexOf(i) > -1;
          var mates = st.wolves.filter(function (w) { return w !== i; }).map(function (w) { return st.names[w] + 'さん'; });
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
      items: items,
      progressLabel: '役職確認',
      lastLabel: '話し合いへ',
      onDone: function () { ctx.show('talk', { resetStack: true }); }
    });
  }

  A.registerGame({
    id: 'awaseyou',
    name: '答えを合わせよう',
    mark: '合',
    sub: '「〇〇といえば？」でみんなの答えをそろえよう',
    color: { dark: ['#1fae7a', '#5fe0ad'], light: ['#0d7d55', '#17a06e'] },
    /* 人狼モードのときは夜のテーマに切り替える */
    theme: function (ctx) {
      return ctx.settings().mode === 'wolf'
        ? { cls: 'wolf', color: { dark: ['#7b55f0', '#b39bff'], light: ['#5b38d6', '#7b55f0'] } }
        : null;
    },
    players: { min: 3, max: 20, def: 5 },
    sets: [
      { id: SID, label: 'お題', rev: 1, fields: [{ key: 'text', label: 'お題', placeholder: '例：おでんの具といえば？', hint: '「〇〇といえば？」の形がおすすめです' }] }
    ],
    defaults: { mode: 'normal', wolfCount: 1, wolfSees: 'none' },
    help: {
      wolf: ['人狼モード', 'プレイヤーの中に<b>人狼</b>がまぎれ込みます。役職確認画面で1人ずつ自分の役職とお題を確認し、話し合ってから一斉に答えを言います。最後に誰が人狼かを当てましょう。'],
      sees: ['人狼に見せる内容', '<b>お題を見せない</b>：人狼はお題が分からないまま、みんなの話からお題を推理して答えを合わせます。<br><b>お題を見せる</b>：人狼もお題を知っていますが、目的は「みんなの答えがそろわないように、こっそりズラす」ことです。']
    },
    logoHtml: function (ctx) {
      var wolf = ctx.settings().mode === 'wolf';
      return '<div class="aw-hero">' +
        '<svg class="aw-deco" viewBox="0 0 200 120" aria-hidden="true">' +
          '<circle class="b1" cx="78" cy="60" r="46"/><circle class="b2" cx="122" cy="60" r="46"/>' +
          '</svg><span class="aw-moon" aria-hidden="true"></span>' +
        ctx.logo(wolf ? 'awaseyou-wolf' : 'awaseyou', 'gl-svg', '答えを合わせよう') +
        (wolf ? '<p class="aw-wolf-tag">人狼モード</p>' : '') + '</div>';
    },

    title: function (ctx, box) {
      var gs = ctx.settings();
      var sw = document.createElement('div');
      sw.className = 'mode-switch';
      sw.innerHTML = '<button data-val="normal">通常モード</button><button data-val="wolf" class="wolf">☾ 人狼モード</button>';
      var desc = document.createElement('p');
      desc.className = 'mode-desc';
      var row = document.createElement('div');
      row.className = 'mode-row';
      row.innerHTML = '<button class="btn-mode">ゲームスタート</button><button class="btn-help" data-help="wolf" aria-label="人狼モードの説明">?</button>';
      var paint = function () {
        ctx.$$('button', sw).forEach(function (b) { b.classList.toggle('on', b.dataset.val === gs.mode); });
        desc.textContent = gs.mode === 'wolf' ? '役職確認あり：人狼を探しながら答えを合わせる' : 'お題を出して、せーので答えを合わせる';
        document.getElementById('title-logo').innerHTML = ctx.game.logoHtml(ctx);
        ctx.refreshTheme();
      };
      sw.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        ctx.setSetting('mode', b.dataset.val); paint();
      });
      row.querySelector('.btn-mode').addEventListener('click', function () {
        if (gs.mode === 'wolf') { ctx.show('setup', { resetStack: true }); return; }
        var e = ctx.drawEntry(SID, []);
        if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
        st.q = 1;
        st.slot.start(e);
        ctx.show('play', { resetStack: true });
      });
      box.appendChild(sw); box.appendChild(desc); box.appendChild(row);
      paint();
    },

    rules: function (ctx) {
      return '' +
        '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3>' +
          '<p>「おでんの具といえば？」のようなお題に、全員で<b>同時に</b>答えます。目標は<b>全員の答えをそろえる</b>こと！</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['お題', '考える', 'せーの', '一致？'], ['読み上げ', 'みんなの答え', '同時に言う', 'そろえば成功']) + '</div>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">2</span>通常モードの遊び方</h3>' +
          '<ul><li>お題画面のお題を読み上げます。</li>' +
          '<li>自分の答えより「<b>みんなが答えそうなもの</b>」を考えるのがコツ。</li>' +
          '<li>「せーの」で同時に答えを言い、全員そろえば成功です。</li>' +
          '<li>「次のお題」で次へ進みます。「チェンジ」でお題を変えられ、チェンジした後は「一つ戻す／一つ進む」で行き来できます。</li></ul>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>人狼モード</h3>' +
          '<p>タイトル画面のボタンで切り替えます。プレイヤーの中に<b style="color:#b98cff">人狼</b>がまぎれ込みます。</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['役職', '話し合い', 'せーの', '人狼は？'], ['1人ずつ確認', 'お題は言わない', '同時に言う', '結果発表']) + '</div>' +
          '<ul>' +
            '<li><b>① 役職確認</b>：スマホを回して、1人ずつ自分の役職（村人／人狼）とお題を確認します。</li>' +
            '<li><b>② 話し合い</b>：お題そのものは口に出さずに、答えをそろえるための相談をします。</li>' +
            '<li><b>③ せーの</b>：全員同時に答えを言います。</li>' +
            '<li><b>④ 人狼さがし</b>：答えや話し合いの様子から、誰が人狼かを話し合って指名します。「結果発表」で人狼とお題を公開します。</li>' +
          '</ul>' +
          '<p><b>人狼に見せる内容</b>（ゲーム設定で選択）</p>' +
          '<ul><li><b>お題を見せない</b>：人狼はお題を知りません。話し合いからお題を推理して、村人のフリをして答えを合わせます。</li>' +
          '<li><b>お題を見せる</b>：人狼もお題を知っていますが、みんなの答えが<b>そろわないように</b>こっそりズラすのが目的です。</li></ul>' +
          '<p>人狼を見つけられたら村人の勝ち、逃げ切ったら人狼の勝ちです。</p>' +
        '</div>';
    },

    screens: {
      play: {
        html: T({ back: 'title', right: '<span class="tb-count aw-q"></span>' }) +
          '<div class="stage">' +
            '<div class="odai-card aw-bubble"><div class="odai-text"></div></div>' +
            '<p class="odai-note aw-sei">せーので答えを言おう！全員そろえば成功</p>' +
            '<div class="aw-chg"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-next">次のお題</button></div>',
        enter: function (ctx) { renderPlay(ctx); }
      },

      setup: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area">' +
            '<div class="card">' +
              '<div class="row-line"><label class="row-label nomb">人狼の人数</label><div class="aw-wc"></div></div>' +
              '<label class="row-label" style="margin-top:14px">人狼に見せる内容 <button class="btn-help sm" data-help="sees" aria-label="説明">?</button></label>' +
              '<div class="seg aw-sees"><button class="seg-btn" data-val="none">お題を見せない</button><button class="seg-btn" data-val="same">お題を見せる</button></div>' +
            '</div>' +
            '<div class="aw-players"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-start">役職確認画面へ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          var gs = ctx.settings();
          var paintWc = function () {
            var mx = maxWolves(ctx.playerCount());
            if (gs.wolfCount > mx) { gs.wolfCount = mx; }
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
              var w = Math.min(gs.wolfCount, maxWolves(n));
              return '役職配分：<b class="c">村人 ' + (n - w) + '人</b> ／ <b class="s" style="color:#b98cff">人狼 ' + w + '人</b>';
            },
            onChange: function () { paintWc(); }
          });
          sc.querySelector('.aw-start').onclick = function () { startWolfGame(ctx); };
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
          ctx.screen('talk').querySelector('.aw-wc-note').textContent = '人狼は ' + st.wolves.length + ' 人 ／ ' + st.n + ' 人中';
        }
      },

      result: {
        html: T({ back: 'title' }) +
          '<div class="stage">' +
            '<div class="odai-card"><span class="odai-kicker">お題</span><div class="odai-text aw-topic"></div></div>' +
            '<div class="odai-card aw-night" style="min-height:0"><span class="odai-kicker">人狼は…</span>' +
              '<div class="wolf-list aw-wolves"></div></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-title" style="flex:0 0 34%">タイトルへ</button><button class="btn-big aw-again">次のゲームへ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('result');
          var t = sc.querySelector('.aw-topic');
          t.textContent = st.topic.text;
          ctx.fitText(t, 34, 16);
          sc.querySelector('.aw-wolves').innerHTML = st.wolves.map(function (w) { return '<span>' + esc(st.names[w]) + '</span>'; }).join('');
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
        var c = st.slot.current();
        var e = ctx.drawEntry(SID, c ? [SID + '|' + c.topic.uid] : []);
        if (!e) { ctx.toast('お題がありません', 1600); return; }
        st.q++;
        st.slot.start(e);
      });
      ctx.screen('talk').querySelector('.aw-result').addEventListener('click', function () {
        ctx.confirm('結果を発表しますか？\n（人狼とお題が表示されます）', function () { ctx.show('result'); });
      });
      var rs = ctx.screen('result');
      rs.querySelector('.aw-title').addEventListener('click', function () { ctx.goTitle(); });
      rs.querySelector('.aw-again').addEventListener('click', function () { startWolfGame(ctx); });
      window.addEventListener('odai:resize', function () {
        var t = pl.querySelector('.odai-text');
        if (pl.classList.contains('active')) ctx.fitText(t, 44, 18);
      });
    }
  });
})();
