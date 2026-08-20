/* ==========================================================================
   ui.js — 页面渲染与交互
   记账 / 流水 / 统计 / 我的 四个 Tab，以及弹层、Toast、确认框。
   全局对象：window.UI
   ========================================================================== */
window.UI = (function () {
  'use strict';

  /* ---------- DOM 引用 ---------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var pages = {
    home: $('#page-home'),
    flow: $('#page-flow'),
    stats: $('#page-stats'),
    mine: $('#page-mine')
  };
  var overlayEl = $('#overlay');
  var sheetEl = $('#sheet');
  var modalEl = $('#modal');
  var toastEl = $('#toast');
  var toastTimer = null;

  /* ---------- 状态 ---------- */
  var entry = { type: 'expense', amount: '', categoryId: null, accountId: null, toAccountId: null, date: '', note: '' };
  var flowFilter = { type: 'all', categoryId: null, accountId: null, start: '', end: '', keyword: '' };
  var statsState = { range: 'month', start: '', end: '', granularity: 'day', scope: 'expense' };
  var mineView = 'menu';

  // 弹层选择回调暂存
  var _catType = 'expense', _catTitle = '', _onCatSelect = null;
  var _onAccountSelect = null;
  var _onDateSelect = null;
  var _onRangeSelect = null;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(v) {
    var neg = v < 0;
    var s = Math.abs(v).toFixed(2);
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + '¥' + p.join('.');
  }
  function dateLabel(date) {
    var t = Store.today();
    if (date === t) return '今天';
    if (date === Store.addDays(t, -1)) return '昨天';
    var p = date.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return +p[1] + '月' + +p[2] + '日 周' + week;
  }
  function typeName(t) { return { expense: '支出', income: '收入', transfer: '转账' }[t] || t; }

  /* ---------- 弹层 / Toast / 确认 ---------- */
  function openSheet(html) {
    sheetEl.innerHTML = html;
    sheetEl.hidden = false;
    overlayEl.hidden = false;
    sheetEl.scrollTop = 0;
  }
  function closeSheet() {
    sheetEl.hidden = true;
    overlayEl.hidden = true;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2000);
  }
  function showModal(opts) {
    modalEl.innerHTML =
      '<div class="modal-title">' + esc(opts.title) + '</div>' +
      '<div class="modal-body">' + esc(opts.body) + '</div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-plain" onclick="UI._modalCancel()">' + esc(opts.cancelText || '取消') + '</button>' +
      '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" onclick="UI._modalConfirm()">' + esc(opts.confirmText || '确定') + '</button>' +
      '</div>';
    modalEl.hidden = false;
    overlayEl.hidden = false;
    modalEl._onConfirm = opts.onConfirm;
  }
  function closeModal() {
    modalEl.hidden = true;
    overlayEl.hidden = true;
  }
  function _modalCancel() { closeModal(); }
  function _modalConfirm() {
    var cb = modalEl._onConfirm;
    closeModal();
    if (cb) cb();
  }

  function sheetHead(title, backFn) {
    var back = backFn ? '<button class="sheet-close" onclick="' + backFn + '">‹</button>' : '<span></span>';
    return '<div class="sheet-head">' + back +
      '<div class="sheet-title">' + esc(title) + '</div>' +
      '<button class="sheet-close" onclick="UI.closeSheet()" aria-label="关闭">×</button></div>';
  }

  /* ---------- 主题 ---------- */
  function applyTheme() {
    var s = Store.getSettings();
    var theme = s.theme || 'light';
    if (theme === 'system') {
      theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#2A2226' : '#FFF8FA');
  }

  /* ================= 记账页 ================= */
  function renderHome() {
    if (!entry.date) entry.date = Store.today();
    if (!entry.accountId) {
      var def = Store.getSettings().defaultAccountId;
      var accs = Store.getAccounts();
      entry.accountId = (def && accs.some(function (a) { return a.id === def; })) ? def : (accs[0] ? accs[0].id : null);
    }

    var r = Store.monthRange(0);
    var ov = Store.getOverview(r.start, r.end);

    var html = '';
    // 概览卡
    html += '<div class="overview-card">' +
      '<div class="overview-label">本月结余</div>' +
      '<div class="overview-balance num">' + money(ov.balance) + '</div>' +
      '<div class="overview-row">' +
      '<div class="overview-col"><div class="overview-label">支出</div><div class="num">' + money(ov.expense) + '</div></div>' +
      '<div class="overview-col"><div class="overview-label">收入</div><div class="num">' + money(ov.income) + '</div></div>' +
      '</div></div>';

    // 记账表单
    var isTransfer = entry.type === 'transfer';
    html += '<div class="card entry-card">';

    // 类型切换
    html += '<div class="segmented">' +
      segBtn('expense', '支出') + segBtn('income', '收入') + segBtn('transfer', '转账') +
      '</div>';

    // 金额输入
    html += '<div class="amount-input-wrap">' +
      '<input class="amount-input num" id="amount-input" type="text" inputmode="decimal" placeholder="0.00" value="' + esc(entry.amount) + '" oninput="UI.onAmountInput(this)" />' +
      '</div>';

    // 分类（转账不显示）
    if (!isTransfer) {
      var cat = Store.getCategory(entry.categoryId);
      html += '<div class="entry-row">' +
        '<div class="entry-cell" onclick="UI.openCategoryPicker(\'' + entry.type + '\', UI._entryCatSelect, \'选择分类\')">' +
        '<span class="cell-label">分类</span><span class="cell-value">' + cat.icon + ' ' + esc(cat.name) + '</span></div>' +
        '</div>';
    }

    // 账户
    if (isTransfer) {
      var a1 = Store.getAccount(entry.accountId);
      var a2 = Store.getAccount(entry.toAccountId);
      html += '<div class="entry-row">' +
        '<div class="entry-cell" onclick="UI.openAccountPicker(UI._entryFromSelect, \'转出账户\')">' +
        '<span class="cell-label">转出</span><span class="cell-value">' + (a1 ? a1.icon + ' ' + esc(a1.name) : '选择') + '</span></div>' +
        '<div class="entry-cell" onclick="UI.openAccountPicker(UI._entryToSelect, \'转入账户\')">' +
        '<span class="cell-label">转入</span><span class="cell-value">' + (a2 ? a2.icon + ' ' + esc(a2.name) : '选择') + '</span></div>' +
        '</div>';
    } else {
      var a = Store.getAccount(entry.accountId);
      html += '<div class="entry-row">' +
        '<div class="entry-cell" onclick="UI.openAccountPicker(UI._entryAccSelect, \'选择账户\')">' +
        '<span class="cell-label">账户</span><span class="cell-value">' + (a ? a.icon + ' ' + esc(a.name) : '选择') + '</span></div>' +
        '<div class="entry-cell" onclick="UI.openDatePicker(UI._entryDateSelect, \'选择日期\')">' +
        '<span class="cell-label">日期</span><span class="cell-value">' + dateLabel(entry.date) + '</span></div>' +
        '</div>';
    }

    // 备注
    html += '<div class="entry-row"><div style="flex:1">' +
      '<input class="input" id="note-input" type="text" maxlength="100" placeholder="备注（可选）" value="' + esc(entry.note) + '" oninput="UI.onNoteInput(this)" />' +
      '</div></div>';

    // 保存
    html += '<div style="margin-top:14px"><button class="btn btn-primary btn-block" onclick="UI.saveEntry()">保存</button></div>';
    html += '</div>';

    // 最近记录
    var recent = Store.getTransactions().slice(0, 5);
    html += '<div class="section-title">最近记录</div>';
    if (recent.length === 0) {
      html += emptyState('🌸', '今天还没有记录哦～\n点上面记第一笔吧');
    } else {
      html += '<div class="card recent-list">' + recent.map(function (t) { return recentItemHTML(t); }).join('') + '</div>';
    }

    pages.home.innerHTML = html;
  }

  function segBtn(val, label) {
    return '<button type="button" class="' + (entry.type === val ? 'active' : '') + '" onclick="UI.setType(\'' + val + '\')">' + label + '</button>';
  }
  function recentItemHTML(t) {
    var cat = Store.getCategory(t.categoryId);
    var acc = Store.getAccount(t.accountId);
    var icon = t.type === 'transfer' ? '🔁' : cat.icon;
    var name = t.type === 'transfer' ? (acc ? acc.name : '') + ' → ' + (Store.getAccount(t.toAccountId) ? Store.getAccount(t.toAccountId).name : '') : cat.name;
    var sub = (acc ? acc.name : '') + (t.note ? ' · ' + t.note : '');
    var amtCls = t.type === 'expense' ? 'expense' : (t.type === 'income' ? 'income' : 'transfer');
    var sign = t.type === 'expense' ? '-' : (t.type === 'income' ? '+' : '');
    return '<div class="recent-item" onclick="UI.openTxDetail(\'' + t.id + '\')">' +
      '<div class="recent-icon">' + icon + '</div>' +
      '<div class="recent-main"><div class="recent-name">' + esc(name) + '</div><div class="recent-sub">' + esc(sub) + '</div></div>' +
      '<div class="recent-amount amount ' + amtCls + '">' + sign + money(t.amount) + '</div></div>';
  }

  function setType(type) {
    entry.type = type;
    entry.categoryId = null; // 分类体系随类型变化，切换时重置为未分类
    if (type === 'transfer') { entry.toAccountId = entry.toAccountId || entry.accountId; }
    renderHome();
  }
  function onAmountInput(el) {
    var v = el.value.replace(/[^\d.]/g, '');
    var dot = v.indexOf('.');
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    if (dot >= 0 && v.length - dot - 1 > 2) v = v.slice(0, dot + 3);
    el.value = v;
    entry.amount = v;
  }
  function onNoteInput(el) { entry.note = el.value; }

  // 记账表单的选择回调
  function _entryCatSelect(id) { entry.categoryId = id; renderHome(); }
  function _entryAccSelect(id) { entry.accountId = id; renderHome(); }
  function _entryFromSelect(id) { entry.accountId = id; renderHome(); }
  function _entryToSelect(id) { entry.toAccountId = id; renderHome(); }
  function _entryDateSelect(date) { entry.date = date; renderHome(); }

  function saveEntry() {
    var amount = parseFloat(entry.amount);
    if (!amount || amount <= 0) { toast('请输入金额'); return; }
    amount = Math.round(amount * 100) / 100;
    if (entry.type === 'transfer') {
      if (!entry.accountId || !entry.toAccountId) { toast('请选择转出和转入账户'); return; }
      if (entry.accountId === entry.toAccountId) { toast('两个账户不能相同'); return; }
    } else if (!entry.accountId) { toast('请选择账户'); return; }

    Store.addTransaction({
      type: entry.type, amount: amount,
      categoryId: entry.type === 'transfer' ? null : entry.categoryId,
      accountId: entry.accountId,
      toAccountId: entry.type === 'transfer' ? entry.toAccountId : null,
      date: entry.date, time: Store.nowTime(), note: entry.note || ''
    }).then(function () {
      toast('已记一笔 ✨');
      entry.amount = ''; entry.note = '';
      renderHome();
    });
  }

  /* ---------- 分类选择弹层 ---------- */
  function openCategoryPicker(type, onSelect, title) {
    _catType = type; _catTitle = title; _onCatSelect = onSelect;
    var tops = Store.getTopCategories(type);
    var html = sheetHead(title);
    html += '<button class="chip" style="width:100%;justify-content:center" onclick="UI.pickCategory(\'\')">📦 未分类</button>';
    html += '<div class="pick-grid" style="margin-top:12px">' + tops.map(function (c) {
      var hasSub = Store.getSubCategories(c.id).length > 0;
      return '<div class="pick-item" onclick="UI.pickCategory(\'' + c.id + '\')">' +
        '<span class="pick-icon">' + c.icon + '</span><span class="pick-name">' + esc(c.name) + '</span>' +
        (hasSub ? '<span style="font-size:9px;color:var(--text-muted)">›</span>' : '') + '</div>';
    }).join('') + '</div>';
    openSheet(html);
  }
  function pickCategory(id) {
    if (id === '') { // 未分类
      _onCatSelect(null); closeSheet(); return;
    }
    var subs = Store.getSubCategories(id);
    if (subs.length) {
      var top = Store.getCategory(id);
      var html = sheetHead(top.name, 'UI._catBack()');
      html += '<button class="chip" style="width:100%;justify-content:center" onclick="UI.pickCategory(\'' + id + '\')">' + top.icon + ' ' + esc(top.name) + '（整体）</button>';
      html += '<div class="pick-grid" style="margin-top:12px">' + subs.map(function (c) {
        return '<div class="pick-item" onclick="UI.pickCategory(\'' + c.id + '\')">' +
          '<span class="pick-icon">' + c.icon + '</span><span class="pick-name">' + esc(c.name) + '</span></div>';
      }).join('') + '</div>';
      openSheet(html);
    } else {
      _onCatSelect(id); closeSheet();
    }
  }
  function _catBack() { openCategoryPicker(_catType, _onCatSelect, _catTitle); }

  /* ---------- 账户选择弹层 ---------- */
  function openAccountPicker(onSelect, title) {
    _onAccountSelect = onSelect;
    var accs = Store.getAccounts();
    var html = sheetHead(title);
    html += '<div class="pick-grid">' + accs.map(function (a) {
      return '<div class="pick-item" onclick="UI.pickAccount(\'' + a.id + '\')">' +
        '<span class="pick-icon">' + a.icon + '</span><span class="pick-name">' + esc(a.name) + '</span></div>';
    }).join('') + '</div>';
    openSheet(html);
  }
  function pickAccount(id) { if (_onAccountSelect) _onAccountSelect(id); closeSheet(); }

  /* ---------- 日期选择弹层 ---------- */
  function openDatePicker(onSelect, title) {
    _onDateSelect = onSelect;
    var t = Store.today();
    var html = sheetHead(title);
    html += '<div class="entry-row">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="UI._pickQuickDate(\'' + t + '\')">今天</button>' +
      '<button class="btn btn-ghost" style="flex:1" onclick="UI._pickQuickDate(\'' + Store.addDays(t, -1) + '\')">昨天</button>' +
      '</div>';
    html += '<div class="field" style="margin-top:14px"><input class="input" id="date-picker-input" type="date" /></div>';
    html += '<button class="btn btn-primary btn-block" onclick="UI._confirmDate()">确定</button>';
    openSheet(html);
    setTimeout(function () { var i = $('#date-picker-input'); if (i) i.value = entry.date || t; }, 0);
  }
  function _pickQuickDate(d) { _onDateSelect(d); closeSheet(); }
  function _confirmDate() { var v = $('#date-picker-input').value; if (v) _onDateSelect(v); closeSheet(); }

  /* ================= 流水页 ================= */
  function renderFlow() {
    var html = '';
    // 类型筛选
    var types = [['all', '全部'], ['expense', '支出'], ['income', '收入'], ['transfer', '转账']];
    html += '<div class="filter-bar">' + types.map(function (t) {
      return '<button class="filter-chip ' + (flowFilter.type === t[0] ? 'active' : '') + '" onclick="UI.setFlowType(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>';

    // 分类/账户/日期筛选
    var catLbl = flowFilter.categoryId ? Store.getCategory(flowFilter.categoryId).name : '分类';
    var accLbl = flowFilter.accountId ? (Store.getAccount(flowFilter.accountId) || {}).name : '账户';
    var rangeLbl = flowFilter.start ? flowFilter.start + '~' + flowFilter.end : '日期';
    html += '<div class="filter-bar">' +
      '<button class="filter-chip ' + (flowFilter.categoryId ? 'active' : '') + '" onclick="UI.openFlowCategory()">' + esc(catLbl) + '</button>' +
      '<button class="filter-chip ' + (flowFilter.accountId ? 'active' : '') + '" onclick="UI.openFlowAccount()">' + esc(accLbl) + '</button>' +
      '<button class="filter-chip ' + (flowFilter.start ? 'active' : '') + '" onclick="UI.openFlowRange()">' + esc(rangeLbl) + '</button>' +
      (flowFilter.categoryId || flowFilter.accountId || flowFilter.start ? '<button class="filter-chip" onclick="UI.clearFlowFilter()">清除</button>' : '') +
      '</div>';

    // 搜索
    html += '<input class="input search-input" id="flow-search" type="text" placeholder="搜索备注 / 金额" value="' + esc(flowFilter.keyword) + '" oninput="UI.onFlowSearch(this)" />';

    // 列表
    var list = filteredTransactions();
    if (list.length === 0) {
      html += emptyState('🧾', '没有符合条件的记录');
    } else {
      html += groupByDay(list);
    }
    pages.flow.innerHTML = html;
  }

  function filteredTransactions() {
    var kw = flowFilter.keyword.trim();
    return Store.getTransactions().filter(function (t) {
      if (flowFilter.type !== 'all' && t.type !== flowFilter.type) return false;
      if (flowFilter.categoryId) {
        if (flowFilter.categoryId === '__none__') { if (t.categoryId) return false; }
        else if (t.categoryId !== flowFilter.categoryId) return false;
      }
      if (flowFilter.accountId && t.accountId !== flowFilter.accountId && t.toAccountId !== flowFilter.accountId) return false;
      if (flowFilter.start && (t.date < flowFilter.start || t.date > flowFilter.end)) return false;
      if (kw) {
        var acc = Store.getAccount(t.accountId);
        var cat = Store.getCategory(t.categoryId);
        var hay = (t.note || '') + ' ' + (acc ? acc.name : '') + ' ' + cat.name + ' ' + t.amount;
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function groupByDay(list) {
    var groups = {};
    list.forEach(function (t) {
      (groups[t.date] = groups[t.date] || []).push(t);
    });
    var dates = Object.keys(groups).sort().reverse();
    return dates.map(function (d) {
      var items = groups[d];
      var exp = 0, inc = 0;
      items.forEach(function (t) { if (t.type === 'expense') exp += t.amount; else if (t.type === 'income') inc += t.amount; });
      var sub = '';
      if (exp > 0) sub += '<span class="exp">支出 ' + money(exp) + '</span>';
      if (inc > 0) sub += (exp > 0 ? ' · ' : '') + '<span class="inc">收入 ' + money(inc) + '</span>';
      return '<div class="day-group"><div class="day-head">' +
        '<span class="day-date">' + dateLabel(d) + '</span>' +
        '<span class="day-subtotal">' + sub + '</span></div>' +
        items.map(function (t) { return txItemHTML(t); }).join('') + '</div>';
    }).join('');
  }

  function txItemHTML(t) {
    var cat = Store.getCategory(t.categoryId);
    var acc = Store.getAccount(t.accountId);
    var icon = t.type === 'transfer' ? '🔁' : cat.icon;
    var name = t.type === 'transfer'
      ? (acc ? acc.name : '') + ' → ' + (Store.getAccount(t.toAccountId) ? Store.getAccount(t.toAccountId).name : '')
      : cat.name;
    var sub = (acc ? acc.name : '') + (t.note ? ' · ' + t.note : '');
    var amtCls = t.type === 'expense' ? 'expense' : (t.type === 'income' ? 'income' : 'transfer');
    var sign = t.type === 'expense' ? '-' : (t.type === 'income' ? '+' : '');
    return '<div class="tx-item" onclick="UI.openTxDetail(\'' + t.id + '\')">' +
      '<div class="recent-icon">' + icon + '</div>' +
      '<div class="recent-main"><div class="recent-name">' + esc(name) + '</div><div class="recent-sub">' + esc(sub) + '</div></div>' +
      '<div class="recent-amount amount ' + amtCls + '">' + sign + money(t.amount) + '</div></div>';
  }

  function setFlowType(t) { flowFilter.type = t; renderFlow(); }
  function onFlowSearch(el) { flowFilter.keyword = el.value; renderFlow(); }
  function clearFlowFilter() { flowFilter = { type: 'all', categoryId: null, accountId: null, start: '', end: '', keyword: '' }; renderFlow(); }
  function openFlowCategory() {
    openCategoryPicker('expense', function (id) {
      flowFilter.categoryId = id || '__none__';
      renderFlow();
    }, '按分类筛选');
  }
  function openFlowAccount() { openAccountPicker(function (id) { flowFilter.accountId = id; renderFlow(); }, '按账户筛选'); }
  function openFlowRange() {
    openRangePicker(function (start, end) { flowFilter.start = start; flowFilter.end = end; renderFlow(); });
  }

  /* ---------- 日期范围选择（筛选/统计共用） ---------- */
  function openRangePicker(onSelect) {
    _onRangeSelect = onSelect;
    var html = sheetHead('选择日期范围');
    html += '<div class="entry-row">' +
      '<div style="flex:1"><div class="field-label">开始</div><input class="input" id="range-start" type="date" /></div>' +
      '<div style="flex:1"><div class="field-label">结束</div><input class="input" id="range-end" type="date" /></div>' +
      '</div>';
    html += '<button class="btn btn-primary btn-block" onclick="UI._confirmRange()">确定</button>';
    openSheet(html);
  }
  function _confirmRange() {
    var s = $('#range-start').value, e = $('#range-end').value;
    if (!s || !e) { toast('请选择完整日期范围'); return; }
    if (s > e) { toast('开始日期不能晚于结束日期'); return; }
    _onRangeSelect(s, e); closeSheet();
  }

  /* ---------- 账单详情 / 编辑 ---------- */
  function openTxDetail(id) {
    var tx = Store.getTransactions().filter(function (t) { return t.id === id; })[0];
    if (!tx) return;
    var cat = Store.getCategory(tx.categoryId);
    var acc = Store.getAccount(tx.accountId);
    var toAcc = tx.type === 'transfer' ? Store.getAccount(tx.toAccountId) : null;

    var html = sheetHead(typeName(tx.type) + '详情');
    html += '<div style="text-align:center;padding:8px 0 16px">' +
      '<div style="font-size:34px;font-weight:700" class="amount ' + (tx.type === 'expense' ? 'expense' : tx.type === 'income' ? 'income' : 'transfer') + '">' +
      (tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : '') + money(tx.amount) + '</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-top:6px">' +
      (tx.type === 'transfer' ? (acc ? acc.name : '') + ' → ' + (toAcc ? toAcc.name : '') : cat.icon + ' ' + esc(cat.name)) + '</div>' +
      '</div>';

    html += '<div class="card" style="box-shadow:none;border:1px solid var(--divider)">' +
      detailRow('账户', tx.type === 'transfer' ? (acc ? acc.name : '') + ' → ' + (toAcc ? toAcc.name : '') : (acc ? acc.name : '')) +
      (tx.type !== 'transfer' ? detailRow('分类', cat.icon + ' ' + cat.name) : '') +
      detailRow('日期', tx.date + ' ' + (tx.time || '')) +
      (tx.note ? detailRow('备注', tx.note) : '') +
      '</div>';

    html += '<div class="entry-row" style="margin-top:16px">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="UI.closeSheet();UI.openTxEdit(\'' + id + '\')">编辑</button>' +
      '<button class="btn btn-danger" style="flex:1" onclick="UI.closeSheet();UI.deleteTx(\'' + id + '\')">删除</button>' +
      '</div>';
    openSheet(html);
  }
  function detailRow(k, v) {
    return '<div style="display:flex;justify-content:space-between;padding:10px 2px;border-bottom:1px solid var(--divider);font-size:14px">' +
      '<span style="color:var(--text-secondary)">' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
  }

  function deleteTx(id) {
    showModal({
      title: '删除这笔记录？', body: '删除后不可恢复，建议先导出备份。', danger: true,
      confirmText: '删除', onConfirm: function () {
        Store.deleteTransaction(id).then(function () { toast('已删除'); renderHome(); renderFlow(); });
      }
    });
  }

  /* ---------- 账单编辑 ---------- */
  function openTxEdit(id) {
    var tx = Store.getTransactions().filter(function (t) { return t.id === id; })[0];
    if (!tx) return;
    var html = sheetHead('编辑' + typeName(tx.type));
    html += '<div class="field"><div class="field-label">金额</div>' +
      '<input class="input num" id="edit-amount" type="text" inputmode="decimal" value="' + tx.amount + '" oninput="UI.onEditAmount(this)" /></div>';
    if (tx.type !== 'transfer') {
      var cat = Store.getCategory(tx.categoryId);
      html += '<div class="field"><div class="field-label">分类</div>' +
        '<div class="entry-cell" onclick="UI._editPickCategory(\'' + id + '\')"><span class="cell-value">' + cat.icon + ' ' + esc(cat.name) + '</span></div></div>';
    }
    html += '<div class="field"><div class="field-label">日期</div>' +
      '<input class="input" id="edit-date" type="date" value="' + tx.date + '" /></div>';
    html += '<div class="field"><div class="field-label">备注</div>' +
      '<input class="input" id="edit-note" type="text" maxlength="100" value="' + esc(tx.note || '') + '" /></div>';
    html += '<button class="btn btn-primary btn-block" onclick="UI.saveTxEdit(\'' + id + '\')">保存</button>';
    openSheet(html);
  }
  var _editId = null, _editAmount = 0;
  function onEditAmount(el) {
    var v = el.value.replace(/[^\d.]/g, '');
    var dot = v.indexOf('.');
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    if (dot >= 0 && v.length - dot - 1 > 2) v = v.slice(0, dot + 3);
    el.value = v;
  }
  function _editPickCategory(id) {
    _editId = id;
    var tx = Store.getTransactions().filter(function (t) { return t.id === id; })[0];
    openCategoryPicker(tx.type, function (catId) {
      var t = Store.getTransactions().filter(function (x) { return x.id === id; })[0];
      if (t) Store.updateTransaction(id, { categoryId: catId }).then(function () { renderHome(); renderFlow(); openTxEdit(id); });
    }, '选择分类');
  }
  function saveTxEdit(id) {
    var amt = parseFloat($('#edit-amount').value);
    if (!amt || amt <= 0) { toast('请输入金额'); return; }
    amt = Math.round(amt * 100) / 100;
    Store.updateTransaction(id, {
      amount: amt, date: $('#edit-date').value, note: $('#edit-note').value || ''
    }).then(function () {
      toast('已保存');
      closeSheet();
      renderHome(); renderFlow(); renderStats();
    });
  }

  /* ================= 统计页 ================= */
  function renderStats() {
    computeStatsRange();
    var ov = Store.getOverview(statsState.start, statsState.end);

    var html = '';
    // 范围切换
    var ranges = [['month', '本月'], ['lastMonth', '上月'], ['3m', '近3月'], ['12m', '近12月'], ['custom', '自定义']];
    html += '<div class="range-tabs">' + ranges.map(function (r) {
      return '<button class="range-tab ' + (statsState.range === r[0] ? 'active' : '') + '" onclick="UI.setStatsRange(\'' + r[0] + '\')">' + r[1] + '</button>';
    }).join('') + '</div>';

    // 概览卡
    html += '<div class="stat-cards">' +
      statCard('收入', ov.income, 'income', ov.incomeDelta) +
      statCard('支出', ov.expense, 'expense', ov.expenseDelta) +
      statCard('结余', ov.balance, 'plain', null) +
      '</div>';

    // 支出分类占比（环形图）
    html += '<div class="card chart-card">' +
      '<div class="chart-title">' + (statsState.scope === 'expense' ? '支出' : '收入') + '分类占比</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:12px">' +
      '<button class="chip ' + (statsState.scope === 'expense' ? 'selected' : '') + '" onclick="UI.setStatsScope(\'expense\')">支出</button>' +
      '<button class="chip ' + (statsState.scope === 'income' ? 'selected' : '') + '" onclick="UI.setStatsScope(\'income\')">收入</button>' +
      '</div>' +
      '<div class="donut-wrap" id="donut-wrap"></div>' +
      '</div>';

    // 收支趋势
    html += '<div class="card chart-card">' +
      '<div class="chart-title">收支趋势</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:12px">' +
      trendTab('day', '按日') + trendTab('week', '按周') + trendTab('month', '按月') +
      '</div>' +
      '<div class="chart-box" id="trend-box"></div>' +
      '<div style="display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:12px;color:var(--text-secondary)">' +
      '<span><span class="legend-dot" style="background:var(--expense);display:inline-block;margin-right:4px"></span>支出</span>' +
      '<span><span class="legend-dot" style="background:var(--income);display:inline-block;margin-right:4px"></span>收入</span>' +
      '</div>' +
      '</div>';

    // 分类排行
    var rank = Store.getRanking(statsState.scope, statsState.start, statsState.end, 10);
    html += '<div class="card chart-card"><div class="chart-title">' + (statsState.scope === 'expense' ? '支出' : '收入') + '排行</div>';
    if (rank.length === 0) {
      html += emptyState('🏆', '暂无数据');
    } else {
      html += rank.map(function (r, i) { return rankItemHTML(r, i, ov); }).join('');
    }
    html += '</div>';

    pages.stats.innerHTML = html;

    // 渲染图表
    renderDonutChart();
    renderTrendChart();
  }

  function computeStatsRange() {
    var t = Store.today();
    if (statsState.range === 'month') { var r = Store.monthRange(0); statsState.start = r.start; statsState.end = r.end; }
    else if (statsState.range === 'lastMonth') { var r2 = Store.monthRange(-1); statsState.start = r2.start; statsState.end = r2.end; }
    else if (statsState.range === '3m') { statsState.start = Store.monthStart(Store.addMonths(t, -2)); statsState.end = t; }
    else if (statsState.range === '12m') { statsState.start = Store.monthStart(Store.addMonths(t, -11)); statsState.end = t; }
    // custom 由 setStatsRange 单独处理
  }
  function setStatsRange(type) {
    if (type === 'custom') {
      openRangePicker(function (start, end) {
        statsState.range = 'custom'; statsState.start = start; statsState.end = end;
        renderStats();
      });
      return;
    }
    statsState.range = type;
    renderStats();
  }
  function setStatsScope(scope) { statsState.scope = scope; renderStats(); }
  function setGranularity(g) { statsState.granularity = g; renderTrendChart(); }
  function trendTab(val, label) {
    return '<button class="chip ' + (statsState.granularity === val ? 'selected' : '') + '" onclick="UI.setGranularity(\'' + val + '\')">' + label + '</button>';
  }

  function statCard(label, value, kind, delta) {
    var cls = kind === 'plain' ? '' : kind;
    var dHtml = '';
    if (delta !== null && delta !== undefined && kind !== 'plain') {
      var up = delta > 0, flat = delta === 0;
      dHtml = '<div class="stat-delta" style="color:' + (flat ? 'var(--text-muted)' : up ? 'var(--error)' : 'var(--expense)') + '">' +
        (flat ? '持平' : (up ? '↑' : '↓') + Math.abs(delta) + '%') + ' 环比</div>';
    }
    return '<div class="stat-card ' + cls + '"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value num">' + money(value) + '</div>' + dHtml + '</div>';
  }

  function renderDonutChart() {
    var wrap = $('#donut-wrap');
    if (!wrap) return;
    var br = Store.getCategoryBreakdown(statsState.scope, statsState.start, statsState.end);
    var total = br.total;
    var top = br.list.slice(0, 8);
    var rest = br.list.slice(8);
    var restSum = rest.reduce(function (s, x) { return s + x.amount; }, 0);

    var items = top.map(function (x, i) { return { name: x.name, value: x.amount, color: Charts.PALETTE[i % Charts.PALETTE.length] }; });
    if (restSum > 0) items.push({ name: '其他', value: restSum, color: Charts.OTHER_COLOR });

    var centerTitle = statsState.scope === 'expense' ? '总支出' : '总收入';
    var svgBox = document.createElement('div');
    Charts.renderDonut(svgBox, items, total, centerTitle, Charts.formatShort(total));

    var legend = '<div class="legend">' + (br.list.length === 0 ? '<div style="color:var(--text-muted);font-size:13px">暂无数据</div>' :
      br.list.slice(0, 8).map(function (x, i) {
        return '<div class="legend-item" onclick="UI.drilldown(\'' + (x.id || '') + '\')">' +
          '<span class="legend-dot" style="background:' + (Charts.PALETTE[i % Charts.PALETTE.length]) + '"></span>' +
          '<span class="legend-name">' + esc(x.name) + '</span>' +
          '<span class="legend-val">' + x.pct.toFixed(1) + '%</span></div>';
      }).join('')) +
      (restSum > 0 ? '<div class="legend-item"><span class="legend-dot" style="background:' + Charts.OTHER_COLOR + '"></span><span class="legend-name">其他</span><span class="legend-val">' + (restSum / total * 100).toFixed(1) + '%</span></div>' : '') +
      '</div>';

    wrap.innerHTML = svgBox.innerHTML + legend;
  }

  function renderTrendChart() {
    var box = $('#trend-box');
    if (!box) return;
    var data = Store.getTrend(statsState.start, statsState.end, statsState.granularity);
    Charts.renderBars(box, data);
  }

  function rankItemHTML(r, i, ov) {
    var max = ov.expense || 1;
    var barColor = statsState.scope === 'expense' ? 'var(--expense)' : 'var(--income)';
    var widthPct = Math.max(2, r.amount / max * 100);
    return '<div class="rank-item" onclick="UI.drilldown(\'' + (r.id || '') + '\')">' +
      '<span class="rank-no">' + (i + 1) + '</span>' +
      '<span style="font-size:20px">' + r.icon + '</span>' +
      '<div class="rank-bar-wrap"><div class="rank-bar" style="width:' + widthPct + '%;background:' + barColor + '"></div></div>' +
      '<div style="min-width:70px;text-align:right"><div class="rank-val num">' + money(r.amount) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted)">' + r.pct.toFixed(1) + '% · ' + r.count + '笔</div></div>' +
      '</div>';
  }

  function drilldown(categoryId) {
    flowFilter = { type: statsState.scope, categoryId: categoryId || '__none__', accountId: null, start: statsState.start, end: statsState.end, keyword: '' };
    switchTab('flow');
  }

  /* ================= 我的页 ================= */
  function renderMine() {
    var html = '';
    if (mineView === 'menu') html = renderMineMenu();
    else if (mineView === 'accounts') html = renderAccounts();
    else if (mineView === 'categories') html = renderCategories();
    else if (mineView === 'data') html = renderData();
    else if (mineView === 'settings') html = renderSettings();
    else if (mineView === 'about') html = renderAbout();
    pages.mine.innerHTML = html;
  }
  function goMine(view) { mineView = view; renderMine(); }

  function renderMineMenu() {
    var menu = [
      ['💳', '账户管理', 'accounts'],
      ['🏷️', '分类管理', 'categories'],
      ['💾', '数据管理', 'data'],
      ['⚙️', '设置', 'settings'],
      ['ℹ️', '关于与隐私', 'about']
    ];
    return '<div class="mine-menu">' + menu.map(function (m) {
      return '<button class="mine-item" onclick="UI.goMine(\'' + m[2] + '\')">' +
        '<span class="mi-icon">' + m[0] + '</span>' + m[1] +
        '<span class="mi-arrow">›</span></button>';
    }).join('') + '</div>';
  }

  function subHead(title) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">' +
      '<button class="icon-btn" onclick="UI.goMine(\'menu\')" style="width:36px;height:36px">‹</button>' +
      '<span style="font-size:17px;font-weight:700">' + title + '</span></div>';
  }

  /* ---- 账户管理 ---- */
  function renderAccounts() {
    var accs = Store.getAccounts();
    var html = subHead('账户管理');
    html += '<div class="card">' + accs.map(function (a) {
      var bal = Store.getBalance(a.id);
      return '<div class="account-item">' +
        '<div class="account-icon">' + a.icon + '</div>' +
        '<div class="account-main"><div class="account-name">' + esc(a.name) + '</div>' +
        '<div class="account-type">' + accountTypeName(a.type) + (a.type === 'credit' ? ' · 负债账户' : '') + '</div></div>' +
        '<div class="account-balance num" style="color:' + (bal < 0 ? 'var(--error)' : 'var(--text)') + '">' + money(bal) + '</div>' +
        '<button class="icon-btn" onclick="UI.openAccountForm(\'' + a.id + '\')">✏️</button>' +
        '</div>';
    }).join('') + '</div>';
    html += '<div style="margin-top:14px"><button class="btn btn-primary btn-block" onclick="UI.openAccountForm()">+ 新增账户</button></div>';
    return html;
  }
  function accountTypeName(t) {
    return { cash: '现金', wechat: '微信', alipay: '支付宝', bank: '银行卡', credit: '信用卡', other: '其他' }[t] || t;
  }

  function openAccountForm(id) {
    var a = id ? Store.getAccount(id) : null;
    var html = sheetHead(a ? '编辑账户' : '新增账户');
    html += '<div class="field"><div class="field-label">名称</div><input class="input" id="acc-name" type="text" maxlength="20" value="' + esc(a ? a.name : '') + '" /></div>';
    html += '<div class="field"><div class="field-label">图标（emoji）</div><input class="input" id="acc-icon" type="text" maxlength="4" value="' + esc(a ? a.icon : '💰') + '" /></div>';
    html += '<div class="field"><div class="field-label">类型</div><select class="select" id="acc-type">' +
      ['cash', 'wechat', 'alipay', 'bank', 'credit', 'other'].map(function (t) {
        return '<option value="' + t + '"' + (a && a.type === t ? ' selected' : '') + '>' + accountTypeName(t) + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="field"><div class="field-label">初始余额</div><input class="input num" id="acc-balance" type="text" inputmode="decimal" value="' + (a ? a.initialBalance : '0') + '" /></div>';
    html += '<div class="entry-row">' +
      (a ? '<button class="btn btn-danger" style="flex:1" onclick="UI.deleteAccount(\'' + a.id + '\')">删除</button>' : '') +
      '<button class="btn btn-primary" style="flex:1" onclick="UI.saveAccountForm(\'' + (a ? a.id : '') + '\')">保存</button></div>';
    openSheet(html);
  }
  function saveAccountForm(id) {
    var name = $('#acc-name').value.trim();
    if (!name) { toast('请输入账户名称'); return; }
    var data = {
      name: name, icon: $('#acc-icon').value || '💰', type: $('#acc-type').value,
      initialBalance: parseFloat($('#acc-balance').value) || 0
    };
    var p = id
      ? Store.updateAccount(id, data).then(function () { toast('已保存'); })
      : Store.addAccount(data).then(function () { toast('已新增'); });
    p.then(function () { closeSheet(); renderMine(); });
  }
  function deleteAccount(id) {
    var a = Store.getAccount(id);
    var count = Store.getTransactions().filter(function (t) { return t.accountId === id || t.toAccountId === id; }).length;
    showModal({
      title: '删除账户「' + (a ? a.name : '') + '」？',
      body: count > 0 ? '该账户下有 ' + count + ' 笔账单，删除后这些账单的账户将变为空。' : '确定删除该账户？',
      danger: true, confirmText: '删除',
      onConfirm: function () {
        Store.deleteAccount(id).then(function () { toast('已删除'); renderMine(); });
      }
    });
  }

  /* ---- 分类管理 ---- */
  function renderCategories() {
    var html = subHead('分类管理');
    html += '<div class="segmented" style="margin-bottom:14px">' +
      '<button class="' + (_catType === 'expense' ? 'active' : '') + '" onclick="UI._catMgmtType(\'expense\')">支出分类</button>' +
      '<button class="' + (_catType === 'income' ? 'active' : '') + '" onclick="UI._catMgmtType(\'income\')">收入分类</button>' +
      '</div>';
    var tops = Store.getTopCategories(_catType);
    html += '<div class="card">' + tops.map(function (top) {
      var subs = Store.getSubCategories(top.id);
      var row = '<div class="cat-row">' +
        '<span class="cat-icon">' + top.icon + '</span>' +
        '<span class="cat-name">' + esc(top.name) + '</span>' +
        '<button class="icon-btn" onclick="UI.openCategoryForm(\'' + top.id + '\')">✏️</button>' +
        '</div>';
      if (subs.length) {
        row += '<div class="sub-cats">' + subs.map(function (s) {
          return '<div class="sub-cat"><span>' + s.icon + '</span><span style="flex:1">' + esc(s.name) + '</span>' +
            '<button class="icon-btn" onclick="UI.openCategoryForm(\'' + s.id + '\')" style="width:36px;height:36px">✏️</button></div>';
        }).join('') + '</div>';
      }
      return row;
    }).join('') + '</div>';
    html += '<div style="margin-top:14px"><button class="btn btn-primary btn-block" onclick="UI.openCategoryForm()">+ 新增分类</button></div>';
    return html;
  }
  function _catMgmtType(t) { _catType = t; renderMine(); }

  function openCategoryForm(id) {
    var c = id ? Store.getCategory(id) : null;
    var parentId = c ? c.parentId : null;
    var isSub = c ? !!c.parentId : false;
    var html = sheetHead(c ? '编辑分类' : '新增分类');
    html += '<div class="field"><div class="field-label">名称</div><input class="input" id="cat-name" type="text" maxlength="10" value="' + esc(c ? c.name : '') + '" /></div>';
    html += '<div class="field"><div class="field-label">图标（emoji）</div><input class="input" id="cat-icon" type="text" maxlength="4" value="' + esc(c ? c.icon : '🏷️') + '" /></div>';
    if (!c) {
      // 新增：选择类型 + 所属一级分类
      var tops = Store.getTopCategories(_catType);
      html += '<div class="field"><div class="field-label">类型</div><select class="select" id="cat-type">' +
        '<option value="expense"' + (_catType === 'expense' ? ' selected' : '') + '>支出</option>' +
        '<option value="income"' + (_catType === 'income' ? ' selected' : '') + '>收入</option></select></div>';
      html += '<div class="field"><div class="field-label">归属（留空为一级分类）</div><select class="select" id="cat-parent">' +
        '<option value="">无（作为一级分类）</option>' +
        tops.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') +
        '</select></div>';
    } else if (isSub) {
      html += '<div class="field"><div class="field-label">归属一级分类</div><div style="font-size:14px;padding:10px 0">' +
        Store.getCategory(parentId).name + '</div></div>';
    }
    html += '<div class="entry-row">' +
      (c && !c.isSystem ? '<button class="btn btn-danger" style="flex:1" onclick="UI.deleteCategory(\'' + c.id + '\')">删除</button>' : '') +
      '<button class="btn btn-primary" style="flex:1" onclick="UI.saveCategoryForm(\'' + (c ? c.id : '') + '\')">保存</button></div>';
    openSheet(html);
  }
  function saveCategoryForm(id) {
    var name = $('#cat-name').value.trim();
    if (!name) { toast('请输入分类名称'); return; }
    if (id) {
      Store.updateCategory(id, { name: name, icon: $('#cat-icon').value || '🏷️' }).then(function () { toast('已保存'); closeSheet(); renderMine(); });
    } else {
      var type = $('#cat-type').value;
      var parentId = $('#cat-parent').value || null;
      Store.addCategory({ name: name, icon: $('#cat-icon').value || '🏷️', type: type, parentId: parentId, isSystem: false, isHidden: false, sort: 99 }).then(function () { toast('已新增'); closeSheet(); renderMine(); });
    }
  }
  function deleteCategory(id) {
    showModal({
      title: '删除分类？', body: '删除后，该分类下的账单将归入「未分类」。', danger: true, confirmText: '删除',
      onConfirm: function () { Store.deleteCategory(id).then(function () { toast('已删除'); renderMine(); renderHome(); }); }
    });
  }

  /* ---- 数据管理 ---- */
  function renderData() {
    var html = subHead('数据管理');
    html += '<div class="card" style="padding:14px;margin-bottom:14px;background:var(--brand-light);border-radius:var(--radius);font-size:13px;color:var(--brand-dark)">' +
      '🔒 数据只存储在本设备的浏览器中，无账号、无云端、不采集。清除浏览器数据会导致记录丢失，请定期导出备份。</div>';
    html += '<div class="card">' +
      dataItem('📄', '导出账单 CSV', '导出全部账单明细，可用 Excel / Numbers 打开', 'UI.exportCSV()') +
      dataItem('💾', '备份数据（JSON）', '导出完整数据包，用于备份或迁移', 'UI.exportJSON()') +
      dataItem('📥', '恢复备份', '从 JSON 文件导入，覆盖当前数据', 'UI.importJSON()') +
      '</div>';
    return html;
  }
  function dataItem(icon, title, sub, action) {
    return '<button class="mine-item" onclick="' + action + '" style="text-align:left">' +
      '<span class="mi-icon">' + icon + '</span>' +
      '<span style="flex:1"><div>' + title + '</div><div style="font-size:12px;color:var(--text-muted)">' + sub + '</div></span>' +
      '<span class="mi-arrow">›</span></button>';
  }
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  function exportCSV() {
    var csv = Store.exportCSV();
    download('轻账本账单_' + Store.today() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('已导出 CSV');
  }
  function exportJSON() {
    var json = JSON.stringify(Store.exportAll(), null, 2);
    download('轻账本备份_' + Store.today() + '.json', json, 'application/json');
    toast('已导出备份');
  }
  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var f = input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          showModal({
            title: '恢复备份？', body: '导入将覆盖当前全部数据，建议先导出备份。', danger: true, confirmText: '恢复',
            onConfirm: function () {
              Store.importAll(data).then(function () { toast('恢复成功'); renderMine(); renderHome(); renderFlow(); renderStats(); });
            }
          });
        } catch (e) { toast('文件格式无效'); }
      };
      reader.readAsText(f);
    };
    input.click();
  }

  /* ---- 设置 ---- */
  function renderSettings() {
    var s = Store.getSettings();
    var html = subHead('设置');
    html += '<div class="card">' +
      settingRow('主题', selectHTML('theme', [['light', '樱粉（浅色）'], ['dark', '深色'], ['system', '跟随系统']], s.theme)) +
      settingRow('货币符号', '<input class="input" id="set-currency" type="text" maxlength="4" value="' + esc(s.currency || '¥') + '" style="width:90px;text-align:center" />') +
      settingRow('一周起始日', selectHTML('weekStart', [['monday', '周一'], ['sunday', '周日']], s.weekStart)) +
      settingRow('默认账户', selectHTML('defaultAccountId', Store.getAccounts().map(function (a) { return [a.id, a.name]; }), s.defaultAccountId)) +
      '</div>';
    html += '<div style="margin-top:14px"><button class="btn btn-primary btn-block" onclick="UI.saveSettings()">保存设置</button></div>';
    return html;
  }
  function settingRow(label, control) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 2px;border-bottom:1px solid var(--divider)">' +
      '<span style="font-size:14px">' + label + '</span>' + control + '</div>';
  }
  function selectHTML(id, options, current) {
    return '<select class="select" id="set-' + id + '" style="width:130px;min-height:40px">' +
      options.map(function (o) {
        return '<option value="' + o[0] + '"' + (current === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
  }
  function saveSettings() {
    Store.updateSettings({
      theme: $('#set-theme').value,
      currency: $('#set-currency').value || '¥',
      weekStart: $('#set-weekStart').value,
      defaultAccountId: $('#set-defaultAccountId').value
    }).then(function () {
      toast('已保存');
      applyTheme();
      renderHome();
      goMine('menu');
    });
  }

  /* ---- 关于 ---- */
  function renderAbout() {
    var html = subHead('关于与隐私');
    html += '<div class="card">' +
      '<div style="text-align:center;padding:10px 0 16px">' +
      '<div style="font-size:48px">🌸</div>' +
      '<div style="font-size:20px;font-weight:700;margin-top:6px">轻账本</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-top:4px">打开即用 · 10秒记一笔 · 月底看报告</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:10px">V1.0</div>' +
      '</div></div>';
    html += '<div class="card" style="font-size:13px;color:var(--text-secondary);line-height:1.8">' +
      '<p>· 本产品为个人财务记账工具，数据仅存储在<b style="color:var(--text)">你当前设备的浏览器本地</b>。</p>' +
      '<p>· 无账号体系、无云端同步、不采集任何个人信息、不发起任何统计请求。</p>' +
      '<p>· 清除浏览器数据、更换设备会导致记录丢失，请通过「数据管理」定期导出备份。</p>' +
      '</div>';
    return html;
  }

  /* ---------- 空状态 ---------- */
  function emptyState(icon, text) {
    return '<div class="empty"><span class="empty-icon">' + icon + '</span><div class="empty-text">' + text.replace('\n', '<br/>') + '</div></div>';
  }

  /* ---------- Tab 切换 ---------- */
  function switchTab(tab) {
    ['home', 'flow', 'stats', 'mine'].forEach(function (t) {
      pages[t].classList.toggle('active', t === tab);
    });
    document.querySelectorAll('.tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });
    if (tab === 'home') renderHome();
    else if (tab === 'flow') renderFlow();
    else if (tab === 'stats') renderStats();
    else if (tab === 'mine') { mineView = 'menu'; renderMine(); }
    window.scrollTo(0, 0);
  }

  /* ---------- 导出 ---------- */
  return {
    switchTab: switchTab,
    renderHome: renderHome, renderFlow: renderFlow, renderStats: renderStats, renderMine: renderMine,
    applyTheme: applyTheme,
    setType: setType, onAmountInput: onAmountInput, onNoteInput: onNoteInput, saveEntry: saveEntry,
    openCategoryPicker: openCategoryPicker, pickCategory: pickCategory, _catBack: _catBack,
    openAccountPicker: openAccountPicker, pickAccount: pickAccount,
    openDatePicker: openDatePicker, _pickQuickDate: _pickQuickDate, _confirmDate: _confirmDate,
    openRangePicker: openRangePicker, _confirmRange: _confirmRange,
    _entryCatSelect: _entryCatSelect, _entryAccSelect: _entryAccSelect,
    _entryFromSelect: _entryFromSelect, _entryToSelect: _entryToSelect, _entryDateSelect: _entryDateSelect,
    setFlowType: setFlowType, onFlowSearch: onFlowSearch, clearFlowFilter: clearFlowFilter,
    openFlowCategory: openFlowCategory, openFlowAccount: openFlowAccount, openFlowRange: openFlowRange,
    openTxDetail: openTxDetail, deleteTx: deleteTx, openTxEdit: openTxEdit,
    onEditAmount: onEditAmount, _editPickCategory: _editPickCategory, saveTxEdit: saveTxEdit,
    setStatsRange: setStatsRange, setStatsScope: setStatsScope, setGranularity: setGranularity,
    drilldown: drilldown,
    goMine: goMine, openAccountForm: openAccountForm, saveAccountForm: saveAccountForm, deleteAccount: deleteAccount,
    _catMgmtType: _catMgmtType, openCategoryForm: openCategoryForm, saveCategoryForm: saveCategoryForm, deleteCategory: deleteCategory,
    exportCSV: exportCSV, exportJSON: exportJSON, importJSON: importJSON,
    saveSettings: saveSettings,
    closeSheet: closeSheet, _modalCancel: _modalCancel, _modalConfirm: _modalConfirm
  };
})();
