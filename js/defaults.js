/* ==========================================================================
   defaults.js — 默认账户与预设分类
   首次运行由 store.js 写入数据库。
   全局对象：window.Defaults
   ========================================================================== */
window.Defaults = (function () {
  'use strict';

  function id(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 账户（PRD F3） ---------- */
  var ACCOUNT_DEFS = [
    { type: 'cash',    name: '现金',   icon: '💵' },
    { type: 'wechat',  name: '微信',   icon: '💬' },
    { type: 'alipay',  name: '支付宝', icon: '💙' },
    { type: 'bank',    name: '银行卡', icon: '🏦' },
    { type: 'credit',  name: '信用卡', icon: '💳' }
  ];

  function buildAccounts() {
    return ACCOUNT_DEFS.map(function (a, i) {
      return {
        id: id('acc'),
        name: a.name,
        type: a.type,
        icon: a.icon,
        initialBalance: 0,
        sort: i,
        isHidden: false
      };
    });
  }

  /* ---------- 分类（PRD F4.1） ---------- */
  // 支出：一级分类 -> 二级分类（emoji 图标）
  var EXPENSE_DEFS = [
    { name: '餐饮', icon: '🍜', subs: [['三餐', '🍚'], ['外卖', '🥡'], ['饮品', '🧋'], ['零食', '🍿']] },
    { name: '交通', icon: '🚗', subs: [['公交地铁', '🚇'], ['打车', '🚕'], ['加油', '⛽'], ['停车', '🅿️']] },
    { name: '购物', icon: '🛍️', subs: [['日用百货', '🧻'], ['服饰', '👗'], ['数码', '📱'], ['美妆', '💄']] },
    { name: '居住', icon: '🏠', subs: [['房租', '🔑'], ['水电燃气', '💡'], ['物业', '🧾'], ['家居', '🛋️']] },
    { name: '娱乐', icon: '🎮', subs: [['电影', '🎬'], ['游戏', '🎮'], ['旅游', '✈️'], ['运动', '⚽']] },
    { name: '医疗', icon: '🏥', subs: [['药品', '💊'], ['门诊', '🩺'], ['体检', '🩻']] },
    { name: '教育', icon: '📚', subs: [['课程', '📖'], ['书籍', '📚'], ['培训', '🎓']] },
    { name: '人情', icon: '🎁', subs: [['送礼', '🎁'], ['红包', '🧧'], ['聚会', '🎉']] },
    { name: '通讯', icon: '📱', subs: [['话费', '📞'], ['网费', '📡']] },
    { name: '其他', icon: '📦', subs: [] }
  ];

  // 收入：一级分类（无二级）
  var INCOME_DEFS = [
    ['工资', '💰'], ['奖金', '🏆'], ['理财', '📈'], ['兼职', '💼'],
    ['礼金', '🧧'], ['报销', '🧾'], ['其他', '💵']
  ];

  function buildCategories() {
    var cats = [];
    var sort = 0;

    EXPENSE_DEFS.forEach(function (top) {
      var topId = id('cat');
      cats.push({
        id: topId, name: top.name, type: 'expense', icon: top.icon,
        parentId: null, isSystem: true, isHidden: false, sort: sort++, useCount: 0
      });
      top.subs.forEach(function (sub, i) {
        cats.push({
          id: id('cat'), name: sub[0], type: 'expense', icon: sub[1],
          parentId: topId, isSystem: true, isHidden: false, sort: i, useCount: 0
        });
      });
    });

    INCOME_DEFS.forEach(function (def, i) {
      cats.push({
        id: id('cat'), name: def[0], type: 'income', icon: def[1],
        parentId: null, isSystem: true, isHidden: false, sort: i, useCount: 0
      });
    });

    return cats;
  }

  return {
    id: id,
    buildAccounts: buildAccounts,
    buildCategories: buildCategories
  };
})();
