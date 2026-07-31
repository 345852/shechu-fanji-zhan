(function () {
  const { W, H, GROUND, COLORS, LEVELS } = window.GameData;
  const { clamp, rects } = window.GameUtils;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
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
      this.hitStopTimer = 0;
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
      const dt = Math.min(0.033, (now - this.last) / 1000 || 0);
      this.last = now;
      this.update(dt);
      this.draw();
      this.input.afterFrame();
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
      this.hitStopTimer = 0;
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
      this.camera.x = this.player.x + this.player.w / 2 - W / 2;
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
      if (text) this.caption(text, color, duration);
      this.hitStopTimer = Math.max(this.hitStopTimer, Math.min(stop || 0.16, 0.38));
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
      const ready = ratio >= 1 && this.state === "playing" && this.freezeTimer <= 0;
      if (this.ultimateButton) {
        this.ultimateButton.style.setProperty("--ult-ratio", ratio.toFixed(2));
        this.ultimateButton.dataset.charge = this.freezeTimer > 0 ? "释放中" : ready ? "READY" : `${Math.round(ratio * 100)}%`;
        this.ultimateButton.classList.toggle("is-ready", ready);
        this.ultimateButton.classList.toggle("is-active", this.freezeTimer > 0);
      }
      if (this.perkButton) {
        const uses = this.task ? this.task.adUsesLeft : 0;
        this.perkButton.dataset.charge = uses > 0 ? `${uses}次` : "0次";
        this.perkButton.classList.toggle("no-ads", uses <= 0);
        this.perkButton.classList.toggle("is-active", this.privilegeTimer > 0);
      }
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
        this.damageBoss(damage);
        if (feedback) {
          this.floatText(feedback.label || `-${Math.round(damage)}`, this.boss.x + this.boss.w / 2, this.boss.y - 10, feedback.color || COLORS.yellow);
        }
        hit = true;
      }
      if (hit) this.screenShake = Math.max(this.screenShake, 4);
      if (hit && feedback && feedback.callout) {
        this.breathe(feedback.callout, feedback.color || COLORS.yellow, feedback.stop || 0.16, feedback.duration || 0.95);
      } else if (hit) {
        this.hitStopTimer = Math.max(this.hitStopTimer, 0.1);
      }
    }

    damageBoss(damage) {
      if (!this.boss || this.boss.dead) return;
      this.boss.takeDamage(damage, this);
    }

    update(dt) {
      this.time += dt;
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.screenShake = Math.max(0, this.screenShake - 45 * dt);
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
      this.privilegeTimer = Math.max(0, this.privilegeTimer - dt);
      this.gateToastTimer = Math.max(0, this.gateToastTimer - dt);
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
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

    updatePlaying(dt) {
      if (this.hitStopTimer > 0) {
        this.updateParticles(dt * 0.3);
        this.updateFloatingTexts(dt * 0.45);
        this.updateHitCheers(dt * 0.45);
        this.slashes.forEach((slash) => { slash.life -= dt * 0.35; });
        this.slashes = this.slashes.filter((slash) => slash.life > 0);
        this.syncCameraToPlayer();
        return;
      }

      this.player.update(dt, this);
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
            this.damageBoss(projectile.damage);
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

      this.syncCameraToPlayer();
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

    drawCenteredText(ctx, text, y, font, color) {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(text, Math.round(W / 2 - ctx.measureText(text).width / 2), y);
    }

    draw() {
      const ctx = this.ctx;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      const shakeX = this.screenShake ? (Math.random() - 0.5) * this.screenShake : 0;
      const shakeY = this.screenShake ? (Math.random() - 0.5) * this.screenShake : 0;
      ctx.translate(Math.round(shakeX), Math.round(shakeY));

      if (this.state === "title") {
        this.drawTitle(ctx);
      } else {
        this.drawWorld(ctx);
        this.drawHud(ctx);
        if (this.state === "paused") this.drawOverlay(ctx, "暂停摸鱼中", "点开始继续");
        if (this.state === "down") this.drawOverlay(ctx, "被 KPI 放倒", "正在从工位复活");
        if (this.state === "floorClear") this.drawOverlay(ctx, "楼层清空", "电梯上行中");
        if (this.state === "ending") this.drawEnding(ctx);
      }
      ctx.restore();
    }

    drawTitle(ctx) {
      ctx.fillStyle = "#050816";
      ctx.fillRect(0, 0, W, H);
      this.drawCity(ctx, { sky: "#111827", back: "#26305f", floor: "#46516f", neon: COLORS.yellow }, 0);
      this.drawCenteredText(ctx, "社畜反击战", 148, "46px Courier New", COLORS.yellow);
      ctx.fillStyle = COLORS.pink;
      ctx.fillRect(W / 2 - 128, 166, 256, 8);
      this.drawCenteredText(ctx, "从工位推进到顶楼", 220, "18px Courier New", "#ffffff");
      this.drawCenteredText(ctx, "把延期事项推进上线", 246, "18px Courier New", "#ffffff");
      this.drawCenteredText(ctx, "点开始进入公司大楼", 294, "18px Courier New", COLORS.cyan);
      this.drawCenteredText(ctx, "收集资料 · 处理阻碍 · 通过验收", 322, "18px Courier New", COLORS.cyan);
      this.drawCenteredText(ctx, "5 层交付 · 进度门槛 · 特权续航", 362, "16px Courier New", "#fff7d8");
      this.drawPixelWorker(ctx, W / 2 - 52, 410, 1, 3);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(W / 2 + 26, 442, 120, 14);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "18px Courier New";
      ctx.fillText("上线单", W / 2 + 58, 456);
    }

    drawWorld(ctx) {
      this.drawCity(ctx, this.level.theme, this.camera.x);
      ctx.save();
      ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));
      const worldSpace = { x: 0, y: 0 };
      this.drawOffice(ctx);
      this.drawHazards(ctx);
      this.pickups.forEach((pickup) => pickup.draw(ctx, worldSpace));
      this.enemies.forEach((enemy) => enemy.draw(ctx, worldSpace));
      if (this.boss) this.boss.draw(ctx, worldSpace);
      this.projectiles.forEach((projectile) => projectile.draw(ctx, worldSpace));
      this.slashes.forEach((slash) => this.drawSlash(ctx, slash));
      this.player.draw(ctx, worldSpace);
      this.particles.forEach((particle) => particle.draw(ctx, worldSpace));
      this.floatingTexts.forEach((item) => this.drawFloatingText(ctx, item));
      this.hitCheers.forEach((item) => this.drawHitCheer(ctx, item));
      ctx.restore();
      if (this.phase === "boss") this.drawBossHp(ctx);
      if (this.freezeTimer > 0) this.drawUltimateActive(ctx);
      if (this.messageTimer > 0) this.drawToast(ctx);
      if (this.callout) this.drawCallout(ctx);
    }

    drawCity(ctx, theme, camX) {
      ctx.fillStyle = theme.sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = theme.back;
      for (let i = -1; i < 9; i += 1) {
        const x = Math.round(i * 150 - (camX || 0) * 0.16) % 1200;
        const h = 130 + (i % 3) * 34;
        ctx.fillRect(x, GROUND - 190 - h * 0.25, 96, h);
        ctx.fillStyle = "rgba(255,255,255,.18)";
        for (let y = GROUND - 170 - h * 0.25; y < GROUND - 30; y += 28) {
          ctx.fillRect(x + 16, y, 12, 8);
          ctx.fillRect(x + 52, y, 12, 8);
        }
        ctx.fillStyle = theme.back;
      }
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(0, 0, W, 124);
      ctx.fillStyle = theme.neon;
      ctx.fillRect(0, GROUND + 42, W, 7);
    }

    drawOffice(ctx) {
      const floorLeft = this.camera.x - 80;
      const floorWidth = W + 160;
      ctx.fillStyle = this.level.theme.floor;
      ctx.fillRect(floorLeft, GROUND, floorWidth, H - GROUND);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(floorLeft, GROUND, floorWidth, 10);
      for (let x = 120; x < this.bossGate - 60; x += 230) {
        this.drawDesk(ctx, x, GROUND - 48);
      }
      ctx.fillStyle = "#fff7d8";
      ctx.fillRect(this.bossGate, GROUND - 130, 70, 130);
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(this.bossGate + 10, GROUND - 112, 50, 112);
      ctx.fillStyle = COLORS.yellow;
      ctx.font = "16px Courier New";
      ctx.fillText("验收", this.bossGate + 12, GROUND - 88);
      ctx.font = "13px Courier New";
      ctx.fillText(`${this.level.requiredProgress}%`, this.bossGate + 15, GROUND - 66);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.level.floor, 48, 64);
    }

    drawDesk(ctx, x, y) {
      ctx.fillStyle = "#7c3f1d";
      ctx.fillRect(x, y + 24, 86, 18);
      ctx.fillStyle = "#c08457";
      ctx.fillRect(x - 5, y + 16, 96, 12);
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(x + 20, y, 42, 24);
      ctx.fillStyle = "#111827";
      ctx.fillRect(x + 24, y + 5, 34, 14);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(x + 28, y + 8, 24, 4);
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
      const a = clamp(slash.life / slash.maxLife, 0, 1);
      const area = slash.area;
      const tipX = slash.dir > 0 ? area.x + area.w : area.x;
      ctx.globalAlpha = a;
      if (slash.kind === "reflect") {
        const sx = slash.dir > 0 ? area.x + area.w - 10 : area.x - 8;
        ctx.fillStyle = "rgba(39,212,255,.45)";
        ctx.fillRect(sx - 6, area.y - 6, 24, area.h + 14);
        ctx.fillStyle = COLORS.cyan;
        ctx.fillRect(sx, area.y - 10, 8, area.h + 22);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx + 3, area.y - 2, 2, area.h + 4);
        ctx.fillStyle = COLORS.yellow;
        for (let i = 0; i < 4; i += 1) {
          ctx.fillRect(sx + slash.dir * (15 + i * 9), area.y + 4 + i * 9, 6, 6);
        }
      } else if (slash.kind === "resign") {
        const lead = slash.dir > 0 ? area.x + area.w - 12 : area.x - 34;
        ctx.fillStyle = "rgba(255,218,20,.35)";
        ctx.fillRect(area.x - 8, area.y + 8, area.w + 18, 18);
        ctx.fillStyle = COLORS.pink;
        ctx.fillRect(area.x + (slash.dir > 0 ? 4 : 22), area.y + 2, area.w - 20, 8);
        ctx.fillStyle = "#fff7d8";
        ctx.fillRect(lead, area.y + 7, 46, 24);
        ctx.fillStyle = COLORS.ink;
        ctx.font = "12px Courier New";
        ctx.fillText("上线", lead + 9, area.y + 23);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(tipX - (slash.dir > 0 ? 2 : 18), area.y + 1, 18, area.h);
      } else {
        const combo = slash.combo || 1;
        ctx.fillStyle = combo === 3 ? COLORS.pink : COLORS.yellow;
        for (let i = 0; i < combo + 1; i += 1) {
          const y = area.y + 5 + i * 8;
          const inset = i * 7;
          ctx.fillRect(area.x + inset, y, Math.max(16, area.w - inset), 7);
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(tipX + (slash.dir > 0 ? -22 : 8), area.y + 2, 15, area.h - 4);
        if (combo === 3) {
          ctx.fillStyle = COLORS.cyan;
          ctx.fillRect(tipX + (slash.dir > 0 ? -10 : 0), area.y - 12, 10, area.h + 22);
        }
      }
      if (slash.label) {
        ctx.fillStyle = "rgba(5,8,22,.82)";
        ctx.fillRect(area.x, area.y - 24, Math.min(96, Math.max(56, slash.label.length * 13)), 18);
        ctx.fillStyle = slash.color || COLORS.yellow;
        ctx.font = "13px Courier New";
        ctx.fillText(slash.label, area.x + 5, area.y - 10);
      }
      ctx.globalAlpha = 1;
    }

    drawFloatingText(ctx, item) {
      const a = clamp(item.life / item.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = "16px Courier New";
      const width = Math.max(28, ctx.measureText(item.text).width + 12);
      const x = Math.round(item.x - width / 2);
      const y = Math.round(item.y);
      ctx.fillStyle = "rgba(5,8,22,.84)";
      ctx.fillRect(x, y - 16, width, 20);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x + 6, y - 1);
      ctx.globalAlpha = 1;
    }

    drawHitCheer(ctx, item) {
      const a = clamp(item.life / item.maxLife, 0, 1);
      const pop = 1 + (1 - a) * 0.18;
      const text = String(item.text);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.25);
      ctx.font = "18px Courier New";
      const width = Math.min(126, Math.max(82, ctx.measureText(text).width + 20));
      const x = Math.round(item.x - width / 2);
      const y = Math.round(item.y);
      ctx.translate(x + width / 2, y - 18);
      ctx.scale(pop, pop);
      ctx.translate(-(x + width / 2), -(y - 18));
      ctx.fillStyle = "rgba(5,8,22,.9)";
      ctx.fillRect(x + 4, y - 38, width, 30);
      ctx.fillStyle = item.color || COLORS.yellow;
      ctx.fillRect(x, y - 42, width, 30);
      ctx.fillStyle = "#050816";
      ctx.fillRect(x + 4, y - 38, width - 8, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x + Math.round((width - ctx.measureText(text).width) / 2), y - 21);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x - 7, y - 37, 5, 5);
      ctx.fillStyle = COLORS.pink;
      ctx.fillRect(x + width + 3, y - 22, 6, 6);
      ctx.restore();
    }

    drawCallout(ctx) {
      const item = this.callout;
      const a = clamp(item.life / item.maxLife, 0, 1);
      const text = String(item.text);
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.45 + a * 0.55);
      ctx.font = "20px Courier New";
      const width = Math.min(W - 28, Math.max(172, ctx.measureText(text).width + 38));
      const x = Math.round(W / 2 - width / 2);
      const y = this.phase === "boss" ? 232 : 222;
      ctx.fillStyle = "rgba(5,8,22,.92)";
      ctx.fillRect(x + 5, y + 5, width, 46);
      ctx.fillStyle = item.color || COLORS.yellow;
      ctx.fillRect(x, y, width, 46);
      ctx.fillStyle = "#050816";
      ctx.fillRect(x + 4, y + 4, width - 8, 38);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x + Math.round((width - ctx.measureText(text).width) / 2), y + 29);
      ctx.restore();
    }

    drawHud(ctx) {
      ctx.fillStyle = "rgba(5,8,22,.86)";
      ctx.fillRect(8, 8, W - 16, 130);
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, W - 16, 130);
      ctx.font = "14px Courier New";
      ctx.fillStyle = "#fff";
      ctx.fillText(`${this.level.floor} ${this.level.title}`, 18, 30);
      ctx.font = "12px Courier New";
      ctx.fillStyle = "#fff7d8";
      ctx.fillText(`事项 ${Math.round(this.task.progress)}%  门槛 ${this.level.requiredProgress}%`, 18, 49);
      this.drawTaskGauge(ctx, 58, 58, 116, 9);
      ctx.fillStyle = "#fff";
      ctx.font = "14px Courier New";
      ctx.fillText(`弹药 ${this.player.ammo}/${this.player.maxAmmo}`, 18, 82);
      this.drawBar(ctx, 58, 96, 116, 9, this.player.health / this.player.maxHealth, COLORS.red, "体力");
      this.drawBar(ctx, 58, 112, 116, 9, this.player.mind / this.player.maxMind, COLORS.cyan, "心态");
      this.drawBar(ctx, 58, 128, 116, 8, this.player.rage / 100, COLORS.yellow, "怒气");
      this.drawMoveCard(ctx, 190, 54);
      ctx.fillStyle = "#fff";
      ctx.font = "13px Courier New";
      ctx.fillText(`倒${this.stats.deaths}`, 342, 40);
      ctx.fillText(`鱼${this.stats.moyu}`, 342, 62);
      ctx.fillText(`${this.elapsedSeconds()}s`, 342, 84);
      ctx.fillText(`质${Math.round(this.task.quality)}`, 342, 106);
      if (this.player.broken > 0) this.statusTag(ctx, "破防", 12, 164, COLORS.pink);
      if (this.player.meetingTrap > 0) this.statusTag(ctx, "会议", 70, 164, COLORS.yellow);
      if (this.player.attackDebuff > 0) this.statusTag(ctx, "缩水", 128, 164, COLORS.orange);
      if (this.player.moyu) this.statusTag(ctx, "摸鱼", 186, 164, COLORS.green);
      if (this.privilegeTimer > 0) this.statusTag(ctx, "特权", 244, 164, COLORS.yellow);
    }

    drawMoveCard(ctx, x, y) {
      const move = this.player.currentMove();
      const cd = this.player.specialCd;
      const rageRatio = clamp(this.player.rage / 100, 0, 1);
      const rageText = this.freezeTimer > 0 ? `冻结 ${this.freezeTimer.toFixed(1)}s` : rageRatio >= 1 ? "大招 READY" : `大招 ${Math.round(rageRatio * 100)}%`;
      const ready = rageRatio >= 1 && this.freezeTimer <= 0;
      ctx.fillStyle = COLORS.purple;
      ctx.fillRect(x, y, 136, 62);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 136, 62);
      if (ready && Math.floor(this.time * 6) % 2 === 0) {
        ctx.strokeStyle = COLORS.yellow;
        ctx.strokeRect(x - 3, y - 3, 142, 68);
      }
      ctx.fillStyle = COLORS.yellow;
      ctx.font = "13px Courier New";
      ctx.fillText("当前招式", x + 8, y + 14);
      ctx.fillStyle = "#fff";
      ctx.font = "14px Courier New";
      ctx.fillText(move.name, x + 8, y + 29);
      ctx.fillStyle = cd > 0 ? COLORS.pink : COLORS.cyan;
      ctx.font = "12px Courier New";
      ctx.fillText(cd > 0 ? `CD ${cd.toFixed(1)}s` : move.hint, x + 8, y + 40);
      ctx.fillStyle = "#050816";
      ctx.fillRect(x + 8, y + 46, 120, 11);
      ctx.fillStyle = ready ? COLORS.yellow : COLORS.orange;
      ctx.fillRect(x + 8, y + 46, Math.floor(120 * rageRatio), 11);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 8, y + 46, 120, 11);
      ctx.fillStyle = ready ? COLORS.ink : "#ffffff";
      ctx.font = "11px Courier New";
      ctx.fillText(rageText, x + 12, y + 55);
    }

    drawUltimateActive(ctx) {
      const a = clamp(this.freezeTimer / 3, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.24 + a * 0.2;
      ctx.fillStyle = COLORS.yellow;
      for (let y = 176; y < 344; y += 24) {
        ctx.fillRect(0, y + Math.floor((this.time * 60) % 12), W, 4);
      }
      ctx.globalAlpha = 1;
      const text = "已读不回生效中";
      ctx.font = "20px Courier New";
      const width = Math.max(190, ctx.measureText(text).width + 34);
      const x = Math.round(W / 2 - width / 2);
      const y = 164;
      ctx.fillStyle = "rgba(5,8,22,.9)";
      ctx.fillRect(x + 5, y + 5, width, 36);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x, y, width, 36);
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(text, x + Math.round((width - ctx.measureText(text).width) / 2), y + 24);
      ctx.restore();
    }

    drawBar(ctx, x, y, w, h, ratio, color, label) {
      ctx.fillStyle = "#111827";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.floor(w * clamp(ratio, 0, 1)), h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "13px Courier New";
      ctx.fillText(label, x - 42, y + h - 2);
    }

    drawTaskGauge(ctx, x, y, w, h) {
      const ratio = this.task.progress / this.task.target;
      ctx.fillStyle = "#111827";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(x, y, Math.floor(w * clamp(ratio, 0, 1)), h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "13px Courier New";
      ctx.fillText("事项", x - 42, y + h);
      ctx.fillStyle = COLORS.yellow;
      ctx.font = "10px Courier New";
      const text = `${Math.round(this.task.progress)}/${this.task.target}`;
      ctx.fillText(text, x + w - 42, y + h - 1);
    }

    statusTag(ctx, text, x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 15, 52, 18);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "13px Courier New";
      ctx.fillText(text, x + 8, y - 2);
    }

    drawBossHp(ctx) {
      if (!this.boss) return;
      const y = 150;
      ctx.fillStyle = "rgba(17,24,39,.9)";
      ctx.fillRect(28, y, W - 56, 32);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(28, y, W - 56, 32);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(34, y + 7, Math.floor((W - 68) * clamp(this.boss.hp / this.boss.maxHp, 0, 1)), 18);
      ctx.fillStyle = "#fff";
      ctx.font = "15px Courier New";
      const phase = this.floorIndex === 4 ? ` P${this.boss.phase}` : "";
      ctx.fillText(`${this.boss.name}${phase}`, 38, y + 22);
    }

    drawToast(ctx) {
      const text = this.message;
      ctx.font = "16px Courier New";
      const width = Math.min(W - 24, Math.max(180, ctx.measureText(text).width + 32));
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(W / 2 - width / 2, 190, width, 30);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - width / 2, 190, width, 30);
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(text, W / 2 - width / 2 + 16, 211);
    }

    drawOverlay(ctx, title, sub) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, W, H);
      this.drawCenteredText(ctx, title, H / 2 - 28, "34px Courier New", COLORS.yellow);
      this.drawCenteredText(ctx, sub, H / 2 + 12, "18px Courier New", "#fff");
    }

    drawPixelPanel(ctx, x, y, w, h, color) {
      ctx.fillStyle = "rgba(0,0,0,.42)";
      ctx.fillRect(x + 8, y + 8, w, h);
      ctx.fillStyle = color || COLORS.yellow;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#050816";
      ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
    }

    drawMetricBox(ctx, label, value, x, y, w, color) {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(x, y, w, 48);
      ctx.strokeStyle = color || COLORS.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, 48);
      ctx.fillStyle = "#fff7d8";
      ctx.font = "12px Courier New";
      ctx.fillText(label, x + 8, y + 16);
      ctx.fillStyle = color || "#ffffff";
      ctx.font = "18px Courier New";
      ctx.fillText(String(value), x + 8, y + 38);
    }

    drawEnding(ctx) {
      ctx.fillStyle = "rgba(5,8,22,.88)";
      ctx.fillRect(0, 0, W, H);
      const t = this.stateTimer;
      const confetti = [COLORS.yellow, COLORS.pink, COLORS.cyan, COLORS.green, COLORS.orange];
      for (let i = 0; i < 30; i += 1) {
        const x = Math.round((i * 47 + t * (42 + i % 4 * 10)) % W);
        const y = Math.round((i * 71 + t * (28 + i % 5 * 8)) % H);
        ctx.fillStyle = confetti[i % confetti.length];
        ctx.fillRect(x, y, 6 + i % 3, 6 + (i + 1) % 3);
      }

      const score = this.settlementScore();
      const grade = this.settlementGrade(score);
      this.drawPixelPanel(ctx, 24, 48, W - 48, 574, COLORS.yellow);
      ctx.fillStyle = COLORS.yellow;
      ctx.font = "30px Courier New";
      ctx.fillText("事项结算单", 54, 92);
      ctx.fillStyle = grade === "S" ? COLORS.yellow : grade === "A" ? COLORS.cyan : COLORS.pink;
      ctx.fillRect(318, 64, 54, 42);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "32px Courier New";
      ctx.fillText(grade, 337, 96);

      const workerX = 58 + Math.min(38, t * 26);
      this.drawPixelWorker(ctx, workerX, 128, 1, 2);
      ctx.fillStyle = "#7c3f1d";
      ctx.fillRect(274, 168, 84, 28);
      ctx.fillStyle = "#fff7d8";
      const letterY = t < 1.8 ? 118 + t * 30 : 172;
      ctx.fillRect(194, letterY, 74, 28);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "13px Courier New";
      ctx.fillText("上线单", 211, letterY + 19);

      ctx.fillStyle = "#ffffff";
      ctx.font = "18px Courier New";
      ctx.fillText("恭喜你，事项已上线！", 162, 138);
      ctx.fillStyle = COLORS.cyan;
      ctx.font = "14px Courier New";
      ctx.fillText("交付结果：老板已确认", 162, 162);

      this.drawMetricBox(ctx, "通关时间", `${this.elapsedSeconds()} 秒`, 50, 220, 154, COLORS.cyan);
      this.drawMetricBox(ctx, "事项进度", `${Math.round(this.task.progress)}%`, 226, 220, 154, COLORS.green);
      this.drawMetricBox(ctx, "交付质量", `${Math.round(this.task.quality)}%`, 50, 286, 154, COLORS.cyan);
      this.drawMetricBox(ctx, "资料收集", `${this.stats.workItems}/5`, 226, 286, 154, COLORS.yellow);
      this.drawMetricBox(ctx, "处理阻碍", `${this.stats.defeated} 个`, 50, 352, 154, COLORS.green);
      this.drawMetricBox(ctx, "验收通过", `${this.stats.bosses}/5`, 226, 352, 154, COLORS.pink);
      this.drawMetricBox(ctx, "承受伤害", Math.round(this.stats.damageTaken), 50, 418, 154, COLORS.red);
      this.drawMetricBox(ctx, "特权使用", `${3 - this.task.adUsesLeft} 次`, 226, 418, 154, COLORS.orange);

      ctx.fillStyle = COLORS.pink;
      ctx.fillRect(50, 494, 330, 44);
      ctx.fillStyle = "#050816";
      ctx.fillRect(55, 499, 320, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Courier New";
      ctx.fillText(`评分 ${score} · ${this.title()}`, 78, 522);

      this.drawCenteredText(ctx, "点开始再来一轮", 586, "20px Courier New", COLORS.yellow);
    }

    drawPixelWorker(ctx, x, y, dir, scale) {
      const s = scale || 1;
      ctx.fillStyle = "#f6c28b";
      ctx.fillRect(x + 10 * s, y + 2 * s, 16 * s, 16 * s);
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(x + 6 * s, y + 19 * s, 24 * s, 24 * s);
      ctx.fillStyle = "#111827";
      ctx.fillRect(x + (dir > 0 ? 21 : 9) * s, y + 8 * s, 4 * s, 4 * s);
      ctx.fillRect(x + 7 * s, y + 43 * s, 8 * s, 14 * s);
      ctx.fillRect(x + 21 * s, y + 43 * s, 8 * s, 14 * s);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x + (dir > 0 ? 27 : -18) * s, y + 29 * s, 26 * s, 9 * s);
    }
  }

  window.BossRushGame = Game;
}());
