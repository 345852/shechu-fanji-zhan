const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const windowListeners={},documentListeners={};
  const buttons=['enter','right','1 j'].map(press=>({dataset:{press},handlers:{},classList:{add(){},remove(){}},setPointerCapture(){},
    addEventListener(type,fn){this.handlers[type]=fn;}}));
  const document={querySelectorAll:selector=>selector==='[data-press]'?buttons:[],addEventListener:(name,fn)=>documentListeners[name]=fn};
  const window={document,addEventListener:(name,fn)=>windowListeners[name]=fn};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/input.js'),'utf8'),{window,document,performance:{now:()=>1000}});
  const input=new window.Input();
  const send=(index,type,detail=1)=>buttons[index].handlers[type]({type,detail,pointerId:1,preventDefault(){}});
  return {input,send,windowListeners};
}
test('start/pause stay on screen until release while movement and combat respond on press',()=>{
  const {input,send}=setup();send(0,'pointerdown');assert.equal(input.consume('enter'),false);
  send(0,'pointerup');assert.equal(input.consume('enter'),true);assert.equal(input.down.enter,false);
  send(0,'lostpointercapture');send(0,'click');assert.equal(input.consume('enter'),false);
  send(1,'pointerdown');assert.equal(input.down.right,true);send(1,'pointerup');assert.equal(input.down.right,false);
  send(2,'pointerdown');assert.equal(input.down.j,true);assert.equal(input.consume('1'),true);send(2,'pointerup');assert.equal(input.down.j,false);
});
test('cancelled start gestures never launch the game; keyboard button clicks still work',()=>{
  for(const cancelled of ['pointercancel','lostpointercapture']){
    const {input,send}=setup();send(0,'pointerdown');send(0,cancelled);send(0,'pointerup');assert.equal(input.consume('enter'),false);
  }
  const {input,send}=setup();send(0,'click',0);assert.equal(input.consume('enter'),true);assert.equal(input.down.enter,false);
});

test('leaving the page cancels an armed start before the finger is released',()=>{
  const {input,send,windowListeners}=setup();send(0,'pointerdown');windowListeners.blur();send(0,'pointerup');assert.equal(input.consume('enter'),false);
});
