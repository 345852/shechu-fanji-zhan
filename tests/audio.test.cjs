const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ muted = false, suspended = false, supported = true, brokenStorage = false } = {}) {
  const listeners = {}, sources = [], contexts = [], storage = new Map([['shechu-sound-muted', muted ? '1' : '0']]);
  let finishResume;
  const param = () => ({ value: 0, events: [],
    setValueAtTime(...args) { this.events.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); },
    cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); },
    setTargetAtTime(...args) { this.events.push(['target', ...args]); }
  });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    connect() {}, disconnect() { this.disconnected = true; },
    start(at) { this.started = at; }, stop(at) { (this.stops ||= []).push(at); }
  });
  class Context {
    constructor() { this.state = suspended ? 'suspended' : 'running'; this.currentTime = 2; this.sampleRate = 8000; this.destination = {}; contexts.push(this); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { const n = node(); sources.push(n); return n; }
    createOscillator() { const n = node(); sources.push(n); return n; }
    resume() { return new Promise(resolve => { finishResume = () => { this.state = 'running'; resolve(); }; }); }
  }
  const buttons = [0, 1].map(() => ({ attrs: {}, label: {}, handlers: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.handlers[event] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; }, querySelector() { return this.label; }
  }));
  const document = { hidden: false, querySelectorAll: () => buttons,
    addEventListener(event, fn) { (listeners[event] ||= []).push(fn); }
  };
  const window = { AudioContext: supported ? Context : undefined,
    localStorage: { getItem(key) { if (brokenStorage) throw Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (brokenStorage) throw Error('blocked'); storage.set(key, value); } }
  };
  const clock = { now: 100 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), { window, document, performance: { now: () => clock.now }, Math });
  const sound = new window.GameAudio();
  const gesture = () => listeners.pointerdown[0]({ target: { closest: () => true } });
  return { sound, gesture, sources, contexts, document, listeners, buttons, storage, clock, finishResume: () => finishResume() };
}

test('no audio context or sound before a gesture; both mute controls persist together', () => {
  const s = setup(); s.sound.setActive(true); s.sound.play('start');
  assert.equal(s.contexts.length, 0); assert.equal(s.sources.length, 0);
  s.buttons[0].handlers.click(); s.gesture();
  assert.equal(s.contexts.length, 0); assert.equal(s.storage.get('shechu-sound-muted'), '1');
  s.buttons.forEach(b => { assert.equal(b.attrs['aria-pressed'], 'false'); assert.equal(b.label.textContent, '已静音'); });
  s.buttons[1].handlers.click(); s.sound.play('start');
  assert.equal(s.contexts.length, 1); assert.ok(s.sources.length > 8);
  s.buttons.forEach(b => assert.equal(b.attrs['aria-pressed'], 'true'));
});

test('opening fanfare waits for audio activation once; old attacks are never queued', async () => {
  const s = setup({ suspended: true }); s.gesture(); s.sound.setActive(true);
  s.sound.play('start'); s.sound.play('swing'); s.sound.play('hit');
  assert.equal(s.sources.length, 0);
  const events = []; const synthesize = s.sound.synthesize.bind(s.sound);
  s.sound.synthesize = (...args) => { events.push(args[0]); synthesize(...args); };
  s.finishResume(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['start']); assert.equal(s.sound.pendingStart, null);
});

test('muting or a delayed resume cannot replay the opening later', async () => {
  for (const cancel of ['mute', 'pause', 'stale']) {
    const s = setup({ suspended: true }); s.gesture(); s.sound.setActive(true); s.sound.play('start');
    if (cancel === 'mute') s.sound.setMuted(true);
    if (cancel === 'pause') s.sound.setActive(false);
    if (cancel === 'stale') s.clock.now += 600;
    s.finishResume(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(s.sources.length, 0, cancel);
  }
});

test('all sound palettes schedule bounded voices that disconnect after playback', () => {
  const s = setup(); s.gesture(); s.sound.setActive(true);
  for (const name of ['enemyReady', 'enemySwing', 'start', 'swing', 'hit', 'reflect', 'parry', 'thrust', 'ranged', 'ultimate', 'hurt', 'step', 'jump', 'land', 'pickupCoffee', 'pickupBrief', 'pickupAmmo', 'pickupRest']) {
    const before = s.sources.length; s.sound.ctx.currentTime += 1; s.sound.play(name, 3);
    assert.ok(s.sources.length > before, name);
    for (const source of s.sources.slice(before)) {
      assert.ok(source.stops[0] > source.started);
      assert.ok(source.stops[0] - source.started < 0.6);
      source.onended(); assert.equal(source.disconnected, true);
    }
    assert.equal(s.sound.voices.size, 0);
  }
});

test('multiple targets share one impact and rapid inputs cannot exhaust audio voices', () => {
  const s = setup(); s.gesture(); s.sound.setActive(true); s.sound.play('hit');
  const count = s.sources.length;
  for (let i = 0; i < 20; i++) s.sound.play('hit');
  assert.equal(s.sources.length, count);
  s.sound.ctx.currentTime += 0.06; s.sound.play('hit'); assert.ok(s.sources.length > count);
  for (let i = 0; i < 100; i++) s.sound.play('swing');
  assert.ok(s.sound.voices.size <= 48);
});

test('pause and background cut scheduled tails without a catch-up burst', () => {
  const s = setup(); s.gesture(); s.sound.setActive(true); s.sound.play('start');
  const count = s.sources.length; s.sound.setActive(false);
  assert.ok(s.sources.every(source => source.stops.at(-1) <= s.sound.ctx.currentTime + 0.016));
  s.sound.play('swing'); s.sound.setActive(true); assert.equal(s.sources.length, count);
  s.sound.play('swing'); const afterSwing = s.sources.length;
  s.document.hidden = true; s.listeners.visibilitychange[0](); s.sound.play('hit');
  assert.equal(s.sources.length, afterSwing);
});

test('saved mute, unavailable Web Audio and blocked storage remain safe', () => {
  const muted = setup({ muted: true }); muted.gesture(); assert.equal(muted.contexts.length, 0);
  const unsupported = setup({ supported: false }); unsupported.gesture(); unsupported.sound.setActive(true); unsupported.sound.play('start'); assert.equal(unsupported.sources.length, 0);
  const privateMode = setup({ brokenStorage: true }); privateMode.gesture(); privateMode.sound.setMuted(true); privateMode.sound.setMuted(false); assert.equal(privateMode.contexts.length, 1);
});

test('movement and collection sounds obey mute, pause and background settings', () => {
  const s=setup();s.gesture();s.sound.setActive(true);
  const cues=['step','jump','land','pickupCoffee','pickupBrief','pickupAmmo','pickupRest'];
  s.sound.setMuted(true);cues.forEach(name=>s.sound.play(name));assert.equal(s.sources.length,0);
  s.sound.setMuted(false);s.sound.setActive(false);cues.forEach(name=>s.sound.play(name));assert.equal(s.sources.length,0);
  s.sound.setActive(true);s.document.hidden=true;cues.forEach(name=>s.sound.play(name));assert.equal(s.sources.length,0);
  s.document.hidden=false;cues.forEach(name=>s.sound.play(name));assert.ok(s.sources.length>0);
});
