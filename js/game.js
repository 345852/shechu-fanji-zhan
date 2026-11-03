(function () {
  const { W, H, GROUND, COLORS, LEVELS } = window.GameData;
  const { clamp, rects } = window.GameUtils;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = true;
      this.pixelRatio = 1;
      this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.resizeCanvas();
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(canvas);
      }
      window.addEventListener('resize', () => this.resizeCanvas());
      document.addEventListener('visibilitychange', () => {
        this.last = performance.now();
        if (document.hidden && this.state === 'playing') this.state = 'paused';
      });
      this.input = new window.Input();
      this.player = new window.Player();
      this.state = "title";
      this.floorIndex = 0;
      this.level = LEVELS[0];
      this.worldWidth = 1800;
      this.bossGate = 1410;
      this.phase = "run";
      this.enemies = [];
      this.pickups = [];
      this.projectiles = [];
      this.particles = [];
      this.slashes = [];
      this.floatingTexts = [];
      this.hitCheers = [];
      this.callout = null;
      this.boss = null;
      this.camera = { x: 0, y: 0 };
      this.time = 0;
      this.last = performance.now();
      this.freezeTimer = 0;
      this.screenShake = 0;
      this.toiletUsed = false;
      this.message = "";
      this.messageTimer = 0;
      this.gateToastTimer = 0;
      this.stateTimer = 0;
      this.stats = this.makeStats();
      this.task = this.makeTask();
      this.floorProgressClaimed = false;
      this.privilegeTimer = 0;
      const doc = window.document;
      this.ultimateButton = doc && doc.querySelector ? doc.querySelector(".touch-btn.ultimate") : null;
      this.perkButton = doc && doc.querySelector ? doc.querySelector(".perk-btn") : null;
    }

    resizeCanvas() {
      const bounds = this.canvas.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(W, Math.round(bounds.width * density));
      const height = Math.round(width * H / W);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.pixelRatio = width / W;
      this.ctx.imageSmoothingEnabled = true;
    }

    makeStats() {
      return {
        start: performance.now(),
        deaths: 0,
        moyu: 0,
        damageTaken: 0,
        hits: 0,
        defeated: 0,
        bosses: 0,
        workItems: 0,
        cleared: false,
        finish: 0
      };
    }

    makeTask() {
      return {
        name: "把延期事项推进上线",
        progress: 0,
        target: 100,
        quality: 100,
        adUsesLeft: 3
      };
    }

    start() {
      requestAnimationFrame((now) => this.loop(now));
    }

    loop(now) {
      // Bound simulation steps while rendering on every display refresh (60/120 Hz).
      const elapsed = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
      this.last = now;
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
      for (let i = 0; i < steps; i += 1) {
        this.update(elapsed / steps);
        this.input.afterFrame();
      }
      this.draw();
      requestAnimationFrame((next) => this.loop(next));
    }

    startGame() {
      this.stats = this.makeStats();
      this.task = this.makeTask();
      this.privilegeTimer = 0;
      this.floorIndex = 0;
      this.player = new window.Player();
      this.loadFloor(0, true);
    }

    restartAfterEnding() {
      this.startGame();
      this.toast("新一轮事项开始");
    }

    loadFloor(index, first) {
      this.floorIndex = index;
      this.level = LEVELS[index];
      this.state = "playing";
      this.phase = "run";
      this.worldWidth = 1800;
      this.bossGate = 1410;
      this.freezeTimer = 0;
      this.screenShake = 0;
      this.toiletUsed = false;
      this.floorProgressClaimed = false;
      this.gateToastTimer = 0;
      this.projectiles = [];
      this.particles = [];
      this.slashes = [];
      this.floatingTexts = [];
      this.hitCheers = [];
      this.callout = null;
      this.boss = null;
      this.enemies = this.level.enemies.map((enemy) => new window.Enemy(enemy.type, enemy.x));
      this.pickups = this.level.pickups.map((pickup) => new window.Pickup(pickup.type, pickup.x));
      this.player.resetForFloor(index);
      if (first) {
        this.player.health = this.player.maxHealth;
        this.player.mind = this.player.maxMind;
        this.player.rage = 0;
        this.player.ammo = 8;
      }
      this.syncCameraToPlayer();
      this.toast(`${this.level.floor} ${this.level.taskName}`);
    }

    syncCameraToPlayer() {
      const target = clamp(this.player.x + this.player.w / 2 - W * 0.4, 0, this.worldWidth - W);
      const dt = arguments[0];
      this.camera.x = dt === undefined ? target : this.camera.x + (target - this.camera.x) * (1 - Math.exp(-10 * dt));
      this.camera.y = 0;
    }

    toast(text) {
      this.message = text;
      this.messageTimer = 2.2;
    }

    playerDown() {
      this.stats.deaths += 1;
      this.reduceTaskQuality(7);
      this.state = "down";
      this.stateTimer = 2.2;
      this.toast("倒下了，事项还没交付");
    }

    floorClear() {
      this.projectiles = [];
      this.enemies = [];
      this.freezeTimer = 0;
      this.screenShake = 14;
      if (!this.floorProgressClaimed) {
        const amount = this.level.clearProgress || 12;
        this.advanceTask(amount, `${this.level.deliverable} 完成 +${amount}%`, 2);
        this.floorProgressClaimed = true;
      }
      if (this.floorIndex >= LEVELS.length - 1) {
        this.state = "ending";
        this.stats.cleared = true;
        this.stats.finish = performance.now();
        this.stateTimer = 0;
        return;
      }
      this.state = "floorClear";
      this.stateTimer = 2.4;
      this.toast(`${this.level.bossName} 已下线`);
    }

    advanceTask(amount, text, qualityDelta) {
      const before = this.task.progress;
      this.task.progress = clamp(this.task.progress + amount, 0, this.task.target);
      this.task.quality = clamp(this.task.quality + (qualityDelta || 0), 0, 100);
      if (text && Math.round(this.task.progress) > Math.round(before)) this.toast(text);
    }

    collectWorkItem(amount, text) {
      this.stats.workItems += 1;
      this.advanceTask(amount, text, 1.5);
      this.cheer("资料到手!", this.player.x + this.player.w / 2, this.player.y - 8, COLORS.cyan);
      this.caption("关键资料入库", COLORS.cyan, 0.95);
    }

    reduceTaskQuality(amount) {
      this.task.quality = clamp(this.task.quality - amount, 0, 100);
    }

    canEnterBoss() {
      return Math.round(this.task.progress) >= (this.level.requiredProgress || 0);
    }

    requestAdPrivilege() {
      if (this.task.adUsesLeft <= 0) {
        this.toast("本局特权已用完");
        this.caption("继续靠操作推进", COLORS.pink, 0.9);
        return;
      }
      this.task.adUsesLeft -= 1;
      // 后续接激励广告 SDK 时，在广告完成回调里调用 grantAdPrivilege。
      this.grantAdPrivilege();
    }

    grantAdPrivilege() {
      this.privilegeTimer = Math.max(this.privilegeTimer, 8);
      if (this.player.health < 70 || this.player.mind < 58) {
        this.player.health = clamp(this.player.health + 52, 0, this.player.maxHealth);
        this.player.mind = clamp(this.player.mind + 42, 0, this.player.maxMind);
        this.toast("特权：状态续航");
        this.caption("状态续航已生效", COLORS.green, 1.0);
      } else if (this.task.quality < 86) {
        this.task.quality = clamp(this.task.quality + 12, 0, 100);
        this.toast("特权：质量补救");
        this.caption("交付质量回稳", COLORS.cyan, 1.0);
      } else {
        this.player.rage = clamp(this.player.rage + 45, 0, 100);
        this.player.ammo = clamp(this.player.ammo + 4, 0, this.player.maxAmmo);
        this.toast("特权：专注爆发");
        this.caption("专注加成 8 秒", COLORS.yellow, 1.0);
      }
      this.player.invuln = Math.max(this.player.invuln, 0.75);
      this.burst(this.player.x + this.player.w / 2, this.player.y + 24, COLORS.yellow, 14);
    }

    spawnPickup(type, x) {
      this.pickups.push(new window.Pickup(type, x));
    }

    burst(x, y, color, amount) {
      for (let i = 0; i < amount; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 180;
        this.particles.push(new window.Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 80, color, 0.35 + Math.random() * 0.35, 3 + Math.floor(Math.random() * 3)));
      }
    }

    floatText(text, x, y, color) {
      this.floatingTexts.push({
        text,
        x,
        y,
        color: color || "#fff",
        life: 1.18,
        maxLife: 1.18,
        vy: -18
      });
    }

    cheer(text, x, y, color) {
      const life = 0.82;
      this.hitCheers.push({
        text,
        x,
        y,
        color: color || COLORS.yellow,
        life,
        maxLife: life,
        vy: -26
      });
      this.hitCheers = this.hitCheers.slice(-12);
      const sparks = [COLORS.yellow, COLORS.pink, COLORS.cyan, color || COLORS.yellow];
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
        const s = 70 + Math.random() * 150;
        this.particles.push(new window.Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, sparks[i % sparks.length], 0.32 + Math.random() * 0.28, 3));
      }
    }

    caption(text, color, duration) {
      const life = duration || 0.95;
      this.callout = {
        text,
        color: color || COLORS.yellow,
        life,
        maxLife: life
      };
    }

    breathe(text, color, stop, duration) {
      // Feedback must never stop simulation, input, camera, or effect lifetimes.
      if (text) this.caption(text, color, Math.min(duration || 0.65, 0.75));
    }

    updateCallout(dt) {
      if (!this.callout) return;
      this.callout.life -= dt;
      if (this.callout.life <= 0) this.callout = null;
    }

    updateHitCheers(dt) {
      this.hitCheers.forEach((item) => {
        item.life -= dt;
        item.y += item.vy * dt;
      });
      this.hitCheers = this.hitCheers.filter((item) => item.life > 0);
    }

    syncTouchUi() {
      const ratio = clamp(this.player.rage / 100, 0, 1);
      const ready = ratio >= 1 && this.state === 'playing' && this.freezeTimer <= 0;
      const uses = this.task.adUsesLeft;
      const charge = this.freezeTimer > 0 ? '释放中' : ready ? 'READY' : `${Math.round(ratio * 100)}%`;
      const signature = [charge, uses, this.privilegeTimer > 0, this.state, this.floorIndex].join('|');
      if (signature === this.uiSignature) return;
      this.uiSignature = signature;
      if (this.ultimateButton) {
        this.ultimateButton.style.setProperty('--ult-ratio', ratio.toFixed(2));
        this.ultimateButton.dataset.charge = charge;
        this.ultimateButton.classList.toggle('is-ready', ready);
        this.ultimateButton.classList.toggle('is-active', this.freezeTimer > 0);
      }
      if (this.perkButton) {
        this.perkButton.dataset.charge = `${uses}次`;
        this.perkButton.classList.toggle('no-ads', uses <= 0);
        this.perkButton.classList.toggle('is-active', this.privilegeTimer > 0);
      }
      const shell = document.querySelector('.cabinet');
      if (shell) shell.dataset.state = this.state;
      const button = document.querySelector('.system b');
      if (button) button.textContent = this.state === 'paused' ? '继续' : this.state === 'ending' ? '再来' : '暂停';
      document.querySelectorAll('.floor-guide li').forEach((el, i) => el.classList.toggle('active', 4 - i === this.floorIndex));
    }

    addSlash(area, dir, opts) {
      const data = opts || {};
      const life = data.life || 0.18;
      this.slashes.push({ area: { ...area }, dir, life, maxLife: life, ...data });
    }

    hitEnemies(area, damage, knock, feedback) {
      let hit = false;
      this.enemies.forEach((enemy) => {
        if (!enemy.dead && rects(area, enemy.hitbox)) {
          enemy.takeDamage(damage, knock, this);
          if (feedback) {
            this.floatText(feedback.label || `-${Math.round(damage)}`, enemy.x + enemy.w / 2, enemy.y - 8, feedback.color || COLORS.yellow);
          }
          hit = true;
        }
      });
      if (this.boss && !this.boss.dead && rects(area, this.boss.hitbox)) {
        this.damageBoss(damage, knock);
        if (feedback) {
          this.floatText(feedback.label || `-${Math.round(damage)}`, this.boss.x + this.boss.w / 2, this.boss.y - 10, feedback.color || COLORS.yellow);
        }
        hit = true;
      }
      if (hit) this.screenShake = Math.max(this.screenShake, 4);
      if (hit && feedback && feedback.callout) {
        this.breathe(feedback.callout, feedback.color || COLORS.yellow, feedback.stop || 0.16, feedback.duration || 0.95);
      }
    }

    damageBoss(damage, knock = 0) {
      if (!this.boss || this.boss.dead) return;
      this.boss.takeDamage(damage, this, knock);
    }

    update(dt) {
      this.time += dt;
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.screenShake = Math.max(0, this.screenShake - 45 * dt);
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
      this.privilegeTimer = Math.max(0, this.privilegeTimer - dt);
      this.gateToastTimer = Math.max(0, this.gateToastTimer - dt);
      this.updateCallout(dt);
      this.syncTouchUi();

      if (this.state === "title") {
        if (this.input.consume("enter") || this.input.consume("j")) this.startGame();
        return;
      }

      if (this.state === "paused") {
        if (this.input.consume("enter") || this.input.consume("p")) this.state = "playing";
        return;
      }

      if (this.state === "playing" && (this.input.consume("enter") || this.input.consume("p"))) {
        this.state = "paused";
        return;
      }

      if (this.state === "playing" && this.input.consume("v")) {
        this.requestAdPrivilege();
      }

      if (this.state === "down") {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.loadFloor(this.floorIndex, false);
        return;
      }

      if (this.state === "floorClear") {
        this.stateTimer -= dt;
        this.updateParticles(dt);
        this.updateFloatingTexts(dt);
        this.updateHitCheers(dt);
        if (this.stateTimer <= 0) this.loadFloor(this.floorIndex + 1, false);
        return;
      }

      if (this.state === "ending") {
        if (this.input.consume("enter") || this.input.consume("j")) {
          this.restartAfterEnding();
          return;
        }
        this.stateTimer += dt;
        this.updateParticles(dt);
        this.updateFloatingTexts(dt);
        this.updateHitCheers(dt);
        return;
      }

      this.updatePlaying(dt);
    }

    characterPositions() {
      return new Map([this.player, ...this.enemies, this.boss].filter(Boolean)
        .map(entity => [entity, { x: entity.x, y: entity.y }]));
    }

    resolveCharacterCollisions(previous = this.characterPositions()) {
      const player = this.player;
      const beforePlayer = previous.get(player) || player;
      const gap = 6;
      const opponents = [...this.enemies, this.boss].filter(entity => entity && !entity.dead);
      for (const enemy of opponents) {
        // Jumping above a body remains possible. On landing, bodies separate again.
        if (player.y + player.h <= enemy.y || player.y >= enemy.y + enemy.h) continue;
        const beforeEnemy = previous.get(enemy) || enemy;
        const wasVerticallyTouching = beforePlayer.y + player.h > beforeEnemy.y && beforePlayer.y < beforeEnemy.y + enemy.h;
        const oldDelta = beforeEnemy.x + enemy.w / 2 - beforePlayer.x - player.w / 2;
        const delta = enemy.x + enemy.w / 2 - player.x - player.w / 2;
        const side = Math.sign(wasVerticallyTouching ? oldDelta : delta) || player.dir;
        const desired = side > 0 ? player.x + player.w + gap : player.x - enemy.w - gap;
        if (side > 0 ? enemy.x >= desired : enemy.x <= desired) continue;

        // Preserve ordering from the start of the step, including fast charge/thrust crossings.
        const minX = 20, maxX = this.worldWidth - enemy.w - 20;
        const fits = desired >= minX && desired <= maxX;
        if (fits) {
          enemy.x = desired;
        } else {
          const previouslySeparated = side > 0
            ? beforeEnemy.x >= beforePlayer.x + player.w + gap - 0.001
            : beforeEnemy.x + enemy.w + gap <= beforePlayer.x + 0.001;
          if (previouslySeparated && (player.x - beforePlayer.x) * side > 0) {
            // A solid level edge blocks the player's attempted push; pursuit never pushes her back.
            enemy.x = clamp(desired, minX, maxX);
            player.x = side > 0 ? enemy.x - player.w - gap : enemy.x + enemy.w + gap;
            player.vx = 0;
          } else {
            // Recover an invalid spawn/landing overlap at an edge without moving the player.
            const otherSide = side > 0 ? player.x - enemy.w - gap : player.x + player.w + gap;
            enemy.x = clamp(otherSide, minX, maxX);
          }
        }
        const actualSide = Math.sign(enemy.x + enemy.w / 2 - player.x - player.w / 2) || side;
        if ((enemy.vx || 0) * actualSide < 0) enemy.vx = 0;
        if (enemy === this.boss && enemy.rushTimer > 0) {
          if (!(enemy.hitStun > 0)) player.takeDamage(18, 14, this, 'rush');
          enemy.rushTimer = 0;
        }
      }
    }

    updatePlaying(dt) {
      const previous = this.characterPositions();
      this.pickups.forEach(pickup => { pickup.animTime = this.time; });
      this.player.update(dt, this);
      if (this.state !== 'playing') return;
      this.resolveCharacterCollisions(previous);
      this.applyHazards(dt);
      this.updatePickups();

      this.enemies.forEach((enemy) => enemy.update(dt, this));
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);

      if (this.phase === "run" && this.player.x > this.bossGate) {
        if (!this.canEnterBoss()) {
          const need = this.level.requiredProgress || 0;
          this.player.x = this.bossGate - 42;
          this.player.vx = Math.min(this.player.vx, 0);
          if (this.gateToastTimer <= 0) {
            this.toast(`事项进度 ${Math.round(this.task.progress)}/${need}，先补资料`);
            this.caption("进度达标才能验收", COLORS.yellow, 0.95);
            this.gateToastTimer = 1.45;
          }
        } else {
          this.phase = "boss";
          this.worldWidth = 1840;
          this.boss = new window.Boss(this.level, this.floorIndex);
          this.player.x = Math.min(this.player.x, 1470);
          this.toast(`${this.level.bossName} 开始验收`);
        }
      }

      if (this.boss) this.boss.update(dt, this);
      this.resolveCharacterCollisions(previous);

      this.projectiles.forEach((projectile) => {
        projectile.update(dt, this);
        if (projectile.dead) return;
        if (projectile.owner === "player") {
          let hit = false;
          this.enemies.forEach((enemy) => {
            if (!hit && !enemy.dead && rects(projectile, enemy.hitbox)) {
              enemy.takeDamage(projectile.damage, projectile.vx > 0 ? 90 : -90, this);
              hit = true;
            }
          });
          if (!hit && this.boss && !this.boss.dead && rects(projectile, this.boss.hitbox)) {
            this.damageBoss(projectile.damage, Math.sign(projectile.vx) * 90);
            hit = true;
          }
          if (hit) projectile.dead = true;
        } else if (rects(projectile, this.player.hitbox)) {
          this.player.takeDamage(projectile.damage, projectile.mindDamage, this, projectile.kind);
          projectile.dead = true;
        }
      });
      this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);

      this.updateParticles(dt);
      this.updateFloatingTexts(dt);
      this.updateHitCheers(dt);
      this.slashes.forEach((slash) => { slash.life -= dt; });
      this.slashes = this.slashes.filter((slash) => slash.life > 0);

      this.syncCameraToPlayer(dt);
    }

    updateParticles(dt) {
      this.particles.forEach((particle) => particle.update(dt));
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    updateFloatingTexts(dt) {
      this.floatingTexts.forEach((item) => {
        item.life -= dt;
        item.y += item.vy * dt;
      });
      this.floatingTexts = this.floatingTexts.filter((item) => item.life > 0);
    }

    updatePickups() {
      this.pickups.forEach((pickup) => {
        if (pickup.used && pickup.type !== "toilet") return;
        if (rects(this.player.hitbox, pickup)) pickup.apply(this.player, this);
      });
    }

    applyHazards(dt) {
      this.level.hazards.forEach((hazard) => {
        if (hazard.type === "laser") {
          const active = ((this.time + hazard.offset) % hazard.period) < hazard.period * 0.45;
          if (!active) return;
          const box = { x: hazard.x, y: hazard.y, w: hazard.w, h: 18 };
          if (rects(this.player.hitbox, box)) this.player.takeDamage(9, 12, this, "laser");
        } else if (hazard.type === "conveyor") {
          const on = {
            x: hazard.x,
            y: hazard.y - 16,
            w: hazard.w,
            h: 30
          };
          if (this.player.onGround && rects(this.player.hitbox, on)) {
            this.player.vx += hazard.dir * 290 * dt;
          }
        }
      });
    }

    elapsedSeconds() {
      const end = this.stats.finish || performance.now();
      return Math.max(0, Math.floor((end - this.stats.start) / 1000));
    }

    title() {
      if (this.stats.cleared && this.task.quality >= 92 && this.stats.deaths === 0) return "高质量交付人";
      if (this.stats.cleared && this.task.adUsesLeft === 0) return "资源整合大师";
      if (this.stats.cleared && this.stats.workItems >= 5) return "资料闭环专家";
      if (this.stats.deaths >= 5) return "韧性负责人";
      if (this.stats.moyu >= 10) return "节奏管理大师";
      return "事项推进官";
    }

    settlementScore() {
      const raw = 220
        + Math.round(this.task.progress * 2.0)
        + Math.round(this.task.quality * 2.2)
        + this.stats.bosses * 38
        + this.stats.defeated * 12
        + this.stats.workItems * 28
        + Math.round(this.stats.hits * 1.4)
        - this.stats.deaths * 80
        - this.stats.moyu * 12
        - (3 - this.task.adUsesLeft) * 35
        - Math.round(this.stats.damageTaken * 0.35)
        - Math.round(this.elapsedSeconds() * 1.6);
      return Math.round(clamp(raw, 0, 999));
    }

    settlementGrade(score) {
      if (score >= 920) return "S";
      if (score >= 780) return "A";
      if (score >= 620) return "B";
      return "C";
    }


    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (this.state === 'title') { this.drawTitle(ctx); return; }
      this.drawWorld(ctx);
      this.drawHud(ctx);
      if (this.state === 'paused') this.drawOverlay(ctx, '暂停摸鱼中', '按 ENTER 或点继续返回战斗');
      if (this.state === 'down') this.drawOverlay(ctx, '被 KPI 放倒', '正在从工位复活');
      if (this.state === 'floorClear') this.drawOverlay(ctx, '验收通过', '下一层，继续反击');
      if (this.state === 'ending') this.drawEnding(ctx);
    }

    drawTitle(ctx) {
      window.GameArt.title(ctx, this);
    }

    drawWorld(ctx) {
      ctx.save();
      const shake = this.reducedMotion ? 0 : Math.min(2.5, this.screenShake * 0.22);
      ctx.translate(Math.sin(this.time * 66) * shake, Math.cos(this.time * 49) * shake * 0.45);
      this.drawCity(ctx, this.level.theme, this.camera.x);
      ctx.save();
      ctx.translate(-this.camera.x, -this.camera.y);
      const worldSpace = { x: 0, y: 0 };
      this.drawOffice(ctx);
      this.drawHazards(ctx);
      this.pickups.forEach((pickup) => pickup.draw(ctx, worldSpace));
      this.enemies.forEach((enemy) => enemy.draw(ctx, worldSpace));
      if (this.boss) this.boss.draw(ctx, worldSpace);
      this.projectiles.forEach((projectile) => projectile.draw(ctx, worldSpace));
      this.player.draw(ctx, worldSpace);
      this.slashes.forEach((slash) => this.drawSlash(ctx, slash));
      this.particles.forEach((particle) => particle.draw(ctx, worldSpace));
      this.floatingTexts.forEach((item) => this.drawFloatingText(ctx, item));
      this.hitCheers.forEach((item) => this.drawHitCheer(ctx, item));
      ctx.restore();
      ctx.restore();
      if (this.phase === "boss") this.drawBossHp(ctx);
      if (this.freezeTimer > 0) this.drawUltimateActive(ctx);
      if (this.messageTimer > 0) this.drawToast(ctx);
      if (this.callout) this.drawCallout(ctx);
    }

    drawCity(ctx, theme, camX) {
      window.GameArt.city(ctx, theme, camX, this.time);
    }

    drawOffice(ctx) {
      window.GameArt.office(ctx, this);
    }

    drawDesk(ctx, x, y) {
      window.GameArt.desk(ctx, x, y);
    }

    drawHazards(ctx) {
      this.level.hazards.forEach((hazard) => {
        if (hazard.type === "laser") {
          const active = ((this.time + hazard.offset) % hazard.period) < hazard.period * 0.45;
          ctx.fillStyle = active ? COLORS.red : "rgba(220,38,38,.22)";
          ctx.fillRect(hazard.x, hazard.y, hazard.w, 18);
          ctx.fillStyle = active ? "#fff" : "rgba(255,255,255,.22)";
          ctx.fillRect(hazard.x, hazard.y + 7, hazard.w, 4);
          ctx.fillStyle = COLORS.ink;
          ctx.fillRect(hazard.x - 10, hazard.y - 8, 10, 34);
          ctx.fillRect(hazard.x + hazard.w, hazard.y - 8, 10, 34);
        } else if (hazard.type === "conveyor") {
          ctx.fillStyle = "#111827";
          ctx.fillRect(hazard.x, hazard.y, hazard.w, 20);
          ctx.fillStyle = "#6b7280";
          for (let x = hazard.x + ((Math.floor(this.time * 70) * hazard.dir) % 28); x < hazard.x + hazard.w; x += 28) {
            ctx.fillRect(x, hazard.y + 3, 16, 14);
          }
        }
      });
    }

    drawSlash(ctx, slash) {
      window.GameArt.slash(ctx, slash);
    }

    drawFloatingText(ctx, item) {
      window.GameArt.floating(ctx, item);
    }

    drawHitCheer(ctx, item) {
      window.GameArt.cheer(ctx, item);
    }

    drawCallout(ctx) {
      window.GameArt.callout(ctx, this);
    }

    drawHud(ctx) {
      window.GameArt.hud(ctx, this);
    }


    drawUltimateActive(ctx) {
      window.GameArt.ultimate(ctx, this);
    }




    drawBossHp(ctx) {
      window.GameArt.bossHp(ctx, this);
    }

    drawToast(ctx) {
      window.GameArt.toast(ctx, this);
    }

    drawOverlay(ctx, title, sub) {
      window.GameArt.overlay(ctx, title, sub);
    }



    drawEnding(ctx) {
      window.GameArt.ending(ctx, this);
    }

  }

  window.BossRushGame = Game;
}());
