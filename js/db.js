/* ==========================================================================
   db.js — 本地存储封装
   IndexedDB 优先，不可用时降级 localStorage。
   全局对象：window.DB
   ========================================================================== */
window.DB = (function () {
  'use strict';

  var DB_NAME = 'qingzhangben';
  var DB_VERSION = 1;
  var STORES = ['transactions', 'accounts', 'categories', 'settings'];
  var LS_PREFIX = 'qzb_';

  /* ---------- IndexedDB ---------- */
  var _db = null;
  var _dbError = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_dbError) return Promise.reject(_dbError);
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { _dbError = req.error; reject(req.error); };
      req.onblocked = function () { reject(new Error('blocked')); };
    });
  }

  function store(db, name, mode) { return db.transaction(name, mode).objectStore(name); }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  var IDB = {
    getAll: function (name) { return open().then(function (db) { return reqToPromise(store(db, name, 'readonly').getAll()); }); },
    get: function (name, id) { return open().then(function (db) { return reqToPromise(store(db, name, 'readonly').get(id)); }); },
    put: function (name, item) { return open().then(function (db) { return reqToPromise(store(db, name, 'readwrite').put(item)); }); },
    bulkPut: function (name, items) {
      return open().then(function (db) {
        var t = db.transaction(name, 'readwrite');
        var os = t.objectStore(name);
        items.forEach(function (it) { os.put(it); });
        return new Promise(function (resolve, reject) {
          t.oncomplete = function () { resolve(); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      });
    },
    del: function (name, id) { return open().then(function (db) { return reqToPromise(store(db, name, 'readwrite').delete(id)); }); },
    clear: function (name) { return open().then(function (db) { return reqToPromise(store(db, name, 'readwrite').clear()); }); }
  };

  /* ---------- localStorage 降级 ---------- */
  function lsGet(name) {
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + name) || '[]'); }
    catch (e) { return []; }
  }
  function lsSet(name, arr) {
    try { localStorage.setItem(LS_PREFIX + name, JSON.stringify(arr)); } catch (e) { /* 忽略配额错误 */ }
  }
  var LS = {
    getAll: function (name) { return Promise.resolve(lsGet(name)); },
    get: function (name, id) { return Promise.resolve(lsGet(name).filter(function (x) { return x.id === id; })[0] || null); },
    put: function (name, item) {
      var arr = lsGet(name);
      var i = -1;
      arr.forEach(function (x, idx) { if (x.id === item.id) i = idx; });
      if (i >= 0) arr[i] = item; else arr.push(item);
      lsSet(name, arr);
      return Promise.resolve();
    },
    bulkPut: function (name, items) {
      var arr = lsGet(name);
      items.forEach(function (item) {
        var i = -1;
        arr.forEach(function (x, idx) { if (x.id === item.id) i = idx; });
        if (i >= 0) arr[i] = item; else arr.push(item);
      });
      lsSet(name, arr);
      return Promise.resolve();
    },
    del: function (name, id) { lsSet(name, lsGet(name).filter(function (x) { return x.id !== id; })); return Promise.resolve(); },
    clear: function (name) { lsSet(name, []); return Promise.resolve(); }
  };

  /* ---------- 选择实现 ---------- */
  var impl = null;
  function getImpl() {
    if (impl) return Promise.resolve(impl);
    return open().then(function () { impl = IDB; return impl; })
      .catch(function () { impl = LS; return impl; });
  }

  return {
    getAll: function (name) { return getImpl().then(function (m) { return m.getAll(name); }); },
    get: function (name, id) { return getImpl().then(function (m) { return m.get(name, id); }); },
    put: function (name, item) { return getImpl().then(function (m) { return m.put(name, item); }); },
    bulkPut: function (name, items) { return getImpl().then(function (m) { return m.bulkPut(name, items); }); },
    del: function (name, id) { return getImpl().then(function (m) { return m.del(name, id); }); },
    clear: function (name) { return getImpl().then(function (m) { return m.clear(name); }); },
    STORES: STORES
  };
})();
