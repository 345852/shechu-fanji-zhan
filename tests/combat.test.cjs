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
  for(const file of ['data','input','renderer','entities','game'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),sandbox,{filename:file+'.js'});
  const game = new window.BossRushGame(canvas);
  game.startGame();game.enemies=[];game.pickups=[];game.level={...game.level,hazards:[]};
  return {game,window,canvas,ctx,listeners,document,docListeners};
}
function advance(game,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++){game.update(1/hz);game.input.afterFrame();}}
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
