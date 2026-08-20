/* ==========================================================================
   app.js — 入口：初始化、Tab 路由、遮罩关闭、Service Worker 注册
   ========================================================================== */
(function () {
  'use strict';

  function bootstrap() {
    Store.init().then(function () {
      UI.applyTheme();
      bindTabs();
      bindOverlay();
      UI.renderHome();
      registerSW();
    }).catch(function (err) {
      // 初始化失败也尽量渲染，避免白屏
      console.error('初始化失败：', err);
      bindTabs();
      bindOverlay();
      UI.renderHome();
    });
  }

  function bindTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (el) {
      el.addEventListener('click', function () {
        UI.switchTab(el.getAttribute('data-tab'));
      });
    });
  }

  function bindOverlay() {
    var overlay = document.getElementById('overlay');
    overlay.addEventListener('click', function () {
      document.getElementById('sheet').hidden = true;
      document.getElementById('modal').hidden = true;
      overlay.hidden = true;
    });
  }

  function registerSW() {
    // file:// 协议下不注册 Service Worker
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 忽略注册失败 */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
