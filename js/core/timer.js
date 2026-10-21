/* =========================================================
   timer.js  -  共通カウントダウンタイマー
   - 0秒になったらアラーム音（Web Audio）＋バイブ＋「TIME UP!」表示
   - 経過時間は Date.now() 基準なので、画面が裏に回ってもずれない
   - 動作中は画面スリープを抑止（対応端末のみ）
   使い方:
     var t = OdaiTimer.create(container, 180);   // 3分
     t.start(); t.pause(); t.reset(); t.destroy();
   ========================================================= */
(function (global) {
  'use strict';

  var actx = null;
  function audio() {
    try {
      if (!actx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }

  /* 1音を鳴らす。type: 'square' など / 'bell'（倍音つき減衰）/ 'marimba'（柔らかい減衰） */
  function tone(freq, start, dur, vol, type) {
    var a = audio();
    if (!a) return;
    var t0 = a.currentTime + start;
    var parts = type === 'bell' ? [[1, 1], [2.76, 0.32], [5.4, 0.12], [8.9, 0.05]]
      : type === 'marimba' ? [[1, 1], [4, 0.18], [10, 0.04]]
      : [[1, 1]];
    parts.forEach(function (p) {
      var o = a.createOscillator();
      var g = a.createGain();
      o.type = (type === 'bell' || type === 'marimba') ? 'sine' : (type || 'square');
      o.frequency.value = freq * p[0];
      var v = (vol || 0.25) * p[1];
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (type === 'bell' ? 1 / Math.sqrt(p[0]) : 1));
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
  }
  function beep(freq, start, dur, vol) { tone(freq, start, dur, vol, 'square'); }

  /* アラーム音（設定で選択）。1回分の長さ(秒)と、鳴らす関数 */
  var N = { C5: 523.25, D5: 587.33, E5: 659.25, G4: 392.0, G5: 783.99, A5: 880.0, C6: 1046.5, E6: 1318.5, B4: 493.88 };
  var SOUNDS = {
    chime: { label: 'チャイム', len: 2.6, play: function () {     // 学校のチャイム風（キンコンカンコン）
      [[N.E5, 0], [N.C5, 0.5], [N.D5, 1.0], [N.G4, 1.5]].forEach(function (n) { tone(n[0], n[1], 1.6, 0.32, 'bell'); });
    } },
    marimba: { label: 'マリンバ', len: 1.6, play: function () {   // ころころ上がるアルペジオ
      [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6].forEach(function (f, i) { tone(f, i * 0.13, 0.5, 0.35, 'marimba'); });
    } },
    bell: { label: 'ベル', len: 1.4, play: function () {          // 呼び鈴（チリリン）
      for (var i = 0; i < 6; i++) tone(i % 2 ? N.A5 : N.E6, i * 0.09, 0.9, 0.22, 'bell');
    } },
    digital: { label: '電子音', len: 1.3, play: function () {     // キッチンタイマー風（ピピピピッ）
      for (var i = 0; i < 4; i++) beep(N.C6 * 2, i * 0.16, 0.09, 0.18);
      beep(N.C6 * 2, 0.75, 0.25, 0.18);
    } }
  };
  var soundName = 'chime';
  try { var sv = JSON.parse(global.localStorage.getItem('odai.settings.v1') || '{}').alarm; if (sv && SOUNDS[sv]) soundName = sv; } catch (e) {}

  var alarmTimer = null;
  function playAlarm(name, times) {
    stopAlarm();
    var snd = SOUNDS[name || soundName] || SOUNDS.chime;
    var rounds = 0, max = times || 3;
    function once() {
      snd.play();
      rounds++;
      if (rounds < max) alarmTimer = setTimeout(once, snd.len * 1000 + 250);
    }
    once();
    if (!name) { try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 800]); } catch (e) {} }
  }
  function stopAlarm() {
    clearTimeout(alarmTimer); alarmTimer = null;
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
  }
  function tick() { beep(880, 0, 0.07, 0.12); }

  var wakeLock = null;
  function holdWake(on) {
    try {
      if (on && navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
      } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var active = [];

  function create(container, totalSec, opts) {
    opts = opts || {};
    totalSec = Math.max(1, totalSec | 0);
    var el = document.createElement('div');
    el.className = 'timer';
    el.innerHTML =
      '<div class="tm-face">' +
        '<svg class="tm-ring" viewBox="0 0 120 120" aria-hidden="true">' +
          '<circle class="tm-track" cx="60" cy="60" r="52"/>' +
          '<circle class="tm-prog" cx="60" cy="60" r="52"/>' +
        '</svg>' +
        '<span class="tm-time">' + fmt(totalSec) + '</span>' +
      '</div>' +
      '<div class="tm-btns">' +
        '<button type="button" class="tm-btn tm-reset" aria-label="リセット">↺</button>' +
        '<button type="button" class="tm-btn main tm-play">▶ スタート</button>' +
      '</div>';
    container.appendChild(el);

    var timeEl = el.querySelector('.tm-time');
    var prog = el.querySelector('.tm-prog');
    var playBtn = el.querySelector('.tm-play');
    var C = 2 * Math.PI * 52;
    prog.style.strokeDasharray = C;

    var st = { total: totalSec, left: totalSec, running: false, endAt: 0, iv: null, lastTick: -1, done: false };

    function draw() {
      timeEl.textContent = fmt(st.left);
      prog.style.strokeDashoffset = C * (1 - st.left / st.total);
      el.classList.toggle('warn', st.left <= 10 && st.left > 0);
      el.classList.toggle('over', st.done);
      el.classList.toggle('running', st.running);
      playBtn.textContent = st.running ? '❚❚ 一時停止' : (st.done ? '▶ もう一度' : (st.left < st.total ? '▶ 再開' : '▶ スタート'));
    }
    function loop() {
      st.left = Math.max(0, (st.endAt - Date.now()) / 1000);
      var whole = Math.ceil(st.left);
      if (whole <= 3 && whole > 0 && whole !== st.lastTick) { st.lastTick = whole; tick(); }
      if (st.left <= 0) {
        st.left = 0; st.running = false; st.done = true;
        clearInterval(st.iv); st.iv = null;
        holdWake(false);
        draw();
        playAlarm();
        var tu = document.getElementById('timeup');
        if (tu) tu.hidden = false;
        if (opts.onEnd) opts.onEnd();
        return;
      }
      draw();
    }
    function start() {
      audio();                     // ユーザー操作の中で音声を有効化しておく
      if (st.done) { st.left = st.total; st.done = false; }
      st.endAt = Date.now() + st.left * 1000;
      st.running = true; st.lastTick = -1;
      clearInterval(st.iv);
      st.iv = setInterval(loop, 200);
      holdWake(true);
      draw();
    }
    function pause() {
      if (!st.running) return;
      st.left = Math.max(0, (st.endAt - Date.now()) / 1000);
      st.running = false;
      clearInterval(st.iv); st.iv = null;
      holdWake(false);
      draw();
    }
    function reset(sec) {
      pause();
      if (sec) st.total = Math.max(1, sec | 0);
      st.left = st.total; st.done = false;
      stopAlarm();
      draw();
    }
    function destroy() {
      pause();
      var i = active.indexOf(api);
      if (i > -1) active.splice(i, 1);
      if (el.parentNode) el.parentNode.removeChild(el);
    }

    playBtn.addEventListener('click', function () { if (st.running) pause(); else start(); });
    el.querySelector('.tm-reset').addEventListener('click', function () { reset(); });

    var api = { el: el, start: start, pause: pause, reset: reset, destroy: destroy, state: st };
    active.push(api);
    draw();
    if (opts.autoStart) start();
    return api;
  }

  global.OdaiTimer = {
    create: create,
    fmt: fmt,
    stopAlarm: stopAlarm,
    pauseAll: function () { active.slice().forEach(function (t) { t.pause(); }); },
    destroyAll: function () { active.slice().forEach(function (t) { t.destroy(); }); },
    unlockAudio: audio,
    sounds: SOUNDS,
    sound: function () { return soundName; },
    setSound: function (n) { if (SOUNDS[n]) soundName = n; },
    preview: function (n) { audio(); playAlarm(n, 1); }
  };
})(window);
