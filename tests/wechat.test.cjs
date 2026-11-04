const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'shechu-wechat-test-'));
execFileSync(process.execPath, [path.join(root, 'scripts/build-wechat.cjs'), '--out', temp]);
const createCore = require(path.join(temp, 'core.js'));
const createRuntime = require('../minigame/runtime');
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
function setup(info = {}, storage = new Map(), supported = true, roundRectAvailable = true) {
  const callbacks = {}, frames = new Map(), canvases = [], audio = [], text = [];
  let ms = 5000, nextId = 0;
  const param = () => ({value:0,setValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node = () => ({gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),playbackRate:param(),connect(){},disconnect(){},start(){},stop(){this.stopped=true;}});
  const wx = {
    createCanvas() {
      // DevTools 1.06.2503300 rejects scalar radii; older runtimes may omit roundRect.
      const roundRect = roundRectAvailable ? (x,y,w,h,radii) => {
        if (!Array.isArray(radii)) throw new TypeError("Failed to execute 'roundRect': The provided value cannot be converted to a sequence.");
      } : undefined;
      const context = new Proxy({roundRect,fillText:t=>text.push(t),measureText:t=>({width:t.length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(o,key)=>key in o?o[key]:()=>{}});
      const c={width:0,height:0,getContext:()=>context};canvases.push(c);return c;
    },
    getWindowInfo: () => ({windowWidth:390,windowHeight:844,pixelRatio:3,safeArea:{left:0,right:390,top:47,bottom:810},...info}),
    getMenuButtonBoundingClientRect: () => ({bottom:80}),
    getPerformance: () => ({now:()=>ms*1000}),
    getStorageSync:key=>storage.get(key), setStorageSync:(key,val)=>storage.set(key,val)
  };
  if (supported) wx.createWebAudioContext=()=>{
    const c={state:'running',sampleRate:8000,get currentTime(){return ms/1000;},destination:{},
      createGain:node,createDynamicsCompressor:node,createBiquadFilter:node,createOscillator:node,createBufferSource:node,
      createBuffer:(_,n)=>{const data=new Float32Array(n);return {length:n,getChannelData:()=>data};},
      resume(){this.state='running';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();}};
    audio.push(c);return c;
  };
  for(const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','KeyDown','KeyUp','Hide','Show','WindowResize','AudioInterruptionBegin']){
    wx['on'+event]=fn=>callbacks[event]=fn;wx['off'+event]=fn=>{if(callbacks[event]===fn)delete callbacks[event];};
  }
  const frameApi={requestAnimationFrame:fn=>{frames.set(++nextId,fn);return nextId;},cancelAnimationFrame:id=>frames.delete(id)};
  const runtime=createRuntime(wx,frameApi,createCore);runtime.start();
  const tick=(n=1)=>{for(let i=0;i<n;i++){ms+=1000/60;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(ms));}};
  const point=(id,finger=1)=>{const b=runtime.controls().find(b=>b.id===id);assert.ok(b,id);const l=runtime.layout;return {identifier:finger,clientX:l.x+(b.x+b.w/2)*l.scale,clientY:l.y+(b.y+b.h/2)*l.scale};};
  const send=(event,p)=>callbacks[event]({changedTouches:Array.isArray(p)?p:[p]});
  const click=id=>{const p=point(id);send('TouchStart',p);send('TouchEnd',p);tick();};
  return {runtime,game:runtime.game,wx,callbacks,frames,canvases,audio,text,storage,tick,point,send,click};
}

test('native entry boots without browser globals and fits canvas below the WeChat capsule',()=>{
  for(const size of [{windowWidth:320,windowHeight:568,safeArea:{left:0,right:320,top:20,bottom:568}},{},{windowWidth:430,windowHeight:932,safeArea:{left:0,right:430,top:59,bottom:898}}]){
    const s=setup(size);assert.equal(s.canvases.length,2);assert.equal(s.runtime.screen,s.canvases[0]);assert.equal(s.game.state,'title');
    const l=s.runtime.layout;assert.ok(l.y>=88);assert.ok(l.y+760*l.scale<=l.height);assert.ok(l.x>=0);assert.ok(l.x+430*l.scale<=l.width+.01);
    s.click('start');assert.equal(s.game.state,'playing');s.game.enemies=[];s.game.pickups=[];
    const p=s.point('right');s.send('TouchStart',p);s.tick(60);s.send('TouchEnd',p);
    assert.ok(s.game.player.x>200);assert.ok(s.game.elapsedSeconds()<=2,'microseconds converted once');s.runtime.dispose();
  }
});
test('build is an isolated game project, excludes browser files and keeps AppID unset until supplied',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(temp,'project.config.json')));
  assert.equal(config.compileType,'game');assert.equal(config.appid,'');assert.equal(config.setting.urlCheck,true);
  assert.equal(fs.existsSync(path.join(temp,'index.html')),false);
  assert.equal(fs.existsSync(path.join(temp,'style.css')),false);
  assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/build-wechat.cjs'),'--appid','not-an-appid','--out',temp],{stdio:'pipe'}));
  const s=setup();
  let booted=false;
  vm.runInNewContext(fs.readFileSync(path.join(temp,'game.js'),'utf8'),{
    wx:s.wx,requestAnimationFrame:()=>{},cancelAnimationFrame:()=>{},
    require:name=>name==='./core'?createCore:(wx,api,core)=>{assert.equal(core,createCore);return {start(){booted=true;}};}
  });assert.equal(booted,true);s.runtime.dispose();
});
test('native multitouch holds movement and attack together and releases only the matching finger',()=>{
  const s=setup();s.click('start');s.game.enemies=[];
  const right=s.point('right',1),combo=s.point('combo',2),combo2=s.point('combo',3);
  s.send('TouchStart',[right,combo,combo2]);s.tick(5);
  assert.equal(s.game.input.down.right,true);assert.equal(s.game.input.down.j,true);assert.ok(s.game.player.attackTimer>0);
  assert.ok(s.game.audio.movementLoop);s.send('TouchEnd',combo);assert.equal(s.game.input.down.j,true);
  s.send('TouchCancel',right);assert.equal(s.game.input.down.right,false);assert.equal(s.game.input.down.j,true);
  s.send('TouchEnd',combo2);s.tick();assert.equal(s.game.input.down.j,false);assert.equal(s.game.audio.movementLoop.level,0);s.runtime.dispose();
});
test('dragging out cancels start and mute; movement can slide between directions',()=>{
  const s=setup(),p=s.point('start'),outside={...p,clientX:0,clientY:0};
  s.send('TouchStart',p);s.send('TouchMove',outside);s.send('TouchEnd',p);s.tick();assert.equal(s.game.state,'title');
  s.click('start');const right=s.point('right'),left=s.point('left');s.send('TouchStart',right);s.send('TouchMove',left);
  assert.equal(s.game.input.down.left,true);assert.equal(s.game.input.down.right,false);s.send('TouchCancel',left);
  const sound=s.point('sound');s.send('TouchStart',sound);s.send('TouchCancel',sound);assert.equal(s.game.audio.muted,false);s.runtime.dispose();
});
test('hide clears held controls and audio, resume stays paused with one frame chain',()=>{
  const s=setup();s.click('start');const p=s.point('right');s.send('TouchStart',p);s.tick(5);
  const loop=s.game.audio.movementLoop;assert.ok(loop);s.callbacks.Hide();
  assert.equal(s.game.state,'paused');assert.equal(s.frames.size,0);assert.equal(s.game.audio.movementLoop,null);assert.equal(loop.source.stopped,true);
  s.send('TouchEnd',p);s.callbacks.Show();s.callbacks.Show();assert.equal(s.frames.size,1);s.tick();assert.equal(s.game.state,'paused');
  s.click('system');assert.equal(s.game.state,'playing');assert.equal(s.game.input.down.right,undefined);
  s.callbacks.AudioInterruptionBegin();assert.equal(s.game.state,'paused');s.runtime.dispose();assert.equal(s.frames.size,0);assert.deepEqual(Object.keys(s.callbacks),[]);
});
test('sound preference uses wx storage and unsupported audio does not block the game',()=>{
  const s=setup();s.click('sound');assert.equal(s.audio.length,1);assert.equal(s.game.audio.muted,false);
  s.click('sound');assert.equal(s.storage.get('shechu-sound-muted'),'1');const store=s.storage;s.runtime.dispose();
  const muted=setup({},store);muted.click('start');assert.equal(muted.audio.length,0);muted.click('sound');assert.equal(muted.audio.length,1);muted.runtime.dispose();
  const none=setup({},new Map(),false);none.click('start');none.click('sound');assert.equal(none.game.state,'playing');none.runtime.dispose();
});
test('all floors and state overlays render and native buttons reflect charge, rewards and restart',()=>{
  const s=setup();s.click('start');
  for(let i=0;i<5;i++){s.game.loadFloor(i,false);s.game.draw();}
  s.game.player.rage=100;s.game.draw();assert.equal(s.runtime.controls().find(b=>b.id==='ultimate').primary,true);
  s.click('perk');assert.equal(s.game.task.adUsesLeft,2);
  s.game.state='ending';s.game.draw();assert.ok(s.text.includes('点右下角「再来」开始新一轮'));
  s.click('system');assert.equal(s.game.floorIndex,0);assert.equal(s.game.state,'playing');s.runtime.dispose();
});

test('title, controls and all floors render when native roundRect is unavailable',()=>{
  const s=setup({},new Map(),true,false);
  assert.equal(s.game.state,'title');assert.ok(s.text.includes('开始反击  ↗'));
  s.click('start');
  for(let i=0;i<5;i++){s.game.loadFloor(i,false);s.game.draw();}
  s.click('system');assert.equal(s.game.state,'paused');s.game.draw();
  s.game.state='ending';s.game.draw();s.runtime.dispose();
});
