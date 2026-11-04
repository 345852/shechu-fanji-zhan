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

  // A hit interrupts pursuit and attacks; knockback replaces existing forward momentum.
  function receiveImpact(entity, knock, game, weight = 1) {
    const away = Math.sign((entity.x + entity.w / 2) - (game.player.x + game.player.w / 2)) || game.player.dir;
    // More hits interrupt the action, but do not restart an already-running stun forever.
    if (!(entity.hitStun > 0)) entity.hitStun = 0.30 + Math.min(0.16, Math.abs(knock || 0) * 0.001);
    entity.counterQueued = 2.4;
    entity.alertTimer = 3;
    entity.meleeAttack = null;
    entity.attackPhase = "idle";
    entity.vx = away * Math.max(95, Math.abs(knock || 0)) * weight;
    entity.attackTimer = 0;
    entity.attackCd = Math.max(entity.attackCd, 0.2);
    entity.rushTimer = 0;
    entity.actionTimer = 0;
  }

  function updateHitStun(entity, dt, game) {
    if (!(entity.hitStun > 0)) return false;
    const step = Math.min(dt, entity.hitStun);
    const decay = Math.exp(-10 * step);
    entity.x = clamp(entity.x + entity.vx * (1 - decay) / 10, 20, game.worldWidth - entity.w - 20);
    entity.vx *= decay;
    entity.hitStun = Math.max(0, entity.hitStun - dt);
    return true;
  }

  const CONTACT_ATTACKS = {
    hr: { name: "薪资拍击", reach: 46, windup: 0.30, damage: 7, mind: 9, cooldown: 1.25, voice: 1 },
    intern: { name: "文件挥击", reach: 40, windup: 0.32, damage: 5, mind: 5, cooldown: 1.35, voice: 2 },
    bootlicker: { name: "汇报突击", reach: 50, windup: 0.26, damage: 6, mind: 6, cooldown: 1.15, voice: 3 },
    boss: { name: "验收重击", reach: 56, windup: 0.34, damage: 12, mind: 10, cooldown: 1.35, voice: 4 }
  };

  function canReachPlayer(entity, game, reach) {
    return Math.abs(center(game.player).x - center(entity).x) < (entity.w + game.player.w) / 2 + reach - 12 &&
      game.player.y + game.player.h > GROUND - 64 && game.player.y < GROUND;
  }

  function startContactAttack(entity, game, profile, counter = false) {
    const windup = counter ? 0.20 : profile.windup;
    entity.dir = Math.sign(center(game.player).x - center(entity).x) || entity.dir || 1;
    entity.vx = 0;
    entity.rushTimer = 0;
    entity.counterQueued = 0;
    entity.meleeAttack = { ...profile, windup, reach: profile.reach + (counter ? 18 : 0), counter, struck: false };
    entity.attackKind = "enemyMelee";
    entity.attackPhase = "windup";
    entity.attackDuration = windup + 0.12 + 0.28;
    entity.attackTimer = entity.attackDuration;
    entity.attackCd = profile.cooldown;
    entity.actionText = (counter ? "反击 · " : "") + profile.name;
    entity.actionTimer = entity.attackDuration;
    game.sound("enemyReady", counter ? 2 : 1);
  }

  function updateContactAttack(entity, dt, game) {
    const attack = entity.meleeAttack;
    if (!attack) return false;
    entity.vx = 0;
    entity.attackTimer = Math.max(0, entity.attackTimer - dt);
    entity.actionTimer = entity.attackTimer;
    const elapsed = entity.attackDuration - entity.attackTimer;
    entity.attackPhase = elapsed < attack.windup ? "windup" : elapsed < attack.windup + 0.12 ? "strike" : "recovery";
    if (!attack.struck && elapsed >= attack.windup + 0.06) {
      attack.struck = true;
      const area = { x: entity.dir > 0 ? entity.x + entity.w - 3 : entity.x - attack.reach + 3,
        y: GROUND - 64, w: attack.reach, h: 56 };
      game.sound("enemySwing", attack.voice);
      game.addSlash(area, entity.dir, { kind: "enemy", color: "#f89f9b", life: 0.20 });
      if (rects(area, game.player.hitbox)) game.player.takeDamage(attack.damage, attack.mind, game, "minion");
    }
    if (entity.attackTimer === 0) {
      entity.meleeAttack = null;
      entity.attackPhase = "idle";
    }
    return true;
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
      window.GameArt.particle(ctx, this, cam);
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
      this.animTime = (this.animTime || 0) + dt;
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
      window.GameArt.projectile(ctx, this, cam);
    }
  }

  class Pickup {
    constructor(type, x) {
      this.type = type;
      this.x = x;
      this.y = type === "toilet" ? GROUND - 60 : type === "brief" ? GROUND - 42 : GROUND - 28;
      this.w = type === "toilet" ? 42 : type === "brief" ? 32 : 24;
      this.h = type === "toilet" ? 60 : type === "brief" ? 34 : 24;
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
        game.sound("pickupCoffee");
      } else if (this.type === "stapler") {
        player.ammo = clamp(player.ammo + 5, 0, player.maxAmmo);
        game.toast("补充订书机弹药 +5");
        this.used = true;
        game.sound("pickupAmmo");
      } else if (this.type === "brief") {
        const amount = game.level.pickupProgress || 8;
        if (game.collectWorkItem) game.collectWorkItem(amount, `${game.level.deliverable} +${amount}%`);
        game.floatText(`事项 +${amount}%`, player.x + player.w / 2, player.y - 10, COLORS.yellow);
        this.used = true;
        game.sound("pickupBrief");
      } else if (this.type === "toilet" && !game.toiletUsed) {
        player.mind = player.maxMind;
        game.toiletUsed = true;
        this.used = true;
        game.toast("带薪拉屎：心态满血复活");
        game.sound("pickupRest");
      }
    }

    draw(ctx, cam) {
      window.GameArt.pickup(ctx, this, cam);
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
      this.attackDuration = 0;
      this.pendingHit = null;
      this.comboWindow = 0;
      this.animTime = 0;
      this.walkCycle = 0;
      this.stepDistance = 0;
      this.stepSide = 1;
      this.crouchPose = 0;
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
        { id: "resign", name: "上线单突刺", hint: "破甲爆发" }
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
      this.attackTimer = 0;
      this.attackQueued = 0;
      this.pendingHit = null;
      this.comboWindow = 0;
      this.combo = 0;
      this.onGround = true;
      this.crouchPose = 0;
      this.stepDistance = 0;
      this.stepSide = 1;
    }

    get hitbox() {
      const shrink = this.crouching ? 24 : 0;
      return { x: this.x + 5, y: this.y + 8 + shrink, w: this.w - 10, h: this.h - 10 - shrink };
    }

    update(dt, game) {
      const input = game.input;
      const locked = this.broken > 0 || this.meetingTrap > 0 || game.freezeTimer > 0 || game.state !== "playing";
      this.animTime += dt;
      this.hitReaction = Math.max(0, (this.hitReaction || 0) - dt);
      this.walkCycle += Math.abs(this.vx) * dt * 0.065;
      this.crouchPose += ((this.crouching ? 1 : 0) - this.crouchPose) * (1 - Math.exp(-18 * dt));
      this.attackQueued = Math.max(0, this.attackQueued - dt);
      this.comboWindow = Math.max(0, this.comboWindow - dt);
      if (this.comboWindow === 0 && this.attackTimer === 0) this.combo = 0;
      if (locked) { this.pendingHit = null; this.attackQueued = 0; }
      this.invuln = Math.max(0, this.invuln - dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.speedBoost = Math.max(0, this.speedBoost - dt);
      this.broken = Math.max(0, this.broken - dt);
      this.meetingTrap = Math.max(0, this.meetingTrap - dt);
      this.attackDebuff = Math.max(0, this.attackDebuff - dt);
      this.specialCd = Math.max(0, this.specialCd - dt);
      this.parryTimer = Math.max(0, this.parryTimer - dt);
      this.thrustTimer = Math.max(0, this.thrustTimer - dt);
      this.attackScale = (this.attackDebuff > 0 ? 0.55 : 1) * (game.privilegeTimer > 0 ? 1.18 : 1);

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
          if (this.attackTimer <= 0) this.dir = ax;
          this.vx += ax * 1100 * dt;
        } else {
          this.vx *= Math.pow(0.001, dt);
        }
        if (input.dashDir && this.onGround) {
          this.vx = input.dashDir * 360;
          this.dir = input.dashDir;
        }
        this.vx = this.thrustTimer > 0
          ? this.dir * (220 + 300 * this.thrustTimer / 0.22)
          : clamp(this.vx, -maxSpeed, maxSpeed);

        if ((input.consume("up") || input.consume("space")) && this.onGround && !this.crouching) {
          this.vy = -560;
          this.onGround = false;
          game.sound("jump");
        }

        if (input.consume("q")) this.switchMove(-1, game);
        if (input.consume("e")) this.switchMove(1, game);
        if (input.consume("1")) this.selectMove(0, game);
        if (input.consume("2")) this.selectMove(1, game);
        if (input.consume("3")) this.selectMove(2, game);
        if (this.parryTimer > 0) this.reflectProjectiles(game);
        if (input.consume("j")) this.useCurrentMove(game);
        if (this.currentMove().id === 'combo' && this.attackTimer <= 0 && (this.attackQueued > 0 || input.down.j)) {
          this.attackQueued = 0;
          this.swing(game);
        }
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
      if (this.pendingHit && !locked) {
        this.pendingHit.delay -= dt;
        if (this.pendingHit.delay <= 0) {
          const hit = this.pendingHit;
          game.sound("swing", hit.effect.combo);
          this.pendingHit = null;
          const area = { x: this.dir > 0 ? this.x + this.w - 4 : this.x - hit.range + 4,
            y: this.y + 12, w: hit.range, h: 38 };
          game.hitEnemies(area, hit.damage * this.attackScale, hit.knock * this.dir, hit.feedback);
          game.addSlash(area, this.dir, hit.effect);
        }
      }

      if (this.mind <= 0 && this.broken <= 0) {
        this.mind = 20;
        this.broken = 2.0;
        game.toast("破防！短暂无法操作");
        game.breathe("破防：先把心态捡回来", COLORS.pink, 0.3, 1.1);
      }
      if (this.health <= 0 && !this.dead) {
        this.dead = true;
        game.playerDown();
      }
    }

    updateMovementAudio(previous, game, dt) {
      if (this.dead || game.state !== "playing") { game.audio.setMovement(0); return; }
      if (this.onGround && previous.onGround === false) game.sound("land");
      const distance = Math.abs(this.x - previous.x);
      const walking = !!game.input.down.left !== !!game.input.down.right;
      const locked = this.broken > 0 || this.meetingTrap > 0 || game.freezeTimer > 0;
      const moving = walking && !locked && distance > 0.001 && distance <= 16 && dt > 0;
      game.audio.setMovement(moving ? distance / dt : 0, this.crouching);
      // Read final positions after body/wall resolution, not desired velocity or held keys alone.
      if (!walking || locked || !this.onGround || !previous.onGround || this.thrustTimer > 0 || distance < 0.001 || distance > 16) {
        this.stepDistance = 0;
        return;
      }
      this.stepDistance += distance;
      const stride = Math.PI / 0.065; // Same distance per footfall as the leg animation.
      if (this.stepDistance >= stride) {
        this.stepDistance %= stride;
        this.stepSide *= -1;
        game.sound("step", this.stepSide * (this.crouching ? 0.55 : 1));
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
      if (this.attackTimer > 0) {
        this.attackQueued = 0.20;
        return;
      }
      this.combo = (this.combo % 3) + 1;
      this.comboWindow = 0.85;
      this.attackKind = "combo";
      this.attackDuration = this.combo === 3 ? 0.40 : 0.30;
      this.attackTimer = this.attackDuration;
      const damage = 18 + this.combo * 5;
      const color = this.combo === 3 ? COLORS.pink : COLORS.yellow;
      this.pendingHit = {
        delay: this.combo === 3 ? 0.12 : 0.075,
        range: 48 + this.combo * 8,
        damage,
        knock: this.combo === 3 ? 100 : 35,
        feedback: { label: `-${Math.round(damage * this.attackScale)}`, color,
          callout: this.combo === 3 ? '键盘重击 · 需求退回' : '', duration: 0.6 },
        effect: { kind: 'combo', combo: this.combo, color, life: this.combo === 3 ? 0.28 : 0.22 }
      };
    }

    demandReflect(game) {
      if (this.specialCd > 0) {
        game.toast(`需求反弹冷却中 ${this.specialCd.toFixed(1)}s`);
        return;
      }
      if (this.attackTimer > 0) return;
      this.attackKind = "reflect";
      this.attackDuration = 0.32;
      this.attackTimer = 0.32;
      this.parryTimer = 0.42;
      game.sound("reflect");
      this.specialCd = 1.05;
      this.reflectProjectiles(game);
      const area = {
        x: this.dir > 0 ? this.x + this.w - 4 : this.x - 46,
        y: this.y + 8,
        w: 50,
        h: 42
      };
      game.breathe("需求反弹：锅回去了", COLORS.cyan, 0.18, 0.95);
      game.hitEnemies(area, 8 * this.attackScale, 35 * this.dir, {
        label: "反弹",
        color: COLORS.cyan,
        callout: "需求反弹：锅回去了",
        stop: 0.2,
        duration: 0.95
      });
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
        game.sound("parry");
        this.rage = clamp(this.rage + reflected * 10, 0, 100);
        game.screenShake = Math.max(game.screenShake, 6);
        game.toast(`需求反弹 ×${reflected}`);
        game.floatText(`反弹 ×${reflected}`, this.x + this.w / 2 + this.dir * 46, this.y - 8, COLORS.cyan);
        game.breathe(`需求反弹 ×${reflected}`, COLORS.cyan, 0.22, 1.0);
      }
    }

    resignationThrust(game) {
      if (this.specialCd > 0) {
        game.toast(`上线单突刺冷却中 ${this.specialCd.toFixed(1)}s`);
        return;
      }
      if (this.attackTimer > 0) return;
      this.attackKind = "thrust";
      this.attackDuration = 0.38;
      this.attackTimer = 0.38;
      this.thrustTimer = 0.22;
      game.sound("thrust");
      this.specialCd = 0.85;
      this.vx = this.dir * 520;
      const area = {
        x: this.dir > 0 ? this.x + this.w - 2 : this.x - 92,
        y: this.y + 10,
        w: 96,
        h: 38
      };
      const damage = 46 * this.attackScale;
      game.floatText("上线单突刺", this.x + this.w / 2 + this.dir * 58, this.y + 6, COLORS.pink);
      game.breathe("上线单突刺：验收通过", COLORS.pink, 0.22, 1.0);
      game.hitEnemies(area, damage, 170 * this.dir, {
        label: `-${Math.round(damage)}`,
        color: COLORS.pink,
        callout: "上线单突刺：验收通过",
        stop: 0.26,
        duration: 1.0
      });
      game.addSlash(area, this.dir, {
        kind: "resign",
        color: COLORS.pink,
        label: "上线单突刺",
        life: 0.34
      });
      game.burst(this.x + this.w / 2 + this.dir * 52, this.y + 26, COLORS.yellow, 9);
    }

    throwStapler(game) {
      if (this.attackTimer > 0.08) return;
      if (this.ammo <= 0) {
        game.toast("订书机没钉了");
        return;
      }
      this.attackKind = "ranged";
      this.attackDuration = 0.26;
      this.attackTimer = 0.26;
      this.ammo -= 1;
      game.sound("ranged");
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
      game.breathe("订书机警告：别再催了", COLORS.cyan, 0.1, 0.8);
    }

    ultimate(game) {
      if (this.rage < 100) {
        game.toast("怒气还没攒满");
        return;
      }
      this.rage = 0;
      game.freezeTimer = 3;
      game.sound("ultimate");
      game.screenShake = 18;
      game.toast("已读不回：全场冻结 3 秒");
      game.floatText("已读不回", this.x + this.w / 2, this.y - 12, COLORS.yellow);
      game.breathe("已读不回：全场静音", COLORS.yellow, 0.28, 1.15);
      if (game.boss) game.damageBoss(70);
      game.enemies.forEach((enemy) => enemy.takeDamage(70, 0, game));
    }

    damageCaption(source) {
      return {
        laser: "KPI 激光命中",
        minion: "同事背刺：血压上来了",
        rush: "内卷冲撞：人麻了",
        pancake: "大饼砸脸：先别信",
        ppt: "PPT 光波入脑",
        pot: "黑锅扣头：谁接谁亏",
        wave: "996 冲击波",
        stapler: "周报飞镖扎心"
      }[source] || "职场暴击：先深呼吸";
    }

    takeDamage(amount, mindDamage, game, source) {
      if (this.invuln > 0 || this.dead) return;
      if (this.parryTimer > 0) {
        game.sound("parry");
        this.rage = clamp(this.rage + 10, 0, 100);
        this.invuln = 0.4;
        game.screenShake = Math.max(game.screenShake, 5);
        game.burst(this.x + this.w / 2 + this.dir * 24, this.y + 24, COLORS.cyan, 8);
        game.floatText("挡下", this.x + this.w / 2, this.y - 8, COLORS.cyan);
        game.breathe("挡下：这个需求不接", COLORS.cyan, 0.18, 0.9);
        return;
      }
      let final = amount;
      if (this.crouching && source === "pancake") final *= 0.25;
      if (this.moyu) final *= 1.2;
      final *= source === "laser" ? 0.72 : 0.68;
      let finalMind = (mindDamage || 0) * 0.65;
      if (game.privilegeTimer > 0) {
        final *= 0.72;
        finalMind *= 0.65;
      }
      game.stats.damageTaken += final;
      if (game.reduceTaskQuality) game.reduceTaskQuality(Math.max(0.6, (final + finalMind) * 0.05));
      this.health -= final;
      game.sound("hurt");
      this.hitReaction = .18;
      this.mind -= finalMind;
      this.rage = clamp(this.rage + final * 0.7 + finalMind * 0.36, 0, 100);
      this.invuln = 1.15;
      // Body contact must not let an opponent drive the player out of her occupied space.
      if (source !== 'minion' && source !== 'rush') this.vx = -this.dir * 120;
      game.screenShake = Math.max(game.screenShake, 8);
      game.burst(this.x + this.w / 2, this.y + 20, COLORS.red, 8);
      game.floatText(`-${Math.round(final)}`, this.x + this.w / 2, this.y - 10, COLORS.red);
      game.breathe(this.moyu ? "摸鱼被抓：这下社死" : this.damageCaption(source), COLORS.red, 0.28, 1.05);
    }

    draw(ctx, cam) {
      window.GameArt.character(ctx, this, cam);
      window.GameArt.vitals(ctx, this, this.x - cam.x, this.y - cam.y);
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
      this.hitStun = 0;
      this.counterQueued = 0;
      this.alertTimer = 0;
      this.meleeAttack = null;
      this.attackPhase = "idle";
      this.attackTimer = 0;
      this.animTime = 0;
      this.walkCycle = 0;
      this.label = type === "hr" ? "HR" : type === "intern" ? "实习" : "舔狗";
      this.title = type === "hr" ? "HR·薪资守门" : type === "intern" ? "实习生·背锅侠" : "同事·汇报怪";
      this.color = type === "hr" ? "#93c5fd" : type === "intern" ? "#a7f3d0" : "#f9a8d4";
    }

    get hitbox() {
      return { x: this.x + 3, y: this.y + 4, w: this.w - 6, h: this.h - 4 };
    }

    update(dt, game) {
      if (this.dead || game.state !== "playing") return;
      this.animTime += dt;
      this.hitReaction = Math.max(0, (this.hitReaction || 0) - dt);
      if (game.freezeTimer > 0) return;
      this.attackCd = Math.max(0, this.attackCd - dt);
      this.alertTimer = Math.max(0, (this.alertTimer || 0) - dt);
      if (updateHitStun(this, dt, game)) return;
      this.counterQueued = Math.max(0, (this.counterQueued || 0) - dt);
      if (updateContactAttack(this, dt, game)) return;
      const dx = center(game.player).x - center(this).x;
      this.dir = Math.sign(dx) || this.dir || 1;
      const dist = Math.abs(dx), profile = CONTACT_ATTACKS[this.type] || CONTACT_ATTACKS.bootlicker;
      if (dist < 380) this.alertTimer = 3;
      const counter = this.counterQueued > 0;
      if (canReachPlayer(this, game, profile.reach + (counter ? 18 : 0))) {
        this.vx = 0;
        if (counter || this.attackCd <= 0) startContactAttack(this, game, profile, counter);
      } else if (this.alertTimer > 0) {
        this.vx = clamp(this.vx + this.dir * 520 * dt, -85, 85);
      } else this.vx *= Math.pow(0.02, dt);
      this.x = clamp(this.x + this.vx * dt, 20, game.worldWidth - this.w - 20);
      this.walkCycle += Math.abs(this.vx) * dt * 0.07;
    }

    takeDamage(amount, knock, game) {
      if (this.dead) return;
      this.hp -= amount;
      game.sound("hit", amount);
      this.hitReaction = .18;
      receiveImpact(this, knock, game);
      game.stats.hits += 1;
      game.cheer(this.hp <= 0 ? "恭喜下线!" : "恭喜命中!", this.x + this.w / 2, this.y - 6, this.hp <= 0 ? COLORS.yellow : this.color);
      game.burst(this.x + this.w / 2, this.y + 18, this.color, 5);
      if (this.hp <= 0) {
        this.dead = true;
        this.counterQueued = 0;
        game.stats.defeated += 1;
        if (game.advanceTask) game.advanceTask(2, "阻碍处理 +2%", 0.4);
        game.player.rage = clamp(game.player.rage + 12, 0, 100);
        if (Math.random() < 0.35) game.spawnPickup("coffee", this.x);
      }
    }

    draw(ctx, cam) {
      window.GameArt.enemy(ctx, this, cam);
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
      this.hitStun = 0;
      this.counterQueued = 0;
      this.alertTimer = 0;
      this.meleeAttack = null;
      this.attackPhase = "idle";
      this.attackTimer = 0;
      this.animTime = 0;
      this.walkCycle = 0;
      this.actionText = "";
      this.actionTimer = 0;
    }

    get hitbox() {
      return { x: this.x + 8, y: this.y + 8, w: this.w - 16, h: this.h - 8 };
    }

    update(dt, game) {
      if (this.dead || game.state !== "playing") return;
      this.animTime += dt;
      this.hitReaction = Math.max(0, (this.hitReaction || 0) - dt);
      if (game.freezeTimer > 0) return;
      this.attackCd = Math.max(0, this.attackCd - dt);
      if (updateHitStun(this, dt, game)) return;
      this.counterQueued = Math.max(0, (this.counterQueued || 0) - dt);
      if (updateContactAttack(this, dt, game)) return;
      this.walkCycle += Math.abs(this.vx || 0) * dt * 0.07;
      this.flash = Math.max(0, this.flash - dt);
      this.attackTimer = Math.max(0, (this.attackTimer || 0) - dt);
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      this.dir = game.player.x < this.x ? -1 : 1;
      const hpPct = this.hp / this.maxHp;
      if (this.floorIndex === 4) {
        this.phase = hpPct < 0.34 ? 3 : hpPct < 0.67 ? 2 : 1;
      }
      const dx = game.player.x - this.x;
      const counter = this.counterQueued > 0;
      if ((counter || this.attackCd <= 0) && canReachPlayer(this, game, CONTACT_ATTACKS.boss.reach + (counter ? 18 : 0))) {
        startContactAttack(this, game, CONTACT_ATTACKS.boss, counter);
        return;
      }
      if (this.rushTimer > 0) {
        this.rushTimer = Math.max(0, this.rushTimer - dt);
        this.x = clamp(this.x + this.rushDir * 480 * dt, game.bossGate - 100, game.worldWidth - this.w);
        if (rects(this.hitbox, game.player.hitbox)) game.player.takeDamage(18, 14, game, 'rush');
      }
      if (Math.abs(dx) > 120) {
        this.x += Math.sign(dx) * (42 + this.floorIndex * 8) * dt;
      }
      if (this.attackCd <= 0 || counter) {
        this.counterQueued = 0;
        this.performAttack(game);
      }
    }

    performAttack(game) {
      const attacks = this.level.bossAttacks;
      let attack = attacks[Math.floor(Math.random() * attacks.length)];
      if (this.floorIndex === 4) {
        attack = this.phase === 1 ? "scythe" : this.phase === 2 ? "shockwave" : "layoffStorm";
      }
      this.attackKind = "special";
      this.meleeAttack = null;
      this.attackPhase = "idle";
      this.actionText = this.attackName(attack);
      this.actionTimer = 1.1;
      this.attackDuration = .45;
      this.attackTimer = .45;
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
        this.rushTimer = 0.25;
        this.rushDir = this.dir;
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
          game.breathe("临时会议：人被钉住了", COLORS.yellow, 0.22, 1.0);
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
        game.breathe("空头支票：攻击力缩水", COLORS.orange, 0.2, 1.0);
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
        game.breathe("996 冲击波", COLORS.yellow, 0.18, 1.0);
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

    takeDamage(amount, game, knock = 0) {
      if (this.dead) return;
      this.hp -= amount;
      game.sound("hit", amount);
      this.hitReaction = .18;
      this.flash = 0.12;
      receiveImpact(this, knock, game, 0.65);
      game.stats.hits += 1;
      game.cheer(this.hp <= 0 ? "恭喜过关!" : "恭喜破防!", this.x + this.w / 2, this.y + 8, this.hp <= 0 ? COLORS.yellow : this.color);
      game.player.rage = clamp(game.player.rage + amount * 0.28, 0, 100);
      game.burst(this.x + this.w / 2, this.y + 34, this.color, 10);
      if (this.hp <= 0 && !this.dead) {
        this.dead = true;
        game.stats.bosses += 1;
        game.floorClear();
      }
    }

    draw(ctx, cam) {
      window.GameArt.enemy(ctx, this, cam, true);
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
