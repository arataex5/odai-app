/* =========================================================
   答えを合わせよう
   タイトルで「通常モード／ミステリーモード」を切り替え、遊び方を3つから選ぶ

   通常モード
     お題だけ表示   ：お題画面のみ
     クイックスタート：読み上げ役を順番に交代しながらお題を出す
     フルゲーム     ：協力＋得点。ラウンドごとに難易度（=得点）が上がる。
                      親が3つの候補から選んだお題に、せーので答える。
                      全員一致＝移動なし／最多一致グループ＝+点／ひとりだけ＝−点／全員バラバラ＝移動なし
                      ラウンド数の6割（端数切り捨て）全員一致できたら全員の勝利、できなければ最高得点の人の勝ち

   ミステリーモード（答えをこっそりズラす「犯人」がまぎれているかも）
     役職とお題表示 ：お題ごとに役職確認 → せーの → （ズレたら投票）→ 結果（点数なし）
     クイックスタート：上と同じ流れで、勝ったチームに 1pt。〇点先取
     フルゲーム     ：役職は最初に1回。ラウンドを重ね、ラウンド数の4割（四捨五入）全員一致で仲間の勝ち。
                      それが無理になるほどズレたら投票タイム → 役職公開 → 勝敗
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var SID = 'odai';

  var st = {
    mode: 'topic', q: 1, slot: null,
    topic: null, roles: [], extra: [], outcome: null, voted: -2,   // ミステリー：1お題ごとの遊び方
    g: null                                                        // フルゲーム（協力／ミステリー）
  };

  function isMys(ctx) { return ctx.settings().mode === 'wolf'; }
  function M(ctx) { return ctx.match(); }

  /* ---------------- 役職カード ---------------- */
  /* 仲間カードは人数分、犯人カードは人数で決まる枚数。全部まぜて人数分だけ配る（余りに犯人が入ることもある） */
  function culpritCards(n) { return n <= 6 ? 1 : n <= 10 ? 2 : n <= 14 ? 3 : n <= 19 ? 4 : 5; }
  function deal(ctx, n) {
    var deck = [], i, w = culpritCards(n);
    for (i = 0; i < n; i++) deck.push(false);
    for (i = 0; i < w; i++) deck.push(true);
    deck = ctx.shuffle(deck);
    return { roles: deck.slice(0, n), extra: deck.slice(n) };
  }
  function culpritList(roles) { var o = []; roles.forEach(function (r, i) { if (r) o.push(i); }); return o; }
  function extraText(extra) {
    var c = extra.filter(Boolean).length, m = extra.length - c;
    return '配られなかったカード：' + [c ? '犯人 ' + c + '枚' : '', m ? '仲間 ' + m + '枚' : ''].filter(Boolean).join('・');
  }

  /* ---------------- 目標回数・難易度 ---------------- */
  function coopNeed(t) { return Math.max(1, Math.floor(t * 3 / 5)); }     // 協力成功に必要な全員一致の回数
  function mysNeed(t) { return Math.max(1, Math.round(t * 2 / 5)); }      // 仲間の勝ちに必要な全員一致の回数
  function mysFailMax(t) { return t - mysNeed(t) + 1; }                    // この回数ズレたら投票タイム
  /* 難易度の並び。協力：1→5（最後が5、その前が3）／ミステリー：5→1（最後が1、その前が3）。0＝ランダム */
  function levelPlan(t, asc) {
    var out = [];
    for (var r = 1; r <= t; r++) {
      var lv;
      if (t <= 5) lv = 5 - (t - r);
      else if (r <= 5) lv = r;
      else if (r === t) lv = 5;
      else if (r === t - 1) lv = 3;
      else lv = 0;
      out.push(lv ? (asc ? lv : 6 - lv) : 0);
    }
    return out;
  }
  function levelOf(t) { var v = parseInt(t && t.x && t.x.level, 10); return v >= 1 && v <= 5 ? v : 0; }
  function stars(lv) { var a = '', b = ''; for (var i = 1; i <= 5; i++) { if (i <= lv) a += '★'; else b += '★'; } return a + '<i class="off">' + b + '</i>'; }

  /* 難易度 lv のお題を k 件。足りなければ近い難易度 → 難易度なし → 使用済みも含めて補う */
  function drawCands(ctx, lv, k) {
    var S = ctx.store, pool = S.pool(ctx.gid, SID), all = S.list(ctx.gid, SID), out = [], have = {};
    var add = function (list) {
      ctx.shuffle(list).forEach(function (t) { if (out.length < k && !have[t.uid]) { have[t.uid] = 1; out.push(t); } });
    };
    add(pool.filter(function (t) { return levelOf(t) === lv; }));
    for (var d = 1; d <= 4 && out.length < k; d++) add(pool.filter(function (t) { return levelOf(t) && Math.abs(levelOf(t) - lv) === d; }));
    if (out.length < k) add(pool.filter(function (t) { return !levelOf(t); }));
    if (out.length < k) add(all.filter(function (t) { return levelOf(t) === lv; }));
    if (out.length < k) add(all);
    return out;
  }

  var LABELS = {
    normal: {
      topic: { label: 'お題だけ表示', sub: 'お題を出すだけ。判定・点数なし' },
      quick: { label: 'クイックスタート', sub: '点数なしで気軽に。読み上げ役は順番に交代' },
      full: { label: 'フルゲーム', sub: 'みんなで協力して全員一致をめざす。得点もあり' }
    },
    wolf: {
      topic: { label: '役職とお題表示', sub: '役職確認→せーの→投票を何回でも（点数なし）' },
      quick: { label: 'クイックスタート', sub: 'お題ごとに役職を配り直し。勝ったチームに1pt' },
      full: { label: 'フルゲーム', sub: 'ラウンドを重ねて、投票で犯人を見破る' }
    }
  };
  var WIN = {
    mates: { title: '仲間チームの勝ち！', cls: 'citizen' },
    culprit: { title: '犯人の勝ち！', cls: 'wolf' },
    all: { title: '全員の勝ち！', cls: 'citizen' },
    none: { title: '全員の負け…', cls: 'lose' }
  };

  /* 勝敗：how = 'match'（全員一致）| 'goal'（目標回数達成）| 'vote'（投票。voted = プレイヤー番号 / -1 = 犯人はいない） */
  function verdict(roles, names, how, voted, goalN) {
    var has = roles.some(Boolean);
    if (how === 'match') return has ? { win: 'mates', why: '全員の答えがそろった！犯人の妨害は失敗' } : { win: 'all', why: '全員の答えがそろった！しかも犯人はいなかった' };
    if (how === 'goal') return has ? { win: 'mates', why: goalN + '回 全員一致を達成！犯人の妨害は失敗' } : { win: 'all', why: goalN + '回 全員一致を達成！犯人はいなかった' };
    if (voted === -1) return has ? { win: 'culprit', why: '「犯人はいない」が最多票…でも犯人はまぎれていた！' } : { win: 'all', why: '「犯人はいない」が最多票。本当に犯人はいなかった！' };
    if (roles[voted]) return { win: 'mates', why: '最多票の ' + esc(names[voted]) + ' さんは犯人だった！' };
    return has ? { win: 'culprit', why: '最多票の ' + esc(names[voted]) + ' さんは仲間…犯人は逃げ切った！' }
      : { win: 'none', why: '犯人はいないのに、' + esc(names[voted]) + ' さんを疑ってしまった…' };
  }
  function winBox(o, extraHtml) {
    var w = WIN[o.win];
    return '<div class="aw-win-box ' + w.cls + '"><div class="aw-win-title">' + w.title + '</div>' +
      '<p class="aw-win-why">' + o.why + '</p>' + (extraHtml || '') + '</div>';
  }

  /* 役職確認の画面（ミステリー） */
  function roleItems(ctx, roles, topic) {
    var m = M(ctx), know = !!ctx.settings().mysKnow;
    return m.names.map(function (nm, i) {
      return {
        name: nm,
        render: function (body, api) {
          var c = roles[i];
          var mates = roles.map(function (r, j) { return r && j !== i ? m.names[j] + 'さん' : null; }).filter(Boolean);
          body.innerHTML =
            '<div class="role-big ' + (c ? 'wolf' : 'citizen') + '">' + (c ? '犯人' : '仲間') + '</div>' +
            (topic ? '<div class="role-topic"><span class="q">お題</span>' + esc(topic.text) + '</div>' : '') +
            '<p class="role-note">' + (c
              ? 'みんなの答えが<b>そろわないように</b>、こっそりズラしましょう。ただし、犯人だとバレないように！' +
                (know ? (mates.length ? '<br>ほかの犯人：<b>' + esc(mates.join('、')) + '</b>' : '<br>ほかに犯人はいません') : '<br>ほかに犯人がいるかは分かりません')
              : 'せーので答えを<b>そろえよう</b>。でも、こっそりズラしている犯人がまぎれているかも…？（いないこともあります）') + '</p>';
          if (topic) api.fit(body.querySelector('.role-topic'), 40, 16);
        }
      };
    });
  }

  /* =========================================================
     通常：お題画面（お題だけ表示／クイックスタート）
     ========================================================= */
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
    var tx = sc.querySelector('.odai-text');
    tx.textContent = e.topic.text;
    ctx.fitText(tx, 44, 18);
  }

  /* =========================================================
     ミステリー：1お題ごとの遊び方（役職とお題表示／クイックスタート）
     ========================================================= */
  function startMysRound(ctx) {
    var m = M(ctx), c = st.topic;
    var e = ctx.drawEntry(SID, c ? [SID + '|' + c.uid] : []);
    if (!e) { ctx.toast('お題がありません。お題を追加してください', 2400); return; }
    st.topic = e.topic;
    ctx.markUsed(SID, st.topic.uid);
    var d = deal(ctx, m.n);
    st.roles = d.roles; st.extra = d.extra;
    ctx.reveal({
      items: roleItems(ctx, st.roles, st.topic), progressLabel: '役職確認', lastLabel: 'せーので答えよう',
      onDone: function () { ctx.show('talk', { resetStack: true }); }
    });
  }
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
    sc.querySelector('.aw-v-none').classList.toggle('picked', st.voted === -1);
    sc.querySelector('.aw-v-go').disabled = st.voted === -2;
  }

  /* =========================================================
     フルゲーム共通（協力／ミステリー）
     ========================================================= */
  function G() { return st.g; }
  function startFull(ctx) {
    var gs = ctx.settings(), mys = isMys(ctx);
    var m = ctx.startMatch('full', {
      again: function () { ctx.show('setup', { resetStack: true }); },
      finish: function () { ctx.show('clear', { resetStack: true }); }
    });
    var t = mys ? (gs.mysRounds || 5) : (gs.coopRounds || 5);
    var plan = levelPlan(t, !mys).map(function (lv) { return lv || 1 + Math.floor(Math.random() * 5); });
    st.g = {
      kind: mys ? 'mys' : 'coop', T: t, need: mys ? mysNeed(t) : coopNeed(t), levels: plan,
      round: 0, parent: -1, pick: -1, parentMode: 'first',
      ok: 0, ng: 0, log: [], cands: null, topic: null, answers: [], alias: {}, sel: null,
      roles: [], extra: [], votes: null, firstVotes: null, cand: null, runoff: 0, top: -2,
      order: [], shown: 0, busy: false, outcome: null, coopWin: false, finished: false
    };
    if (mys) {
      var d = deal(ctx, m.n);
      st.g.roles = d.roles; st.g.extra = d.extra;
      ctx.reveal({
        items: roleItems(ctx, st.g.roles, null), progressLabel: '役職確認', lastLabel: 'ゲーム開始',
        onDone: function () { firstParent(ctx); }
      });
    } else firstParent(ctx);
  }
  function firstParent(ctx) {
    var g = G();
    if (ctx.settings().firstParent === 'choose') { g.parentMode = 'first'; g.pick = -1; ctx.show('parent', { resetStack: true }); }
    else { g.parent = Math.floor(Math.random() * M(ctx).n); startRound(ctx); ctx.toast('最初の親は ' + M(ctx).names[g.parent] + ' さん！（ランダム）', 2000); }
  }
  function startRound(ctx) {
    var g = G();
    g.cands = drawCands(ctx, g.levels[g.round], 3);
    g.topic = null;
    g.answers = M(ctx).names.map(function () { return ''; });
    g.alias = {}; g.sel = null;
    ctx.show('pick', { resetStack: true });
  }
  function lvNow() { var g = G(); return g.levels[g.round]; }
  function roundChip() { var g = G(); return '第' + (g.round + 1) + ' / ' + g.T + 'R'; }

  /* 目標までの進み具合 */
  function dots(n, on, cls) { var s = ''; for (var i = 0; i < n; i++) s += '<i class="' + (i < on ? 'on ' + (cls || '') : '') + '"></i>'; return s; }
  function progHtml() {
    var g = G();
    if (g.kind === 'coop') {
      var left = Math.max(0, g.need - g.ok);
      return '<div class="aw-goal"><div class="ag-row"><span class="ag-lab">全員一致</span><span class="ag-dots">' + dots(g.need, g.ok) + '</span>' +
        '<span class="ag-txt">' + (left ? 'あと <b>' + left + '</b> 回で協力成功' : '<b>協力成功！</b>') + '</span></div></div>';
    }
    var fm = mysFailMax(g.T), l1 = Math.max(0, g.need - g.ok), l2 = Math.max(0, fm - g.ng);
    return '<div class="aw-goal"><div class="ag-row"><span class="ag-lab">全員一致</span><span class="ag-dots">' + dots(g.need, g.ok) + '</span>' +
        '<span class="ag-txt">' + (l1 ? 'あと <b>' + l1 + '</b> 回で仲間の勝ち' : '<b>仲間の勝ち！</b>') + '</span></div>' +
      '<div class="ag-row ng"><span class="ag-lab">ズレ</span><span class="ag-dots">' + dots(fm, g.ng, 'ng') + '</span>' +
        '<span class="ag-txt">' + (l2 ? 'あと <b>' + l2 + '</b> 回で投票タイム' : '<b>投票タイム！</b>') + '</span></div></div>';
  }
  function lvBadge(lv, coop) {
    return '<div class="aw-lv"><span class="aw-lv-st">難易度 ' + lv + '　<span class="stars">' + stars(lv) + '</span></span>' +
      (coop ? '<span class="aw-lv-pt">このお題は <b>±' + lv + '</b> 点</span>' : '') + '</div>';
  }

  /* 答えのまとめ（似た答えは手動で同じグループに） */
  function groupsOf(ctx) {
    var g = G(), list = [], map = {};
    g.answers.forEach(function (a, i) {
      var k = ctx.normalize(a);
      if (!k) k = '#' + i;
      var guard = 0;
      while (g.alias[k] && guard++ < 50) k = g.alias[k];
      if (!map[k]) { map[k] = { key: k, label: String(a || '').trim() || '（未入力）', members: [] }; list.push(map[k]); }
      map[k].members.push(i);
    });
    return list;
  }
  function judge(groups, n, pt) {
    var max = 0, res = { all: false, bara: false, top: [], solo: [], pts: [], size: [], max: 0 };
    groups.forEach(function (gr) { max = Math.max(max, gr.members.length); gr.members.forEach(function (i) { res.size[i] = gr.members.length; }); });
    res.max = max;
    for (var i = 0; i < n; i++) res.pts[i] = 0;
    res.all = groups.length === 1 && n > 1;
    res.bara = max <= 1;
    if (res.all || res.bara) return res;
    groups.forEach(function (gr) {
      if (gr.members.length === max) { res.top.push(gr); gr.members.forEach(function (j) { res.pts[j] = pt; }); }
      else if (gr.members.length === 1) { res.solo.push(gr); res.pts[gr.members[0]] = -pt; }
    });
    return res;
  }
  function verdictHtml(ctx, res) {
    var g = G(), m = M(ctx), lv = lvNow();
    if (res.all) return '<div class="aw-vd ok">🎉 全員一致！' + (g.kind === 'coop' ? '<small>得点の移動なし</small>' : '') + '</div>';
    if (g.kind === 'mys') return '<div class="aw-vd ng">ズレた…<small>全員一致ではありません</small></div>';
    if (res.bara) return '<div class="aw-vd ng">全員バラバラ…<small>得点の移動なし</small></div>';
    var h = '<div class="aw-vd">';
    res.top.forEach(function (gr) { h += '<p><span class="tag up">最多一致</span>「' + esc(gr.label) + '」' + gr.members.length + '人 → <b class="up">+' + lv + '</b></p>'; });
    if (res.solo.length) h += '<p><span class="tag down">ひとりだけ</span>' + res.solo.map(function (gr) { return esc(m.names[gr.members[0]]); }).join('、') + ' → <b class="down">−' + lv + '</b></p>';
    var others = res.pts.filter(function (p) { return p === 0; }).length;
    if (others) h += '<p class="dim">それ以外の ' + others + ' 人は ±0</p>';
    return h + '</div>';
  }
  function paintJudge(ctx) {
    var sc = ctx.screen('judge'), g = G(), m = M(ctx);
    var groups = groupsOf(ctx), idx = {};
    groups.forEach(function (gr, k) { idx[gr.key] = k; });
    var gbox = sc.querySelector('.aw-groups');
    gbox.innerHTML = groups.map(function (gr, k) {
      return '<button type="button" class="aw-gchip g' + (k % 8) + (g.sel === gr.key ? ' sel' : '') + '" data-key="' + esc(gr.key) + '">' +
        '<span class="gc-dot">' + String.fromCharCode(65 + k) + '</span>' + esc(gr.label) + '<span class="gc-n">×' + gr.members.length + '</span></button>';
    }).join('');
    ctx.$$('.aw-ans-row', sc).forEach(function (row, i) {
      var k = 0;
      groups.forEach(function (gr, kk) { if (gr.members.indexOf(i) > -1) k = kk; });
      var dot = row.querySelector('.aw-ans-g');
      dot.className = 'aw-ans-g g' + (k % 8);
      dot.textContent = String.fromCharCode(65 + k);
    });
    sc.querySelector('.aw-unmerge').hidden = !Object.keys(g.alias).length;
    var res = judge(groups, m.n, lvNow());
    sc.querySelector('.aw-verdict-box').innerHTML = verdictHtml(ctx, res);
    var filled = g.answers.every(function (a) { return String(a || '').trim(); });
    sc.querySelector('.aw-decide').disabled = !filled;
    sc.querySelector('.aw-fill-note').hidden = filled;
    return { groups: groups, res: res };
  }

  /* これまでの回答（縦＝ラウンドとお題、横＝プレイヤー） */
  function boardHtml(ctx, showRoles) {
    var g = G(), m = M(ctx);
    if (!g.log.length) return '<p class="empty-note">まだ回答がありません</p>';
    var h = '<div class="aw-board-wrap"><table class="aw-board"><thead><tr><th class="bd-q">お題</th>';
    m.names.forEach(function (nm, i) {
      h += '<th>' + esc(nm) + (showRoles ? '<span class="bd-role ' + (g.roles[i] ? 'c' : 'm') + '">' + (g.roles[i] ? '犯人' : '仲間') + '</span>' : '') + '</th>';
    });
    h += '</tr></thead><tbody>';
    g.log.forEach(function (l, r) {
      h += '<tr class="' + (l.all ? 'all' : '') + '"><th class="bd-q"><span class="bd-r">R' + (r + 1) + '・難' + l.level + (l.all ? '・<b class="ok">一致</b>' : '・<b class="ng">ズレ</b>') + '</span>' + esc(l.topic) + '</th>';
      l.answers.forEach(function (a, i) {
        var cls = l.all ? 'ok' : (l.size[i] === 1 ? 'odd' : (l.size[i] === l.max ? 'maj' : ''));
        var pt = g.kind === 'coop' && l.pts[i] ? '<span class="bd-pt ' + (l.pts[i] > 0 ? 'up' : 'down') + '">' + (l.pts[i] > 0 ? '+' : '−') + Math.abs(l.pts[i]) + '</span>' : '';
        h += '<td class="' + cls + '">' + esc(a) + pt + '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div>' +
      '<p class="row-hint">緑＝全員一致　赤＝ひとりだけ違う答え' + (g.kind === 'mys' ? '' : '　黄＝最多一致') + '</p>';
  }

  /* 判定の決定 */
  function decideRound(ctx, groups, res) {
    var g = G(), m = M(ctx), lv = lvNow();
    var gIdx = [];
    groups.forEach(function (gr, k) { gr.members.forEach(function (i) { gIdx[i] = k; }); });
    g.log.push({ topic: g.topic.text, level: lv, answers: g.answers.slice(), all: res.all, size: res.size.slice(), max: res.max,
      pts: g.kind === 'coop' ? res.pts.slice() : [] });
    if (res.all) g.ok++; else g.ng++;
    if (g.kind === 'mys') { ctx.show('mround', { resetStack: true }); return; }
    // 協力：ポイント結果へ
    var coopWin = g.ok >= g.need, last = g.round + 1 >= g.T;
    g.coopWin = coopWin; g.finished = coopWin || last;
    var line = res.all ? '🎉 <b>全員一致！</b> 得点の移動なし' : res.bara ? '全員バラバラ… 得点の移動なし'
      : res.top.map(function (gr) { return '最多一致「<b>' + esc(gr.label) + '</b>」' + gr.members.length + '人 <b class="pt">+' + lv + '</b>'; }).join('<br>') +
        (res.solo.length ? '<br>ひとりだけ：' + res.solo.map(function (gr) { return esc(m.names[gr.members[0]]); }).join('、') + ' <b class="pt minus">−' + lv + '</b>' : '');
    var left = Math.max(0, g.need - g.ok);
    ctx.roundResult({
      pts: res.pts, done: g.finished, noBar: true,
      roundHead: '第' + (g.round + 1) + ' / ' + g.T + 'ラウンド　<b>難易度' + lv + '（±' + lv + '点）</b>',
      head: '<div class="rr-topic">お題：<b>' + esc(g.topic.text) + '</b></div><p>' + line + '</p>' + progHtml(),
      goal: coopWin ? '🎉 <b>協力成功！</b> ' + g.ok + '回 全員一致で全員の勝利！'
        : last ? '全ラウンド終了！ 得点が一番高い人の勝ち'
        : 'あと <b>' + left + '</b> 回 全員一致で協力成功（残り ' + (g.T - g.round - 1) + ' ラウンド）',
      nextLabel: g.finished ? '結果発表へ' : '次の親を決める',
      onNext: function () { g.round++; g.parentMode = 'next'; g.pick = -1; ctx.show('parent', { resetStack: true }); }
    });
  }

  /* 投票（フルゲーム）：票数を入力。最多が同数なら決選投票 */
  function renderMVote(ctx) {
    var sc = ctx.screen('mvote'), g = G(), m = M(ctx), n = m.n;
    var box = sc.querySelector('.aw-vrows');
    var labels = m.names.concat(['犯人はいない']);
    box.innerHTML = labels.map(function (nm, i) {
      var off = g.cand && g.cand.indexOf(i) < 0;
      return '<div class="aw-vrow' + (i === n ? ' none' : '') + (off ? ' off' : '') + '" data-i="' + i + '">' +
        '<span class="aw-vname">' + esc(nm) + '</span>' +
        '<div class="counter"><button type="button" class="cbtn" data-d="-1" aria-label="減らす"' + (off ? ' disabled' : '') + '>−</button>' +
        '<span class="cnum-input aw-vnum">' + g.votes[i] + '</span>' +
        '<button type="button" class="cbtn" data-d="1" aria-label="増やす"' + (off ? ' disabled' : '') + '>＋</button></div></div>';
    }).join('');
    var sum = g.votes.reduce(function (a, b) { return a + b; }, 0);
    sc.querySelector('.aw-vsum').innerHTML = '投票数 <b>' + sum + '</b> / ' + n + ' 人';
    var rb = sc.querySelector('.aw-runoff');
    rb.hidden = !g.cand;
    if (g.cand) rb.innerHTML = '<b>決選投票' + (g.runoff > 1 ? '（' + g.runoff + '回目）' : '') + '</b>：最多票が同数でした。<br>' +
      g.cand.map(function (i) { return esc(labels[i]); }).join('・') + ' の中から、もう一度投票してください。';
    sc.querySelector('.aw-vclose').disabled = sum === 0;
  }
  function closeVote(ctx) {
    var g = G(), n = M(ctx).n;
    var max = Math.max.apply(null, g.votes);
    var tops = []; g.votes.forEach(function (v, i) { if (v === max) tops.push(i); });
    if (!g.firstVotes) g.firstVotes = g.votes.slice();
    if (tops.length > 1) {
      g.runoff++; g.cand = tops;
      g.votes = g.votes.map(function () { return 0; });
      renderMVote(ctx);
      ctx.toast('同票です！決選投票をしてください', 2200);
      var sa = ctx.screen('mvote').querySelector('.scroll-area'); if (sa) sa.scrollTop = 0;
      return;
    }
    g.top = tops[0] === n ? -1 : tops[0];
    g.topVotes = max;
    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) { return g.firstVotes[a] - g.firstVotes[b] || a - b; });
    if (g.top >= 0) { order.splice(order.indexOf(g.top), 1); order.push(g.top); }
    g.order = order; g.shown = 0; g.busy = false;
    if (g.vtimer) { g.vtimer.destroy(); g.vtimer = null; }
    ctx.show('mreveal', { resetStack: true });
  }
  function renderReveal(ctx) {
    var sc = ctx.screen('mreveal'), g = G(), m = M(ctx), n = m.n;
    sc.querySelector('.aw-rv-top').innerHTML = '最多票：<b>' + (g.top === -1 ? '犯人はいない' : esc(m.names[g.top]) + ' さん') + '</b>' +
      (g.runoff ? '（決選投票で決定）' : '（' + g.topVotes + '票）');
    sc.querySelector('.aw-rv-grid').innerHTML = g.order.map(function (pi, k) {
      var shown = k < g.shown, next = k === g.shown;
      var c = g.roles[pi];
      return '<button type="button" class="aw-rc' + (shown ? ' shown ' + (c ? 'c' : 'm') : '') + (next ? ' next' : '') + (next && g.busy ? ' suspense' : '') + '" data-k="' + k + '">' +
        '<span class="aw-rc-name">' + esc(m.names[pi]) + '</span>' +
        '<span class="aw-rc-votes">' + g.firstVotes[pi] + '票' + (pi === g.top ? '・最多' : '') + '</span>' +
        '<span class="aw-rc-role">' + (shown ? (c ? '犯人' : '仲間') : (next && g.busy ? '…' : '？')) + '</span></button>';
    }).join('');
    var all = g.shown >= n;
    var btn = sc.querySelector('.aw-rv-next');
    btn.textContent = all ? '勝敗判定へ' : esc(m.names[g.order[g.shown]]) + ' さんの役職を公開';
    btn.disabled = g.busy;
    sc.querySelector('.aw-rv-all').hidden = all;
  }
  function revealNext(ctx) {
    var g = G(), n = M(ctx).n;
    if (g.busy) return;
    if (g.shown >= n) {
      var o = verdict(g.roles, M(ctx).names, 'vote', g.top);
      g.outcome = o;
      ctx.show('mresult', { resetStack: true });
      return;
    }
    var pi = g.order[g.shown];
    var tense = pi === g.top || g.shown === n - 1;          // 最多票の人と最後の1人はタメてから公開
    if (!tense) { g.shown++; renderReveal(ctx); return; }
    g.busy = true; renderReveal(ctx);
    setTimeout(function () { g.busy = false; g.shown++; renderReveal(ctx); }, 1600);
  }

  /* 協力フルゲームの結果 */
  function renderClear(ctx) {
    var sc = ctx.screen('clear'), g = G(), m = M(ctx);
    var rows = m.names.map(function (nm, i) { return { i: i, nm: nm, total: m.total[i] || 0 }; });
    rows.sort(function (a, b) { return b.total - a.total || a.i - b.i; });
    var max = rows.length ? rows[0].total : 0;
    var win = rows.filter(function (r) { return r.total === max; });
    var played = g.log.length;
    if (g.coopWin) {
      sc.querySelector('.cl-cup').textContent = '🎉';
      sc.querySelector('.cl-title').textContent = '協力成功！';
      sc.querySelector('.cl-main').innerHTML = '<b>' + played + '</b> ラウンドで <b>' + g.ok + '</b> 回 全員一致！<br>全員の勝利！';
    } else {
      sc.querySelector('.cl-cup').textContent = '🏆';
      sc.querySelector('.cl-title').textContent = win.map(function (r) { return r.nm + 'さん'; }).join('、') + 'の勝ち！';
      sc.querySelector('.cl-main').innerHTML = '全員一致 <b>' + g.ok + '</b> 回（目標 ' + g.need + ' 回）…協力成功ならず';
    }
    sc.querySelector('.cl-sub').textContent = played + ' / ' + g.T + ' ラウンド' + (!g.coopWin && played < g.T ? '（途中で終了）' : '');
    var rank = 0, prev = null;
    sc.querySelector('.cl-score').innerHTML = rows.map(function (r, k) {
      if (r.total !== prev) { rank = k + 1; prev = r.total; }
      return '<div class="rs-row' + (rank === 1 && !g.coopWin ? ' top' : '') + '"><span class="rs-rank">' + rank + '位</span>' +
        '<span class="rs-name">' + esc(r.nm) + '</span><span class="rs-total">' + r.total + '点</span></div>';
    }).join('');
    sc.querySelector('.cl-board').innerHTML = boardHtml(ctx, false);
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
      '全員が同時に答えを言う');
    // 協力フルゲームの得点
    var s3p = '', a3 = ['大根', '大根', '大根', '卵', '卵', 'ちくわ'], p3 = ['+3', '+3', '+3', '±0', '±0', '−3'];
    a3.forEach(function (a, i) {
      var x = 30 + i * 52, solo = i === 5, top = i < 3;
      s3p += I.person(x, 150, { c: top ? 1 : solo ? 3 : 2, s: 0.9, eyes: top ? 'happy' : 'open', mouth: solo ? 'sad' : top ? 'smile' : 'flat' }) +
        I.say(x, 150, a, { s: 0.9, size: 10, stroke: solo ? '#e5484d' : top ? 'currentColor' : 'var(--fg-dim)' }) +
        I.badge(x, 170, p3[i], top ? '#d9a21b' : solo ? '#e5484d' : '#8a8fa8');
    });
    var s3 = I.svg(320, 186,
      I.card(70, 4, 180, 28, '第3ラウンド：±3点のお題', { size: 10.5, r: 14 }) + s3p,
      '一番多い答えの人は＋、ひとりだけの人は−');
    // ミステリー：犯人もお題を知っていて、こっそりズラす
    var s2 = I.svg(320, 182,
      I.card(84, 4, 152, 34, 'おでんの具といえば？', { size: 10.5, r: 10, sub: '全員に見えている' }) +
      I.person(44, 164, { c: 1, eyes: 'happy', label: '仲間' }) + I.say(44, 164, '大根', {}) +
      I.person(120, 164, { c: 2, eyes: 'happy', label: '仲間' }) + I.say(120, 164, '大根', {}) +
      I.person(196, 164, { c: 4, mask: true, mouth: 'flat', label: '犯人' }) + I.say(196, 164, 'はんぺん', { stroke: '#9b6bff' }) +
      I.person(272, 164, { c: 3, mouth: 'o', label: '仲間' }) + I.say(272, 164, '？', { think: true, w: 34 }),
      '犯人もお題を知っている。目的は「答えをこっそりズラす」こと');
    return { s1: s1, s2: s2, s3: s3 };
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
      { id: SID, label: 'お題', rev: 1,
        fields: [
          { key: 'text', label: 'お題', placeholder: '例：おでんの具といえば？', hint: '「〇〇といえば？」の形がおすすめです' },
          { key: 'level', label: '難易度', options: [['', '未設定'], ['1', '1（そろいやすい）'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5（そろいにくい）']],
            hint: 'フルゲームでラウンドごとに使います。1＝答えがそろいやすい 〜 5＝そろいにくい' }
        ],
        sub: function (t) { var lv = levelOf(t); return lv ? '難易度 ' + lv : ''; } }
    ],
    defaults: { mode: 'normal', target: 5, coopRounds: 5, mysRounds: 5, firstParent: 'random', mysKnow: false, voteSec: 180 },
    settings: [
      { key: 'firstParent', type: 'seg', label: 'フルゲーム：最初の親', options: [['random', 'ランダム'], ['choose', '指定する']] },
      { key: 'mysKnow', type: 'bool', label: 'ミステリー：犯人同士はお互いを知っている' },
      { key: 'voteSec', type: 'time', label: 'ミステリー（フルゲーム）：投票タイマー', def: 180 }
    ],
    help: {
      wolf: ['ミステリーモード', '答え合わせの中に、一致させないよう<b>妨害している人</b>が紛れ込むことがあります！<br>だれが妨害しているのか見破りましょう！<br>ただし、<b>誰も妨害していない</b>場合もあるため注意！'],
      know: ['犯人同士はお互いを知っている', 'オンにすると、役職確認のときに犯人はほかの犯人がだれかを知ることができます。オフ（標準）では、犯人もほかの犯人を知りません。']
    },
    logoHtml: function (ctx) {
      var wolf = isMys(ctx);
      return '<div class="aw-hero">' +
        '<svg class="aw-deco" viewBox="0 0 200 120" aria-hidden="true">' +
          '<circle class="b1" cx="78" cy="60" r="46"/><circle class="b2" cx="122" cy="60" r="46"/>' +
        '</svg><span class="aw-moon" aria-hidden="true"></span>' +
        '<div class="aw-logo-box">' + ctx.logo(wolf ? 'awaseyou-wolf' : 'awaseyou', 'gl-svg', '答えを合わせよう') + '</div>' +
        '<p class="aw-wolf-tag">ミステリーモード</p></div>';
    },

    title: function (ctx, box) {
      var gs = ctx.settings();
      var top = document.createElement('div');
      top.className = 'aw-switch-row';
      top.innerHTML = '<div class="mode-switch"><button data-val="normal">通常モード</button><button data-val="wolf" class="wolf">☾ ミステリー</button></div>' +
        '<button class="btn-help aw-help" data-help="wolf" aria-label="ミステリーモードの説明">?</button>';
      box.appendChild(top);
      var list = ctx.modeButtons(box, {
        topic: { fn: function () {
          st.mode = 'topic'; st.q = 1;
          if (isMys(ctx)) { ctx.show('setup', { resetStack: true }); return; }
          if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
        } },
        quick: { fn: function () { st.mode = 'quick'; ctx.show('setup', { resetStack: true }); } },
        full: { fn: function () { st.mode = 'full'; ctx.show('setup', { resetStack: true }); } }
      });
      var paint = function () {
        var v = gs.mode === 'wolf' ? 'wolf' : 'normal';
        ctx.$$('.mode-switch button', top).forEach(function (b) { b.classList.toggle('on', b.dataset.val === v); });
        top.querySelector('.aw-help').classList.toggle('off', v !== 'wolf');     // ミステリーモードの時だけ表示（場所は確保）
        ['topic', 'quick', 'full'].forEach(function (k) {
          list.querySelector('.mode-' + k + ' .bm-label').textContent = LABELS[v][k].label;
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
        '<div class="rule-sec"><h3><span class="badge">2</span>通常モード：フルゲーム（協力＋得点）</h3>' +
          '<div class="rule-fig">' + ctx.figFlow(['お題', 'せーの', '入力', '得点', '交代'], ['3つから', '同時に', '全員分', '一致数で', '親が指名']) + '</div>' +
          '<ol class="rule-steps">' +
            '<li><b>親がお題を選んで読み上げる</b>：そのラウンドの難易度のお題が3つ出るので、好きなものを1つ選びます。</li>' +
            '<li><b>相談なしで考える</b>（5秒くらい）。全員が思いついた合図を出したら…</li>' +
            '<li><b>せーので発表！</b> 似ている答えが出たら、同じ答えにするかを全員で相談します（入力画面でまとめられます）。</li>' +
            '<li><b>得点</b>：下の表のとおり。</li>' +
            '<li><b>次のラウンドへ</b>：今の親が、次の親を指名します（自分以外）。</li>' +
          '</ol>' +
          I.fig(il.s3, 'ひとりだけの答えが2人以上いたら、その全員が−') +
          '<table class="rule-table"><tr><th>結果</th><th>得点</th></tr>' +
            '<tr><td>全員一致</td><td>移動なし（協力成功に1回カウント）</td></tr>' +
            '<tr><td>一番人数が多い答えの人<br><small>同じ人数のグループが複数あれば、どちらも</small></td><td><b>＋ラウンドの点</b></td></tr>' +
            '<tr><td>ひとりだけの答えでズレた人</td><td><b>−ラウンドの点</b></td></tr>' +
            '<tr><td>それ以外／全員バラバラ</td><td>移動なし</td></tr></table>' +
          '<p><b>難易度と点数</b>：第1ラウンド＝難易度1（±1点）、第2＝難易度2（±2点）… 第5＝難易度5（±5点）。だんだん難しく、点も大きくなります。<br>' +
            '<small>6ラウンド以上のときは、6ラウンド目からはランダムな難易度（点数もその難易度）。ただし<b>最後のひとつ前は難易度3、最後は難易度5</b>で固定。5ラウンドより少ないときは、最後が5、その前が4、その前が3…と逆算します。</small></p>' +
          '<p><b>勝ち負け</b>：全員一致が<b>目標の回数</b>に届いたら、その時点で<b>全員の勝利（協力成功）</b>！目標の回数は、ラウンド数のおよそ6割（5ラウンドなら<b>3回</b>、6ラウンドなら3回、7・8ラウンドなら4回、10ラウンドなら6回）。ゲーム設定画面と、プレイ中の画面に「あと何回か」が表示されます。<br>' +
            '協力成功できなかったら、全ラウンド終了時に<b>得点が一番高い人の勝ち</b>（同点なら全員）。</p>' +
        '</div>' +
        '<div class="rule-sec"><h3><span class="badge">3</span>ミステリーモード</h3>' +
          '<p>答え合わせの中に、答えが<b>そろわないよう妨害している「犯人」</b>がまぎれているかも…！だれが妨害しているのか見破りましょう。ただし、<b>犯人がいない</b>こともあります。</p>' +
          I.fig(il.s2, '役職（仲間／犯人）が配られるだけで、お題は全員が見られます') +
          '<p><b>役職カード</b>：仲間カードは人数分、犯人カードは人数で決まります（3〜6人：1枚／7〜10人：2枚／11〜14人：3枚／15〜19人：4枚／20人：5枚）。全部まぜて<b>人数分だけ配る</b>ので、余ったカードに犯人が入っていると、犯人が少ない（いない）ゲームになります。</p>' +
          '<p><b>フルゲームの流れ</b>（役職は最初に1回だけ配ります）</p>' +
          '<div class="rule-fig">' + ctx.figFlow(['役職', 'お題', 'せーの', '一致？', '投票'], ['1人ずつ', '3つから', '同時に', '目標まで', 'ズレ多数']) + '</div>' +
          '<ul>' +
            '<li><b>仲間の目標</b>：全員一致を<b>目標の回数</b>（5ラウンドなら<b>2回</b>、7・8ラウンドなら3回、10ラウンドなら4回＝ラウンド数のおよそ4割）達成したら、その時点で<b>仲間チームの勝ち</b>（犯人がいなければ全員の勝ち）。</li>' +
            '<li><b>犯人の目標</b>：答えをズラして、仲間が目標に届かなくなるまでズレさせること。そうなったら<b>投票タイム</b>へ。</li>' +
            '<li><b>難易度</b>：最初が一番難しく（難易度5）、だんだん簡単に（最後は難易度1）。終盤ほどズラすとバレやすくなります。</li>' +
            '<li><b>投票タイム</b>（標準3分）：これまでの全員の回答を見ながら話し合い、犯人だと思う人に投票（「犯人はいない」も選べます）。最多票が同数なら、その人たちで<b>決選投票</b>。</li>' +
            '<li><b>役職公開</b>：票の少ない人から1人ずつ公開。最後はドキドキの演出つき！（まとめて公開もできます）</li>' +
          '</ul>' +
          '<table class="rule-table"><tr><th>結果</th><th>勝ち</th></tr>' +
            '<tr><td>目標の回数 全員一致した</td><td>仲間チーム（犯人がいなければ全員）</td></tr>' +
            '<tr><td>投票で犯人を当てた</td><td>仲間チーム</td></tr>' +
            '<tr><td>投票で犯人を外した</td><td>犯人</td></tr>' +
            '<tr><td>「犯人はいない」が最多票で、本当にいなかった</td><td>全員の勝ち</td></tr>' +
            '<tr><td>犯人はいないのに、だれかを疑った</td><td>全員の負け</td></tr></table>' +
          '<p><b>ゲーム設定で変えられること</b>：ラウンド数（標準5）、最初の親（ランダム／指定）、犯人同士がお互いを知るか（標準：知らない）、投票タイマー（標準3分）。</p>' +
        '</div>' +
        ctx.modesRule({
          topic: '通常モードはお題画面だけ。ミステリーモードは<b>「役職とお題表示」</b>：お題ごとに役職を配って、せーの → ズレたら投票 → 結果発表をくり返します（点数なし）。',
          quick: '通常モードは読み上げ役が順番に交代しながら何回でも。ミステリーモードは「役職とお題表示」と同じ流れで、勝ったチームのメンバーに1pt（全員の勝ちなら全員に1pt）。〇点先取。',
          full: '通常モードは<b>協力＋得点</b>（上の2）。ミステリーモードは<b>投票で犯人を見破る</b>本格版（上の3）。'
        });
    },

    screens: {
      /* ---------- 通常：お題画面 ---------- */
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

      /* ---------- ゲーム設定 ---------- */
      setup: {
        html: T({ back: 'title', right: '<span class="tb-count mode-chip aw-mode-title"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="aw-target"></div>' +
            '<div class="card aw-preview" hidden></div>' +
            '<div class="card aw-opt" hidden>' +
              '<label class="row-label">最初の親</label>' +
              '<div class="seg aw-fp"><button type="button" class="seg-btn" data-val="random">ランダム</button><button type="button" class="seg-btn" data-val="choose">指定する</button></div>' +
              '<div class="aw-opt-mys">' +
                '<div class="aw-know-row"><label class="check-row"><input type="checkbox" class="aw-know"><span class="cbox"></span><span class="check-text">犯人同士はお互いを知っている</span></label>' +
                  '<button class="btn-help sm" data-help="know" aria-label="説明">?</button></div>' +
                '<label class="row-label" style="margin-top:14px">投票タイマー</label><div class="time-set aw-vt"></div>' +
              '</div>' +
            '</div>' +
            '<div class="aw-players"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-start">ゲーム開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('setup');
          var gs = ctx.settings(), mys = isMys(ctx), full = st.mode === 'full';
          var mk = LABELS[mys ? 'wolf' : 'normal'][st.mode].label;
          sc.querySelector('.aw-mode-title').textContent = (mys ? 'ミステリー・' : '') + mk;
          sc.querySelector('.aw-start').textContent = mys ? '役職確認へ' : 'ゲーム開始';
          var rkey = mys ? 'mysRounds' : 'coopRounds';
          var pv = sc.querySelector('.aw-preview');
          var paintPreview = function () {
            if (!full) { pv.hidden = true; return; }
            var t = gs[rkey] || 5, plan = levelPlan(t, !mys);
            var seq = plan.map(function (lv) { return '<span class="lv' + (lv ? '' : ' rnd') + '">' + (lv || '?') + '</span>'; }).join('');
            pv.hidden = false;
            pv.innerHTML = mys
              ? '<p class="aw-pv-main"><b class="big">' + mysNeed(t) + '回</b> 全員一致で <b>仲間チームの勝ち！</b></p>' +
                '<p class="aw-pv-sub"><b>' + mysFailMax(t) + '回</b> ズレたら投票タイム（犯人さがし）</p>' +
                '<p class="aw-pv-seq">難易度：' + seq + '</p><p class="row-hint">?＝ランダム。最初が難しく、だんだん簡単になります。</p>'
              : '<p class="aw-pv-main">' + t + 'ラウンド中 <b class="big">' + coopNeed(t) + '回</b> 全員一致で <b>全員の勝利！</b></p>' +
                '<p class="aw-pv-sub">届かなければ、最後に得点が一番高い人の勝ち</p>' +
                '<p class="aw-pv-seq">難易度＝得点：' + seq + '</p><p class="row-hint">?＝ランダム。難易度の数字がそのラウンドの得点（±）です。</p>';
          };
          var tg = sc.querySelector('.aw-target');
          tg.innerHTML = '';
          if (full) ctx.targetCard(tg, { key: rkey, def: 5, min: 3, max: 15, label: 'ラウンド数', unit: 'ラウンド', onChange: paintPreview });
          else if (mys && st.mode === 'quick') ctx.targetCard(tg, { def: 5, hint: '勝ったチームのメンバー全員に 1pt（全員の勝ちなら全員に 1pt）。役職はお題ごとに配り直します。' });
          paintPreview();
          // オプション
          var opt = sc.querySelector('.aw-opt');
          opt.hidden = !full;
          sc.querySelector('.aw-opt-mys').hidden = !mys;
          var paintFp = function () { ctx.$$('.aw-fp .seg-btn', sc).forEach(function (b) { b.classList.toggle('on', b.dataset.val === (gs.firstParent || 'random')); }); };
          sc.querySelector('.aw-fp').onclick = function (ev) { var b = ev.target.closest('.seg-btn'); if (!b) return; ctx.setSetting('firstParent', b.dataset.val); paintFp(); };
          paintFp();
          var kn = sc.querySelector('.aw-know');
          kn.checked = !!gs.mysKnow;
          kn.onchange = function () { ctx.setSetting('mysKnow', kn.checked); };
          var paintVt = function () {
            var v = gs.voteSec || 180, mm = Math.floor(v / 60), ss = v % 60;
            var box = sc.querySelector('.aw-vt');
            box.innerHTML = ctx.counterHtml('vtm', '分', mm) + '<span class="unit">分</span>' + ctx.counterHtml('vts', '秒', ('0' + ss).slice(-2)) + '<span class="unit">秒</span>';
            var apply = function (a, b) { ctx.setSetting('voteSec', Math.max(10, Math.min(59 * 60 + 59, a * 60 + b))); paintVt(); };
            ctx.bindCounter(box, 'vtm', { min: 0, max: 59, get: function () { return mm; }, apply: function (x) { apply(x, ss); } });
            ctx.bindCounter(box, 'vts', { min: 0, max: 59, step: 15, wrap: true, format: function (x) { return ('0' + x).slice(-2); },
              get: function () { return ss; }, apply: function (x) { apply(mm, x); } });
          };
          paintVt();
          ctx.playersCard(sc.querySelector('.aw-players'), {
            note: function (n) {
              if (mys) { var w = culpritCards(n); return '役職カード：<b class="c">仲間 ' + n + '枚</b> ＋ <b class="s" style="color:#b98cff">犯人 ' + w + '枚</b> → ' + n + '枚を配る（犯人が少ない・いないことも）'; }
              return full ? '親は毎ラウンド、今の親が<b class="c">次の親を指名</b>して交代' : '読み上げ役は <b class="c">順番どおりに交代</b>';
            }
          });
          sc.querySelector('.aw-start').onclick = function () {
            if (full) { startFull(ctx); return; }
            ctx.startMatch(st.mode, { targetDef: 5, again: function () { ctx.show('setup', { resetStack: true }); } });
            if (mys) { st.topic = null; startMysRound(ctx); return; }
            if (nextTopic(ctx)) ctx.show('play', { resetStack: true });
          };
        }
      },

      /* ---------- ミステリー（1お題ごと）：せーの ---------- */
      talk: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-wq"></span>' }) +
          '<div class="stage">' +
            '<div class="odai-card aw-night"><span class="odai-kicker">お題</span>' +
              '<div class="odai-text aw-talk-topic"></div>' +
            '</div>' +
            '<p class="odai-note aw-sei">せーので答えを言おう！<br>全員そろったか、ズレたかを選んでください</p>' +
            '<p class="counter-pill aw-wc-note"></p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-w-ng" style="flex:0 0 36%">ズレた…</button><button class="btn-big aw-w-ok">全員そろった！</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('talk'), m = M(ctx);
          var t = sc.querySelector('.aw-talk-topic');
          t.textContent = st.topic.text; ctx.fitText(t, 40, 18);
          sc.querySelector('.aw-wc-note').textContent = '犯人カード ' + culpritCards(m.n) + '枚（配られていないこともあります）';
          sc.querySelector('.aw-wq').textContent = '第' + (m.round + 1) + 'ゲーム';
        }
      },

      vote: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count mode-chip">投票</span>' }) +
          '<div class="scroll-area">' +
            '<div class="lead-box">答えがそろいませんでした。<b>妨害した犯人はだれ？</b><br>話し合って多数決。<b>一番票が多かった人</b>を選んでください（同数なら、その人たちで決選投票）。</div>' +
            '<div class="aw-j-list aw-v-list"></div>' +
            '<button type="button" class="aw-pl vote none aw-v-none"><span class="aw-pl-name">犯人はいない</span><span class="aw-pl-state">が最多票</span></button>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-v-go" disabled>結果発表へ</button></div>',
        enter: function (ctx) { st.voted = -2; renderVote(ctx); }
      },

      result: {
        html: T({ back: 'title-confirm' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="aw-win"></div>' +
            '<div class="odai-card"><span class="odai-kicker">お題</span><div class="odai-text aw-topic"></div></div>' +
            '<div class="odai-card aw-night" style="min-height:0"><span class="odai-kicker">犯人は…</span>' +
              '<div class="wolf-list aw-wolves"></div><p class="row-hint aw-extra"></p></div>' +
          '</div></div>' +
          '<div class="bottom-bar aw-res-bar"><button class="btn-big sub aw-title" style="flex:0 0 34%">タイトルへ</button><button class="btn-big aw-again">次のお題へ</button></div>' +
          '<div class="bottom-bar aw-res-full" hidden><button class="btn-big aw-to-points">ポイント結果へ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('result'), m = M(ctx), o = st.outcome;
          var t = sc.querySelector('.aw-topic');
          t.textContent = st.topic.text;
          ctx.fitText(t, 34, 16);
          var cl = culpritList(st.roles);
          sc.querySelector('.aw-wolves').innerHTML = cl.length ? cl.map(function (w) { return '<span>' + esc(m.names[w]) + '</span>'; }).join('') : '<span class="none">いませんでした</span>';
          sc.querySelector('.aw-extra').textContent = extraText(st.extra);
          var pts = st.mode === 'quick';
          sc.querySelector('.aw-win').innerHTML = winBox(o, pts ? '<p class="aw-win-pt">' +
            (o.win === 'none' ? 'だれにも点は入りません' : o.win === 'all' ? '全員に <b>+1pt</b>' : '勝ったチームのみんなに <b>+1pt</b>') + '</p>' : '');
          sc.querySelector('.aw-res-bar').hidden = pts;
          sc.querySelector('.aw-res-full').hidden = !pts;
        }
      },

      /* ---------- フルゲーム：親を決める ---------- */
      parent: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-p-r"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="aw-p-prog"></div>' +
            '<div class="lead-box aw-p-lead"></div>' +
            '<div class="aw-j-list aw-p-list"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-p-go" disabled>ラウンド開始</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('parent'), g = G(), m = M(ctx);
          sc.querySelector('.aw-p-r').textContent = roundChip();
          sc.querySelector('.aw-p-prog').innerHTML = g.round ? progHtml() : '';
          sc.querySelector('.aw-p-lead').innerHTML = g.parentMode === 'first'
            ? '<b>最初の親</b>を選んでください。'
            : '今の親 <b>' + esc(m.names[g.parent]) + '</b> さんが、<b>次の親</b>を指名してください（自分以外）。';
          var paint = function () {
            var box = sc.querySelector('.aw-p-list');
            box.innerHTML = '';
            m.names.forEach(function (nm, i) {
              var self = g.parentMode === 'next' && i === g.parent;
              var b = document.createElement('button');
              b.type = 'button';
              b.className = 'aw-pl vote' + (g.pick === i ? ' picked' : '') + (self ? ' off' : '');
              b.disabled = self;
              b.innerHTML = '<span class="aw-pl-name">' + esc(nm) + '</span><span class="aw-pl-state">' + (self ? '今の親' : g.pick === i ? '✓ 親' : '指名') + '</span>';
              b.addEventListener('click', function () { g.pick = i; paint(); });
              box.appendChild(b);
            });
            var go = sc.querySelector('.aw-p-go');
            go.disabled = g.pick < 0;
            go.textContent = '第' + (g.round + 1) + 'ラウンドを始める';
          };
          paint();
        }
      },

      /* ---------- フルゲーム：お題選び ---------- */
      pick: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-k-r"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="aw-k-prog"></div>' +
            '<p class="who-line aw-k-who"></p>' +
            '<div class="aw-k-lv"></div>' +
            '<p class="q-title">親がお題を1つ選んで、読み上げてください</p>' +
            '<div class="aw-cands"></div>' +
          '</div>',
        enter: function (ctx) {
          var sc = ctx.screen('pick'), g = G(), m = M(ctx);
          sc.querySelector('.aw-k-r').textContent = roundChip();
          sc.querySelector('.aw-k-prog').innerHTML = progHtml();
          sc.querySelector('.aw-k-who').innerHTML = '親：<b>' + esc(m.names[g.parent]) + '</b> さん';
          sc.querySelector('.aw-k-lv').innerHTML = lvBadge(lvNow(), g.kind === 'coop');
          var box = sc.querySelector('.aw-cands');
          box.innerHTML = '';
          g.cands.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'aw-cand';
            b.innerHTML = '<span class="ac-text">' + esc(t.text) + '</span>' + (levelOf(t) && levelOf(t) !== lvNow() ? '<span class="ac-lv">難易度' + levelOf(t) + '</span>' : '') + '<span class="ac-go">これにする</span>';
            b.addEventListener('click', function () {
              g.topic = t;
              ctx.markUsed(SID, t.uid);
              ctx.show('ask', { resetStack: true });
            });
            box.appendChild(b);
          });
        }
      },

      /* ---------- フルゲーム：せーの ---------- */
      ask: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-a-r"></span>' }) +
          '<div class="stage">' +
            '<div class="aw-a-lv"></div>' +
            '<div class="odai-card aw-bubble"><div class="odai-text"></div></div>' +
            '<p class="odai-note aw-sei">相談なしで考えて（5秒くらい）、<br>全員が思いついたら <b>せーので発表！</b></p>' +
            '<button type="button" class="chip aw-repick">↺ お題を選び直す</button>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-a-go">答えを入力する</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('ask'), g = G();
          sc.querySelector('.aw-a-r').textContent = roundChip();
          sc.querySelector('.aw-a-lv').innerHTML = lvBadge(lvNow(), g.kind === 'coop');
          var tx = sc.querySelector('.odai-text');
          tx.textContent = g.topic.text; ctx.fitText(tx, 44, 18);
        }
      },

      /* ---------- フルゲーム：答えの入力と判定 ---------- */
      judge: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-j-r"></span>' }) +
          '<div class="scroll-area">' +
            '<div class="aw-j-head"></div>' +
            '<p class="q-title">みんなの答え</p>' +
            '<div class="aw-ans"></div>' +
            '<p class="q-title">答えのまとめ</p>' +
            '<p class="row-hint">似ている答えは、まとめを<b>2つ続けてタップ</b>すると「同じ答え」にできます。</p>' +
            '<div class="aw-groups"></div>' +
            '<button type="button" class="chip aw-unmerge" hidden>まとめを元に戻す</button>' +
            '<div class="aw-verdict-box"></div>' +
            '<p class="row-hint aw-fill-note">全員の答えを入力すると決定できます。</p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-decide" disabled>この結果で決定</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('judge'), g = G(), m = M(ctx);
          sc.querySelector('.aw-j-r').textContent = roundChip();
          sc.querySelector('.aw-j-head').innerHTML = '<div class="aw-j-topic"><span>お題</span><b>' + esc(g.topic.text) + '</b></div>' + lvBadge(lvNow(), g.kind === 'coop');
          var box = sc.querySelector('.aw-ans');
          box.innerHTML = '';
          m.names.forEach(function (nm, i) {
            var row = document.createElement('div');
            row.className = 'aw-ans-row';
            row.innerHTML = '<span class="aw-ans-name">' + esc(nm) + '</span>' +
              '<input class="aw-ans-in" type="text" maxlength="30" enterkeyhint="next" placeholder="答え" aria-label="' + esc(nm) + 'さんの答え">' +
              '<span class="aw-ans-g">A</span>';
            var inp = row.querySelector('input');
            inp.value = g.answers[i] || '';
            inp.addEventListener('input', function () { g.answers[i] = inp.value; paintJudge(ctx); });
            inp.addEventListener('keydown', function (ev) {
              if (ev.key !== 'Enter' || ev.isComposing) return;
              ev.preventDefault();
              var all = ctx.$$('.aw-ans-in', sc), nx = all[i + 1];
              if (nx) nx.focus(); else inp.blur();
            });
            box.appendChild(row);
          });
          paintJudge(ctx);
        }
      },

      /* ---------- ミステリー（フルゲーム）：ラウンドの結果 ---------- */
      mround: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count aw-m-r"></span>' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="aw-m-vd"></div>' +
            '<div class="aw-m-prog"></div>' +
            '<p class="q-title">これまでの回答</p>' +
            '<div class="aw-m-board"></div>' +
          '</div></div>' +
          '<div class="bottom-bar"><button class="btn-big aw-m-go"></button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('mround'), g = G();
          var last = g.log[g.log.length - 1];
          sc.querySelector('.aw-m-r').textContent = roundChip();
          sc.querySelector('.aw-m-vd').innerHTML = last.all
            ? '<div class="aw-big-vd ok">🎉 全員一致！</div>' : '<div class="aw-big-vd ng">ズレた…</div>';
          sc.querySelector('.aw-m-prog').innerHTML = progHtml();
          sc.querySelector('.aw-m-board').innerHTML = boardHtml(ctx, false);
          var next = g.ok >= g.need ? 'win' : g.ng >= mysFailMax(g.T) ? 'vote' : 'next';
          g.after = next;
          var go = sc.querySelector('.aw-m-go');
          go.textContent = next === 'win' ? '結果発表へ' : next === 'vote' ? '投票タイムへ' : '次の親を決める';
          if (next === 'vote') ctx.toast('ズレが多すぎる…犯人がいるかも？投票タイムへ！', 2200);
        }
      },

      /* ---------- ミステリー（フルゲーム）：投票タイム ---------- */
      mvote: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count mode-chip">投票タイム</span>' }) +
          '<div class="scroll-area">' +
            '<div class="lead-box">仲間の目標に届かなくなりました…。<b>妨害した犯人はだれ？</b><br>これまでの回答を見ながら話し合って、犯人だと思う人に投票しよう。<b>「犯人はいない」</b>も選べます。</div>' +
            '<div class="aw-vtimer"></div>' +
            '<p class="q-title">これまでの回答</p>' +
            '<div class="aw-v-board"></div>' +
            '<p class="q-title">投票の結果（票数を入力）</p>' +
            '<div class="aw-runoff" hidden></div>' +
            '<div class="aw-vrows"></div>' +
            '<p class="aw-vsum"></p>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-vclose" disabled>投票を締め切る</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('mvote'), g = G(), n = M(ctx).n;
          if (!g.votes) { g.votes = []; for (var i = 0; i <= n; i++) g.votes.push(0); }
          sc.querySelector('.aw-v-board').innerHTML = boardHtml(ctx, false);
          if (g.vtimer) g.vtimer.destroy();
          var tb = sc.querySelector('.aw-vtimer'); tb.innerHTML = '';
          g.vtimer = ctx.timer(tb, ctx.settings().voteSec || 180);
          renderMVote(ctx);
        }
      },

      /* ---------- ミステリー（フルゲーム）：役職公開 ---------- */
      mreveal: {
        html: T({ back: 'title-confirm', right: '<span class="tb-count mode-chip">役職公開</span>' }) +
          '<div class="scroll-area">' +
            '<p class="aw-rv-top"></p>' +
            '<p class="row-hint" style="text-align:center">票の少ない人から1人ずつ公開します</p>' +
            '<div class="aw-rv-grid"></div>' +
            '<button type="button" class="chip aw-rv-all">まとめて全員公開</button>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big aw-rv-next"></button></div>',
        enter: function (ctx) { renderReveal(ctx); }
      },

      /* ---------- ミステリー（フルゲーム）：結果 ---------- */
      mresult: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area"><div class="stage top">' +
            '<div class="aw-mr-win"></div>' +
            '<div class="aw-mr-roles"></div>' +
            '<p class="row-hint aw-mr-extra"></p>' +
            '<p class="q-title">全員の回答</p>' +
            '<div class="aw-mr-board"></div>' +
          '</div></div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-mr-title" style="flex:0 0 36%">タイトルへ</button><button class="btn-big aw-mr-again">もう一度遊ぶ</button></div>',
        enter: function (ctx) {
          var sc = ctx.screen('mresult'), g = G(), m = M(ctx);
          sc.querySelector('.aw-mr-win').innerHTML = winBox(g.outcome);
          sc.querySelector('.aw-mr-roles').innerHTML = '<div class="aw-roles">' + m.names.map(function (nm, i) {
            return '<span class="aw-role ' + (g.roles[i] ? 'c' : 'm') + '"><b>' + esc(nm) + '</b>' + (g.roles[i] ? '犯人' : '仲間') + '</span>';
          }).join('') + '</div>';
          sc.querySelector('.aw-mr-extra').textContent = extraText(g.extra) + '　／　全員一致 ' + g.ok + '回・ズレ ' + g.ng + '回';
          sc.querySelector('.aw-mr-board').innerHTML = boardHtml(ctx, true);
          if (g.outcome.win !== 'none') { try { if (window.OdaiTimer) window.OdaiTimer.preview('marimba'); } catch (e) {} }
        }
      },

      /* ---------- 協力フルゲーム：結果 ---------- */
      clear: {
        html: T({ back: 'title' }) +
          '<div class="scroll-area">' +
            '<div class="vc-hero cl-hero"><div class="vc-confetti" aria-hidden="true"></div>' +
              '<div class="vc-cup cl-cup" aria-hidden="true">🎉</div>' +
              '<div class="vc-title cl-title"></div>' +
              '<p class="cl-main"></p><p class="vc-sub cl-sub"></p></div>' +
            '<p class="q-title">得点</p>' +
            '<div class="rs-list cl-score"></div>' +
            '<p class="q-title">これまでの回答</p>' +
            '<div class="cl-board"></div>' +
          '</div>' +
          '<div class="bottom-bar"><button class="btn-big sub aw-cl-title" style="flex:0 0 36%">タイトルへ</button><button class="btn-big aw-cl-again">もう一度遊ぶ</button></div>',
        enter: function (ctx) { renderClear(ctx); }
      }
    },

    init: function (ctx) {
      /* 通常：お題画面 */
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

      /* ミステリー（1お題ごと） */
      var finish = function (o) { st.outcome = o; ctx.show('result', { resetStack: true }); };
      var tk = ctx.screen('talk');
      tk.querySelector('.aw-w-ok').addEventListener('click', function () {
        ctx.confirm('全員の答えがそろいましたか？', function () { finish(verdict(st.roles, M(ctx).names, 'match')); });
      });
      tk.querySelector('.aw-w-ng').addEventListener('click', function () { ctx.show('vote', { resetStack: true }); });
      var vt = ctx.screen('vote');
      vt.querySelector('.aw-v-none').addEventListener('click', function () { st.voted = -1; renderVote(ctx); });
      vt.querySelector('.aw-v-go').addEventListener('click', function () {
        var m = M(ctx), v = st.voted;
        var msg = v === -1 ? '「犯人はいない」が一番多かったですね？' : '一番票が多かったのは ' + m.names[v] + ' さんですね？';
        ctx.confirm(msg, function () { finish(verdict(st.roles, m.names, 'vote', v)); });
      });
      var rs = ctx.screen('result');
      rs.querySelector('.aw-title').addEventListener('click', function () { ctx.goTitle(); });
      rs.querySelector('.aw-again').addEventListener('click', function () { ctx.nextTurn(); startMysRound(ctx); });
      rs.querySelector('.aw-to-points').addEventListener('click', function () {
        var m = M(ctx), o = st.outcome;
        var pts = m.names.map(function (n, i) {
          var c = !!st.roles[i];
          return o.win === 'all' ? 1 : o.win === 'mates' ? (c ? 0 : 1) : o.win === 'culprit' ? (c ? 1 : 0) : 0;
        });
        var cl = culpritList(st.roles).map(function (w) { return m.names[w]; });
        ctx.roundResult({
          pts: pts,
          head: '<div class="rr-topic">お題：<b>' + esc(st.topic.text) + '</b></div>' +
            '<p>犯人：<b>' + (cl.length ? esc(cl.join('、')) : 'いなかった') + '</b></p>' +
            '<p>' + WIN[o.win].title + (o.win === 'none' ? '' : ' <b class="pt">+1pt</b>') + '</p>',
          shareWin: true,
          onNext: function () { startMysRound(ctx); }
        });
      });

      /* フルゲーム */
      var pr = ctx.screen('parent');
      pr.querySelector('.aw-p-go').addEventListener('click', function () {
        var g = G(); if (g.pick < 0) return;
        g.parent = g.pick;
        startRound(ctx);
      });
      var ak = ctx.screen('ask');
      ak.querySelector('.aw-a-go').addEventListener('click', function () { ctx.show('judge', { resetStack: true }); });
      ak.querySelector('.aw-repick').addEventListener('click', function () {
        var g = G();
        ctx.unmarkLast(SID, g.topic.uid);
        g.topic = null;
        ctx.show('pick', { resetStack: true });
      });
      var jd = ctx.screen('judge');
      jd.querySelector('.aw-groups').addEventListener('click', function (ev) {
        var b = ev.target.closest('.aw-gchip'); if (!b) return;
        var g = G(), k = b.dataset.key;
        if (g.sel == null) { g.sel = k; }
        else if (g.sel === k) { g.sel = null; }
        else { g.alias[k] = g.sel; g.sel = null; ctx.toast('同じ答えにまとめました', 1200); }
        paintJudge(ctx);
      });
      jd.querySelector('.aw-unmerge').addEventListener('click', function () { G().alias = {}; G().sel = null; paintJudge(ctx); });
      jd.querySelector('.aw-decide').addEventListener('click', function () {
        var r = paintJudge(ctx);
        ctx.confirm('この結果で決定しますか？', function () { decideRound(ctx, r.groups, r.res); });
      });
      var mr = ctx.screen('mround');
      mr.querySelector('.aw-m-go').addEventListener('click', function () {
        var g = G();
        if (g.after === 'win') { g.outcome = verdict(g.roles, M(ctx).names, 'goal', -2, g.ok); ctx.show('mresult', { resetStack: true }); }
        else if (g.after === 'vote') { g.votes = null; g.cand = null; g.firstVotes = null; g.runoff = 0; ctx.show('mvote', { resetStack: true }); }
        else { g.round++; g.parentMode = 'next'; g.pick = -1; ctx.show('parent', { resetStack: true }); }
      });
      var mv = ctx.screen('mvote');
      mv.querySelector('.aw-vrows').addEventListener('click', function (ev) {
        var b = ev.target.closest('.cbtn'); if (!b || b.disabled) return;
        var i = +b.closest('.aw-vrow').dataset.i, g = G();
        g.votes[i] = Math.max(0, Math.min(M(ctx).n, g.votes[i] + (+b.dataset.d)));
        renderMVote(ctx);
      });
      mv.querySelector('.aw-vclose').addEventListener('click', function () {
        var g = G(), n = M(ctx).n, sum = g.votes.reduce(function (a, b) { return a + b; }, 0);
        if (!sum) return;
        if (sum !== n) ctx.confirm('投票数（' + sum + '票）が人数（' + n + '人）と違います。\nこのまま締め切りますか？', function () { closeVote(ctx); });
        else closeVote(ctx);
      });
      var rv = ctx.screen('mreveal');
      rv.querySelector('.aw-rv-next').addEventListener('click', function () { revealNext(ctx); });
      rv.querySelector('.aw-rv-grid').addEventListener('click', function (ev) {
        var b = ev.target.closest('.aw-rc.next'); if (b) revealNext(ctx);
      });
      rv.querySelector('.aw-rv-all').addEventListener('click', function () {
        ctx.confirm('残りの全員の役職を、まとめて公開しますか？', function () { var g = G(); g.busy = false; g.shown = M(ctx).n; renderReveal(ctx); });
      });
      var res = ctx.screen('mresult');
      res.querySelector('.aw-mr-title').addEventListener('click', function () { ctx.goTitle(); });
      res.querySelector('.aw-mr-again').addEventListener('click', function () { ctx.show('setup', { resetStack: true }); });
      var cl = ctx.screen('clear');
      cl.querySelector('.aw-cl-title').addEventListener('click', function () { ctx.goTitle(); });
      cl.querySelector('.aw-cl-again').addEventListener('click', function () { ctx.show('setup', { resetStack: true }); });

      window.addEventListener('odai:resize', function () {
        if (pl.classList.contains('active')) ctx.fitText(pl.querySelector('.odai-text'), 44, 18);
      });
    }
  });
})();
