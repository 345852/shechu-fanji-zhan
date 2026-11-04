const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {GameData:{W:430,H:760,GROUND:680}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/renderer.js'),'utf8'),{window});

test('portable rounded rectangles keep paths inside bounds, clamp narrow gauges and retain paint',()=>{
  for(const [w,h,r] of [[40,20,4],[2,6,3],[24,23,10],[30,10,0]]){
    const points=[],radii=[];
    let opened=false,closed=false,filled=false,stroked=false;
    const c={
      beginPath(){opened=true;},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},
      arcTo(x1,y1,x2,y2,radius){points.push([x1,y1],[x2,y2]);radii.push(radius);},
      closePath(){closed=true;},fill(){filled=true;},stroke(){stroked=true;}
    };
    window.GameArt.rr(c,10,15,w,h,r,'#fff','#000');
    assert.ok(opened&&closed&&filled&&stroked);
    assert.equal(c.fillStyle,'#fff');assert.equal(c.strokeStyle,'#000');assert.equal(c.lineWidth,1);
    assert.equal(radii.length,4);assert.ok(radii.every(value=>value===Math.min(r,w/2,h/2)));
    assert.ok(points.every(([x,y])=>x>=10&&x<=10+w&&y>=15&&y<=15+h));
  }
  const untouched={beginPath(){assert.fail('empty rectangles must not create a path');}};
  window.GameArt.rr(untouched,0,0,0,5,2,'#fff');
  window.GameArt.rr(untouched,0,0,5,-1,2,'#fff');
});
