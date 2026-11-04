const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ muted = false, suspended = false, supported = true, brokenStorage = false, mobileGate = false, legacyConstructor = false, sessionDenied = false } = {}) {
  const listeners = {}, sources = [], contexts = [], storage = new Map([['shechu-sound-muted', muted ? '1' : '0']]);
  const pendingResumes = []; let eventType = null;
  const param = () => ({ value: 0, events: [],
    setValueAtTime(...args) { this.events.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); },
    cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); },
    setTargetAtTime(...args) { this.events.push(['target', ...args]); }
  });
  const node = () => ({ gain: param(), playbackRate: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    connect() {}, disconnect() { this.disconnected = true; },
    start(at) { this.started = at; }, stop(at) { (this.stops ||= []).push(at); }
  });
  class Context {
    constructor(options) { if (legacyConstructor && options) throw new TypeError('unsupported options'); this.state = suspended || mobileGate ? 'suspended' : 'running'; this.currentTime = 2; this.sampleRate = 8000; this.destination = {}; contexts.push(this); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createBuffer(_, length) { const data = new Float32Array(length); return { length, getChannelData: () => data }; }
    createBufferSource() { const n = node(); sources.push(n); return n; }
    createOscillator() { const n = node(); sources.push(n); return n; }
    resume() {
      this.resumeCalls = (this.resumeCalls || 0) + 1;
      if (mobileGate && ['pointerup', 'touchend', 'click', 'keydown'].includes(eventType)) {
        this.state = 'running'; if (this.onstatechange) this.onstatechange();
        pendingResumes.splice(0).forEach(fn => fn()); return Promise.resolve();
      }
      return new Promise(resolve => { pendingResumes.push(() => { this.state = 'running'; if (this.onstatechange) this.onstatechange(); resolve(); }); });
    }
  }
  const buttons = [0, 1].map(() => ({ attrs: {}, label: {}, handlers: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.handlers[event] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; }, querySelector() { return this.label; }
  }));
  const document = { hidden: false, querySelectorAll: () => buttons,
    addEventListener(event, fn) { (listeners[event] ||= []).push(fn); }
  };
  const window = { navigator: { audioSession: sessionDenied ? Object.defineProperty({}, 'type', { set() { throw Error('denied'); } }) : {} }, AudioContext: supported ? Context : undefined,
    localStorage: { getItem(key) { if (brokenStorage) throw Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (brokenStorage) throw Error('blocked'); storage.set(key, value); } }
  };
  const clock = { now: 100 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), { window, document, performance: { now: () => clock.now }, Math });
  const sound = new window.GameAudio();
  const gesture = (type = 'pointerdown', inside = true, soundButton = false) => {
    eventType = type;
    (listeners[type] || []).forEach(fn => fn({ type, pointerType: 'touch', target: { closest: selector => selector === '.cabinet' ? inside : soundButton } }));
    eventType = null;
  };
  const clickSound = (index = 0) => { eventType = 'click'; buttons[index].handlers.click(); eventType = null; };
  return { sound, gesture, clickSound, get sources() { return sources.filter(n => !n.buffer || n.buffer.length !== 1); },
    allSources: sources, contexts, document, listeners, buttons, storage, clock, window,
    finishResume: () => pendingResumes.splice(0).forEach(fn => fn()) };

}

