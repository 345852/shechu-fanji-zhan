const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const listeners = {}, docListeners = {};
  const ctx = new Proxy({ measureText: t => ({ width: String(t).length*9 }), createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}) },{get:(o,k)=>k in o?o[k]:()=>{}});
  const canvas = {width:430,height:760,getContext:()=>ctx,getBoundingClientRect:()=>({width:430,height:760})};
  const document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,cb)=>{(docListeners[name] ||= []).push(cb);}};
  const window={document,devicePixelRatio:2,matchMedia:()=>({matches:false}),addEventListener:(name,cb)=>{(listeners[name] ||= []).push(cb);}};
  const sandbox={window,document,performance:{now:()=>1000},requestAnimationFrame:()=>{},Math,console};
  vm.createContext(sandbox);
  for(const file of ['data','audio','input','renderer','entities','game'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),sandbox,{filename:file+'.js'});
  const game = new window.BossRushGame(canvas);
  game.startGame();game.enemies=[];game.pickups=[];game.level={...game.level,hazards:[]};
  return {game,window,canvas,ctx,listeners,document,docListeners};
}
function advance(game,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++){game.update(1/hz);game.input.afterFrame();}}
test('each collected item plays its own cue once while standing on it',()=>{
  for(const [type,cue] of [['coffee','pickupCoffee'],['brief','pickupBrief'],['stapler','pickupAmmo'],['toilet','pickupRest']]){
    const {game,window}=setup(),sounds=[];game.sound=name=>sounds.push(name);
    game.player.health=40;game.player.mind=30;game.player.ammo=0;
    const item=new window.Pickup(type,game.player.x);game.pickups=[item];
    for(let i=0;i<10;i++)game.updatePickups();
    assert.deepEqual(sounds,[cue],type);assert.equal(item.used,true);
    if(type==='coffee')assert.equal(game.player.health,82);
    if(type==='brief')assert.ok(game.task.progress>0);
    if(type==='stapler')assert.equal(game.player.ammo,5);
    if(type==='toilet')assert.equal(game.player.mind,game.player.maxMind);
  }
});
test('walking footsteps follow distance in both directions and at different refresh rates',()=>{
  const counts=[];
  for(const hz of [30,60,120])for(const direction of ['left','right']){
    const {game}=setup(),steps=[];game.player.x=600;
    game.sound=(name,side)=>{if(name==='step')steps.push(side);};
    game.input.setKey(direction,true);game.last=1000;
    for(let i=1;i<=hz*1.5;i++)game.loop(1000+i*1000/hz);
    assert.ok(steps.length>=5&&steps.length<=6);
    steps.slice(1).forEach((side,i)=>assert.equal(side,-steps[i]));counts.push(steps.length);
  }
  assert.equal(new Set(counts).size,1);
});
test('running is quicker, crouching is quieter, and stopping ends footsteps',()=>{
  const counts=[];
  for(const mode of ['walk','boost','crouch']){
    const {game}=setup(),steps=[];game.sound=(name,side)=>{if(name==='step')steps.push(side);};
    game.input.setKey('right',true);if(mode==='boost')game.player.speedBoost=4;
    if(mode==='crouch')game.input.setKey('s',true);
    advance(game,2);counts.push(steps.length);
    if(mode==='crouch')assert.ok(steps.every(side=>Math.abs(side)===.55));
    game.input.setKey('right',false);advance(game,1);assert.equal(steps.length,counts.at(-1));
  }
  assert.ok(counts[1]>counts[0]&&counts[0]>counts[2]);
});
test('idle, wall contact, blocked bodies, pauses and frozen controls have no footsteps',()=>{
  for(const mode of ['idle','left-wall','right-wall','blocked','paused','frozen']){
    const {game,window}=setup(),steps=[];game.bossGate=game.worldWidth+100;
    game.sound=name=>{if(name==='step')steps.push(name);};
    game.input.setKey(mode==='left-wall'?'left':'right',mode!=='idle');
    if(mode==='left-wall')game.player.x=20;
    if(mode==='right-wall')game.player.x=game.worldWidth-60;
    if(mode==='blocked'){
      const enemy=new window.Enemy('hr',game.worldWidth-52);enemy.update=()=>{};game.enemies=[enemy];
      game.player.x=enemy.x-game.player.w-6;
    }
    if(mode==='paused')game.state='paused';
    if(mode==='frozen')game.freezeTimer=10;
    advance(game,1);assert.equal(steps.length,0,mode);
  }
});
test('jump and landing sound once, with no footsteps in midair or on repeated grounded frames',()=>{
  const {game}=setup(),sounds=[];game.sound=name=>sounds.push(name);
  game.input.setKey('right',true);game.input.setKey('space',true);advance(game,.3);
  assert.equal(game.player.onGround,false);assert.deepEqual(sounds,['jump']);
  game.input.setKey('right',false);game.input.setKey('space',false);advance(game,1);
  assert.deepEqual(sounds,['jump','land']);
  game.loadFloor(1,false);game.enemies=[];game.pickups=[];game.level={...game.level,hazards:[]};
  advance(game,.3);assert.deepEqual(sounds,['jump','land']);
});
test('opening sound plays on a new run, never on resume or a floor transition',()=>{
  const {game}=setup();const sounds=[];game.audio.play=name=>sounds.push(name);
  game.startGame();assert.deepEqual(sounds,['start']);
  game.enemies=[];game.state='paused';game.input.setKey('enter',true);advance(game,1/120);
  game.input.setKey('enter',false);game.loadFloor(1,false);assert.deepEqual(sounds,['start']);
  game.restartAfterEnding();assert.deepEqual(sounds,['start','start']);
});
test('combat sounds follow actual swings and successful skills, including projectile impacts',()=>{
  const {game,window}=setup();const sounds=[];game.sound=(name,variation)=>sounds.push([name,variation]);
  game.input.setKey('j',true);advance(game,1);game.input.setKey('j',false);
  assert.deepEqual(sounds.filter(s=>s[0]==='swing').map(s=>s[1]),[1,2,3]);
  advance(game,.5);const p=game.player;
  p.demandReflect(game);p.demandReflect(game);assert.equal(sounds.filter(s=>s[0]==='reflect').length,1);
  advance(game,1.2);p.resignationThrust(game);p.resignationThrust(game);assert.equal(sounds.filter(s=>s[0]==='thrust').length,1);
  advance(game,.5);p.ammo=0;p.throwStapler(game);assert.equal(sounds.filter(s=>s[0]==='ranged').length,0);
  p.ammo=2;p.throwStapler(game);p.throwStapler(game);assert.equal(sounds.filter(s=>s[0]==='ranged').length,1);
  const projectile=game.projectiles[0];game.enemies=[new window.Enemy('hr',projectile.x+2)];advance(game,1/120);
  assert.equal(sounds.filter(s=>s[0]==='hit').length,1);
  p.rage=0;p.ultimate(game);assert.equal(sounds.filter(s=>s[0]==='ultimate').length,0);
  p.rage=100;p.ultimate(game);p.ultimate(game);assert.equal(sounds.filter(s=>s[0]==='ultimate').length,1);
});
test('keyboard activation of sound controls never starts or pauses the game',()=>{
  const {game,listeners}=setup();
  listeners.keydown.forEach(fn=>fn({key:'Enter',target:{closest:()=>({})},preventDefault(){}}));
  assert.equal(game.input.consume('enter'),false);
});
test('attacks never freeze locomotion or effects',()=>{
  const {game}=setup();const start=game.player.x;
  game.input.setKey('right',true);game.input.setKey('j',true);
  game.burst(0,0,'#fff',1);const initialLife=game.particles[0].life;
  advance(game,.2);
  assert.ok(game.player.x>start+15);assert.ok(game.particles[0].life<initialLife-.18);
  assert.ok(game.slashes.length>0);assert.ok(game.player.attackTimer<.15);
});
test('combo damage lands after windup and once per swing',()=>{
  const {game,window}=setup();const foe=new window.Enemy('hr',game.player.x+38);foe.update=()=>{};game.enemies=[foe];
  game.player.swing(game);assert.equal(foe.hp,60);advance(game,.05);assert.equal(foe.hp,60);
  advance(game,.05);assert.equal(foe.hp,37);advance(game,.1);assert.equal(foe.hp,37);
});
test('a buffered tap chains once; holding J repeats smoothly',()=>{
  const {game}=setup();game.player.swing(game);advance(game,.18);game.player.swing(game);advance(game,.15);assert.equal(game.player.combo,2);
  advance(game,.5);assert.equal(game.player.attackTimer,0);game.input.setKey('j',true);advance(game,1.2);assert.ok(game.player.attackTimer>0);
});
test('thrust has no positional teleport and advances every frame',()=>{
  const {game}=setup();const x=game.player.x;game.player.resignationThrust(game);assert.equal(game.player.x,x);
  let prev=x;for(let i=0;i<20;i++){advance(game,1/120);const delta=game.player.x-prev;assert.ok(delta>0&&delta<5);prev=game.player.x;}
  assert.ok(prev-x>50);
});
test('60 and 120 Hz display loops have equal gameplay speed',()=>{
  const results=[];for(const hz of [30,60,120]){const {game}=setup();game.input.setKey('right',true);game.input.setKey('j',true);game.last=1000;
    for(let i=1;i<=hz;i++)game.loop(1000+i*1000/hz);results.push(game.player.x);}
  assert.ok(Math.max(...results)-Math.min(...results)<1.5,results.join(','));
});
test('reflect, ranged, ultimate, progression and restart remain playable',()=>{
  const {game,window}=setup();const p=game.player;
  game.projectiles=[new window.Projectile({x:p.x+30,y:p.y+12,vx:-100,vy:0,owner:'enemy'})];p.demandReflect(game);assert.equal(game.projectiles[0].owner,'player');
  advance(game,.4);const ammo=p.ammo;p.throwStapler(game);assert.equal(p.ammo,ammo-1);
  p.rage=100;p.ultimate(game);assert.equal(game.freezeTimer,3);assert.equal(p.rage,0);
  for(let floor=0;floor<5;floor++){game.loadFloor(floor,false);game.task.progress=game.level.requiredProgress;game.player.x=game.bossGate+10;game.updatePlaying(1/120);assert.equal(game.phase,'boss');game.damageBoss(10000);}
  assert.equal(game.state,'ending');assert.equal(game.stats.bosses,5);game.restartAfterEnding();assert.equal(game.floorIndex,0);assert.equal(game.state,'playing');
});
test('focus loss resets held inputs, hidden tabs pause safely',()=>{
  const {game,listeners,document,docListeners}=setup();game.input.setKey('right',true);listeners.blur.forEach(cb=>cb());assert.equal(game.input.down.right,undefined);
  document.hidden=true;docListeners.visibilitychange.forEach(cb=>cb());assert.equal(game.state,'paused');
});
test('all rendering states and five bosses draw at high DPI',()=>{
  const {game,canvas,window}=setup();assert.equal(canvas.width,860);assert.equal(canvas.height,1520);
  for(const state of ['title','playing','paused','down','floorClear','ending']){game.state=state;game.draw();}
  for(let i=0;i<5;i++){game.loadFloor(i,false);game.boss=new window.Boss(game.level,i);game.phase='boss';game.boss.performAttack(game);game.draw();}
});

