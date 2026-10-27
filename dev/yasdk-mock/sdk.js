/* Yandex Games SDK mock (docs/02-tech.md 6.4).
 * Served as /sdk.js in dev, preview and e2e by a Vite plugin; never part of dist/.
 * Behaviour is driven by the page address: ?mock_lang=en&mock_device=mobile&mock_ad=error ...
 * Every call lands in window.__YA_MOCK__.calls; every broken Yandex limit lands in
 * window.__YA_MOCK__.violations (and console.error) and the call itself fails.
 * Loads in Node too: `new Function('window', code)(fakeWindow)` with fakeWindow.location.search.
 */
(function (root) {
  'use strict';

  function parseQuery(search) {
    var out = {};
    var s = String(search || '').replace(/^\?/, '');
    if (!s) return out;
    s.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' ');
      var v = i < 0 ? '1' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    });
    return out;
  }
  function parseJson(text, fallback) {
    try { return text ? JSON.parse(text) : fallback; } catch (e) { return fallback; }
  }

  // M5-00: the producer link (build:pages) prepends __YA_MOCK_DEFAULTS__ — the truthful stand; the address still wins.
  var cfg = root.__YA_MOCK_CONFIG__ || Object.assign({}, root.__YA_MOCK_DEFAULTS__ || {}, parseQuery(root.location ? root.location.search : ''));
  if (cfg.banner === '1' || cfg.banner === '0') cfg.mock_banner = cfg.banner;
  var con = root.console || console;
  var lang = cfg.mock_lang || 'ru';
  var device = cfg.mock_device || 'desktop';
  var authorized = cfg.mock_auth === '1' && cfg.mock_player !== 'lite';
  var adMode = cfg.mock_ad || 'ok';
  var shortcutMode = cfg.mock_shortcut || 'unavailable';
  var initDelay = Number(cfg.mock_init_delay || 0) || 0;
  var timeOffset = Number(cfg.mock_time_offset || 0) || 0;
  var mocks = parseJson(cfg.mocks, {});
  var saveFailLeft = cfg.mock_save === 'fail' ? 3 : 0;
  var advanced = 0;

  var LIMIT_WINDOW_MS = 5 * 60 * 1000;
  // M5-00: ?mock_ad_ms=3000 — how long the dark «ad» screen stays (the producer link: 3 s, like a short real ad).
  var AD_SHOW_MS = Number(cfg.mock_ad_ms || 1500) || 1500;
  var AD_SLOW_OPEN_MS = 5000;
  var STARTUP_AD_MS = 2000;

  function now() { return Date.now() + timeOffset + advanced; }
  function later(fn, ms) { return root.setTimeout(fn, ms); }

  var calls = [];
  var violations = [];
  function record(name, args) { calls.push({ name: name, args: args || [], t: now() }); }
  function violate(message) {
    violations.push(message);
    con.error('[yasdk-mock] violation: ' + message);
    return new Error('yasdk-mock: ' + message);
  }
  function makeWindowLimiter(label, max) {
    var stamps = [];
    return function () {
      var t = now();
      stamps = stamps.filter(function (x) { return t - x < LIMIT_WINDOW_MS; });
      if (stamps.length >= max) return violate(label + ' called more than ' + max + ' times in 5 minutes');
      stamps.push(t);
      return null;
    };
  }

  var listeners = {};
  function on(event, cb) { record('on', [event]); (listeners[event] = listeners[event] || []).push(cb); }
  function off(event, cb) {
    record('off', [event]);
    var list = listeners[event] || [];
    var i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  }
  function dispatch(event, detail) {
    record('event:' + event, detail === undefined ? [] : [detail]);
    (listeners[event] || []).slice().forEach(function (cb) { try { cb(detail); } catch (e) { con.error(e); } });
  }

  // Player data persists across reloads like on the platform; a fresh browser context is a new player.
  var storage = root.localStorage || null;
  var PLAYER_KEY = '__yasdk_mock_player__';
  var playerData = {};
  var playerStats = {};
  try {
    if (storage) playerData = parseJson(storage.getItem(PLAYER_KEY), {}) || {};
  } catch (e) { playerData = {}; }
  function persistPlayer() {
    try { if (storage) storage.setItem(PLAYER_KEY, JSON.stringify(playerData)); } catch (e) { /* private mode */ }
  }

  var limitGetPlayer = makeWindowLimiter('getPlayer', 20);
  var limitSetData = makeWindowLimiter('setData', 100);
  var lastSetScore = {};

  var player = {
    getMode: function () { record('player.getMode'); return authorized ? '' : 'lite'; },
    isAuthorized: function () { record('player.isAuthorized'); return authorized; },
    getName: function () { record('player.getName'); return authorized ? 'Mock Player' : ''; },
    getPhoto: function (size) { record('player.getPhoto', [size]); return ''; },
    getUniqueID: function () { record('player.getUniqueID'); return authorized ? 'mock-player-1' : ''; },
    getIDsPerGame: function () { record('player.getIDsPerGame'); return Promise.resolve([]); },
    getPayingStatus: function () { record('player.getPayingStatus'); return 'unknown'; },
    getData: function (keys) {
      record('player.getData', keys ? [keys] : []);
      var out = {};
      var src = playerData;
      Object.keys(src).forEach(function (k) {
        if (!keys || keys.indexOf(k) >= 0) out[k] = JSON.parse(JSON.stringify(src[k]));
      });
      return Promise.resolve(out);
    },
    setData: function (data, flush) {
      record('player.setData', [data, !!flush]);
      var err = limitSetData();
      if (err) return Promise.reject(err);
      if (saveFailLeft > 0) { saveFailLeft -= 1; return Promise.reject(new Error('yasdk-mock: setData failed (mock_save=fail)')); }
      playerData = JSON.parse(JSON.stringify(data || {}));
      persistPlayer();
      return Promise.resolve();
    },
    getStats: function (keys) {
      record('player.getStats', keys ? [keys] : []);
      var out = {};
      Object.keys(playerStats).forEach(function (k) { if (!keys || keys.indexOf(k) >= 0) out[k] = playerStats[k]; });
      return Promise.resolve(out);
    },
    setStats: function (stats) { record('player.setStats', [stats]); playerStats = Object.assign({}, stats); return Promise.resolve(); },
    incrementStats: function (inc) {
      record('player.incrementStats', [inc]);
      Object.keys(inc).forEach(function (k) { playerStats[k] = (playerStats[k] || 0) + inc[k]; });
      return Promise.resolve(Object.assign({}, playerStats));
    },
  };

  var readyCalled = false;
  var gameplayState = 'stopped';
  var adBusy = false;

  // M5-00: a dark screen «Реклама» over everything, with seconds left; a rewarded one has «✕» to close it early (no reward).
  function showOverlay(kind, onEarlyClose) {
    var doc = root.document;
    if (!doc || !doc.body) return null;
    var el = doc.createElement('div');
    el.id = '__ya_mock_ad__';
    el.setAttribute('data-kind', kind);
    el.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(8,10,20,.96);color:#fff;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;font:600 24px/1.2 system-ui,sans-serif;';
    var title = doc.createElement('div');
    title.textContent = lang === 'ru' ? 'Реклама' : 'Ad';
    var left = doc.createElement('div');
    left.setAttribute('data-left', '');
    left.style.cssText = 'font-size:16px;opacity:.7;';
    el.appendChild(title);
    el.appendChild(left);
    var end = now() + AD_SHOW_MS;
    var tickId = root.setInterval ? root.setInterval(function () { left.textContent = String(Math.max(0, Math.ceil((end - now()) / 1000))); }, 200) : 0;
    left.textContent = String(Math.ceil(AD_SHOW_MS / 1000));
    el.__stop = function () { if (root.clearInterval) root.clearInterval(tickId); };
    if (onEarlyClose) {
      var x = doc.createElement('button');
      x.type = 'button';
      x.setAttribute('data-ad-close', '');
      x.textContent = '\u2715';
      x.style.cssText = 'position:absolute;top:12px;right:12px;width:44px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,.18);color:#fff;font:600 20px system-ui,sans-serif;cursor:pointer;';
      x.addEventListener('click', function (e) { e.stopPropagation(); onEarlyClose(); });
      el.appendChild(x);
    }
    // Over everything, the banner too (the platform's ad covers the whole page).
    doc.documentElement.appendChild(el);
    return el;
  }
  function hideOverlay(el) { if (el && el.__stop) el.__stop(); if (el && el.parentNode) el.parentNode.removeChild(el); }

  function callbacksOf(opts) { return (opts && opts.callbacks) || {}; }
  function safe(fn, arg) { if (typeof fn === 'function') { try { fn(arg); } catch (e) { con.error(e); } } }

  function showFullscreenAdv(opts) {
    record('adv.showFullscreenAdv');
    var cb = callbacksOf(opts);
    if (adBusy) { later(function () { safe(cb.onError, new Error('yasdk-mock: another ad is open')); safe(cb.onClose, false); }, 0); return; }
    if (adMode === 'error') { later(function () { safe(cb.onError, new Error('yasdk-mock: ad error')); safe(cb.onClose, false); }, 0); return; }
    if (adMode === 'noshow') { later(function () { safe(cb.onClose, false); }, 0); return; }
    adBusy = true;
    var openDelay = adMode === 'slow' ? AD_SLOW_OPEN_MS : 0;
    dispatch('game_api_pause');
    later(function () {
      var el = showOverlay('fullscreen');
      safe(cb.onOpen);
      later(function () {
        hideOverlay(el);
        adBusy = false;
        safe(cb.onClose, true);
        dispatch('game_api_resume');
      }, AD_SHOW_MS);
    }, openDelay);
  }

  function showRewardedVideo(opts) {
    record('adv.showRewardedVideo');
    var cb = callbacksOf(opts);
    if (adBusy) { later(function () { safe(cb.onError, new Error('yasdk-mock: another ad is open')); safe(cb.onClose); }, 0); return; }
    if (adMode === 'error') { later(function () { safe(cb.onError, new Error('yasdk-mock: ad error')); safe(cb.onClose); }, 0); return; }
    if (adMode === 'noshow') { later(function () { safe(cb.onClose); }, 0); return; }
    adBusy = true;
    var openDelay = adMode === 'slow' ? AD_SLOW_OPEN_MS : 0;
    dispatch('game_api_pause');
    later(function () {
      var finished = false;
      // mock_ad=late: onRewarded comes after onClose (the real SDK may be late on a slow network).
      function finish(rewarded) {
        if (finished) return;
        finished = true;
        hideOverlay(el);
        adBusy = false;
        if (rewarded && adMode !== 'late') safe(cb.onRewarded);
        safe(cb.onClose);
        if (rewarded && adMode === 'late') later(function () { safe(cb.onRewarded); }, 400);
        dispatch('game_api_resume');
      }
      var el = showOverlay('rewarded', function () { record('adv.closeEarly'); finish(false); });
      safe(cb.onOpen);
      later(function () { finish(adMode !== 'closenoreward'); }, AD_SHOW_MS);
    }, openDelay);
  }

  // M5-00: the sticky banner stand-in. ?mock_banner=1 — on; auto — on a computer only (right, 160 px), off on a phone
  // (Q-046). The platform narrows the game frame itself: here the page body gives the banner its strip, the game relayouts.
  var BANNER_W = 160;
  var BANNER_H = 56;
  function coarse() {
    try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }
  var bannerWanted = cfg.mock_banner === '1' || (cfg.mock_banner === 'auto' && !coarse());
  var bannerOn = false;
  var hiddenByGame = false;
  var bannerEl = null;
  function setBanner(on) {
    var doc = root.document;
    if (!doc || !doc.body || on === bannerOn) return;
    bannerOn = on;
    var bottom = coarse() && cfg.mock_banner === '1';
    if (on) {
      bannerEl = doc.createElement('div');
      bannerEl.id = '__ya_mock_banner__';
      bannerEl.style.cssText = 'position:fixed;z-index:99999;background:#20232e;color:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font:600 14px/1.2 system-ui,sans-serif;' +
        (bottom ? 'left:0;right:0;bottom:0;height:' + BANNER_H + 'px;' : 'top:0;right:0;bottom:0;width:' + BANNER_W + 'px;');
      bannerEl.textContent = lang === 'ru' ? 'Баннер' : 'Banner';
      doc.documentElement.appendChild(bannerEl);
      // index.html gives body width and height 100%: the size itself shrinks, the way the platform shrinks the game frame.
      if (bottom) doc.body.style.height = 'calc(100% - ' + BANNER_H + 'px)';
      else doc.body.style.width = 'calc(100% - ' + BANNER_W + 'px)';
    } else {
      if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
      bannerEl = null;
      doc.body.style.width = '';
      doc.body.style.height = '';
    }
    try { root.dispatchEvent(new root.Event('resize')); } catch (e) { /* Node */ }
  }
  // ?mock_fullscreen=tap: the whole screen on the first tap, if the page is not full screen yet (the platform frame does it).
  if (cfg.mock_fullscreen === 'tap' && root.document && root.addEventListener) {
    var asked = false;
    root.addEventListener('pointerdown', function () {
      if (asked) return;
      asked = true;
      var d = root.document;
      var de = d.documentElement;
      if (d.fullscreenElement || !de.requestFullscreen) return;
      record('mock.fullscreen');
      de.requestFullscreen().catch(function () { /* refused: the game runs in the window */ });
    }, true);
  }

  var boards = {};
  var leaderboards = {
    getDescription: function (name) {
      record('leaderboards.getDescription', [name]);
      return Promise.resolve({ appID: '0', default: true, description: { invert_sort_order: false, score_format: { type: 'numeric', options: { decimal_offset: 0 } } }, name: name, title: { ru: name, en: name } });
    },
    setScore: function (name, score, extraData) {
      record('leaderboards.setScore', [name, score, extraData]);
      var t = now();
      if (lastSetScore[name] !== undefined && t - lastSetScore[name] < 1000) {
        return Promise.reject(violate('setScore(' + name + ') called more than once per second'));
      }
      lastSetScore[name] = t;
      boards[name] = { score: score, extraData: extraData };
      return Promise.resolve();
    },
    getPlayerEntry: function (name) {
      record('leaderboards.getPlayerEntry', [name]);
      var b = boards[name];
      if (!b) return Promise.reject(new Error('yasdk-mock: no entry'));
      return Promise.resolve({ score: b.score, extraData: b.extraData, rank: 1, player: { uniqueID: 'mock-player-1', publicName: 'Mock Player', lang: lang, scopePermissions: { avatar: 'allow', public_name: 'allow' }, getAvatarSrc: function () { return ''; }, getAvatarSrcSet: function () { return ''; } }, formattedScore: String(b.score) });
    },
    getEntries: function (name, opts) {
      record('leaderboards.getEntries', [name, opts]);
      var b = boards[name];
      var entries = b ? [{ score: b.score, extraData: b.extraData, rank: 1, player: { uniqueID: 'mock-player-1', publicName: 'Mock Player', lang: lang, scopePermissions: { avatar: 'allow', public_name: 'allow' }, getAvatarSrc: function () { return ''; }, getAvatarSrcSet: function () { return ''; } }, formattedScore: String(b.score) }] : [];
      return Promise.resolve({ leaderboard: { name: name }, ranges: [{ start: 0, size: entries.length }], userRank: b ? 1 : 0, entries: entries });
    },
  };

  // M5-05: payments. ?mock_pay=ok|cancel|error; the catalog is ?mock_catalog=id:price,... (prices in «YAN», like the console);
  // unconsumed purchases persist per browser like on the platform (getPurchases() at start restores «no ads»).
  var PAY_KEY = '__yasdk_mock_purchases__';
  var payMode = cfg.mock_pay || 'ok';
  var purchases = [];
  try { if (storage) purchases = parseJson(storage.getItem(PAY_KEY), []) || []; } catch (e) { purchases = []; }
  function persistPurchases() { try { if (storage) storage.setItem(PAY_KEY, JSON.stringify(purchases)); } catch (e) { /* private mode */ } }
  var tokenSeq = 0;
  var payments = {
    getCatalog: function () {
      record('payments.getCatalog');
      var list = String(cfg.mock_catalog || '').split(',').filter(Boolean).map(function (pair) {
        var i = pair.indexOf(':');
        var id = i < 0 ? pair : pair.slice(0, i);
        var price = i < 0 ? '0' : pair.slice(i + 1);
        return { id: id, title: id, description: '', imageURI: '', price: price + ' YAN', priceValue: price, priceCurrencyCode: 'YAN', getPriceCurrencyImage: function () { return ''; } };
      });
      return Promise.resolve(list);
    },
    purchase: function (opts) {
      var id = opts && opts.id;
      record('payments.purchase', [id]);
      if (payMode === 'cancel') return Promise.reject(new Error('yasdk-mock: purchase cancelled (mock_pay=cancel)'));
      if (payMode === 'error') return Promise.reject(new Error('yasdk-mock: purchase failed (mock_pay=error)'));
      var p = { productID: id, purchaseToken: 'mock-token-' + (++tokenSeq) + '-' + now(), developerPayload: (opts && opts.developerPayload) || '' };
      purchases.push(p);
      persistPurchases();
      return Promise.resolve(p);
    },
    getPurchases: function () { record('payments.getPurchases'); return Promise.resolve(purchases.slice()); },
    consumePurchase: function (token) {
      record('payments.consumePurchase', [token]);
      purchases = purchases.filter(function (p) { return p.purchaseToken !== token; });
      persistPurchases();
      return Promise.resolve();
    },
  };

  var safeStorage = {
    _m: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem: function (k, v) { this._m[k] = String(v); },
    removeItem: function (k) { delete this._m[k]; },
    clear: function () { this._m = {}; },
    key: function (i) { return Object.keys(this._m)[i] || null; },
    get length() { return Object.keys(this._m).length; },
  };

  var sdk = {
    EVENTS: { EXIT: 'EXIT', HISTORY_BACK: 'HISTORY_BACK', ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED', ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED' },
    environment: {
      app: { id: '0' },
      browser: { lang: lang },
      i18n: { lang: lang, tld: lang === 'ru' ? 'ru' : 'com' },
      payload: cfg.payload || '',
      mocks: mocks,
    },
    deviceInfo: {
      type: device,
      isMobile: function () { return device === 'mobile'; },
      isDesktop: function () { return device === 'desktop'; },
      isTablet: function () { return device === 'tablet'; },
      isTV: function () { return device === 'tv'; },
    },
    features: {
      LoadingAPI: {
        ready: function () {
          record('LoadingAPI.ready');
          if (readyCalled) throw violate('LoadingAPI.ready() called twice');
          readyCalled = true;
        },
      },
      GameplayAPI: {
        start: function () { record('GameplayAPI.start'); gameplayState = 'started'; },
        stop: function () { record('GameplayAPI.stop'); gameplayState = 'stopped'; },
      },
    },
    adv: {
      showFullscreenAdv: showFullscreenAdv,
      showRewardedVideo: showRewardedVideo,
      getBannerAdvStatus: function () { record('adv.getBannerAdvStatus'); return Promise.resolve(bannerOn ? { stickyAdvIsShowing: true } : { stickyAdvIsShowing: false, reason: 'ADV_IS_NOT_CONNECTED' }); },
      showBannerAdv: function () { record('adv.showBannerAdv'); hiddenByGame = false; if (bannerWanted) setBanner(true); return Promise.resolve(bannerOn ? { stickyAdvIsShowing: true } : { stickyAdvIsShowing: false, reason: 'ADV_IS_NOT_CONNECTED' }); },
      hideBannerAdv: function () { record('adv.hideBannerAdv'); hiddenByGame = true; setBanner(false); return Promise.resolve({ stickyAdvIsShowing: false }); },
    },
    on: on,
    off: off,
    dispatchEvent: function (name, detail) { record('dispatchEvent', [name]); dispatch(name, detail); return Promise.resolve(); },
    getPlayer: function (opts) {
      record('getPlayer', opts ? [opts] : []);
      var err = limitGetPlayer();
      if (err) return Promise.reject(err);
      return Promise.resolve(player);
    },
    getPayments: function (opts) { record('getPayments', opts ? [opts] : []); return Promise.resolve(payments); },
    getStorage: function () { record('getStorage'); return Promise.resolve(safeStorage); },
    getFlags: function (params) {
      record('getFlags', params ? [params] : []);
      if (cfg.mock_flags === 'error') return Promise.reject(new Error('yasdk-mock: getFlags failed'));
      var defaults = (params && params.defaultFlags) || {};
      var remote = parseJson(cfg.mock_flags, {}) || {};
      var out = {};
      Object.keys(defaults).forEach(function (k) { out[k] = String(defaults[k]); });
      Object.keys(remote).forEach(function (k) { out[k] = String(remote[k]); });
      return Promise.resolve(out);
    },
    leaderboards: leaderboards,
    // M4-04: the sign-in dialog — the mock signs the player in at once (mock_auth=1 starts signed in).
    auth: {
      openAuthDialog: function () { record('auth.openAuthDialog'); authorized = true; return Promise.resolve(); },
    },
    getLeaderboards: function () { record('getLeaderboards'); return Promise.resolve(leaderboards); },
    // ?mock_shortcut=accepted|rejected|unavailable: the desktop shortcut prompt.
    shortcut: {
      canShowPrompt: function () { record('shortcut.canShowPrompt'); return Promise.resolve({ canShow: shortcutMode !== 'unavailable' }); },
      showPrompt: function () { record('shortcut.showPrompt'); return Promise.resolve({ outcome: shortcutMode === 'accepted' ? 'accepted' : 'rejected' }); },
    },
    feedback: {
      canReview: function () { record('feedback.canReview'); return Promise.resolve({ value: true }); },
      requestReview: function () { record('feedback.requestReview'); return Promise.resolve({ feedbackSent: true }); },
    },
    clipboard: { writeText: function (text) { record('clipboard.writeText', [text]); } },
    // S-09: the platform frame's whole screen is the browser's on the producer link (Pages has no frame): request() asks the Fullscreen
    // API, status follows it.
    screen: { fullscreen: {
      STATUS_ON: 'on', STATUS_OFF: 'off',
      get status() { var d = root.document; return d && d.fullscreenElement ? 'on' : 'off'; },
      request: function () {
        record('screen.fullscreen.request');
        var de = root.document && root.document.documentElement;
        if (!de || !de.requestFullscreen || root.document.fullscreenElement) return Promise.resolve();
        return de.requestFullscreen({ navigationUI: 'hide' }).catch(function () { /* refused: the game stays in the window */ });
      },
      exit: function () { record('screen.fullscreen.exit'); var d = root.document; return d && d.fullscreenElement && d.exitFullscreen ? d.exitFullscreen() : Promise.resolve(); }
    } },
    serverTime: function () { record('serverTime'); return now(); },
    isAvailableMethod: function (name) { record('isAvailableMethod', [name]); return Promise.resolve(true); },
    gameplayState: function () { return gameplayState; },
  };

  root.__YA_MOCK__ = {
    config: cfg,
    sdk: sdk,
    calls: calls,
    violations: violations,
    now: now,
    advance: function (ms) { advanced += Number(ms) || 0; },
    reset: function () { calls.length = 0; violations.length = 0; },
    isAdOpen: function () { return adBusy; },
    get bannerOn() { return bannerOn; },
    get readyCalled() { return readyCalled; },
    get playerData() { return playerData; },
  };

  root.YaGames = {
    init: function (opts) {
      record('init', opts ? [opts] : []);
      return new Promise(function (resolve) {
        later(function () {
          resolve(sdk);
          // The sticky banner of the console shows by itself once the game is up (the producer turns it on there).
          if (bannerWanted && root.document) later(function () { if (!hiddenByGame) setBanner(true); }, 0);
          if (cfg.mock_startup_ad === '1') {
            later(function () {
              dispatch('game_api_pause');
              later(function () { dispatch('game_api_resume'); }, STARTUP_AD_MS);
            }, 0);
          }
        }, initDelay);
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
