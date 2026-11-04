/* Small, local Web Audio effects. No downloads or audio before a gesture; movement uses one seamless local loop. */
(function () {
  class GameAudio {
    constructor() {
      this.ctx = null;
      this.active = false;
      this.voices = new Set();
      this.lastPlayed = new Map();
      this.pendingStart = null;
      this.pendingPreview = null;
      this.movementLoop = null;
      this.movementBuffer = null;
      this.gestureInGame = false;
      this.muted = false;
      try { this.muted = window.localStorage.getItem('shechu-sound-muted') === '1'; } catch (_) { /* storage may be unavailable */ }
      this.buttons = Array.from(document.querySelectorAll('[data-sound-toggle]'));
      this.buttons.forEach(button => button.addEventListener('click', () => {
        // A blocked context needs another user gesture, not a toggle back to mute.
        if (this.muted) this.setMuted(false, true);
        else if (!this.ctx || this.ctx.state !== 'running') this.unlock(true);
        else this.setMuted(true);
      }));
      this.syncButtons();
      const inGame = event => event.target.closest && event.target.closest('.cabinet');
      const isSoundButton = event => event.target.closest && event.target.closest('[data-sound-toggle]');
      // Touch/pen activation is granted on release. Game controls may suppress click.
      const begin = event => {
        this.gestureInGame = !!inGame(event) && !isSoundButton(event);
        if (this.gestureInGame) this.unlock();
      };
      const end = event => {
        const activate = this.gestureInGame || inGame(event);
        this.gestureInGame = false;
        if (activate && !isSoundButton(event)) this.unlock();
      };
      document.addEventListener('pointerdown', begin, true);
      document.addEventListener('pointerup', end, true);
      document.addEventListener('touchstart', begin, { capture: true, passive: true });
      document.addEventListener('touchend', end, { capture: true, passive: true });
      document.addEventListener('touchcancel', () => { this.gestureInGame = false; }, true);
      document.addEventListener('click', event => {
        if (inGame(event) && !isSoundButton(event)) this.unlock();
      }, true);
      document.addEventListener('keydown', event => {
        if (!isSoundButton(event) && !event.repeat && /^(Enter| |[adwspjklv123qe]|Arrow(?:Left|Right|Up|Down))$/i.test(event.key)) this.unlock();
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.gestureInGame = false; this.stop(); }
        this.syncButtons();
      });
    }

    syncButtons() {
      const supported = !!(window.AudioContext || window.webkitAudioContext);
      const ready = !!this.ctx && this.ctx.state === 'running';
      const label = this.muted ? '已静音' : !supported ? '声音不可用' : ready ? '音效开' : '点此启声';
      this.buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(!this.muted && ready));
        button.title = this.muted ? '开启游戏音效' : ready ? '关闭游戏音效' : '点击启动声音并试听';
        button.classList.toggle('is-muted', this.muted);
        button.querySelector('span').textContent = label;
      });
    }

    setMuted(muted, preview = false) {
      this.muted = muted;
      try { window.localStorage.setItem('shechu-sound-muted', muted ? '1' : '0'); } catch (_) { /* optional preference */ }
      if (muted) this.stop();
      else this.unlock(preview);
      this.syncButtons();
    }

    createGraph(context) {
      this.ctx = context;
      this.primer = null;
      this.movementLoop = null;
      this.movementBuffer = null;
      context.onstatechange = () => {
        if (this.ctx !== context) return;
        if (context.state === 'running') this.finishUnlock(context);
        else { this.stop(); this.syncButtons(); }
      };
      this.master = context.createGain();
      this.master.gain.value = 0.52;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.master.connect(limiter);
      limiter.connect(context.destination);
      this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Prepare once during audio unlock, so the first movement never has to synthesize a loop.
      this.createMovementBuffer();
    }

    finishUnlock(context) {
      if (context !== this.ctx) return;
      this.syncButtons();
      if (context.state !== 'running' || this.muted || document.hidden) return;
      const opening = this.pendingStart, preview = this.pendingPreview;
      this.pendingStart = null;
      this.pendingPreview = null;
      if (opening !== null && performance.now() - opening < 500 && this.active) this.play('start');
      else if (preview !== null && performance.now() - preview < 500) this.synthesize('parry');
    }

    prime(context) {
      if (this.primer) return;
      // Start a silent one-sample buffer in the gesture itself for older mobile WebViews.
      const source = context.createBufferSource();
      this.primer = source;
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        if (this.primer === source) this.primer = null;
      };
      source.start(0);
      source.stop(context.currentTime + 0.001);
    }

    unlock(preview = false) {
      if (this.muted || document.hidden) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (preview) this.pendingPreview = performance.now();
      try {
        // When supported, use the media playback route rather than ambient/ringer audio.
        try { if (window.navigator && window.navigator.audioSession) window.navigator.audioSession.type = 'playback'; } catch (_) { /* optional API */ }
        let created = false;
        if (!this.ctx || this.ctx.state === 'closed') {
          let context;
          try { context = new AudioContext({ latencyHint: 'interactive' }); }
          catch (_) { context = new AudioContext(); }
          this.voices.clear();
          this.lastPlayed.clear();
          this.createGraph(context);
          created = true;
        }
        const context = this.ctx;
        if (created || context.state !== 'running') {
          try { this.prime(context); } catch (_) {
            if (this.primer) this.primer.disconnect();
            this.primer = null;
          }
        }
        if (context.state === 'running') { this.finishUnlock(context); return; }
        // Retry in every real gesture, even if an earlier resume promise is still pending.
        Promise.resolve(context.resume()).then(() => this.finishUnlock(context)).catch(() => {
          if (context === this.ctx) this.syncButtons();
        });
        this.syncButtons();
      } catch (_) { this.syncButtons(); /* Sound is optional; gameplay stays available. */ }
    }

    setActive(active) {
      if (this.active && !active) this.stop();
      this.active = active;
    }

    stop() {
      this.pendingStart = null;
      this.pendingPreview = null;
      this.lastPlayed.clear();
      this.stopMovement();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.voices.forEach(voice => {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.003);
        try { voice.source.stop(now + 0.015); } catch (_) { /* already ended */ }
      });
    }

    createMovementBuffer() {
      if (this.movementBuffer) return this.movementBuffer;
      const rate = this.ctx.sampleRate, seconds = 4, beat = 0.25;
      const buffer = this.ctx.createBuffer(1, Math.round(rate * seconds), rate);
      const data = buffer.getChannelData(0), tau = Math.PI * 2;
      const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46,
        523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 392];
      for (let i = 0; i < data.length; i++) {
        const time = i / rate, step = Math.floor(time / beat), t = time - step * beat;
        const envelope = Math.min(1, t / 0.012) * Math.pow(1 - t / beat, 2);
        const phase = tau * notes[step] * t;
        const melody = (Math.sin(phase) + 0.25 * Math.sin(phase * 2)) * envelope * 0.12;
        // The sustained bed uses whole cycles over four seconds so its seam cannot click.
        const pad = (Math.sin(tau * 130.75 * time) + 0.45 * Math.sin(tau * 196 * time)
          + 0.35 * Math.sin(tau * 261.5 * time)) * 0.035;
        const bass = step % 2 === 0 ? Math.sin(tau * (55 * t + 45 * (1 - Math.exp(-35 * t)) / 35))
          * envelope * Math.exp(-18 * t) * 0.08 : 0;
        const tick = (Math.sin(tau * 3100 * t) + 0.4 * Math.sin(tau * 5700 * t))
          * envelope * Math.exp(-50 * t) * 0.018;
        data[i] = melody + pad + bass + tick;
      }
      this.movementBuffer = buffer;
      return buffer;
    }

    setMovement(speed, crouching = false) {
      const allowed = this.active && !this.muted && !document.hidden && this.ctx && this.ctx.state === 'running';
      const moving = allowed && Number.isFinite(speed) && speed > 1;
      let loop = this.movementLoop;
      if (!loop && !moving) return;
      if (!loop) {
        const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
        source.buffer = this.createMovementBuffer();
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain); gain.connect(this.master);
        loop = { source, gain, level: 0, rate: 1 };
        this.movementLoop = loop;
        source.onended = () => {
          source.disconnect(); gain.disconnect();
          if (this.movementLoop === loop) this.movementLoop = null;
        };
        source.start(this.ctx.currentTime);
      }
      const now = this.ctx.currentTime;
      const level = moving ? (crouching ? 0.24 : 0.56) : 0;
      if (loop.level !== level) {
        loop.gain.gain.cancelScheduledValues(now);
        loop.gain.gain.setTargetAtTime(level, now, level > 0 ? 0.045 : 0.035);
        if (level === 0) loop.gain.gain.setValueAtTime(0, now + 0.20);
        loop.level = level;
      }
      if (moving) {
        const rate = Math.max(0.94, Math.min(1.12, 0.92 + speed / 190 * 0.08));
        if (Math.abs(loop.rate - rate) > 0.015) {
          loop.source.playbackRate.setTargetAtTime(rate, now, 0.12);
          loop.rate = rate;
        }
      }
    }

    stopMovement() {
      const loop = this.movementLoop;
      if (!loop || !this.ctx) return;
      this.movementLoop = null;
      const now = this.ctx.currentTime;
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setTargetAtTime(0, now, 0.003);
      try { loop.source.stop(now + 0.015); } catch (_) { /* already ended */ }
    }

    play(name, variation = 1) {
      if (this.muted || !this.active || document.hidden || !this.ctx) return;
      if (this.ctx.state !== 'running') {
        if (name === 'start') this.pendingStart = performance.now();
        return;
      }
      const now = this.ctx.currentTime;
      // A strike can hit several bodies at once. Give it one clear impact, not a volume spike.
      if ((['hit', 'parry', 'hurt', 'enemyReady', 'enemySwing'].includes(name) || name.startsWith('pickup')) && now - (this.lastPlayed.get(name) ?? -1) < 0.055) return;
      this.lastPlayed.set(name, now);
      this.synthesize(name, variation, now + 0.005);
    }

    voice(at, duration, volume, frequency, endFrequency, type = 'sine', noise = false) {
      if (this.voices.size >= 48) return;
      const c = this.ctx, gain = c.createGain();
      const source = noise ? c.createBufferSource() : c.createOscillator();
      let filter;
      if (noise) {
        source.buffer = this.noiseBuffer;
        filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.7;
        source.connect(filter); filter.connect(gain);
      } else { source.type = type; source.connect(gain); }
      const pitch = noise ? filter.frequency : source.frequency;
      pitch.setValueAtTime(frequency, at);
      pitch.exponentialRampToValueAtTime(endFrequency || frequency, at + duration);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + Math.min(0.008, duration * 0.1));
      gain.gain.exponentialRampToValueAtTime(volume * 0.22, at + duration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      gain.gain.setValueAtTime(0, at + duration + 0.006);
      gain.connect(this.master);
      const voice = { source, gain };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (filter) filter.disconnect();
        this.voices.delete(voice);
      };
      source.start(at);
      source.stop(at + duration + 0.015);
    }

    synthesize(name, variation = 1, at = this.ctx.currentTime + 0.005) {
      const tone = (offset, duration, gain, from, to = from, type = 'sine') => this.voice(at + offset, duration, gain, from, to, type);
      const air = (offset, duration, gain, from, to) => this.voice(at + offset, duration, gain, from, to, 'sine', true);
      switch (name) {
        case 'enemyReady':
          tone(0, 0.09, 0.09, variation > 1 ? 440 : 330, 260, 'triangle');
          break;
        case 'enemySwing':
          air(0, 0.12, 0.19, 1400 + variation * 180, 320);
          tone(0, 0.10, 0.12, 170 + variation * 15, 70, 'triangle');
          break;
        case 'step': {
          const strength = Math.max(0.4, Math.min(1, Math.abs(variation)));
          tone(0, 0.07, 0.17 * strength, variation > 0 ? 155 : 125, 65);
          air(0, 0.045, 0.10 * strength, variation > 0 ? 950 : 750, 280);
          break;
        }
        case 'jump':
          tone(0, 0.16, 0.14, 240, 600, 'triangle');
          air(0, 0.08, 0.08, 800, 2000);
          break;
        case 'land':
          tone(0, 0.13, 0.22, 125, 45);
          air(0, 0.09, 0.12, 850, 240);
          break;
        case 'pickupCoffee':
          tone(0, 0.11, 0.17, 330, 660);
          tone(0.08, 0.13, 0.16, 880, 660);
          tone(0.16, 0.23, 0.12, 1318.51);
          break;
        case 'pickupBrief':
          air(0, 0.055, 0.09, 1000, 2300);
          tone(0.02, 0.16, 0.17, 880, 880, 'triangle');
          tone(0.10, 0.24, 0.16, 1320);
          break;
        case 'pickupAmmo':
          air(0, 0.035, 0.17, 3000, 1100);
          air(0.05, 0.045, 0.14, 2300, 900);
          tone(0.06, 0.15, 0.16, 260, 520, 'triangle');
          break;
        case 'pickupRest':
          [392, 523.25, 659.25].forEach((note, i) => tone(i * 0.09, 0.26, 0.13, note));
          break;
        case 'start':
          // A bright ascending major arpeggio, then a celebratory chord (under one second).
          [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => {
            tone(i * 0.105, 0.19, 0.19, note, note, 'triangle');
            tone(i * 0.105, 0.13, 0.055, note * 2);
          });
          [523.25, 659.25, 783.99, 1046.5].forEach(note => tone(0.47, 0.36, 0.10, note));
          tone(0, 0.13, 0.22, 140, 55);
          tone(0.47, 0.22, 0.20, 180, 65);
          air(0.47, 0.16, 0.07, 2800, 900);
          break;
        case 'swing': {
          const combo = Math.max(1, Math.min(3, variation));
          air(0, combo === 3 ? 0.17 : 0.11, 0.24, 700 + combo * 280, 3200 - combo * 400);
          tone(0, 0.075, 0.13, 220 + combo * 45, 75, 'triangle');
          break;
        }
        case 'hit':
          tone(0, 0.12, 0.34, variation > 35 ? 145 : 190, 48);
          air(0, 0.075, 0.30, 1900, 650);
          tone(0.008, 0.05, 0.08, 920, 240, 'triangle');
          break;
        case 'reflect':
          tone(0, 0.23, 0.22, 560, 1120);
          tone(0.035, 0.20, 0.10, 840, 1680);
          air(0, 0.14, 0.12, 1700, 3600);
          break;
        case 'parry':
          tone(0, 0.20, 0.18, 1320); tone(0.025, 0.15, 0.09, 1980);
          break;
        case 'thrust':
          air(0, 0.24, 0.32, 650, 4200);
          tone(0, 0.18, 0.22, 240, 65, 'triangle');
          break;
        case 'ranged':
          air(0, 0.045, 0.27, 3000, 1200);
          tone(0, 0.13, 0.18, 720, 170, 'triangle');
          break;
        case 'ultimate':
          tone(0, 0.30, 0.20, 180, 720, 'triangle');
          [261.63, 392, 523.25].forEach(note => tone(0.16, 0.46, 0.12, note));
          air(0.14, 0.35, 0.25, 2500, 220);
          tone(0.16, 0.35, 0.30, 150, 42);
          break;
        case 'hurt':
          tone(0, 0.14, 0.16, 220, 90, 'triangle');
          air(0, 0.08, 0.12, 900, 300);
          break;
      }
    }
  }
  window.GameAudio = GameAudio;
}());