test('attack pose joins the idle pose without an arm-angle snap',()=>{
  const {game,window,ctx}=setup();const p=game.player;const sample=timer=>{const angles=[];ctx.rotate=a=>angles.push(a);p.attackTimer=timer;window.GameArt.character(ctx,p,{x:0,y:0});return angles;};
  p.attackDuration=.3;p.attackKind='combo';const rest=sample(0),start=sample(.3),nearEnd=sample(.000001),mid=sample(.16);
  assert.equal(rest.length,start.length);
  rest.forEach((a,i)=>{assert.ok(Math.abs(a-start[i])<.0001);assert.ok(Math.abs(a-nearEnd[i])<.0001);});
  assert.ok(mid.some((a,i)=>Math.abs(a-rest[i])>.1));
});

test('a hit cancels pursuit momentum and attacks throughout enemy hit stun',()=>{
  for(const side of [-1,1]){
    const {game,window}=setup();const p=game.player;p.x=300;p.invuln=0;
    const enemy=new window.Enemy('hr',p.x+side*60);enemy.vx=-side*85;game.enemies=[enemy];
    enemy.takeDamage(10,side*35,game);let prev=enemy.x;const health=p.health;
    for(let i=0;i<36;i++){advance(game,1/120);assert.ok((enemy.x-prev)*side>=-1e-8);prev=enemy.x;}
    assert.ok(enemy.hitStun>0);assert.equal(p.health,health);assert.equal(p.x,300);
  }
});
test('approaching opponents cannot overlap or push a stationary player from either side',()=>{
  for(const side of [-1,1]){
    const {game,window}=setup();const p=game.player;p.x=300;p.invuln=0;
    const enemy=new window.Enemy('hr',p.x+side*90);game.enemies=[enemy];
    for(let i=0;i<240;i++){
      advance(game,1/120);assert.equal(p.x,300);
      assert.ok(side>0?enemy.x>=p.x+p.w+6-1e-8:enemy.x+enemy.w<=p.x-6+1e-8);
    }
    assert.ok(p.health<p.maxHealth,'contact attacks still deal damage');
  }
});
test('player movement and thrust claim space without swapping sides with an enemy',()=>{
  for(const side of [-1,1]){
    const {game,window}=setup();const p=game.player;p.x=400;p.dir=side;
    const enemy=new window.Enemy('hr',side>0?p.x+p.w+6:p.x-38);enemy.hp=1000;game.enemies=[enemy];
    const start=p.x;p.resignationThrust(game);game.input.setKey(side>0?'right':'left',true);
    for(let i=0;i<90;i++){
      advance(game,1/120);
      assert.ok(side>0?enemy.x>=p.x+p.w+6-1e-8:enemy.x+enemy.w<=p.x-6+1e-8);
    }
    assert.ok((p.x-start)*side>80);
  }
});
test('boss damage interrupts a charge and suppresses movement/attacks during hit stun',()=>{
  const {game,window}=setup();const p=game.player;p.x=1500;p.invuln=0;
  game.boss=new window.Boss(game.level,0);const b=game.boss;b.x=1560;b.attackCd=0;b.rushTimer=.25;b.rushDir=-1;
  game.damageBoss(10,100);assert.equal(b.rushTimer,0);const start=b.x;const health=p.health;
  advance(game,.3);assert.ok(b.x>start);assert.ok(b.hitStun>0);assert.equal(game.projectiles.length,0);assert.equal(p.health,health);
});
test('a fast boss crossing is stopped on the original side of the player',()=>{
  const {game,window}=setup();const p=game.player;p.x=1500;p.invuln=0;
  game.boss=new window.Boss(game.level,0);const b=game.boss;b.x=1600;b.rushTimer=.2;
  const previous=game.characterPositions();b.x=1400;game.resolveCharacterCollisions(previous);
  assert.equal(p.x,1500);assert.equal(b.x,p.x+p.w+6);assert.equal(b.rushTimer,0);assert.ok(p.health<p.maxHealth);
});
test('jumping over is allowed, but a landing overlap is separated without moving the player',()=>{
  const {game,window}=setup();const p=game.player;p.x=300;
  const enemy=new window.Enemy('hr',300);game.enemies=[enemy];
  p.y=350;game.resolveCharacterCollisions();assert.equal(enemy.x,300);
  const previous=game.characterPositions();p.y=window.GameData.GROUND-p.h;
  game.resolveCharacterCollisions(previous);assert.equal(p.x,300);assert.ok(enemy.x>=p.x+p.w+6||enemy.x+enemy.w<=p.x-6);
});
test('walls block pushing past an opponent without overlap or out-of-bounds enemies',()=>{
  const {game,window}=setup();const p=game.player;
  const enemy=new window.Enemy('hr',game.worldWidth-52);game.enemies=[enemy];p.x=enemy.x-p.w-6;
  const original=p.x;const previous=game.characterPositions();p.x+=20;game.resolveCharacterCollisions(previous);
  assert.equal(p.x,original);assert.equal(enemy.x,game.worldWidth-52);assert.equal(enemy.x,p.x+p.w+6);
});
test('defeated enemies do not occupy space',()=>{
  const {game,window}=setup();const enemy=new window.Enemy('hr',game.player.x);enemy.dead=true;game.enemies=[enemy];
  const original=enemy.x;game.resolveCharacterCollisions();assert.equal(enemy.x,original);
});
test('crowded contact preserves player space, including when a boss blocks the level edge',()=>{
  const {game,window}=setup();const p=game.player;p.x=1680;p.health=10000;
  const left=new window.Enemy('hr',p.x-38);const right=new window.Enemy('hr',p.x+p.w+6);left.hp=right.hp=10000;
  game.enemies=[left,right];game.boss=new window.Boss(game.level,0);game.boss.x=1720;game.boss.attackCd=100;
  game.input.setKey('right',true);
  for(let i=0;i<120;i++){
    advance(game,1/120);
    for(const enemy of [...game.enemies,game.boss])assert.ok(enemy.x>=p.x+p.w+6-1e-8||enemy.x+enemy.w<=p.x-6+1e-8);
  }
});

