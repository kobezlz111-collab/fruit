/* ==========================================================================
   store.js — 业务数据层
   账单/账户/分类 CRUD、余额计算、统计聚合、导入导出。
   全局对象：window.Store
   ========================================================================== */
window.Store = (function () {
  'use strict';

  var SETTINGS_ID = 'main';
  var UNC = { id: null, name: '未分类', icon: '📦' };

  // 内存缓存
  var transactions = [];
  var accounts = [];
  var categories = [];
  var settings = null;
  var initialized = false;

  /* ================= 日期工具 ================= */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return fmtDate(new Date()); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseDate(str) {
    var p = str.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(dateStr, n) {
    var d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }
  function addMonths(dateStr, n) {
    var p = dateStr.split('-');
    var y = +p[0], m = +p[1] - 1;
    var d = new Date(y, m + n, 1);
    return fmtDate(d);
  }
  function monthStart(dateStr) {
    var p = dateStr.split('-');
    return p[0] + '-' + p[1] + '-01';
  }
  function monthEnd(dateStr) {
    var p = dateStr.split('-');
    var y = +p[0], m = +p[1];
    var lastDay = new Date(y, m, 0).getDate();
    return p[0] + '-' + p[1] + '-' + pad(lastDay);
  }
  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  // 根据当前月份计算某月范围；offset 0=本月, -1=上月
  function monthRange(offset) {
    var d = new Date();
    var y = d.getFullYear(), m = d.getMonth() + 1 + offset;
    var nd = new Date(y, m - 1, 1);
    var start = fmtDate(nd);
    var end = fmtDate(new Date(nd.getFullYear(), nd.getMonth() + 1, 0));
    return { start: start, end: end };
  }

  /* ================= 初始化 ================= */
  async function init() {
    if (initialized) return;
    transactions = await DB.getAll('transactions');
    accounts = await DB.getAll('accounts');
    categories = await DB.getAll('categories');
    var s = await DB.getAll('settings');
    settings = (s && s[0]) || null;

    if (accounts.length === 0) {
      accounts = Defaults.buildAccounts();
      await DB.bulkPut('accounts', accounts);
    }
    if (categories.length === 0) {
      categories = Defaults.buildCategories();
      await DB.bulkPut('categories', categories);
    }
    if (!settings) {
      settings = {
        id: SETTINGS_ID,
        theme: 'light',
        currency: '¥',
        weekStart: 'monday',
        defaultAccountId: accounts.length ? accounts[0].id : ''
      };
      await DB.put('settings', settings);
    }
    initialized = true;
  }

  /* ================= 账单 ================= */
  function sortedTx() {
    return transactions.slice().sort(function (a, b) {
      var d = a.date === b.date ? 0 : (a.date < b.date ? 1 : -1);
      if (d !== 0) return d;
      return (a.time || '') < (b.time || '') ? 1 : -1;
    });
  }
  function getTransactions() { return sortedTx(); }

  async function addTransaction(tx) {
    tx.id = tx.id || Defaults.id('tx');
    tx.createdAt = Date.now();
    tx.updatedAt = Date.now();
    transactions.push(tx);
    await DB.put('transactions', tx);
    bumpCategoryUse(tx.categoryId);
    return tx;
  }

  async function updateTransaction(id, patch) {
    var tx = transactions.find(function (t) { return t.id === id; });
    if (!tx) return;
    var oldCat = tx.categoryId;
    for (var k in patch) if (patch.hasOwnProperty(k)) tx[k] = patch[k];
    tx.updatedAt = Date.now();
    await DB.put('transactions', tx);
    if (oldCat !== tx.categoryId) bumpCategoryUse(tx.categoryId);
  }

  async function deleteTransaction(id) {
    transactions = transactions.filter(function (t) { return t.id !== id; });
    await DB.del('transactions', id);
  }

  function bumpCategoryUse(catId) {
    if (!catId) return;
    var cat = categories.find(function (c) { return c.id === catId; });
    if (cat) {
      cat.useCount = (cat.useCount || 0) + 1;
      DB.put('categories', cat);
    }
  }

  /* ================= 账户 ================= */
  function sortedAccounts() {
    return accounts.slice().sort(function (a, b) { return a.sort - b.sort; });
  }
  function getAccounts() { return sortedAccounts(); }

  function getBalance(accountId) {
    var acc = accounts.find(function (a) { return a.id === accountId; });
    if (!acc) return 0;
    var bal = acc.initialBalance || 0;
    transactions.forEach(function (t) {
      if (t.type === 'income' && t.accountId === accountId) bal += t.amount;
      else if (t.type === 'expense' && t.accountId === accountId) bal -= t.amount;
      else if (t.type === 'transfer') {
        if (t.accountId === accountId) bal -= t.amount;
        if (t.toAccountId === accountId) bal += t.amount;
      }
    });
    return bal;
  }

  async function addAccount(acc) {
    acc.id = acc.id || Defaults.id('acc');
    if (acc.sort === undefined) acc.sort = accounts.length;
    accounts.push(acc);
    await DB.put('accounts', acc);
    return acc;
  }
  async function updateAccount(id, patch) {
    var acc = accounts.find(function (a) { return a.id === id; });
    if (!acc) return;
    for (var k in patch) if (patch.hasOwnProperty(k)) acc[k] = patch[k];
    await DB.put('accounts', acc);
  }
  async function deleteAccount(id) {
    accounts = accounts.filter(function (a) { return a.id !== id; });
    await DB.del('accounts', id);
  }
  function getAccount(id) {
    return accounts.find(function (a) { return a.id === id; }) || null;
  }

  /* ================= 分类 ================= */
  function getCategories(type) {
    var list = categories.filter(function (c) { return c.type === type; });
    return list.slice().sort(function (a, b) {
      if ((a.parentId || '') === (b.parentId || '')) return a.sort - b.sort;
      return (a.parentId || '') < (b.parentId || '') ? -1 : 1;
    });
  }
  // 一级分类（parentId 为 null）
  function getTopCategories(type) {
    return categories.filter(function (c) { return c.type === type && !c.parentId && !c.isHidden; })
      .slice().sort(function (a, b) { return a.sort - b.sort; });
  }
  // 某一级分类下的二级分类
  function getSubCategories(parentId) {
    return categories.filter(function (c) { return c.parentId === parentId && !c.isHidden; })
      .slice().sort(function (a, b) { return a.sort - b.sort; });
  }
  function getCategory(id) {
    if (!id) return UNC;
    return categories.find(function (c) { return c.id === id; }) || UNC;
  }

  async function addCategory(cat) {
    cat.id = cat.id || Defaults.id('cat');
    if (cat.useCount === undefined) cat.useCount = 0;
    categories.push(cat);
    await DB.put('categories', cat);
    return cat;
  }
  async function updateCategory(id, patch) {
    var cat = categories.find(function (c) { return c.id === id; });
    if (!cat) return;
    for (var k in patch) if (patch.hasOwnProperty(k)) cat[k] = patch[k];
    await DB.put('categories', cat);
  }
  // 删除分类：其下账单归入「未分类」
  async function deleteCategory(id) {
    categories = categories.filter(function (c) { return c.id !== id; });
    await DB.del('categories', id);
    var changed = transactions.filter(function (t) { return t.categoryId === id; });
    changed.forEach(function (t) { t.categoryId = null; DB.put('transactions', t); });
  }

  /* ================= 统计 ================= */
  function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }

  // 概览：收入/支出/结余 + 环比
  function getOverview(start, end) {
    var income = 0, expense = 0;
    transactions.forEach(function (t) {
      if (inRange(t.date, start, end)) {
        if (t.type === 'income') income += t.amount;
        else if (t.type === 'expense') expense += t.amount;
      }
    });
    var len = daysBetween(start, end) + 1;
    var prevStart = addDays(start, -len);
    var prevEnd = addDays(start, -1);
    var prevIncome = 0, prevExpense = 0;
    transactions.forEach(function (t) {
      if (inRange(t.date, prevStart, prevEnd)) {
        if (t.type === 'income') prevIncome += t.amount;
        else if (t.type === 'expense') prevExpense += t.amount;
      }
    });
    return {
      income: income, expense: expense, balance: income - expense,
      prevIncome: prevIncome, prevExpense: prevExpense,
      incomeDelta: deltaPct(income, prevIncome),
      expenseDelta: deltaPct(expense, prevExpense)
    };
  }
  function deltaPct(cur, prev) {
    if (prev === 0) return cur === 0 ? 0 : null; // 无意义环比
    return Math.round((cur - prev) / prev * 100);
  }

  // 分类占比（支出/收入），按金额降序，含未分类
  function getCategoryBreakdown(type, start, end) {
    var map = {};
    var count = {};
    transactions.forEach(function (t) {
      if (t.type === type && inRange(t.date, start, end)) {
        var key = t.categoryId || null;
        map[key] = (map[key] || 0) + t.amount;
        count[key] = (count[key] || 0) + 1;
      }
    });
    var total = Object.keys(map).reduce(function (s, k) { return s + map[k]; }, 0);
    var list = Object.keys(map).map(function (k) {
      var cat = getCategory(k);
      return {
        id: k, name: cat.name, icon: cat.icon,
        amount: map[k], count: count[k],
        pct: total > 0 ? (map[k] / total * 100) : 0
      };
    });
    list.sort(function (a, b) { return b.amount - a.amount; });
    return { list: list, total: total };
  }

  // 趋势：按日/周/月分桶，统计支出/收入
  function getTrend(start, end, granularity) {
    var buckets = [];
    if (granularity === 'month') {
      var cur = monthStart(start);
      var last = monthStart(end);
      while (cur <= last) {
        buckets.push({ label: cur.slice(0, 7), start: cur, end: monthEnd(cur) });
        cur = monthStart(addMonths(cur, 1));
      }
    } else if (granularity === 'week') {
      // 以起始日为锚，每 7 天一桶
      var w = start;
      while (w <= end) {
        var we = addDays(w, 6);
        if (we > end) we = end;
        buckets.push({ label: w.slice(5) + '~' + we.slice(5), start: w, end: we });
        w = addDays(we, 1);
      }
    } else {
      // day
      var d = start;
      var guard = 0;
      while (d <= end && guard < 400) {
        buckets.push({ label: d.slice(5), start: d, end: d });
        d = addDays(d, 1);
        guard++;
      }
    }
    return buckets.map(function (b) {
      var income = 0, expense = 0;
      transactions.forEach(function (t) {
        if (inRange(t.date, b.start, b.end)) {
          if (t.type === 'income') income += t.amount;
          else if (t.type === 'expense') expense += t.amount;
        }
      });
      return { label: b.label, income: income, expense: expense };
    });
  }

  // 排行 Top N
  function getRanking(type, start, end, n) {
    var br = getCategoryBreakdown(type, start, end);
    return br.list.slice(0, n || 10);
  }

  /* ================= 设置 ================= */
  function getSettings() {
    return settings || {
      id: SETTINGS_ID, theme: 'light', currency: '¥',
      weekStart: 'monday', defaultAccountId: ''
    };
  }
  async function updateSettings(patch) {
    if (!settings) {
      settings = getSettings();
    }
    for (var k in patch) if (patch.hasOwnProperty(k)) settings[k] = patch[k];
    await DB.put('settings', settings);
  }

  /* ================= 导入导出 ================= */
  function exportAll() {
    return {
      app: '轻账本', version: 1, exportedAt: new Date().toISOString(),
      transactions: transactions, accounts: accounts,
      categories: categories, settings: settings
    };
  }
  async function importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('数据格式无效');
    transactions = Array.isArray(data.transactions) ? data.transactions : [];
    accounts = Array.isArray(data.accounts) ? data.accounts : [];
    categories = Array.isArray(data.categories) ? data.categories : [];
    settings = data.settings || null;
    await DB.clear('transactions'); await DB.bulkPut('transactions', transactions);
    await DB.clear('accounts'); await DB.bulkPut('accounts', accounts);
    await DB.clear('categories'); await DB.bulkPut('categories', categories);
    await DB.clear('settings');
    if (settings) await DB.put('settings', settings);
  }
  // 导出 CSV（账单明细）
  function exportCSV() {
    var header = ['类型', '金额', '分类', '账户', '日期', '时间', '备注'];
    var typeName = { expense: '支出', income: '收入', transfer: '转账' };
    var rows = sortedTx().map(function (t) {
      var acc = getAccount(t.accountId);
      var toAcc = t.type === 'transfer' ? getAccount(t.toAccountId) : null;
      var acctLabel = t.type === 'transfer'
        ? (acc ? acc.name : '') + '→' + (toAcc ? toAcc.name : '')
        : (acc ? acc.name : '');
      return [
        typeName[t.type] || t.type,
        t.amount.toFixed(2),
        t.type === 'transfer' ? '' : getCategory(t.categoryId).name,
        acctLabel,
        t.date, t.time || '', t.note || ''
      ];
    });
    var lines = [header].concat(rows).map(function (r) {
      return r.map(csvCell).join(',');
    });
    return '﻿' + lines.join('\r\n');
  }
  function csvCell(v) {
    v = (v === null || v === undefined) ? '' : String(v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  return {
    init: init,
    // 日期
    today: today, nowTime: nowTime, fmtDate: fmtDate, addDays: addDays,
    addMonths: addMonths, monthStart: monthStart, monthEnd: monthEnd,
    monthRange: monthRange,
    // 账单
    getTransactions: getTransactions,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    // 账户
    getAccounts: getAccounts, getAccount: getAccount,
    getBalance: getBalance,
    addAccount: addAccount, updateAccount: updateAccount, deleteAccount: deleteAccount,
    // 分类
    getCategories: getCategories, getTopCategories: getTopCategories,
    getSubCategories: getSubCategories, getCategory: getCategory,
    addCategory: addCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
    // 统计
    getOverview: getOverview, getCategoryBreakdown: getCategoryBreakdown,
    getTrend: getTrend, getRanking: getRanking,
    // 设置
    getSettings: getSettings, updateSettings: updateSettings,
    // 导入导出
    exportAll: exportAll, importAll: importAll, exportCSV: exportCSV
  };
})();
