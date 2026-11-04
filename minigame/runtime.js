'use strict';
const createNativeAudioClass = require('./native-audio');

// Native wx canvas/touch/audio lifecycle. Core modules receive a small, private host facade;
// no browser DOM, web-view, network request or injected global window is needed.
module.exports = function createRuntime(wx, frameApi, createCore) {
  const W = 430, H = 760;
  const screen = wx.createCanvas(); // The first wx canvas is the visible main canvas.
  const stage = wx.createCanvas();
  const context = screen.getContext('2d');
  const touches = new Map(), keyboard = new Set(), cleanups = [];
  let game, layout, disposed = false, started = false, frameId = null, lastState = 'title';
  const clock = wx.getPerformance ? wx.getPerformance() : null;
  // wx.getPerformance uses microseconds; the existing game clock uses milliseconds.
  const performance = { now: () => clock ? clock.now() / 1000 : Date.now() };
  function events() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      emit(type, event = {}) { (listeners.get(type) || []).forEach(fn => fn(event)); }
    };
  }
  const document = Object.assign(events(), { hidden: false, querySelector: () => null, querySelectorAll: () => [] });
  const window = Object.assign(events(), {
    document, navigator: {},
    localStorage: { getItem: key => wx.getStorageSync(key), setItem: (key, value) => wx.setStorageSync(key, value) }
  });
  if (wx.createWebAudioContext) window.AudioContext = function NativeAudioContext() { return wx.createWebAudioContext(); };
  function schedule(callback) {
    if (disposed || document.hidden) return null;
    frameId = frameApi.requestAnimationFrame(() => { frameId = null; if (!disposed && !document.hidden) callback(performance.now()); });
    return frameId;
  }
  function readLayout() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = info.windowWidth, height = info.windowHeight, offset = info.screenTop || 0;
    const safe = info.safeArea || { left: 0, right: width, top: info.statusBarHeight || 0, bottom: height + offset };
    let capsule = null;
    try { if (wx.getMenuButtonBoundingClientRect) capsule = wx.getMenuButtonBoundingClientRect(); } catch (_) { /* desktop may not expose a capsule */ }
    const top = Math.max(0, safe.top - offset, capsule && capsule.bottom > 0 ? capsule.bottom - offset + 8 : 0);
    const bottom = Math.min(height, safe.bottom - offset);
    const left = Math.max(0, safe.left || 0), right = Math.min(width, safe.right || width);
    const scale = Math.max(.1, Math.min((right - left) / W, (bottom - top) / H));
    const density = Math.min(info.pixelRatio || 1, 2.5);
    layout = { width, height, scale, density, x: left + (right - left - W * scale) / 2, y: top + (bottom - top - H * scale) / 2 };
    screen.width = Math.round(width * density); screen.height = Math.round(height * density);
    window.devicePixelRatio = density;
    stage.getBoundingClientRect = () => ({ width: W * scale, height: H * scale });
    if (game) { resetInput(); window.emit('resize'); game.draw(); }
  }
  readLayout();
  createCore({ window, document, performance, requestAnimationFrame: schedule });
  if (wx.createInnerAudioContext) window.GameAudio = createNativeAudioClass(wx, document, performance);
  game = new window.BossRushGame(stage);
  const coreDraw = game.draw.bind(game);
  const overlay = game.drawOverlay.bind(game);
  game.drawOverlay = (c, title, sub) => overlay(c, title, game.state === 'paused' ? '点右下角「继续」返回战斗' : sub);
  const button = (id, x, y, w, h, label, keys = [], extra = {}) => ({ id, x, y, w, h, label, keys, ...extra });
  const audioReady = () => game.audio.ready === undefined ? !!game.audio.ctx && game.audio.ctx.state === 'running' : game.audio.ready;
  function controls() {
    const sound = game.audio.muted ? '已静音' : game.audio.error ? '重试声音' : audioReady() ? '音效开' : (wx.createInnerAudioContext || wx.createWebAudioContext) ? '启用声音' : '声音不可用';
    if (game.state === 'title') return [
      button('start', 38, 620, 354, 62, '开始反击  ↗', [], { release: true, primary: true }),
      button('sound', 142, 698, 146, 36, sound, [], { release: true })
    ];
    const playing = game.state === 'playing';
    const b = (id, x, y, w, h, text, keys, extra) => button(id, x, y, w, h, text, keys, { disabled: !playing, ...extra });
    return [
      button('sound', 218, 578, 90, 32, sound, [], { release: true }),
      b('perk', 316, 578, 96, 32, '补给 ' + game.task.adUsesLeft + '次', ['v']),
      b('jump', 76, 626, 52, 52, '↑', ['space'], { sub: '跳跃' }),
      b('left', 16, 690, 52, 52, '←', ['left']),
      b('crouch', 76, 690, 52, 52, '↓', ['s'], { sub: '下蹲' }),
      b('right', 136, 690, 52, 52, '→', ['right']),
      b('combo', 208, 626, 64, 52, '普攻', ['1', 'j'], { primary: true, sub: '长按连击' }),
      b('reflect', 280, 626, 64, 52, '反弹', ['2', 'j']),
      b('thrust', 352, 626, 64, 52, '突刺', ['3', 'j']),
      b('ranged', 208, 690, 64, 52, '远程', ['k']),
      b('ultimate', 280, 690, 64, 52, '大招', ['l'], { sub: Math.round(game.player.rage) + '%', primary: game.player.rage >= 100 }),
      button('system', 352, 690, 64, 52, game.state === 'ending' ? '再来' : game.state === 'paused' ? '继续' : '暂停', [], { release: true, disabled: !['playing', 'paused', 'ending'].includes(game.state) })
    ];
  }
  function resetInput() { touches.clear(); keyboard.clear(); if (game) { game.input.reset(); game.audio.setMovement(0); } }
  function heldKeys() {
    const next = new Set(keyboard);
    touches.forEach(t => { if (!t.button.release && !t.button.disabled) t.button.keys.forEach(key => next.add(key)); });
    new Set([...Object.keys(game.input.down), ...next]).forEach(key => game.input.setKey(key, next.has(key)));
  }
  function point(touch) { return { x: ((touch.clientX ?? touch.pageX) - layout.x) / layout.scale, y: ((touch.clientY ?? touch.pageY) - layout.y) / layout.scale }; }
  function hit(touch) {
    const p = point(touch);
    return controls().find(b => !b.disabled && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  }
  function tap(key) { game.input.setKey(key, true); game.input.setKey(key, false); }
  function activate(button) {
    if (button.id === 'sound') {
      if (game.audio.muted) game.audio.setMuted(false, true);
      else if (!audioReady()) game.audio.unlock(true);
      else game.audio.setMuted(true);
    } else { tap('enter'); }
  }
  function touchStart(event) {
    if (document.hidden || disposed) return;
    if (game.state !== lastState) { resetInput(); lastState = game.state; }
    for (const touch of event.changedTouches || []) {
      const b = hit(touch);
      if (!b) continue;
      if (b.id !== 'sound') game.audio.unlock();
      touches.set(touch.identifier, { button: b, state: game.state });
    }
    heldKeys();
  }
  function touchMove(event) {
    if (document.hidden || disposed) return;
    for (const touch of event.changedTouches || []) {
      const held = touches.get(touch.identifier); if (!held) continue;
      const b = hit(touch);
      if (b && b.id === held.button.id) continue;
      // Sliding directions is allowed. A release-only action cancels when dragged away.
      if (!held.button.release && b && !b.release) held.button = b;
      else touches.delete(touch.identifier);
    }
    heldKeys();
  }
  function touchEnd(event, cancelled = false) {
    for (const touch of event.changedTouches || []) {
      const held = touches.get(touch.identifier); touches.delete(touch.identifier);
      if (!held || cancelled || document.hidden || held.state !== game.state) continue;
      if (held.button.id !== 'sound') game.audio.unlock();
      const b = hit(touch);
      if (held.button.release && b && b.id === held.button.id) activate(b);
    }
    heldKeys();
  }
  function bind(on, off, fn) { if (wx[on]) { wx[on](fn); cleanups.push(() => { if (wx[off]) wx[off](fn); }); } }
  bind('onTouchStart', 'offTouchStart', touchStart);
  bind('onTouchMove', 'offTouchMove', touchMove);
  bind('onTouchEnd', 'offTouchEnd', touchEnd);
  bind('onTouchCancel', 'offTouchCancel', event => touchEnd(event, true));
  bind('onKeyDown', 'offKeyDown', event => {
    if (document.hidden) return;
    const key = game.input.normalize(event.key); if (!key) return;
    game.audio.unlock(); keyboard.add(key); heldKeys();
  });
  bind('onKeyUp', 'offKeyUp', event => { keyboard.delete(game.input.normalize(event.key)); heldKeys(); });
  bind('onHide', 'offHide', () => {
    document.hidden = true; resetInput(); document.emit('visibilitychange'); game.audio.setActive(false);
    if (game.audio.interrupt) game.audio.interrupt();
    if (frameId !== null) frameApi.cancelAnimationFrame(frameId); frameId = null;
  });
  bind('onShow', 'offShow', () => {
    const hidden = document.hidden; document.hidden = false; document.emit('visibilitychange');
    game.last = performance.now(); if (started && hidden) game.start();
  });
  bind('onAudioInterruptionBegin', 'offAudioInterruptionBegin', () => {
    resetInput(); if (game.audio.interrupt) game.audio.interrupt(); else game.audio.stop();
    if (game.state === 'playing') game.state = 'paused'; game.audio.setActive(false);
  });
  bind('onWindowResize', 'offWindowResize', readLayout);

  function paintButton(c, b) {
    const art = window.GameArt, pressed = Array.from(touches.values()).some(t => t.button.id === b.id);
    const y = b.y + (pressed ? 3 : 0), fill = b.primary ? '#ffc278' : '#314c59';
    c.save(); if (b.disabled) c.globalAlpha = .42;
    art.rr(c, b.x, b.y + 4, b.w, b.h, 10, b.primary ? '#88562e' : '#0a202b', '#52717a');
    const gradient = c.createLinearGradient(0, y, 0, y + b.h); gradient.addColorStop(0, fill); gradient.addColorStop(1, b.primary ? '#f7ab64' : '#233b48');
    art.rr(c, b.x, y, b.w, b.h, 10, gradient, b.primary ? '#ffe5b0' : '#678189');
    art.text(c, b.label, b.x + b.w / 2, y + b.h / 2 + (b.sub ? -1 : 5), b.id === 'start' ? 23 : b.w > 80 ? 12 : 16, b.primary ? '#3b2d23' : '#d9ede6', 700, 'center');
    if (b.sub) art.text(c, b.sub, b.x + b.w / 2, y + b.h - 9, 9, b.primary ? '#6f4d30' : '#9bbdb8', 500, 'center');
    c.restore();
  }
  game.draw = () => {
    if (game.state !== lastState) { resetInput(); lastState = game.state; }
    coreDraw();
    const c = stage.getContext('2d'), art = window.GameArt;
    c.save(); c.setTransform(game.pixelRatio, 0, 0, game.pixelRatio, 0, 0);
    if (game.state !== 'title') {
      const gradient = c.createLinearGradient(0, 570, 0, H); gradient.addColorStop(0, '#19313d'); gradient.addColorStop(1, '#10242f');
      c.fillStyle = gradient; c.fillRect(0, 570, W, H - 570);
      art.text(c, '自由移动 · 长按普攻连击', 17, 598, 10, '#9cb5b3');
    } else art.text(c, '五层闯关 · 每局 3 次免费补给', 215, 601, 12, '#bbd2c8', 500, 'center');
    if (game.state === 'ending') {
      c.fillStyle = '#102935'; c.fillRect(45, 538, 340, 28);
      art.text(c, '点右下角「再来」开始新一轮', 215, 554, 12, '#9edbd2', 600, 'center');
    }
    controls().forEach(b => paintButton(c, b)); c.restore();
    context.setTransform(layout.density, 0, 0, layout.density, 0, 0);
    context.fillStyle = '#0c1c25'; context.fillRect(0, 0, layout.width, layout.height);
    context.drawImage(stage, layout.x, layout.y, W * layout.scale, H * layout.scale);
  };
  game.draw();
  return {
    game, screen, controls, get layout() { return layout; },
    start() { if (started || disposed) return; started = true; game.last = performance.now(); game.start(); },
    dispose() {
      if (disposed) return; disposed = true; cleanups.forEach(fn => fn()); resetInput(); game.audio.stop();
      if (frameId !== null) frameApi.cancelAnimationFrame(frameId);
      if (game.audio.dispose) { game.audio.dispose(); return; }
      const audio = game.audio.ctx; game.audio.ctx = null;
      if (audio) { audio.onstatechange = null; Promise.resolve(audio.close()).catch(() => {}); }
    }
  };
};
