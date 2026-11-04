'use strict';

// Package-local PCM clips use the native media driver. WeChat's WebAudio driver
// does not honor setInnerAudioOption.obeyMuteSwitch on iOS.
const cues = {
  start:['start',1], swing1:['swing',1], swing2:['swing',2], swing3:['swing',3],
  hit:['hit',1], hitHeavy:['hit',40], reflect:['reflect',1], parry:['parry',1],
  thrust:['thrust',1], ranged:['ranged',1], ultimate:['ultimate',1], hurt:['hurt',1],
  enemyReady:['enemyReady',1], enemyReadyHeavy:['enemyReady',2],
  enemySwing:['enemySwing',1], enemySwingHeavy:['enemySwing',2],
  stepLeft:['step',-1], stepRight:['step',1], jump:['jump',1], land:['land',1],
  pickupCoffee:['pickupCoffee',1], pickupBrief:['pickupBrief',1],
  pickupAmmo:['pickupAmmo',1], pickupRest:['pickupRest',1]
};
function cueKey(name, variation) {
  if (name === 'swing') return 'swing' + Math.round(Math.max(1, Math.min(3, variation)));
  if (name === 'hit') return variation > 35 ? 'hitHeavy' : 'hit';
  if (name === 'step') return variation > 0 ? 'stepRight' : 'stepLeft';
  if (name === 'enemyReady' || name === 'enemySwing') return name + (variation > 1 ? 'Heavy' : '');
  return name;
}

