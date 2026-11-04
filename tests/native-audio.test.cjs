const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const createAudio = require('../minigame/native-audio');
const buildAudio = require('../scripts/build-wechat-audio.cjs');

function setup({delayOptions=false,muted=false,autoPlay=true}={}) {
  const storage=new Map([['shechu-sound-muted',muted?'1':'0']]), players=[],options=[];
  const clock={time:0,now(){return this.time;}},document={hidden:false};
  const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),
    setInnerAudioOption(o){options.push(o);if(!delayOptions)o.success();},
    createInnerAudioContext(o){
      assert.equal(o.useWebAudioImplement,false);
      const handlers={},p={handlers,plays:0,stops:0,pauses:0,destroyed:false,
        onPlay:f=>handlers.play=f,onEnded:f=>handlers.ended=f,onError:f=>handlers.error=f,
        play(){this.plays++;if(autoPlay)handlers.play();},stop(){this.stops++;},pause(){this.pauses++;},destroy(){this.destroyed=true;}};
      players.push(p);return p;
    }
  };
  const Audio=createAudio(wx,document,clock),sound=new Audio();
  const advance=(ms,speed=0,crouch=false)=>{for(let i=0;i<Math.ceil(ms/16);i++){clock.time+=16;sound.setMovement(speed,crouch);}};
  return {sound,players,options,document,clock,storage,advance};
}
test('native iPhone route bypasses the ringer switch only after a gesture and waits for actual playback',()=>{
  const s=setup({autoPlay:false});s.sound.setActive(true);s.sound.play('start');
  assert.equal(s.options.length,0);assert.equal(s.players.length,0);
  s.sound.unlock();assert.equal(s.options[0].obeyMuteSwitch,false);assert.equal(s.options[0].mixWithOther,true);
  s.sound.play('start');assert.equal(s.players[0].src,'assets/audio/start.wav');assert.equal(s.sound.ready,false);
  s.players[0].handlers.play();assert.equal(s.sound.ready,true);
  s.sound.setMuted(true);const count=s.players[0].plays;s.sound.unlock();s.sound.play('hit');
  assert.equal(s.players[0].plays,count);assert.equal(s.storage.get('shechu-sound-muted'),'1');
  s.sound.setMuted(false,true);assert.ok(s.players.some(p=>p.src==='assets/audio/parry.wav'));
  s.sound.dispose();assert.ok(s.players.every(p=>p.destroyed));
});
test('asynchronous route setup plays a fresh opening once, and never replays stale attacks',()=>{
  const s=setup({delayOptions:true});s.sound.unlock();s.sound.unlock();s.sound.setActive(true);
  s.sound.play('start');s.sound.play('hit');s.sound.play('swing');
  assert.equal(s.options.length,1);assert.equal(s.players.length,0);
  s.options[0].success();s.options[0].success();assert.equal(s.players.length,1);assert.equal(s.players[0].plays,1);
  assert.equal(s.players[0].src,'assets/audio/start.wav');
  for(const cancel of ['mute','pause','hidden','stale','dispose']){
    const x=setup({delayOptions:true});x.sound.unlock();x.sound.setActive(true);x.sound.play('start');
    if(cancel==='mute')x.sound.setMuted(true);
    if(cancel==='pause')x.sound.setActive(false);
    if(cancel==='hidden'){x.document.hidden=true;x.sound.interrupt();}
    if(cancel==='stale')x.clock.time=2000;
    if(cancel==='dispose')x.sound.dispose();
    x.options[0].success();assert.equal(x.players.length,0,cancel);
  }
});
test('native movement uses one loop, fades out, resumes and stops on pause/mute/interruption',()=>{
  const s=setup();s.sound.unlock();s.sound.setActive(true);s.advance(1000,190);
  const loop=s.sound.movementLoop,p=loop.source;
  assert.equal(p.loop,true);assert.equal(p.obeyMuteSwitch,false);assert.equal(p.plays,1);assert.ok(p.volume>.5);
  s.advance(32,0);s.advance(32,190);assert.equal(p.plays,1,'quick input changes do not restart the loop');
  s.advance(400,0);assert.equal(p.volume,0);assert.equal(loop.playing,false);assert.ok(p.pauses>=1);
  s.advance(400,190);assert.equal(p.plays,2);assert.equal(s.players.length,1);
  s.advance(400,80,true);assert.ok(p.volume<.25);
  s.sound.setActive(false);assert.equal(p.volume,0);s.advance(200,190);assert.equal(p.plays,2);
  s.sound.setActive(true);s.advance(200,190);s.sound.setMuted(true);assert.equal(p.volume,0);
  s.sound.setMuted(false);s.advance(200,190);s.sound.interrupt();assert.equal(s.sound.ready,false);assert.equal(p.volume,0);
  const before=p.plays;s.advance(200,190);assert.equal(p.plays,before);s.sound.unlock();s.advance(200,190);assert.equal(p.plays,before+1);
  s.sound.dispose();assert.equal(p.destroyed,true);
});
test('native effects preserve cue variations, de-duplicate hits and bound players under heavy combat',()=>{
  const s=setup();s.sound.unlock();s.sound.setActive(true);
  s.sound.play('hit',40);for(let i=0;i<50;i++)s.sound.play('hit',40);assert.equal(s.players.length,1);
  assert.ok(s.players[0].src.endsWith('/hitHeavy.wav'));
  s.sound.play('swing',3);assert.ok(s.players.some(p=>p.src.endsWith('/swing3.wav')));
  for(let i=0;i<200;i++){s.clock.time+=60;s.sound.play('swing',i%3+1);s.sound.play('step',-.55);}
  assert.equal(s.players.length,8);assert.ok(s.players.some(p=>p.volume===.55));
  s.sound.stop();assert.ok(s.sound.pool.every(p=>!p.wanted&&!p.busy));
  const before=s.players[0].stops;s.document.hidden=true;s.players[0].handlers.play();assert.ok(s.players[0].stops>before);
  s.sound.dispose();
});
test('native playback errors are visible and retryable; late callbacks cannot reopen interrupted audio',()=>{
  const s=setup({delayOptions:true});s.sound.unlock(true);s.options[0].fail({errMsg:'route unavailable'});
  assert.equal(s.sound.ready,false);assert.equal(s.sound.error,'route unavailable');
  s.sound.unlock(true);s.options[1].success();assert.equal(s.sound.ready,true);
  s.players[0].handlers.error({errMsg:'decode failed'});assert.equal(s.sound.ready,false);assert.equal(s.sound.error,'decode failed');
  s.sound.unlock(true);s.sound.interrupt();s.options[2].success();assert.equal(s.sound.route,'idle');
  s.sound.unlock(true);s.options[3].success();assert.equal(s.sound.ready,true);s.sound.dispose();
  s.options[3].success();assert.equal(s.players.length,1);
  const m=setup({muted:true});m.sound.unlock();assert.equal(m.options.length,0);assert.equal(m.players.length,0);
});
test('packaged PCM cues are deterministic, audible and bounded, with a continuous four-second movement loop',()=>{
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'shechu-native-audio-'));
  try {
    const files=buildAudio(root,temp),hashes=[];assert.equal(files.length,Object.keys(createAudio.cues).length+1);
    let total=0;
    for(const file of files){
      const b=fs.readFileSync(path.join(temp,file));total+=b.length;
      assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
      assert.equal(b.readUInt16LE(20),1);assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt32LE(24),22050);
      assert.equal(b.readUInt32LE(40),b.length-44);
      let peak=0;for(let i=44;i<b.length;i+=2)peak=Math.max(peak,Math.abs(b.readInt16LE(i)));
      assert.ok(peak>100&&peak<32767,file);
      hashes.push(crypto.createHash('sha256').update(b).digest('hex'));
      if(file.endsWith('/movement.wav')){assert.equal((b.length-44)/2/22050,4);assert.ok(Math.abs(b.readInt16LE(44)-b.readInt16LE(b.length-2))<100);}
    }
    assert.ok(total<500000);
    buildAudio(root,temp);files.forEach((f,i)=>assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(temp,f))).digest('hex'),hashes[i]));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
