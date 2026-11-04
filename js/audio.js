/* Small, local Web Audio effects. No downloads, music loop, or audio before a gesture. */
(function () {
  class GameAudio {
    constructor() {
      this.ctx = null;
      this.active = false;
      this.voices = new Set();
      this.lastPlayed = new Map();
      this.pendingStart = null;
      this.muted = false;
      try { this.muted = window.localStorage.getItem('shechu-sound-muted') === '1'; } catch (_) { /* storage may be unavailable */ }
      this.buttons = Array.from(document.querySelectorAll('[data-sound-toggle]'));
      this.buttons.forEach(button => button.addEventListener('click', () => this.setMuted(!this.muted)));
      this.syncButtons();
      // Resume inside the gesture, before the animation loop consumes the action.
      const activate = event => {
        if (event.target.closest && event.target.closest('.cabinet')) this.unlock();
      };
      document.addEventListener('pointerdown', activate, true);
      document.addEventListener('click', activate, true);
      document.addEventListener('keydown', event => {
        if (!event.repeat && /^(Enter| |[adwspjklv123qe]|Arrow(?:Left|Right|Up|Down))$/i.test(event.key)) this.unlock();
      }, true);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    }

    syncButtons() {
      this.buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(!this.muted));
        button.title = this.muted ? '开启游戏音效' : '关闭游戏音效';
        button.classList.toggle('is-muted', this.muted);
        button.querySelector('span').textContent = this.muted ? '已静音' : '音效开';
      });
    }

    setMuted(muted) {
      this.muted = muted;
      try { window.localStorage.setItem('shechu-sound-muted', muted ? '1' : '0'); } catch (_) { /* optional preference */ }
      if (muted) this.stop();
      else this.unlock();
      this.syncButtons();
    }

    createGraph(context) {
      this.ctx = context;
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
    }

    unlock() {
      if (this.muted || document.hidden) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        if (!this.ctx) this.createGraph(new AudioContext({ latencyHint: 'interactive' }));
        if (this.ctx.state === 'running') return;
        // Only the opening fanfare may wait briefly for activation; never replay old attacks.
        Promise.resolve(this.ctx.resume()).then(() => {
          const pending = this.pendingStart;
          this.pendingStart = null;
          if (pending !== null && performance.now() - pending < 500) this.play('start');
        }).catch(() => { this.pendingStart = null; });
      } catch (_) { /* Sound is optional; the game remains playable. */ }
    }

    setActive(active) {
      if (this.active && !active) this.stop();
      this.active = active;
    }

    stop() {
      this.pendingStart = null;
      this.lastPlayed.clear();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.voices.forEach(voice => {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.003);
        try { voice.source.stop(now + 0.015); } catch (_) { /* already ended */ }
      });
    }

    play(name, variation = 1) {
      if (this.muted || !this.active || document.hidden || !this.ctx) return;
      if (this.ctx.state !== 'running') {
        if (name === 'start') this.pendingStart = performance.now();
        return;
      }
      const now = this.ctx.currentTime;
      // A strike can hit several bodies at once. Give it one clear impact, not a volume spike.
      if (['hit', 'parry', 'hurt'].includes(name) && now - (this.lastPlayed.get(name) ?? -1) < 0.055) return;
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
