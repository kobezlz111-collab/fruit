/* ==========================================================================
   charts.js — 手写 SVG 图表（零依赖）
   环形图（分类占比）、分组柱状图（收支趋势）。
   颜色取自 PRD 第七章图表色板。
   全局对象：window.Charts
   ========================================================================== */
window.Charts = (function () {
  'use strict';

  // 分类色板（固定顺序，第 9 项折入「其他」）
  var PALETTE = ['#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#E6B9E3', '#F6D365'];
  var OTHER_COLOR = '#D8C7CE';
  var COLOR_INCOME = '#FF8A5C';
  var COLOR_EXPENSE = '#6FC7A1';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // 金额缩写：12345 -> 1.2万
  function formatShort(v) {
    v = v || 0;
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    return Math.round(v).toString();
  }

  /* ================= 环形图 =================
     items: [{ name, value, color? }]
     total: 总金额；centerTitle/centerValue: 中心文字 */
  function renderDonut(container, items, total, centerTitle, centerValue) {
    var size = 168;
    var cx = size / 2, cy = size / 2;
    var r = 64, strokeW = 26;
    var circ = 2 * Math.PI * r;

    if (!items || items.length === 0 || total <= 0) {
      container.innerHTML =
        '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#F5E6EB" stroke-width="' + strokeW + '"/>' +
        '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#C4B4BC">暂无数据</text>' +
        '</svg>';
      return;
    }

    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#F5E6EB" stroke-width="' + strokeW + '"/>';

    var offset = 0;
    var gap = 1.6; // 段间间隙（沿圆周，近似 px）
    items.forEach(function (it, i) {
      var frac = it.value / total;
      var segLen = frac * circ;
      var dashLen = Math.max(0, segLen - gap);
      var color = it.color || PALETTE[i % PALETTE.length];
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color +
        '" stroke-width="' + strokeW + '" stroke-dasharray="' + dashLen.toFixed(2) + ' ' + (circ - dashLen).toFixed(2) +
        '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      offset += segLen;
    });

    svg += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="12" fill="#8A7580">' + esc(centerTitle || '') + '</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" font-size="17" font-weight="700" fill="#4E3B44">' + esc(centerValue || '') + '</text>';
    svg += '</svg>';

    container.innerHTML = svg;
  }

  /* ================= 分组柱状图 =================
     data: [{ label, income, expense }] */
  function renderBars(container, data) {
    var plotH = 150, padT = 16, padB = 26, padL = 40, padR = 8;
    var n = data.length;
    var groupW = Math.max(36, 320 / Math.max(1, n)); // 每桶最小 36px，超出可横向滚动
    var width = Math.max(320, padL + padR + n * groupW);
    var height = padT + plotH + padB;

    var maxVal = 1;
    data.forEach(function (d) { maxVal = Math.max(maxVal, d.income, d.expense); });
    maxVal = niceMax(maxVal);

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '" preserveAspectRatio="xMidYMid meet" style="min-width:' + width + 'px">';

    // y 轴网格 + 刻度
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var val = maxVal * t / ticks;
      var y = padT + plotH - (val / maxVal) * plotH;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y.toFixed(1) + '" stroke="#F5E6EB" stroke-width="1"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="#C4B4BC">' + formatShort(val) + '</text>';
    }

    var barW = Math.min(14, groupW * 0.3);

    data.forEach(function (d, i) {
      var xc = padL + i * groupW + groupW / 2;
      // 支出柱（左）
      var hE = (d.expense / maxVal) * plotH;
      var yE = padT + plotH - hE;
      svg += '<rect x="' + (xc - barW - 1).toFixed(1) + '" y="' + yE.toFixed(1) + '" width="' + barW + '" height="' + hE.toFixed(1) +
        '" rx="3" fill="' + COLOR_EXPENSE + '"><title>支出 ' + d.label + '：¥' + d.expense.toFixed(2) + '</title></rect>';
      // 收入柱（右）
      var hI = (d.income / maxVal) * plotH;
      var yI = padT + plotH - hI;
      svg += '<rect x="' + (xc + 1).toFixed(1) + '" y="' + yI.toFixed(1) + '" width="' + barW + '" height="' + hI.toFixed(1) +
        '" rx="3" fill="' + COLOR_INCOME + '"><title>收入 ' + d.label + '：¥' + d.income.toFixed(2) + '</title></rect>';

      // x 轴标签（抽稀：≤8 个全显示，否则隔个显示）
      var showLabel = n <= 8 || i % Math.ceil(n / 8) === 0;
      if (showLabel) {
        svg += '<text x="' + xc + '" y="' + (padT + plotH + 16) + '" text-anchor="middle" font-size="10" fill="#C4B4BC">' + esc(d.label) + '</text>';
      }
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  // 把最大值取整到一个「好看」的数
  function niceMax(v) {
    if (v <= 0) return 1;
    var exp = Math.floor(Math.log10(v));
    var base = Math.pow(10, exp);
    var m = v / base;
    var nice;
    if (m <= 1) nice = 1; else if (m <= 2) nice = 2; else if (m <= 5) nice = 5; else nice = 10;
    return nice * base;
  }

  return {
    PALETTE: PALETTE,
    OTHER_COLOR: OTHER_COLOR,
    renderDonut: renderDonut,
    renderBars: renderBars,
    formatShort: formatShort
  };
})();