test('each opponent telegraphs a directional strike before dealing damage once',()=>{
  for(const type of ['hr','intern','bootlicker'])for(const side of [-1,1]){
    const {game,window}=setup(),p=game.player;p.x=400;p.invuln=0;
    const enemy=new window.Enemy(type,p.x+side*55);game.enemies=[enemy];
    const attacks=[];p.takeDamage=(...args)=>attacks.push(args);
    advance(game,1/120);assert.equal(enemy.attackPhase,'windup');assert.equal(enemy.dir,-side);
    const position=enemy.x;advance(game,.15);assert.equal(attacks.length,0);assert.equal(enemy.x,position);
    advance(game,.65);assert.equal(attacks.length,1);assert.equal(enemy.x,position);
    assert.equal(enemy.meleeAttack,null);assert.equal(game.screenShake,0);
  }
});
test('stepping out, jumping over, or crossing behind a windup avoids the committed strike',()=>{
  for(const dodge of ['retreat','jump','behind']){
    const {game,window}=setup(),p=game.player;p.x=400;p.invuln=0;
    const enemy=new window.Enemy('hr',p.x+60);game.enemies=[enemy];advance(game,1/120);
    const health=p.health;
    if(dodge==='retreat')game.input.setKey('left',true);
    if(dodge==='jump')game.input.setKey('space',true);
    if(dodge==='behind')p.x=enemy.x+enemy.w+20;
    advance(game,.4);assert.equal(p.health,health,dodge);assert.equal(enemy.dir,-1);
  }
});
test('an interrupted enemy stops its strike and retaliates only after hit stun',()=>{
  const {game,window}=setup(),p=game.player;p.x=400;p.invuln=0;
  const enemy=new window.Enemy('hr',p.x+60);game.enemies=[enemy];
  const cues=[];game.sound=name=>cues.push(name);advance(game,.1);
  assert.equal(enemy.attackPhase,'windup');enemy.takeDamage(5,35,game);
  assert.equal(enemy.meleeAttack,null);const health=p.health;
  advance(game,.3);assert.equal(p.health,health);assert.ok(enemy.hitStun>0);assert.ok(!cues.includes('enemySwing'));
  advance(game,.1);assert.equal(enemy.attackPhase,'windup');assert.equal(enemy.meleeAttack.counter,true);
  advance(game,.26);assert.ok(p.health<health);assert.equal(cues.filter(c=>c==='enemySwing').length,1);
});
test('held player combos leave a counter opportunity without extending one stun indefinitely',()=>{
  for(const hz of [30,60,120]){
    const {game,window}=setup(),p=game.player;p.x=400;p.invuln=0;
    const enemy=new window.Enemy('hr',p.x+p.w+6);game.enemies=[enemy];
    game.input.setKey('j',true);game.last=1000;
    for(let i=1;i<=Math.round(hz*.71);i++)game.loop(1000+i*1000/hz);
    assert.ok(enemy.hp<enemy.maxHp);assert.ok(p.health<p.maxHealth,`${hz} Hz counter`);
    assert.equal(p.x,400);assert.ok(enemy.x>=p.x+p.w+6);
  }
});
test('enemy strikes respect freeze, pause, lethal interruption and the player parry',()=>{
  for(const mode of ['freeze','pause','defeat','parry']){
    const {game,window}=setup(),p=game.player;p.x=400;p.invuln=0;
    const enemy=new window.Enemy('hr',p.x+60);game.enemies=[enemy];advance(game,.05);
    const health=p.health,timer=enemy.attackTimer;
    if(mode==='freeze')game.freezeTimer=2;
    if(mode==='pause')game.state='paused';
    if(mode==='defeat')enemy.takeDamage(100,35,game);
    if(mode==='parry')p.parryTimer=1;
    advance(game,.5);assert.equal(p.health,health,mode);
    if(['freeze','pause'].includes(mode))assert.equal(enemy.attackTimer,timer);
    if(mode==='defeat')assert.equal(game.enemies.length,0);
    if(mode==='parry')assert.ok(p.rage>=10);
  }
});
test('all five bosses answer nearby and surviving hits without moving into the player',()=>{
  for(let floor=0;floor<5;floor++){
    const {game,window}=setup();game.loadFloor(floor,false);game.enemies=[];game.pickups=[];game.level={...game.level,hazards:[]};
    const p=game.player;p.x=1500;p.invuln=0;game.phase='boss';
    const boss=new window.Boss(game.level,floor);boss.x=p.x+p.w+6;boss.attackCd=0;game.boss=boss;
    advance(game,1/120);assert.equal(boss.attackPhase,'windup');
    advance(game,.43);assert.ok(p.health<p.maxHealth);
    p.invuln=0;const health=p.health;boss.takeDamage(5,game,35);advance(game,.3);assert.equal(p.health,health);
    advance(game,.4);assert.ok(p.health<health,`floor ${floor}`);assert.equal(p.x,1500);assert.ok(boss.x>=p.x+p.w+6);
  }
});
test('out-of-range opponents are alerted by a hit and approach before retaliating',()=>{
  const {game,window}=setup(),p=game.player;p.x=200;p.invuln=0;
  const enemy=new window.Enemy('intern',700);game.enemies=[enemy];advance(game,.5);assert.equal(enemy.x,700);
  enemy.takeDamage(1,35,game);advance(game,.4);const start=enemy.x;advance(game,.6);
  assert.ok(enemy.x<start);assert.equal(p.health,p.maxHealth);assert.equal(enemy.meleeAttack,null);
});
test('opponent windup and recovery poses connect continuously to idle',()=>{
  const {game,window,ctx}=setup(),p=game.player;p.x=400;
  const enemy=new window.Enemy('hr',460);game.enemies=[enemy];advance(game,1/120);
  const sample=timer=>{const angles=[];ctx.rotate=a=>angles.push(a);enemy.attackTimer=timer;window.GameArt.enemy(ctx,enemy,{x:0,y:0});return angles;};
  const idle=sample(0),start=sample(enemy.attackDuration),end=sample(.000001),windup=sample(enemy.attackDuration-enemy.meleeAttack.windup);
  idle.forEach((a,i)=>{assert.ok(Math.abs(a-start[i])<.0001);assert.ok(Math.abs(a-end[i])<.0001);});
  assert.ok(windup.some((a,i)=>Math.abs(a-idle[i])>1));
});


