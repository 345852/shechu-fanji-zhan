(function () {
  const { GROUND, COLORS } = window.GameData;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function center(entity) {
    return { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  }

  class Particle {
    constructor(x, y, vx, vy, color, life, size) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = life; this.maxLife = life; this.size = size || 4;
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 420 * dt;
    }

    draw(ctx, cam) {
      if (this.life <= 0) return;
      ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.size, this.size);
      ctx.globalAlpha = 1;
    }
  }

  class Projectile {
    constructor(opts) {
      Object.assign(this, opts);
      this.w = opts.w || 16;
      this.h = opts.h || 16;
      this.life = opts.life || 5;
      this.damage = opts.damage || 10;
      this.mindDamage = opts.mindDamage || 0;
      this.owner = opts.owner || "enemy";
      this.kind = opts.kind || "stapler";
      this.gravity = opts.gravity || 0;
      this.homing = opts.homing || 0;
      this.color = opts.color || COLORS.yellow;
      this.dead = false;
    }

    update(dt, game) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
      if (this.homing && this.owner === "enemy") {
        const p = center(game.player);
        const me = center(this);
        const dx = p.x - me.x;
        const dy = p.y - me.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        this.vx += (dx / dist) * this.homing * dt;
        this.vy += (dy / dist) * this.homing * dt;
        const speed = Math.hypot(this.vx, this.vy);
        const max = 260;
        if (speed > max) {
          this.vx = this.vx / speed * max;
          this.vy = this.vy / speed * max;
        }
      }
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y > GROUND + 90 || this.x < -200 || this.x > game.worldWidth + 300) this.dead = true;
    }

    draw(ctx, cam) {
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      ctx.fillStyle = this.color;
      if (this.kind === "ppt") {
        ctx.fillRect(x, y, this.w, this.h);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 4, y + 4, this.w - 8, 4);
        return;
      }
      if (this.kind === "pot") {
        ctx.fillStyle = "#111827";
        ctx.fillRect(x + 2, y + 6, this.w - 4, this.h - 6);
        ctx.fillStyle = "#444";
        ctx.fillRect(x + 6, y, this.w - 12, 6);
        return;
      }
      if (this.kind === "pancake") {
        ctx.fillStyle = "#ffc857";
        ctx.fillRect(x + 3, y + 3, this.w - 6, this.h - 6);
        ctx.fillStyle = "#a55a1f";
        ctx.fillRect(x + 8, y + 7, 5, 4);
        ctx.fillRect(x + 17, y + 14, 4, 4);
        return;
      }
      if (this.kind === "wave") {
        ctx.fillStyle = this.color;
        ctx.fillRect(x, y, this.w, this.h);
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.fillRect(x, y + 4, this.w, 2);
        return;
      }
      ctx.fillRect(x, y, this.w, this.h);
      ctx.fillStyle = "#111827";
      ctx.fillRect(x + 3, y + 3, this.w - 6, this.h - 6);
    }
  }

  class Pickup {
    constructor(type, x) {
      this.type = type;
      this.x = x;
      this.y = type === "toilet" ? GROUND - 60 : GROUND - 28;
      this.w = type === "toilet" ? 42 : 24;
      this.h = type === "toilet" ? 60 : 24;
      this.used = false;
    }

    apply(player, game) {
      if (this.used && this.type !== "toilet") return;
      if (this.type === "coffee") {
        player.health = clamp(player.health + 42, 0, player.maxHealth);
        player.speedBoost = 5;
        game.toast("咖啡续命：体力恢复，脚下生风");
        game.floatText("+42 体力", player.x + player.w / 2, player.y - 8, COLORS.green);
        this.used = true;
      } else if (this.type === "stapler") {
        player.ammo = clamp(player.ammo + 5, 0, player.maxAmmo);
        game.toast("补充订书机弹药 +5");
        this.used = true;
      } else if (this.type === "toilet" && !game.toiletUsed) {
        player.mind = player.maxMind;
        game.toiletUsed = true;
        this.used = true;
        game.toast("带薪拉屎：心态满血复活");
      }
    }

    draw(ctx, cam) {
      if (this.used && this.type !== "toilet") return;
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      if (this.type === "coffee") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 4, y + 4, 17, 18);
        ctx.fillStyle = "#7c2d12";
        ctx.fillRect(x + 7, y + 9, 11, 9);
        ctx.fillStyle = "#27d4ff";
        ctx.fillRect(x + 19, y + 8, 6, 8);
      } else if (this.type === "stapler") {
        ctx.fillStyle = "#d1d5db";
        ctx.fillRect(x + 2, y + 8, 20, 10);
        ctx.fillStyle = "#4502ff";
        ctx.fillRect(x + 5, y + 4, 15, 8);
      } else {
        ctx.fillStyle = this.used ? "#6b7280" : "#f9fafb";
        ctx.fillRect(x + 8, y + 8, 25, 34);
        ctx.fillStyle = "#93c5fd";
        ctx.fillRect(x + 13, y + 13, 14, 9);
        ctx.fillStyle = "#111827";
        ctx.fillRect(x + 4, y + 42, 34, 8);
        if (!this.used) {
          ctx.fillStyle = "#16a34a";
          ctx.fillRect(x, y, 42, 5);
        }
      }
    }
  }

  class Player {
    constructor() {
      this.x = 70;
      this.y = GROUND - 58;
      this.w = 34;
      this.h = 58;
      this.vx = 0;
      this.vy = 0;
      this.dir = 1;
      this.onGround = false;
      this.maxHealth = 130;
      this.maxMind = 120;
      this.health = 130;
      this.mind = 120;
      this.rage = 0;
      this.ammo = 8;
      this.maxAmmo = 12;
      this.attackTimer = 0;
      this.attackQueued = 0;
      this.combo = 0;
      this.invuln = 0;
      this.broken = 0;
      this.meetingTrap = 0;
      this.crouching = false;
      this.speedBoost = 0;
      this.idle = 0;
      this.moyu = false;
      this.moyuCounted = false;
      this.attackScale = 1;
      this.attackDebuff = 0;
      this.moves = [
        { id: "combo", name: "键盘连击", hint: "稳定近战" },
        { id: "reflect", name: "需求反弹", hint: "反制远程" },
        { id: "resign", name: "离职信突刺", hint: "破甲爆发" }
      ];
      this.moveIndex = 0;
      this.specialCd = 0;
      this.parryTimer = 0;
      this.thrustTimer = 0;
      this.dead = false;
    }

    resetForFloor(floorIndex) {
      this.x = 70;
      this.y = GROUND - 58;
      this.vx = 0;
      this.vy = 0;
      this.dir = 1;
      this.health = clamp(this.health + 32, 0, this.maxHealth);
      this.mind = clamp(this.mind + 38, 0, this.maxMind);
      this.rage = clamp(this.rage + 18, 0, 100);
      this.ammo = clamp(this.ammo + 3 + floorIndex, 0, this.maxAmmo);
      this.dead = false;
      this.broken = 0;
      this.meetingTrap = 0;
      this.attackScale = 1;
      this.attackDebuff = 0;
      this.specialCd = 0;
      this.parryTimer = 0;
      this.thrustTimer = 0;
      this.invuln = 1.4;
    }

    get hitbox() {
      const shrink = this.crouching ? 24 : 0;
      return { x: this.x + 5, y: this.y + 8 + shrink, w: this.w - 10, h: this.h - 10 - shrink };
    }

    update(dt, game) {
      const input = game.input;
      const locked = this.broken > 0 || this.meetingTrap > 0 || game.freezeTimer > 0 || game.state !== "playing";
      this.invuln = Math.max(0, this.invuln - dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.speedBoost = Math.max(0, this.speedBoost - dt);
      this.broken = Math.max(0, this.broken - dt);
      this.meetingTrap = Math.max(0, this.meetingTrap - dt);
      this.attackDebuff = Math.max(0, this.attackDebuff - dt);
      this.specialCd = Math.max(0, this.specialCd - dt);
      this.parryTimer = Math.max(0, this.parryTimer - dt);
      this.thrustTimer = Math.max(0, this.thrustTimer - dt);
      this.attackScale = this.attackDebuff > 0 ? 0.55 : 1;

      this.crouching = !locked && input.down.s && this.onGround;
      const moving = input.down.left || input.down.right || input.down.up || input.down.space || input.down.j || input.down.k || input.down.l;
      this.idle = moving || locked ? 0 : this.idle + dt;
      if (this.idle > 3 && this.onGround) {
        if (!this.moyu) {
          game.toast("摸鱼状态：心态缓慢恢复");
          if (!this.moyuCounted) {
            game.stats.moyu += 1;
            this.moyuCounted = true;
          }
        }
        this.moyu = true;
        this.mind = clamp(this.mind + 10 * dt, 0, this.maxMind);
      } else {
        this.moyu = false;
        this.moyuCounted = false;
      }

      if (!locked) {
        let ax = 0;
        if (input.down.left) ax -= 1;
        if (input.down.right) ax += 1;
        const maxSpeed = (this.speedBoost > 0 ? 236 : 190) * (this.crouching ? 0.45 : 1);
        if (ax !== 0) {
          this.dir = ax;
          this.vx += ax * 1100 * dt;
        } else {
          this.vx *= Math.pow(0.001, dt);
        }
        if (input.dashDir && this.onGround) {
          this.vx = input.dashDir * 360;
          this.dir = input.dashDir;
        }
        this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

        if ((input.consume("up") || input.consume("space")) && this.onGround && !this.crouching) {
          this.vy = -560;
          this.onGround = false;
        }

        if (input.consume("q")) this.switchMove(-1, game);
        if (input.consume("e")) this.switchMove(1, game);
        if (input.consume("1")) this.selectMove(0, game);
        if (input.consume("2")) this.selectMove(1, game);
        if (input.consume("3")) this.selectMove(2, game);
        if (this.parryTimer > 0) this.reflectProjectiles(game);
        if (input.consume("j")) this.useCurrentMove(game);
        if (input.consume("k")) this.throwStapler(game);
        if (input.consume("l")) this.ultimate(game);
      } else {
        this.vx *= Math.pow(0.02, dt);
      }

      this.vy += 1600 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y + this.h >= GROUND) {
        this.y = GROUND - this.h;
        this.vy = 0;
        this.onGround = true;
      }
      this.x = clamp(this.x, 20, game.worldWidth - 60);

      if (this.mind <= 0 && this.broken <= 0) {
        this.mind = 20;
        this.broken = 2.0;
        game.toast("破防！短暂无法操作");
      }
      if (this.health <= 0 && !this.dead) {
        this.dead = true;
        game.playerDown();
      }
    }

    currentMove() {
      return this.moves[this.moveIndex] || this.moves[0];
    }

    selectMove(index, game) {
      this.moveIndex = clamp(index, 0, this.moves.length - 1);
      if (game) game.toast(`切换招式：${this.currentMove().name}`);
    }

    switchMove(step, game) {
      this.moveIndex = (this.moveIndex + step + this.moves.length) % this.moves.length;
      if (game) game.toast(`切换招式：${this.currentMove().name}`);
    }

    useCurrentMove(game) {
      const move = this.currentMove().id;
      if (move === "reflect") return this.demandReflect(game);
      if (move === "resign") return this.resignationThrust(game);
      return this.swing(game);
    }

    swing(game) {
      if (this.attackTimer > 0.05) {
        this.attackQueued = 0.18;
        return;
      }
      this.combo = (this.combo % 3) + 1;
      this.attackTimer = 0.28;
      const range = 48 + this.combo * 8;
      const area = {
        x: this.dir > 0 ? this.x + this.w - 4 : this.x - range + 4,
        y: this.y + 14,
        w: range,
        h: 34
      };
      const damage = (18 + this.combo * 5) * this.attackScale;
      const label = this.combo === 3 ? "键盘重击" : `键盘连击${this.combo}`;
      game.floatText(label, this.x + this.w / 2 + this.dir * 44, this.y + 8, this.combo === 3 ? COLORS.pink : COLORS.yellow);
      game.hitEnemies(area, damage, this.combo === 3 ? 100 * this.dir : 35 * this.dir, {
        label: `-${Math.round(damage)}`,
        color: this.combo === 3 ? COLORS.pink : COLORS.yellow
      });
      game.addSlash(area, this.dir, {
        kind: "combo",
        combo: this.combo,
        color: this.combo === 3 ? COLORS.pink : COLORS.yellow,
        label,
        life: this.combo === 3 ? 0.24 : 0.18
      });
    }

    demandReflect(game) {
      if (this.specialCd > 0) {
        game.toast(`需求反弹冷却中 ${this.specialCd.toFixed(1)}s`);
        return;
      }
      this.attackTimer = 0.32;
      this.parryTimer = 0.42;
      this.specialCd = 1.05;
      this.reflectProjectiles(game);
      const area = {
        x: this.dir > 0 ? this.x + this.w - 4 : this.x - 46,
        y: this.y + 8,
        w: 50,
        h: 42
      };
      game.hitEnemies(area, 8 * this.attackScale, 35 * this.dir);
      game.addSlash(area, this.dir, {
        kind: "reflect",
        color: COLORS.cyan,
        label: "需求反弹",
        life: 0.36
      });
      game.floatText("需求反弹", this.x + this.w / 2 + this.dir * 34, this.y + 3, COLORS.cyan);
      game.burst(this.x + this.w / 2 + this.dir * 28, this.y + 28, COLORS.cyan, 6);
    }

    reflectProjectiles(game) {
      const shield = {
        x: this.dir > 0 ? this.x + this.w - 10 : this.x - 42,
        y: this.y + 2,
        w: 48,
        h: 58
      };
      let reflected = 0;
      game.projectiles.forEach((projectile) => {
        if (projectile.owner !== "enemy" || projectile.dead || !rects(projectile, shield)) return;
        projectile.owner = "player";
        projectile.vx = Math.abs(projectile.vx || 180) * this.dir + 140 * this.dir;
        projectile.vy = -Math.abs(projectile.vy || 0) * 0.25;
        projectile.damage = Math.max(projectile.damage || 0, 24) * this.attackScale;
        projectile.mindDamage = 0;
        projectile.color = COLORS.cyan;
        projectile.life = Math.max(projectile.life, 2.2);
        reflected += 1;
      });
      if (reflected > 0) {
        this.rage = clamp(this.rage + reflected * 10, 0, 100);
        game.screenShake = Math.max(game.screenShake, 6);
        game.toast(`需求反弹 ×${reflected}`);
        game.floatText(`反弹 ×${reflected}`, this.x + this.w / 2 + this.dir * 46, this.y - 8, COLORS.cyan);
      }
    }

    resignationThrust(game) {
      if (this.specialCd > 0) {
        game.toast(`离职信突刺冷却中 ${this.specialCd.toFixed(1)}s`);
        return;
      }
      this.attackTimer = 0.38;
      this.thrustTimer = 0.22;
      this.specialCd = 0.85;
      this.vx = this.dir * 520;
      this.x += this.dir * 26;
      const area = {
        x: this.dir > 0 ? this.x + this.w - 2 : this.x - 92,
        y: this.y + 10,
        w: 96,
        h: 38
      };
      const damage = 46 * this.attackScale;
      game.floatText("离职信突刺", this.x + this.w / 2 + this.dir * 58, this.y + 6, COLORS.pink);
      game.hitEnemies(area, damage, 170 * this.dir, {
        label: `-${Math.round(damage)}`,
        color: COLORS.pink
      });
      game.addSlash(area, this.dir, {
        kind: "resign",
        color: COLORS.pink,
        label: "离职信突刺",
        life: 0.34
      });
      game.burst(this.x + this.w / 2 + this.dir * 52, this.y + 26, COLORS.yellow, 9);
    }

    throwStapler(game) {
      if (this.ammo <= 0) {
        game.toast("订书机没钉了");
        return;
      }
      this.ammo -= 1;
      game.projectiles.push(new Projectile({
        owner: "player",
        kind: "stapler",
        x: this.x + (this.dir > 0 ? this.w : -16),
        y: this.y + 24,
        vx: this.dir * 430,
        vy: -20,
        w: 22,
        h: 12,
        damage: 18 * this.attackScale,
        color: COLORS.cyan
      }));
      game.floatText("订书机", this.x + this.w / 2 + this.dir * 36, this.y + 8, COLORS.cyan);
    }

    ultimate(game) {
      if (this.rage < 100) {
        game.toast("怒气还没攒满");
        return;
      }
      this.rage = 0;
      game.freezeTimer = 3;
      game.screenShake = 18;
      game.toast("已读不回：全场冻结 3 秒");
      game.floatText("已读不回", this.x + this.w / 2, this.y - 12, COLORS.yellow);
      if (game.boss) game.damageBoss(70);
      game.enemies.forEach((enemy) => enemy.takeDamage(70, 0, game));
    }

    takeDamage(amount, mindDamage, game, source) {
      if (this.invuln > 0 || this.dead) return;
      if (this.parryTimer > 0) {
        this.rage = clamp(this.rage + 10, 0, 100);
        this.invuln = 0.4;
        game.screenShake = Math.max(game.screenShake, 5);
        game.burst(this.x + this.w / 2 + this.dir * 24, this.y + 24, COLORS.cyan, 8);
        game.floatText("挡下", this.x + this.w / 2, this.y - 8, COLORS.cyan);
        return;
      }
      let final = amount;
      if (this.crouching && source === "pancake") final *= 0.25;
      if (this.moyu) final *= 1.2;
      final *= source === "laser" ? 0.72 : 0.68;
      const finalMind = (mindDamage || 0) * 0.65;
      game.stats.damageTaken += final;
      this.health -= final;
      this.mind -= finalMind;
      this.rage = clamp(this.rage + final * 0.7 + finalMind * 0.36, 0, 100);
      this.invuln = 1.15;
      this.vx = -this.dir * 120;
      game.screenShake = Math.max(game.screenShake, 8);
      game.burst(this.x + this.w / 2, this.y + 20, COLORS.red, 8);
      game.floatText(`-${Math.round(final)}`, this.x + this.w / 2, this.y - 10, COLORS.red);
    }

    drawVitals(ctx, x, y) {
      const barW = 70;
      const barH = 7;
      const left = Math.round(x + this.w / 2 - barW / 2);
      const top = Math.round(y - 30);
      const hp = Math.ceil(clamp(this.health, 0, this.maxHealth));
      const ratio = clamp(this.health / this.maxHealth, 0, 1);
      const text = `${hp}/${this.maxHealth}`;

      ctx.fillStyle = "rgba(5,8,22,.88)";
      ctx.fillRect(left - 5, top - 12, barW + 10, 24);
      ctx.strokeStyle = COLORS.yellow;
      ctx.lineWidth = 2;
      ctx.strokeRect(left - 5, top - 12, barW + 10, 24);
      ctx.fillStyle = "#3f1117";
      ctx.fillRect(left, top, barW, barH);
      ctx.fillStyle = ratio < 0.3 ? COLORS.red : "#ef4444";
      ctx.fillRect(left, top, Math.floor(barW * ratio), barH);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, barW, barH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px Courier New";
      ctx.fillText(text, left + Math.max(2, Math.floor((barW - text.length * 6) / 2)), top - 3);
    }

    draw(ctx, cam) {
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      this.drawVitals(ctx, x, y);
      if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return;
      const crouch = this.crouching ? 14 : 0;
      ctx.fillStyle = "#f6c28b";
      ctx.fillRect(x + 10, y + 4 + crouch, 16, 16);
      ctx.fillStyle = "#111827";
      ctx.fillRect(x + (this.dir > 0 ? 21 : 9), y + 10 + crouch, 4, 4);
      ctx.fillStyle = this.moyu ? COLORS.green : COLORS.cyan;
      ctx.fillRect(x + 6, y + 21 + crouch, 24, 24 - crouch);
      ctx.fillStyle = "#263238";
      ctx.fillRect(x + 7, y + 45, 8, 13);
      ctx.fillRect(x + 20, y + 45, 8, 13);
      ctx.fillStyle = COLORS.yellow;
      const kbX = this.dir > 0 ? x + 27 : x - 22;
      ctx.fillRect(kbX, y + 29 + crouch, 25, 9);
      ctx.fillStyle = "#111827";
      ctx.fillRect(kbX + 4, y + 32 + crouch, 3, 3);
      ctx.fillRect(kbX + 11, y + 32 + crouch, 3, 3);
      ctx.fillRect(kbX + 18, y + 32 + crouch, 3, 3);
      if (this.parryTimer > 0) {
        const sx = this.dir > 0 ? x + 36 : x - 18;
        ctx.fillStyle = "rgba(39, 212, 255, .85)";
        ctx.fillRect(sx, y + 7, 10, 48);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx + 3, y + 12, 4, 34);
      }
      if (this.thrustTimer > 0) {
        const px = this.dir > 0 ? x + 40 : x - 44;
        ctx.fillStyle = "#fff7d8";
        ctx.fillRect(px, y + 25, 44, 20);
        ctx.fillStyle = COLORS.ink;
        ctx.font = "10px Courier New";
        ctx.fillText("辞职", px + 8, y + 39);
      }
    }
  }

  class Enemy {
    constructor(type, x) {
      this.type = type;
      this.x = x;
      this.y = GROUND - 48;
      this.w = 32;
      this.h = 48;
      this.vx = 0;
      this.hp = type === "intern" ? 48 : 60;
      this.maxHp = this.hp;
      this.attackCd = 0;
      this.dead = false;
      this.label = type === "hr" ? "HR" : type === "intern" ? "实习" : "舔狗";
      this.color = type === "hr" ? "#93c5fd" : type === "intern" ? "#a7f3d0" : "#f9a8d4";
    }

    get hitbox() {
      return { x: this.x + 3, y: this.y + 4, w: this.w - 6, h: this.h - 4 };
    }

    update(dt, game) {
      if (game.freezeTimer > 0) return;
      this.attackCd = Math.max(0, this.attackCd - dt);
      const dx = game.player.x - this.x;
      const dist = Math.abs(dx);
      if (dist < 380) {
        const dir = Math.sign(dx) || 1;
        this.vx += dir * 520 * dt;
        this.vx = clamp(this.vx, -85, 85);
      } else {
        this.vx *= Math.pow(0.02, dt);
      }
      this.x += this.vx * dt;
      if (dist < 42 && this.attackCd <= 0) {
        game.player.takeDamage(this.type === "hr" ? 7 : 5, this.type === "hr" ? 9 : 5, game, "minion");
        this.attackCd = 1.35;
      }
    }

    takeDamage(amount, knock, game) {
      this.hp -= amount;
      this.vx += knock || 0;
      game.burst(this.x + this.w / 2, this.y + 18, this.color, 5);
      if (this.hp <= 0) {
        this.dead = true;
        game.player.rage = clamp(game.player.rage + 12, 0, 100);
        if (Math.random() < 0.35) game.spawnPickup("coffee", this.x);
      }
    }

    draw(ctx, cam) {
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      ctx.fillStyle = this.color;
      ctx.fillRect(x + 6, y + 10, 20, 28);
      ctx.fillStyle = "#f6c28b";
      ctx.fillRect(x + 8, y, 16, 15);
      ctx.fillStyle = "#111827";
      ctx.fillRect(x + 10, y + 6, 4, 4);
      ctx.fillRect(x + 20, y + 6, 4, 4);
      ctx.fillStyle = "#374151";
      ctx.fillRect(x + 7, y + 38, 7, 10);
      ctx.fillRect(x + 19, y + 38, 7, 10);
      ctx.fillStyle = "#fff";
      ctx.font = "10px Courier New";
      ctx.fillText(this.label, x - 2, y - 5);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(x, y - 14, this.w, 4);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(x, y - 14, this.w * clamp(this.hp / this.maxHp, 0, 1), 4);
    }
  }

  class Boss {
    constructor(level, floorIndex) {
      this.level = level;
      this.floorIndex = floorIndex;
      this.name = level.bossName;
      this.x = 1580;
      this.y = GROUND - 98;
      this.w = 72;
      this.h = 98;
      this.hp = level.bossHp;
      this.maxHp = level.bossHp;
      this.color = level.bossColor;
      this.dir = -1;
      this.attackCd = 1.2;
      this.flash = 0;
      this.phase = 1;
      this.dead = false;
      this.actionText = "";
      this.actionTimer = 0;
    }

    get hitbox() {
      return { x: this.x + 8, y: this.y + 8, w: this.w - 16, h: this.h - 8 };
    }

    update(dt, game) {
      if (game.freezeTimer > 0) return;
      this.flash = Math.max(0, this.flash - dt);
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      this.dir = game.player.x < this.x ? -1 : 1;
      const hpPct = this.hp / this.maxHp;
      if (this.floorIndex === 4) {
        this.phase = hpPct < 0.34 ? 3 : hpPct < 0.67 ? 2 : 1;
      }
      const dx = game.player.x - this.x;
      if (Math.abs(dx) > 120) {
        this.x += Math.sign(dx) * (42 + this.floorIndex * 8) * dt;
      }
      this.attackCd -= dt;
      if (this.attackCd <= 0) this.performAttack(game);
    }

    performAttack(game) {
      const attacks = this.level.bossAttacks;
      let attack = attacks[Math.floor(Math.random() * attacks.length)];
      if (this.floorIndex === 4) {
        attack = this.phase === 1 ? "scythe" : this.phase === 2 ? "shockwave" : "layoffStorm";
      }
      this.actionText = this.attackName(attack);
      this.actionTimer = 1.1;
      this.attackCd = clamp(1.9 - this.floorIndex * 0.08 - this.phase * 0.08, 1.05, 2.05);

      if (attack === "weeklyDart") {
        for (let i = 0; i < 3; i += 1) {
          game.projectiles.push(new Projectile({
            kind: "stapler", owner: "enemy", x: this.x, y: this.y + 22 + i * 16,
            vx: this.dir * (250 + i * 35), vy: -20 + i * 24, w: 22, h: 10,
            damage: 11, mindDamage: 8, color: COLORS.pink
          }));
        }
      } else if (attack === "rush") {
        this.x += this.dir * 120;
        if (rects(this.hitbox, game.player.hitbox)) game.player.takeDamage(18, 14, game, "rush");
      } else if (attack === "pptWave") {
        game.projectiles.push(new Projectile({
          kind: "ppt", owner: "enemy", x: this.x + this.dir * 40, y: GROUND - 170,
          vx: this.dir * 330, vy: 0, w: 120, h: 28, damage: 14, mindDamage: 12, color: COLORS.yellow
        }));
      } else if (attack === "meetingTrap") {
        if (Math.abs(game.player.x - this.x) < 360) {
          game.player.meetingTrap = 3;
          game.player.mind -= 8;
          game.toast("临时会议：你被困住了");
        }
      } else if (attack === "blackPot") {
        game.projectiles.push(new Projectile({
          kind: "pot", owner: "enemy", x: this.x, y: this.y + 10,
          vx: this.dir * 165, vy: -470, w: 30, h: 30, gravity: 820,
          damage: 18, mindDamage: 18, color: COLORS.ink
        }));
      } else if (attack === "internShield") {
        game.enemies.push(new Enemy("intern", this.x + this.dir * 95));
        game.toast("实习生被推出来挡刀");
      } else if (attack === "pancake") {
        game.projectiles.push(new Projectile({
          kind: "pancake", owner: "enemy", x: this.x, y: this.y + 22,
          vx: this.dir * 120, vy: -60, w: 30, h: 30, damage: 17, mindDamage: 16,
          homing: 245, color: COLORS.orange
        }));
      } else if (attack === "optionCheck") {
        game.player.attackDebuff = 6;
        game.player.mind -= 7;
        game.toast("期权空头支票：攻击力缩水");
      } else if (attack === "scythe") {
        game.projectiles.push(new Projectile({
          kind: "wave", owner: "enemy", x: this.x + this.dir * 55, y: GROUND - 92,
          vx: this.dir * 270, vy: 0, w: 92, h: 54, damage: 20, mindDamage: 12, color: COLORS.red
        }));
      } else if (attack === "shockwave") {
        game.screenShake = 18;
        for (let i = 0; i < 3; i += 1) {
          game.projectiles.push(new Projectile({
            kind: "wave", owner: "enemy", x: game.player.x - 360 + i * 270, y: GROUND - 32,
            vx: 0, vy: 0, w: 210, h: 24, life: 0.65, damage: 16, mindDamage: 18, color: COLORS.yellow
          }));
        }
        game.toast("996 冲击波");
      } else if (attack === "layoffStorm") {
        for (let i = 0; i < 7; i += 1) {
          game.projectiles.push(new Projectile({
            kind: "wave", owner: "enemy", x: game.camera.x + 80 + i * 120, y: -30 - i * 22,
            vx: Math.sin(i) * 40, vy: 270 + i * 12, w: 44, h: 18, damage: 13, mindDamage: 12,
            color: COLORS.pink
          }));
        }
      }
    }

    attackName(key) {
      return {
        weeklyDart: "周报飞镖",
        rush: "内卷冲刺",
        pptWave: "PPT 光波",
        meetingTrap: "临时会议",
        blackPot: "黑锅坠落",
        internShield: "实习生挡刀",
        pancake: "大饼追踪弹",
        optionCheck: "空头支票",
        scythe: "降本增效镰刀",
        shockwave: "996 冲击波",
        layoffStorm: "裁员风暴"
      }[key] || key;
    }

    takeDamage(amount, game) {
      this.hp -= amount;
      this.flash = 0.12;
      game.player.rage = clamp(game.player.rage + amount * 0.28, 0, 100);
      game.burst(this.x + this.w / 2, this.y + 34, this.color, 10);
      if (this.hp <= 0 && !this.dead) {
        this.dead = true;
        game.floorClear();
      }
    }

    draw(ctx, cam) {
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      ctx.fillStyle = this.flash > 0 ? "#fff" : this.color;
      ctx.fillRect(x + 12, y + 22, 48, 54);
      ctx.fillStyle = "#f6c28b";
      ctx.fillRect(x + 18, y + 2, 36, 28);
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(x + (this.dir > 0 ? 42 : 24), y + 13, 6, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 6, y + 34, 12, 34);
      ctx.fillRect(x + 54, y + 34, 12, 34);
      ctx.fillStyle = "#374151";
      ctx.fillRect(x + 18, y + 76, 15, 22);
      ctx.fillRect(x + 40, y + 76, 15, 22);
      if (this.floorIndex === 4) {
        ctx.fillStyle = COLORS.yellow;
        ctx.fillRect(x + 24, y - 12, 24, 8);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(x + 28, y - 20, 16, 8);
      }
      if (this.actionTimer > 0) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - 28, y - 42, 128, 22);
        ctx.fillStyle = COLORS.ink;
        ctx.font = "13px Courier New";
        ctx.fillText(this.actionText, x - 22, y - 27);
      }
    }
  }

  window.GameUtils = { clamp, rects, center };
  window.Particle = Particle;
  window.Projectile = Projectile;
  window.Pickup = Pickup;
  window.Player = Player;
  window.Enemy = Enemy;
  window.Boss = Boss;
}());
