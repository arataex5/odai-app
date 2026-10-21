/* =========================================================
   新しいボードゲームのひな形（このファイル自体は読み込まれません）

   追加の手順（README「ボードゲームの追加方法」も参照）
   1. このファイルをコピーして js/games/<ゲームID>.js を作る（ゲームIDは半角英小文字）
   2. お題を data/<ゲームID>/<セットID>.csv に置く（A列=No.、B列以降=fields の順）
   3. index.html の「ボードゲーム」の所に <script src="./js/games/<ゲームID>.js"></script> を1行追加
   4. sw.js の ASSETS に './js/games/<ゲームID>.js' と CSV のパスを追加
   5. python tools/embed_csv.py を実行（オフライン用の埋め込みデータを更新）
   6. sw.js と js/core/store.js の APP_VERSION を上げる
   ========================================================= */
(function () {
  'use strict';
  var A = window.OdaiApp, T = A.topbar, esc = A.esc;
  var st = { slot: null };

  A.registerGame({
    id: 'mygame',                       // ゲームID（data/ のフォルダ名と同じ）
    name: 'マイゲーム',                  // 表示名
    mark: 'マ',                          // ゲーム選択画面のアイコン文字
    sub: 'ゲームの一言説明',
    color: { dark: ['#7a5af5', '#a08bff'], light: ['#5b3bd6', '#7a5af5'] },  // テーマ色（ダーク／ライト）
    players: { min: 2, max: 10, def: 4 },   // プレイヤー設定カードを使う場合

    /* お題セット：data/mygame/odai.csv。fields の1つ目が本文（お題リストに大きく表示） */
    sets: [
      { id: 'odai', label: 'お題', rev: 1, fields: [{ key: 'text', label: 'お題' }] }
    ],

    /* ゲーム固有の設定（設定画面に自動で並びます）
       type: 'bool' | 'time'（分・秒）| 'seg'（options:[[値,'表示'],...]）| 'number'（min,max） */
    defaults: { timerOn: false, timerSec: 60 },
    settings: [
      { key: 'timerOn', type: 'bool', label: 'タイマーを表示する' },
      { key: 'timerSec', type: 'time', label: 'タイマーの時間', def: 60, showIf: 'timerOn' }
    ],

    /* ロゴ：tools/make_logos.py に追加すると ctx.logo('mygame') で書体付きロゴが使えます */
    logoHtml: function (ctx) { return ctx.logo('mygame', 'gl-svg', 'マイゲーム') || '<span class="gl-acc">マイゲーム</span>'; },
    /* 見た目：css/themes.css に body[data-game="mygame"] の色・背景を追加すると、このゲームだけのデザインになります */

    /* タイトル画面のボタン（「ルール説明」は自動で付きます） */
    /* タイトルの遊び方ボタン（① お題だけ表示 ② クイックスタート ③ フルゲーム）
       クイック／フルは ctx.startMatch(mode, { targetDef, again }) で試合を開始し、
       ctx.turn() で順番（全員が1回ずつ担当したら最初から）、ctx.nextTurn() で次の人へ。
       フルゲームは ctx.roundResult({ pts:[...], head:'説明', onNext:fn }) を呼ぶと
       ポイント結果画面 → 目標に届いたら勝利画面 を自動で表示します。
       設定画面に「〇点先取」を出すには ctx.targetCard(box, { def: 5 }) */
    title: function (ctx, box) {
      ctx.modeButtons(box, {
        topic: { fn: function () {
          var e = ctx.drawEntry('odai', []);          // 設定（使用済み除外など）どおりに1件引く
          if (!e) { ctx.toast('お題がありません', 1600); return; }
          st.slot.start(e);                           // 表示中のお題だけが「使用済み」になる
          ctx.show('play', { resetStack: true });
        } }
        // quick: { fn: ... }, full: { fn: ... }
      });
    },

    rules: function (ctx) {
      return '<div class="rule-sec"><h3><span class="badge">1</span>どんなゲーム？</h3><p>ここにルールを書きます。</p>' +
        '<div class="rule-fig">' + ctx.figFlow(['お題', '回答', '判定']) + '</div></div>';
    },

    /* 画面：screen-<ゲームID>-<名前> として自動で追加されます。ctx.show('play') で移動 */
    screens: {
      play: {
        html: T({ back: 'title' }) +
          '<div class="stage"><div class="odai-card"><span class="odai-kicker">お題</span><div class="odai-text"></div></div>' +
          '<div class="mg-chg"></div>' +            /* ［一つ戻す］［チェンジ］［一つ進む］ */
          '<div class="mg-timer"></div></div>' +
          '<div class="bottom-bar"><button class="btn-big mg-next">次のお題</button></div>',
        enter: function (ctx) {
          render(ctx);
          var box = ctx.screen('play').querySelector('.mg-timer');
          box.innerHTML = '';
          if (ctx.settings().timerOn) ctx.timer(box, ctx.settings().timerSec);
        }
      }
    },

    /* 画面のボタンなどのイベントはここで登録 */
    init: function (ctx) {
      var sc = ctx.screen('play');
      /* お題スロット：チェンジ／一つ戻す／一つ進む を自動で管理 */
      st.slot = ctx.topicSlot({
        draw: function (avoid) { return ctx.drawEntry('odai', avoid); },
        onShow: function () { render(ctx); }
      });
      ctx.changeBar(sc.querySelector('.mg-chg'), st.slot);
      sc.querySelector('.mg-next').addEventListener('click', function () {
        var c = st.slot.current();
        var e = ctx.drawEntry('odai', c ? ['odai|' + c.topic.uid] : []);
        if (e) st.slot.start(e);
      });
    }
  });

  function render(ctx) {
    var e = st.slot && st.slot.current();
    if (e) ctx.screen('play').querySelector('.odai-text').textContent = e.topic.text;
  }
})();
