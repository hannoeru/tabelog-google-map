// ==UserScript==
// @name         Tabelog Restaurant Name Google Maps
// @namespace    https://github.com/hannoeru/tabelog-google-map
// @version      0.1.0
// @description  Add a Google Maps button to Tabelog restaurant pages using the restaurant name as the search query.
// @author       hannoeru
// @match        https://tabelog.com/*
// @match        https://*.tabelog.com/*
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (!/(^|\.)tabelog\.com$/.test(window.location.hostname)) return;

  const BUTTON_ID = 'tgm-open-by-name';
  const DEBUG_KEY = 'tgmDebug';
  const actionPanelSelector = '.rdheader-action-wrap .p-btn-bkm-actionpanel__action';
  const titleActionSelector = '.rdheader-rstname';

  const nameSelectors = [
    'h2.display-name span',
    'h2.display-rst-name',
    '.rdheader-rstname',
    '.rstinfo-rstname',
    '.rstinfo-table__name',
    'h1',
  ];

  const anchorSelectors = [
    'h2.display-name',
    'h2.display-rst-name',
    '.rdheader-rstname',
    '.rstinfo-rstname',
    '.rstinfo-table__name',
    'h1',
  ];

  function isDebugEnabled() {
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  }

  function debug(...args) {
    if (isDebugEnabled()) console.debug('[tgm]', ...args);
  }

  function warn(...args) {
    console.warn('[tgm]', ...args);
  }

  function textFromSelector(selector) {
    const node = document.querySelector(selector);
    return node ? node.textContent.trim() : '';
  }

  function metaContent(selector) {
    const node = document.querySelector(selector);
    return node ? node.content.trim() : '';
  }

  function cleanRestaurantName(value) {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\s[-|].*$/, '')
      .replace(/\s\(.+\)$/, '')
      .trim();
  }

  function getRestaurantNameFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        const restaurant = items.find((item) => item && item['@type'] === 'Restaurant' && item.name);

        if (restaurant) {
          const name = cleanRestaurantName(restaurant.name);
          debug('name from JSON-LD', name);
          return name;
        }
      } catch {
        // Ignore unrelated or malformed JSON-LD blocks.
      }
    }

    return '';
  }

  function getRestaurantName() {
    const jsonLdName = getRestaurantNameFromJsonLd();
    if (jsonLdName) return jsonLdName;

    for (const selector of nameSelectors) {
      const name = cleanRestaurantName(textFromSelector(selector));
      if (name) {
        debug('name from selector', selector, name);
        return name;
      }
    }

    const ogTitle = cleanRestaurantName(metaContent('meta[property="og:title"]'));
    if (ogTitle) {
      debug('name from og:title', ogTitle);
      return ogTitle;
    }

    const titleName = cleanRestaurantName(document.title);
    debug('name from document.title', titleName);
    return titleName;
  }

  function getAnchor() {
    const actionPanel = document.querySelector(actionPanelSelector);
    if (actionPanel) {
      debug('anchor from action panel', actionPanel);
      return actionPanel;
    }

    const titleAction = document.querySelector(titleActionSelector);
    if (titleAction) {
      debug('anchor from restaurant header', titleAction);
      return titleAction;
    }

    for (const selector of anchorSelectors) {
      const node = document.querySelector(selector);
      if (node) {
        debug('anchor from selector', selector, node);
        return node;
      }
    }

    debug('anchor fallback to document.body');
    return document.body;
  }

  function openMapsByName(name) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, { active: true, insert: true });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function createButton(name) {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'c-btn-visit__target';
    button.textContent = '地図';
    button.title = `Open Google Maps search for "${name}"`;
    button.addEventListener('click', () => openMapsByName(getRestaurantName()));
    return button;
  }

  function installStyles() {
    if (document.getElementById(`${BUTTON_ID}-style`)) return;

    const style = document.createElement('style');
    style.id = `${BUTTON_ID}-style`;
    style.textContent = `
      .tgm-action {
        display: inline-block;
      }

      .tgm-action--inline {
        margin-left: 10px;
        vertical-align: middle;
      }

      .tgm-action-button {
        position: relative;
        display: inline-block;
      }

      .p-btn-bkm-actionpanel__action {
        justify-content: flex-start !important;
        gap: 4px;
      }

      .p-btn-bkm-actionpanel__action .p-btn-bkm-actionpanel__item {
        margin: 0 !important;
      }

      .p-btn-bkm-actionpanel__action .tgm-action {
        flex: 0 0 62px !important;
        width: 62px !important;
      }

      .p-btn-bkm-actionpanel__action .c-btn-save__target {
        min-width: 62px;
      }

      #${BUTTON_ID} {
        appearance: none;
        display: inline-block;
        box-sizing: border-box;
        width: 62px;
        height: 31px;
        border: 1px solid #d2d2d2;
        border-radius: 4px;
        background: #fff;
        color: #595960;
        cursor: pointer;
        font: 700 12px/12px Meiryo, "Hiragino Sans", "Hiragino Kaku Gothic Pro", "MS PGothic", "Helvetica Neue", Helvetica, Arial, sans-serif;
        position: relative;
        padding: 9px 2px 8px 16px;
        text-align: center;
        vertical-align: middle;
        white-space: nowrap;
      }

      #${BUTTON_ID}:hover {
        background: #f8f8f8;
        border-color: #b8b8b8;
      }

      #${BUTTON_ID}:focus-visible {
        outline: 3px solid rgba(89, 89, 96, 0.25);
        outline-offset: 2px;
      }
    `;
    document.head.append(style);
  }

  function installButton() {
    if (document.getElementById(BUTTON_ID)) {
      debug('button already installed');
      return;
    }

    const name = getRestaurantName();
    if (!name) {
      warn('could not install button because no restaurant name was found');
      return;
    }

    installStyles();

    const anchor = getAnchor();
    const button = createButton(name);
    debug('installing button', { name, anchor });

    if (anchor === document.body) {
      button.style.position = 'fixed';
      button.style.right = '16px';
      button.style.bottom = '16px';
      button.style.zIndex = '2147483647';
      document.body.append(button);
      return;
    }

    if (anchor.matches(actionPanelSelector)) {
      const item = document.createElement('div');
      const inner = document.createElement('div');
      item.className = 'p-btn-bkm-actionpanel__item tgm-action';
      inner.className = 'tgm-action-button';
      inner.append(button);
      item.append(inner);
      anchor.prepend(item);
      return;
    }

    if (anchor.matches(titleActionSelector)) {
      const item = document.createElement('span');
      item.className = 'tgm-action tgm-action--inline';
      item.append(button);
      anchor.append(item);
      return;
    }

    button.style.marginLeft = '10px';
    anchor.insertAdjacentElement('afterend', button);
  }

  debug('loaded', {
    href: window.location.href,
    hostname: window.location.hostname,
    readyState: document.readyState,
  });

  installButton();

  const observer = new MutationObserver(() => installButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
