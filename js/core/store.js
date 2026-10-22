/* =========================================================
   store.js  -  お題ボックス 共通データ層
   - ゲームごと・お題セットごとの CSV 読み込み（data/<ゲームID>/<セットID>.csv）
   - 読めないとき（file:// や一部の APK 環境）は js/embedded-data.js へ自動フォールバック
   - localStorage による永続化（お題の状態 / 設定 / プレイヤー / 履歴）
   ========================================================= */
(function (global) {
  'use strict';

  /* アプリを更新したら sw.js の APP_VERSION と一緒に上げること */
  var APP_VERSION = '1.3.0';

  /* Androidアプリ（APK）の配布設定（LINQ と同じ仕組み）
     mode : 'auto' … download/apk-info.json があるときだけ導線を出す（推奨）
            'on'   … 常に出す / 'off' … 出さない */
  var APK = {
    dir: './download/',
    info: './download/apk-info.json',   // ビルドの GitHub Actions が更新します
    path: './download/odai-box.apk',
    mode: 'auto'
  };

  var LS = {
    settings: 'odai.settings.v1',
    players: 'odai.players.v1',
    meta: 'odai.meta.v1',
    topics: function (gid, sid) { return 'odai.topics.' + gid + '.' + sid + '.v1'; },
    history: function (gid) { return 'odai.history.' + gid + '.v1'; }
  };

  var MAX_PLAYERS = 20;

  /* ------------------------- CSV ------------------------- */
  function parseCSV(text) {
    var rows = [], row = [], field = '', inQuote = false, i, c, n;
    text = String(text).replace(/^﻿/, ''); // BOM除去
    for (i = 0; i < text.length; i++) {
      c = text[i]; n = text[i + 1];
      if (inQuote) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') { inQuote = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuote = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else { field += c; }
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
  }

  /* CSV行 → お題オブジェクト配列
     A列 = No.、B列以降 = セット定義の fields の順（1つ目が本文 text） */
  function rowsToTopics(rows, fields) {
    var out = [], start = 0;
    if (rows.length && (/no/i.test(String(rows[0][0] || '')) || isNaN(parseInt(rows[0][0], 10)))) start = 1;
    for (var i = start; i < rows.length; i++) {
      var r = rows[i];
      var text = String(r[1] == null ? '' : r[1]).trim();
      if (!text) continue;
      var no = parseInt(r[0], 10);
      if (isNaN(no)) no = i;
      var x = {};
      for (var f = 1; f < fields.length; f++) x[fields[f].key] = String(r[f + 1] == null ? '' : r[f + 1]).trim();
      out.push({ uid: 'm' + no, no: no, text: text, x: x, master: true, fav: false, ex: false, used: false });
    }
    return out;
  }

  /* ------------------------- localStorage ------------------------- */
  function lsGet(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var COMMON_GAME_DEFAULTS = {
    excludeUsed: true,      // 使用したお題を除外する
    favoriteOnly: false,    // お気に入りからランダムに選ぶ
    useExclusion: false     // お題の除外を有効化
  };

  /* ------------------------- ストア ------------------------- */
  var Store = {
    version: APP_VERSION,
    apk: APK,
    games: {},              // gid -> ゲーム定義（app.js の registerGame で登録）
    sets: {},               // 'gid/sid' -> お題配列
    source: {},             // 'gid/sid' -> 'csv' | 'embedded(...)'
    history: {},            // gid -> 履歴配列
    settings: { theme: 'dark', lastGame: null, games: {} },
    players: { names: [] },
    resetSets: [],          // データ差し替えでリセットされたセット
    repaired: 0,

    /* ---------- 初期化 ---------- */
    init: function (gameList) {
      var self = this;
      gameList.forEach(function (g) { self.games[g.id] = g; });

      var saved = lsGet(LS.settings, null) || {};
      self.settings = {
        theme: saved.theme === 'light' ? 'light' : 'dark',
        lastGame: saved.lastGame || null,
        alarm: saved.alarm || 'chime',
        games: saved.games || {}
      };
      gameList.forEach(function (g) {
        self.settings.games[g.id] = Object.assign({}, COMMON_GAME_DEFAULTS, g.defaults || {}, self.settings.games[g.id] || {});
      });

      var sp = lsGet(LS.players, null) || {};
      self.players = { names: Array.isArray(sp.names) ? sp.names.slice(0, MAX_PLAYERS) : [] };
      while (self.players.names.length < MAX_PLAYERS) self.players.names.push('');

      var meta = lsGet(LS.meta, null) || {};
      var revs = meta.revs || {};

      var jobs = [];
      gameList.forEach(function (g) {
        self.history[g.id] = lsGet(LS.history(g.id), []) || [];
        (g.sets || []).forEach(function (set) {
          var key = g.id + '/' + set.id;
          var savedTopics = lsGet(LS.topics(g.id, set.id), null);
          var rev = set.rev || 1;
          if (revs[key] != null && revs[key] !== rev) {
            // お題データが差し替わった → 保存状態と、このセットの履歴をリセット
            savedTopics = null;
            self.history[g.id] = self.history[g.id].filter(function (h) { return h.set !== set.id; });
            lsSet(LS.history(g.id), self.history[g.id]);
            self.resetSets.push(g.name + '「' + set.label + '」');
          }
          revs[key] = rev;
          jobs.push(self._loadMaster(g, set).then(function (master) {
            self.sets[key] = self._merge(master, savedTopics);
          }));
        });
      });
      lsSet(LS.meta, { revs: revs });

      return Promise.all(jobs).then(function () {
        gameList.forEach(function (g) { self.repaired += self.syncUsedFromHistory(g.id); });
        gameList.forEach(function (g) { (g.sets || []).forEach(function (s) { self.saveTopics(g.id, s.id); }); });
        return self;
      });
    },

    _loadMaster: function (g, set) {
      var self = this;
      var key = g.id + '/' + set.id;
      var url = './data/' + g.id + '/' + set.id + '.csv';
      return new Promise(function (resolve) {
        var done = false;
        var fallback = function (reason) {
          if (done) return; done = true;
          self.source[key] = 'embedded(' + reason + ')';
          var csv = (global.ODAI_EMBEDDED && global.ODAI_EMBEDDED[key]) || '';
          resolve(rowsToTopics(parseCSV(csv), set.fields));
        };
        if (global.location && global.location.protocol === 'file:') { fallback('file-protocol'); return; }
        var timer = setTimeout(function () { fallback('timeout'); }, 4000);
        try {
          fetch(url, { cache: 'no-cache' })
            .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
            .then(function (txt) {
              if (done) return;
              clearTimeout(timer);
              var list = rowsToTopics(parseCSV(txt), set.fields);
              if (!list.length) throw new Error('empty csv');
              done = true;
              self.source[key] = 'csv';
              resolve(list);
            })
            .catch(function () { clearTimeout(timer); fallback('fetch-error'); });
        } catch (e) { clearTimeout(timer); fallback('exception'); }
      });
    },

    _merge: function (master, saved) {
      if (!saved || !saved.length) return master.slice();
      var byUid = {};
      saved.forEach(function (t) { if (t && t.uid) byUid[t.uid] = t; });
      var merged = [];
      master.forEach(function (m) {
        var s = byUid[m.uid];
        if (s) {
          merged.push({
            uid: m.uid, no: (typeof s.no === 'number') ? s.no : m.no,
            text: m.text, x: m.x, master: true,
            fav: !!s.fav, ex: !!s.ex, used: !!s.used
          });
          delete byUid[m.uid];
        } else merged.push(m);
      });
      saved.forEach(function (s) {
        if (s && s.uid && byUid[s.uid] && !s.master) {
          merged.push({
            uid: s.uid, no: s.no, text: s.text, x: s.x || {}, master: false,
            fav: !!s.fav, ex: !!s.ex, used: !!s.used
          });
        }
      });
      merged.sort(function (a, b) { return a.no - b.no; });
      return merged;
    },

    /* ---------- 保存 ---------- */
    saveTopics: function (gid, sid) { return lsSet(LS.topics(gid, sid), this.sets[gid + '/' + sid] || []); },
    saveSettings: function () { return lsSet(LS.settings, this.settings); },
    savePlayers: function () { return lsSet(LS.players, this.players); },
    saveHistory: function (gid) { return lsSet(LS.history(gid), this.history[gid] || []); },
    flush: function () {
      var self = this;
      Object.keys(self.games).forEach(function (gid) {
        self.saveHistory(gid);
        (self.games[gid].sets || []).forEach(function (s) { self.saveTopics(gid, s.id); });
      });
      self.saveSettings(); self.savePlayers();
    },

    /* ---------- 設定 ---------- */
    gs: function (gid) { return this.settings.games[gid] || (this.settings.games[gid] = Object.assign({}, COMMON_GAME_DEFAULTS)); },
    setGs: function (gid, key, val) { this.gs(gid)[key] = val; this.saveSettings(); },

    /* ---------- お題操作 ---------- */
    list: function (gid, sid) { return this.sets[gid + '/' + sid] || []; },
    setDef: function (gid, sid) {
      var g = this.games[gid];
      if (!g) return null;
      for (var i = 0; i < g.sets.length; i++) if (g.sets[i].id === sid) return g.sets[i];
      return null;
    },
    byUid: function (gid, sid, uid) {
      var l = this.list(gid, sid);
      for (var i = 0; i < l.length; i++) if (l[i].uid === uid) return l[i];
      return null;
    },
    addTopic: function (gid, sid, text, x) {
      var l = this.list(gid, sid), max = 0;
      l.forEach(function (t) { if (t.no > max) max = t.no; });
      var t = {
        uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        no: max + 1, text: String(text).trim(), x: x || {},
        master: false, fav: false, ex: false, used: false
      };
      l.push(t);
      this.saveTopics(gid, sid);
      return t;
    },
    updateTopic: function (gid, sid, uid, text, x) {
      var t = this.byUid(gid, sid, uid);
      if (!t || t.master) return false;
      t.text = String(text).trim();
      t.x = x || {};
      this.saveTopics(gid, sid);
      return true;
    },
    deleteTopics: function (gid, sid, uids) {
      var key = gid + '/' + sid, set = {};
      uids.forEach(function (u) { set[u] = true; });
      var l = this.sets[key].filter(function (t) { return !(set[t.uid] && !t.master); });
      l.sort(function (a, b) { return a.no - b.no; });
      l.forEach(function (t, i) { t.no = i + 1; });
      this.sets[key] = l;
      this.saveTopics(gid, sid);
    },
    toggleFav: function (gid, sid, uid) { var t = this.byUid(gid, sid, uid); if (!t) return; t.fav = !t.fav; this.saveTopics(gid, sid); },
    toggleEx: function (gid, sid, uid) { var t = this.byUid(gid, sid, uid); if (!t) return; t.ex = !t.ex; this.saveTopics(gid, sid); },

    /* 抽出対象（設定の「使用済み除外 / お気に入りのみ / 除外を有効化」を反映） */
    pool: function (gid, sid) {
      var s = this.gs(gid);
      return this.list(gid, sid).filter(function (t) {
        if (s.useExclusion && t.ex) return false;
        if (s.excludeUsed && t.used) return false;
        if (s.favoriteOnly && !t.fav) return false;
        return true;
      });
    },

    /* お題を k 件ランダム抽出（重複なし）。avoid の uid は避ける。
       抽出対象が足りないときは条件をゆるめて補充する（relaxed:true） */
    draw: function (gid, sid, k, avoid) {
      k = k || 1;
      avoid = avoid || [];
      var notAvoided = function (t) { return avoid.indexOf(t.uid) < 0; };
      var pool = shuffle(this.pool(gid, sid).filter(notAvoided));
      var relaxed = false;
      if (pool.length < k) {
        relaxed = true;
        var have = {};
        pool.forEach(function (t) { have[t.uid] = true; });
        var s = this.gs(gid);
        // まず「除外」「お気に入りのみ」は守ったまま、使用済みを解禁
        var extra = shuffle(this.list(gid, sid).filter(function (t) {
          if (have[t.uid] || !notAvoided(t)) return false;
          if (s.useExclusion && t.ex) return false;
          if (s.favoriteOnly && !t.fav) return false;
          return true;
        }));
        pool = pool.concat(extra);
        if (pool.length < k) {
          pool.forEach(function (t) { have[t.uid] = true; });
          pool = pool.concat(shuffle(this.list(gid, sid).filter(function (t) { return !have[t.uid] && notAvoided(t); })));
        }
      }
      return { items: pool.slice(0, k), relaxed: relaxed };
    },
    drawOne: function (gid, sid, avoid) {
      var r = this.draw(gid, sid, 1, avoid);
      return r.items.length ? { topic: r.items[0], relaxed: r.relaxed } : null;
    },

    markUsed: function (gid, sid, uid) {
      var t = this.byUid(gid, sid, uid);
      if (!t) return false;
      var h = this.history[gid] || (this.history[gid] = []);
      h.push({ set: sid, uid: t.uid, no: t.no, text: t.text, ts: Date.now() });
      if (h.length > 800) this.history[gid] = h.slice(-800);
      if (!this.saveHistory(gid)) { this.history[gid].pop(); return false; }
      t.used = true;
      this.saveTopics(gid, sid);
      return true;
    },
    /* 直前に使用済みにしたお題を取り消す（引き直したとき用） */
    unmarkLast: function (gid, sid, uid) {
      var h = this.history[gid] || [];
      for (var i = h.length - 1; i >= 0; i--) {
        if (h[i].set === sid && h[i].uid === uid) { h.splice(i, 1); break; }
      }
      this.saveHistory(gid);
      this.syncUsedFromHistory(gid);
    },
    syncUsedFromHistory: function (gid) {
      var self = this, g = this.games[gid], changed = 0;
      var inHistory = {};
      (this.history[gid] || []).forEach(function (h) { if (h && h.uid) inHistory[h.set + '|' + h.uid] = true; });
      (g.sets || []).forEach(function (s) {
        var c = 0;
        self.list(gid, s.id).forEach(function (t) {
          var should = !!inHistory[s.id + '|' + t.uid];
          if (t.used !== should) { t.used = should; c++; }
        });
        if (c) self.saveTopics(gid, s.id);
        changed += c;
      });
      return changed;
    },
    deleteHistory: function (gid, ids) {
      var set = {};
      ids.forEach(function (i) { set[i] = true; });
      var removed = [];
      this.history[gid] = (this.history[gid] || []).filter(function (h, i) {
        if (set[String(h.ts) + '_' + i]) { removed.push(h); return false; }
        return true;
      });
      this.saveHistory(gid);
      this.syncUsedFromHistory(gid);
      return removed;
    },
    clearHistory: function (gid) {
      var removed = (this.history[gid] || []).slice();
      this.history[gid] = [];
      this.saveHistory(gid);
      this.syncUsedFromHistory(gid);
      return removed;
    },
    restoreHistory: function (gid, entries) {
      if (!entries || !entries.length) return;
      var h = this.history[gid] || (this.history[gid] = []);
      entries.forEach(function (e) { h.push(e); });
      h.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      this.saveHistory(gid);
      this.syncUsedFromHistory(gid);
    },

    /* ---------- プレイヤー（全ゲーム共通の名前リスト） ---------- */
    maxPlayers: MAX_PLAYERS,
    playerNames: function (n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var nm = (this.players.names[i] || '').trim();
        out.push(nm || ('プレイヤー' + (i + 1)));
      }
      return out;
    },
    setPlayerName: function (i, name) { this.players.names[i] = name; this.savePlayers(); },
    movePlayer: function (from, to) {
      var a = this.players.names;
      var v = a.splice(from, 1)[0];
      a.splice(to, 0, v);
      this.savePlayers();
    },

    parseCSV: parseCSV
  };

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  Store.shuffle = shuffle;

  global.OdaiStore = Store;
})(window);
