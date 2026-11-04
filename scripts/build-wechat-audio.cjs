'use strict';
// Render the shared game's cue definitions into deterministic, local PCM WAVs.
// No network, licensed samples, audio encoder or build dependency is needed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {cues} = require('../minigame/native-audio');
const RATE = 22050;
function wav(data) {
  const out = Buffer.alloc(44 + data.length * 2);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(1,22);
  out.writeUInt32LE(RATE,24); out.writeUInt32LE(RATE*2,28); out.writeUInt16LE(2,32); out.writeUInt16LE(16,34);
  out.write('data',36); out.writeUInt32LE(data.length*2,40);
  for(let i=0;i<data.length;i++) out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);
  return out;
}
module.exports = function buildAudio(root, out) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/audio.js'),'utf8'),{window});
  const proto = window.GameAudio.prototype, dir = path.join(out,'assets/audio');
  fs.mkdirSync(dir,{recursive:true});
  const files=[];
  for(const [key,[name,variation]] of Object.entries(cues)) {
    const voices=[];
    proto.synthesize.call({voice:(...v)=>voices.push(v)},name,variation,0);
    const length=Math.ceil((Math.max(...voices.map(v=>v[0]+v[1]))+.025)*RATE), samples=new Float32Array(length);
    let seed=12345;
    for(const [at,duration,volume,from,to,type,noise] of voices) {
      let phase=0, previous=0;
      const begin=Math.round(at*RATE), count=Math.round(duration*RATE), attack=Math.min(.008,duration*.1);
      for(let i=0;i<count;i++) {
        const t=i/RATE, f=from*Math.pow((to||from)/from,t/duration);
        phase+=2*Math.PI*f/RATE;
        let wave;
        if(noise) {
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          const white=seed/4294967296*2-1, alpha=1-Math.exp(-2*Math.PI*Math.min(f,RATE*.45)/RATE);
          previous+=alpha*(white-previous); wave=previous;
        } else wave=type==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):Math.sin(phase);
        const envelope=t<attack?volume*t/attack:t<duration*.6?volume*Math.pow(.22,(t-attack)/(duration*.6-attack)):volume*.22*Math.pow(.0001/(volume*.22),(t-duration*.6)/(duration*.4));
        samples[begin+i]+=wave*envelope*.52;
      }
    }
    // Soft limiting retains impacts without PCM clipping when the opening chord overlaps.
    for(let i=0;i<samples.length;i++) samples[i]=Math.tanh(samples[i]);
    const file='assets/audio/'+key+'.wav';fs.writeFileSync(path.join(out,file),wav(samples));files.push(file);
  }
  const holder={ctx:{sampleRate:RATE,createBuffer:(_,length)=>{const data=new Float32Array(length);return {getChannelData:()=>data};}}};
  const movement=proto.createMovementBuffer.call(holder).getChannelData(0);
  for(let i=0;i<movement.length;i++) movement[i]*=.52;
  const file='assets/audio/movement.wav';fs.writeFileSync(path.join(out,file),wav(movement));files.push(file);
  return files;
};