test('audio waits for a gesture; enable previews once and mute controls persist together', () => {
  const s = setup(); s.sound.setActive(true); s.sound.play('start');
  assert.equal(s.contexts.length, 0); assert.equal(s.sources.length, 0);
  s.buttons.forEach(b => assert.equal(b.label.textContent, '点此启声'));
  s.clickSound(); assert.equal(s.contexts.length, 1); assert.ok(s.sources.length > 0);
  s.buttons.forEach(b => assert.equal(b.label.textContent, '音效开'));
  s.clickSound(); s.gesture();
  assert.equal(s.storage.get('shechu-sound-muted'), '1');
  s.buttons.forEach(b => { assert.equal(b.attrs['aria-pressed'], 'false'); assert.equal(b.label.textContent, '已静音'); });
  s.clickSound(1); s.sound.play('start');
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

test('mobile release unlocks audio when pointerdown is blocked and no click is delivered', async () => {
  for (const release of ['pointerup','touchend']) {
    const s=setup({mobileGate:true});s.gesture('pointerdown');s.sound.setActive(true);
    s.sound.play('start');s.sound.play('swing');
    assert.equal(s.sound.ctx.state,'suspended');assert.equal(s.sources.length,0);
    assert.equal(s.buttons[0].label.textContent,'点此启声');
    const cues=[];const synth=s.sound.synthesize.bind(s.sound);s.sound.synthesize=(name,...args)=>{cues.push(name);synth(name,...args);};
    s.gesture(release);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.sound.ctx.state,'running');assert.deepEqual(cues,['start']);
    s.gesture('touchend');s.gesture('click');assert.deepEqual(cues,['start']);
    assert.equal(s.contexts.length,1);assert.equal(s.buttons[0].label.textContent,'音效开');
  }
});
test('mobile retries remain bounded, prime the context silently, and select supported playback audio',()=>{
  const s=setup({mobileGate:true});
  for(let i=0;i<20;i++)s.gesture('pointerdown');
  assert.equal(s.contexts.length,1);assert.equal(s.allSources.length,1);
  assert.equal(s.allSources[0].buffer.length,1);assert.equal(s.allSources[0].started,0);
  assert.equal(s.window.navigator.audioSession.type,'playback');
  s.gesture('pointerup');assert.equal(s.sound.ctx.state,'running');
  s.allSources[0].onended();assert.equal(s.allSources[0].disconnected,true);
  const legacy=setup({legacyConstructor:true,sessionDenied:true});legacy.gesture();assert.equal(legacy.contexts.length,1);assert.equal(legacy.sound.ctx.state,'running');
});
test('sound button retries blocked audio and previews it instead of accidentally muting',async()=>{
  const s=setup({mobileGate:true});s.gesture('pointerdown');
  s.gesture('pointerup',true,true);assert.equal(s.sound.ctx.state,'suspended');
  s.clickSound();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.sound.muted,false);assert.equal(s.sound.ctx.state,'running');assert.ok(s.sources.length>0);
  assert.equal(s.buttons[0].label.textContent,'音效开');
  s.clickSound();assert.equal(s.sound.muted,true);assert.equal(s.storage.get('shechu-sound-muted'),'1');
});
test('interruption and background discard old sounds and resume on the next mobile release',async()=>{
  const s=setup({mobileGate:true});s.gesture('touchend');s.sound.setActive(true);s.sound.play('swing');
  s.document.hidden=true;s.listeners.visibilitychange[0]();s.sound.ctx.state='interrupted';s.sound.ctx.onstatechange();
  const count=s.sources.length;s.sound.play('hit');assert.equal(s.sources.length,count);
  s.document.hidden=false;s.listeners.visibilitychange[0]();assert.equal(s.buttons[0].label.textContent,'点此启声');
  s.gesture('pointerdown');assert.equal(s.sound.ctx.state,'interrupted');
  s.gesture('pointerup');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.sound.ctx.state,'running');assert.equal(s.sources.length,count);
  s.sound.ctx.currentTime+=1;s.sound.play('swing');assert.ok(s.sources.length>count);
});
test('closed contexts recreate on a gesture and stale resume cannot replay into the new context',async()=>{
  const s=setup({suspended:true});s.gesture();const old=s.sound.ctx;
  s.sound.setActive(true);s.sound.play('start');old.state='closed';old.onstatechange();
  s.gesture('touchend');assert.equal(s.contexts.length,2);assert.notEqual(s.sound.ctx,old);
  s.finishResume();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.sources.length,0);assert.equal(s.sound.pendingStart,null);
  s.sound.play('hit');assert.ok(s.sources.length>0);
});
test('outside gestures and remembered mute never create audio or change the audio route',()=>{
  const outside=setup();outside.gesture('pointerdown',false);outside.gesture('touchend',false);
  assert.equal(outside.contexts.length,0);assert.equal(outside.window.navigator.audioSession.type,undefined);
  const muted=setup({muted:true});muted.gesture('pointerdown');muted.gesture('touchend');
  assert.equal(muted.contexts.length,0);assert.equal(muted.window.navigator.audioSession.type,undefined);
});