module.exports = function createNativeAudioClass(wx, document, clock) {
  return class NativeGameAudio {
    constructor() {
      this.active = false; this.muted = false; this.unlocked = false;
      this.disposed = false; this.route = 'idle'; this.routeAttempt = 0;
      this.played = false; this.error = null; this.pool = [];
      this.movementLoop = null; this.lastPlayed = new Map();
      this.pendingStart = null; this.pendingPreview = null;
      try { this.muted = wx.getStorageSync('shechu-sound-muted') === '1'; } catch (_) {}
    }
    get ready() { return this.route === 'ready' && this.played && !this.error; }
    get supported() { return typeof wx.createInnerAudioContext === 'function'; }
    allowed() { return this.unlocked && !this.disposed && !this.muted && !document.hidden; }
    failed(error) {
      if (this.disposed) return;
      this.error = error && (error.errMsg || error.message) || '音频播放失败';
      this.played = false; this.route = 'idle'; this.stop();
    }
    unlock(preview = false) {
      if (this.disposed || this.muted || document.hidden || !this.supported) return;
      this.unlocked = true;
      if (preview) this.pendingPreview = clock.now();
      if (this.route === 'ready') { this.flush(); return; }
      if (this.route === 'pending') return;
      const attempt = ++this.routeAttempt;
      this.route = 'pending'; this.error = null;
      const success = () => {
        if (this.disposed || attempt !== this.routeAttempt) return;
        this.route = 'ready'; this.flush();
      };
      const fail = error => { if (attempt === this.routeAttempt) this.failed(error); };
      try {
        if (wx.setInnerAudioOption) wx.setInnerAudioOption({obeyMuteSwitch:false, mixWithOther:true, success, fail});
        else success();
      } catch (error) { fail(error); }
    }
    flush() {
      if (!this.allowed() || this.route !== 'ready') return;
      const start = this.pendingStart, preview = this.pendingPreview;
      this.pendingStart = this.pendingPreview = null;
      if (start !== null && this.active && clock.now() - start < 1500) this.play('start');
      else if (preview !== null && clock.now() - preview < 1500) this.effect('parry', 1);
    }
    setMuted(muted, preview = false) {
      this.muted = muted;
      try { wx.setStorageSync('shechu-sound-muted', muted ? '1' : '0'); } catch (_) {}
      if (muted) this.stop(); else this.unlock(preview);
    }
    setActive(active) { if (this.active && !active) this.stop(); this.active = active; }
    makePlayer(loop = false) {
      const source = wx.createInnerAudioContext({useWebAudioImplement:false});
      const slot = {source, busy:false, wanted:false, used:0, key:null};
      source.autoplay = false; source.loop = loop; source.obeyMuteSwitch = false;
      source.onPlay(() => {
        if (!this.allowed() || !slot.wanted) { source.stop(); return; }
        this.played = true; this.error = null;
      });
      source.onEnded(() => { slot.busy = false; slot.wanted = false; });
      source.onError(error => { slot.busy = false; slot.wanted = false; this.failed(error); });
      return slot;
    }
    play(name, variation = 1) {
      if (!this.allowed() || !this.active) return;
      if (this.route !== 'ready') {
        if (name === 'start') this.pendingStart = clock.now();
        return;
      }
      const now = clock.now();
      if ((['hit','parry','hurt','enemyReady','enemySwing'].includes(name) || name.startsWith('pickup')) && now - (this.lastPlayed.get(name) ?? -Infinity) < 55) return;
      this.lastPlayed.set(name, now); this.effect(name, variation);
    }
    effect(name, variation) {
      const key = cueKey(name, variation); if (!cues[key]) return;
      try {
        // A bounded pool allows impacts and swings to overlap without unbounded native players.
        let slot = this.pool.find(p => !p.busy && p.key === key) || this.pool.find(p => !p.busy);
        if (!slot && this.pool.length < 8) { slot = this.makePlayer(); this.pool.push(slot); }
        if (!slot) slot = this.pool.reduce((a,b) => a.used < b.used ? a : b);
        slot.wanted = false; if (slot.key !== null) slot.source.stop();
        slot.source.volume = name === 'step' ? Math.max(.4, Math.min(1, Math.abs(variation))) : 1;
        if (slot.key !== key) { slot.source.src = 'assets/audio/' + key + '.wav'; slot.key = key; }
        slot.used = clock.now(); slot.busy = true; slot.wanted = true; slot.source.play();
      } catch (error) { this.failed(error); }
    }
    setMovement(speed, crouching = false) {
      const moving = this.allowed() && this.active && this.route === 'ready' && Number.isFinite(speed) && speed > 1;
      let loop = this.movementLoop;
      if (!loop && !moving) return;
      try {
        if (!loop) {
          loop = this.makePlayer(true); loop.level = 0; loop.last = clock.now(); loop.playing = false; loop.volume = 0; loop.rate = 1;
          loop.source.volume = 0; loop.source.src = 'assets/audio/movement.wav'; this.movementLoop = loop;
        }
        const now = clock.now(), dt = Math.min(.1, Math.max(0, (now - loop.last) / 1000)); loop.last = now;
        const target = moving ? (crouching ? .24 : .56) : 0;
        loop.level += (target - loop.level) * (1 - Math.exp(-dt / (target ? .045 : .035)));
        if (!moving && loop.level < .003) loop.level = 0;
        if (Math.abs(loop.level - loop.volume) > .002 || (!loop.level && loop.volume)) {
          loop.source.volume = loop.level; loop.volume = loop.level;
        }
        if (moving) {
          const rate = Math.max(.94, Math.min(1.12, .92 + speed / 190 * .08));
          if (Math.abs(rate - loop.rate) > .015) { loop.source.playbackRate = rate; loop.rate = rate; }
          if (!loop.playing) { loop.wanted = true; loop.playing = true; loop.source.play(); }
        } else if (!loop.level && loop.playing) { loop.wanted = false; loop.playing = false; loop.source.pause(); }
      } catch (error) { this.failed(error); }
    }
    stop() {
      this.pendingStart = this.pendingPreview = null; this.lastPlayed.clear();
      for (const slot of this.pool) { slot.wanted = false; slot.busy = false; try { slot.source.stop(); } catch (_) {} }
      if (this.movementLoop) {
        const loop = this.movementLoop; loop.wanted = false; loop.playing = false; loop.level = 0; loop.volume = 0;
        try { loop.source.volume = 0; loop.source.pause(); } catch (_) {}
      }
    }
    interrupt() { ++this.routeAttempt; this.route = 'idle'; this.played = false; this.stop(); }
    dispose() {
      if (this.disposed) return;
      this.stop(); this.disposed = true; ++this.routeAttempt;
      for (const slot of [...this.pool, this.movementLoop].filter(Boolean)) { try { slot.source.destroy(); } catch (_) {} }
      this.pool = []; this.movementLoop = null;
    }
  };
};
module.exports.cues = cues;
module.exports.cueKey = cueKey;