test('continuous movement follows real travel in both directions, including forward jumps', () => {
  for (const direction of ['left', 'right']) for (const mode of ['walk', 'jump', 'crouch', 'boost']) {
    const {game} = setup(), speeds = []; game.player.x = 600;
    game.audio.setMovement = (speed, crouching) => speeds.push({speed, crouching});
    game.input.setKey(direction, true);
    if (mode === 'jump') game.input.setKey('space', true);
    if (mode === 'crouch') game.input.setKey('s', true);
    if (mode === 'boost') game.player.speedBoost = 4;
    advance(game, .25);
    assert.ok(speeds.length > 20); assert.ok(speeds.every(s => s.speed > 1), direction + mode);
    if (mode === 'jump') assert.equal(game.player.onGround, false);
    if (mode === 'crouch') assert.ok(speeds.every(s => s.crouching));
    game.input.setKey(direction, false); speeds.length = 0; advance(game, .1);
    assert.ok(speeds.every(s => s.speed === 0), 'release ' + mode);
  }
});

test('blocked movement and game transitions silence the continuous track', () => {
  for (const mode of ['idle', 'attack', 'wall', 'blocked', 'freeze', 'broken', 'meeting', 'pause', 'down', 'floorClear', 'ending', 'loadFloor']) {
    const {game, window} = setup(), speeds = [];
    game.audio.setMovement = speed => speeds.push(speed); game.bossGate = game.worldWidth + 100;
    if (!['idle', 'attack'].includes(mode)) game.input.setKey('right', true);
    if (mode === 'attack') game.input.setKey('j', true);
    if (mode === 'wall') game.player.x = game.worldWidth - 60;
    if (mode === 'blocked') {
      const enemy = new window.Enemy('hr', game.worldWidth - 52); enemy.update = () => {}; game.enemies = [enemy];
      game.player.x = enemy.x - game.player.w - 6;
    }
    if (mode === 'freeze') game.freezeTimer = 10;
    if (mode === 'broken') game.player.broken = 10;
    if (mode === 'meeting') game.player.meetingTrap = 10;
    if (mode === 'pause') game.state = 'paused';
    if (mode === 'down') game.playerDown();
    if (mode === 'floorClear') game.floorClear();
    if (mode === 'ending') { game.floorIndex = 4; game.floorClear(); }
    if (mode === 'loadFloor') { game.loadFloor(1, false); game.input.setKey('right', false); }
    advance(game, .1);
    assert.ok(speeds.length > 0, mode); assert.ok(speeds.every(speed => speed === 0), mode);
  }
});