test('continuous movement waits for activation and never plays while muted, hidden or paused', () => {
  for (const mode of ['locked', 'muted', 'hidden', 'paused', 'suspended']) {
    const s = setup({ suspended: mode === 'suspended' });
    s.sound.setActive(true);
    if (mode !== 'locked') s.gesture();
    if (mode === 'muted') s.sound.setMuted(true);
    if (mode === 'hidden') s.document.hidden = true;
    if (mode === 'paused') s.sound.setActive(false);
    s.sound.setMovement(190);
    assert.equal(s.sound.movementLoop, null, mode);
    assert.equal(s.sources.length, 0, mode);
  }
});

test('a long walk and quick stop/start share one seamless source with smooth bounded changes', () => {
  const s = setup(); s.gesture(); s.sound.setActive(true); s.sound.setMovement(190);
  const loop = s.sound.movementLoop;
  assert.equal(loop.source.loop, true); assert.equal(loop.source.buffer.length, 32000);
  const events = loop.gain.gain.events.length;
  for (let i = 0; i < 1200; i++) { s.sound.ctx.currentTime += 1 / 120; s.sound.setMovement(190); }
  assert.equal(s.sources.length, 1); assert.equal(loop.gain.gain.events.length, events);
  s.sound.setMovement(0);
  assert.deepEqual(loop.gain.gain.events.at(-1), ['set', 0, s.sound.ctx.currentTime + .2]);
  s.sound.ctx.currentTime += .05; s.sound.setMovement(190);
  assert.equal(s.sound.movementLoop, loop); assert.equal(s.sources.length, 1);
  assert.equal(loop.gain.gain.events.at(-1)[1], .56);
  s.sound.setMovement(80, true); assert.equal(loop.level, .24); assert.ok(loop.rate < 1);
  s.sound.setMovement(500); assert.equal(loop.level, .56); assert.equal(loop.rate, 1.12);
  for (const speed of [NaN, Infinity, -10, 0]) { s.sound.setMovement(speed); assert.equal(loop.level, 0); }
});

test('movement loop tears down on mute, pause, interruption and background, with no stale restart', () => {
  for (const mode of ['mute', 'pause', 'interruption', 'background']) {
    const s = setup(); s.gesture(); s.sound.setActive(true); s.sound.setMovement(190);
    const loop = s.sound.movementLoop, buffer = loop.source.buffer;
    if (mode === 'mute') s.sound.setMuted(true);
    if (mode === 'pause') s.sound.setActive(false);
    if (mode === 'interruption') { s.sound.ctx.state = 'interrupted'; s.sound.ctx.onstatechange(); }
    if (mode === 'background') { s.document.hidden = true; s.listeners.visibilitychange[0](); }
    assert.equal(s.sound.movementLoop, null, mode);
    assert.ok(loop.source.stops.at(-1) <= s.sound.ctx.currentTime + .016, mode);
    s.sound.muted = false; s.sound.active = true; s.document.hidden = false; s.sound.ctx.state = 'running';
    s.sound.finishUnlock(s.sound.ctx); assert.equal(s.sound.movementLoop, null);
    s.sound.setMovement(190); const next = s.sound.movementLoop;
    assert.notEqual(next, loop); assert.equal(next.source.buffer, buffer);
    loop.source.onended(); assert.equal(loop.source.disconnected, true);
    assert.equal(loop.gain.disconnected, true); assert.equal(s.sound.movementLoop, next);
  }
});

test('movement waveform is finite, bounded and continuous across its loop seam', () => {
  const s = setup(); s.gesture(); s.sound.setActive(true); s.sound.setMovement(190);
  const buffer = s.sound.movementLoop.source.buffer, data = buffer.getChannelData(0);
  assert.equal(s.sound.createMovementBuffer(), buffer);
  let peak = 0, minRms = Infinity;
  for (let start = 0; start < data.length; start += 800) {
    let sum = 0;
    for (let i = start; i < start + 800; i++) { assert.ok(Number.isFinite(data[i])); peak = Math.max(peak, Math.abs(data[i])); sum += data[i] ** 2; }
    minRms = Math.min(minRms, Math.sqrt(sum / 800));
  }
  assert.ok(peak > .1 && peak < .4); assert.ok(minRms > .015);
  assert.ok(Math.abs(data[0] - data.at(-1)) < .02);
});
