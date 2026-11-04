/* Resolution-independent artwork. Animation poses read simulation time, never frame count. */
(function () {
  const { W, H, GROUND } = window.GameData;
  const C = { ink:'#122534', cream:'#f3e9cd', muted:'#a4bbb8', orange:'#ffbd76', cyan:'#91dfd4', pink:'#f89f9b' };
  const font = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b,v));
  const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const mix = (a,b,t) => a + (b-a) * ease(t);
  function rr(c,x,y,w,h,r,fill,stroke) {
    if(w<=0||h<=0)return;
    // Basic paths work across browsers and wx runtimes with differing roundRect APIs.
    r=Math.max(0,Math.min(r,w/2,h/2));
    c.beginPath();c.moveTo(x+r,y);
    c.lineTo(x+w-r,y);c.arcTo(x+w,y,x+w,y+r,r);
    c.lineTo(x+w,y+h-r);c.arcTo(x+w,y+h,x+w-r,y+h,r);
    c.lineTo(x+r,y+h);c.arcTo(x,y+h,x,y+h-r,r);
    c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.closePath();
    if(fill){c.fillStyle=fill;c.fill();}
    if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}
  }
  function poly(c,points,fill,stroke){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function line(c,points,color,width=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
  function ellipse(c,x,y,rx,ry,fill){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();}
  function grad(c,x,y,w,h,a,b){const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
  function text(c,t,x,y,size=12,color=C.cream,weight=500,align='left'){c.font=`${weight} ${size}px ${font}`;c.fillStyle=color;c.textAlign=align;c.fillText(String(t),x,y);c.textAlign='left';}
  function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  function pill(c,label,x,y,color=C.cyan){c.font=`600 10px ${font}`;const w=c.measureText(label).width+20;rr(c,x,y,w,22,7,'#132b36e8','#47616a');text(c,label,x+10,y+15,10,color,600);return w;}
  function gauge(c,x,y,w,h,ratio,color){rr(c,x,y,w,h,h/2,'#0e222de0');rr(c,x,y,w*clamp(ratio),h,h/2,grad(c,x,y,w,h,color,'#ffffff99'));}

  function keyboard(c,x,y,angle=0){
    c.save();c.translate(x,y);c.rotate(angle);
    rr(c,-2,2,29,11,3,'#8a674c','#172c35');rr(c,-3,-1,30,10,3,grad(c,0,0,20,10,'#fff3cf','#dfbb80'),'#4c5145');
    for(let j=0;j<2;j++)for(let i=0;i<6;i++)rr(c,i*4+1,j*3+1,2.6,1.8,.5,j===0&&i===5?'#e87b63':'#7a8f88');
    c.restore();
  }

  // Art coordinates: 34 x 58. Root stays at the physical feet, limbs rotate about joints.
  function character(c,e,cam={x:0,y:0},opts={}) {
    const scale=opts.scale||1.18, dir=e.dir||1, clock=e.animTime||0;
    const speed=Math.min(1,Math.abs(e.vx||0)/150), stride=(e.walkCycle||0);
    const airborne=e.onGround===false && !!e.vy;
    const crouch=e.crouchPose||0;
    const atk=e.attackDuration?clamp(1-e.attackTimer/e.attackDuration):1;
    const attacking=(e.attackTimer||0)>0;
    const swing=attacking ? Math.sin(Math.PI*atk) : 0;
    const isEnemy=opts.enemy, boss=opts.boss;
    const heroine=!isEnemy && !boss;
    const bounce=airborne?-1:Math.sin(stride*2)*1.1*speed+Math.sin(clock*2.6)*.65;
    const coat=opts.color || (e.moyu?'#79b38a':'#70c7c3');
    const x=e.x-cam.x+e.w/2,y=e.y-cam.y+e.h;
    c.save();
    const lift=opts.portrait?0:Math.max(0,GROUND-(e.y+e.h));
    ellipse(c,x,opts.portrait?y+2:GROUND-cam.y+3,(e.w*.64+5)*scale/(1+lift*.004),4.5*scale/(1+lift*.004),'#07121a66');
    c.translate(x,y);c.scale(scale*dir,scale);
    if(e.invuln>0)c.globalAlpha=.72+.28*(.5+.5*Math.sin(clock*16));
    const lean=(attacking?swing*(e.attackKind==='thrust'?.22:.12):speed*.07)*dir;
    c.rotate(lean - Math.sin(clamp((e.hitReaction || 0) / .18) * Math.PI) * .16);
    const cy=crouch*9+bounce;
    // The heroine's high ponytail follows locomotion and attack motion continuously.
    if (heroine) {
      c.save();c.translate(-10,-58+cy);
      c.rotate(.08+Math.sin(clock*2.7)*.07+Math.sin(stride-.6)*speed*.16-swing*.14);
      c.beginPath();c.moveTo(2,-2);
      c.bezierCurveTo(-11,-13,-23,-8,-21,6);
      c.bezierCurveTo(-19,19,-24,26,-28,27);
      c.bezierCurveTo(-12,33,-8,19,-11,8);
      c.bezierCurveTo(-12,2,-4,4,2,1);c.closePath();
      c.fillStyle=grad(c,-22,-7,16,36,'#634638','#302f36');c.fill();
      c.beginPath();c.moveTo(-6,-3);c.bezierCurveTo(-20,-7,-12,14,-20,22);
      c.strokeStyle='#9e7560';c.lineWidth=1.2;c.stroke();
      rr(c,-2,-4,5,7,2,'#f1b477');c.restore();
    }
    // Shoes and trousers: front and back legs have independent knee bends.
    function leg(side,front){
      const gait=airborne?(side>0?-.6:.5):Math.sin(stride+(side<0?Math.PI:0))*.48*speed;
      c.save();c.translate(side*5,-19+cy);c.rotate(gait-crouch*.2*side);
      line(c,[[0,0],[side*crouch*4,8-crouch*4],[side*crouch*3,16-crouch*3]],front?'#284353':'#1c303f',7.5);
      rr(c,-4,13-crouch*3,12,5,2.5,grad(c,0,12,0,6,front?(heroine?'#e4d8bf':'#52626c'):'#364451','#14222f'));
      line(c,[[-3,17-crouch*3],[7,17-crouch*3]],'#93a8a9',1.2);c.restore();
    }
    leg(-1,false);
    // Rear arm and hand.
    c.save();c.translate(-8,-33+cy);c.rotate(-.2-Math.sin(stride)*speed*.6);
    line(c,[[0,0],[-4,7],[-1,14]],'#3e898d',6);ellipse(c,-1,15,3.5,4,'#dda17f');c.restore();
    leg(1,true);
    // Shirt volume, seam and rolled cuffs.
    rr(c,heroine?-10:-11,-39+cy,heroine?21:23,23,7,grad(c,-10,-36,24,20,coat,boss?'#34434f':'#326c78'),'#244a58');
    poly(c,[[-9,-35+cy],[-3,-32+cy],[0,-38+cy],[4,-32+cy],[10,-36+cy],[5,-41+cy],[-5,-41+cy]],'#eff0d9');
    if (heroine) {
      poly(c,[[-3,-36+cy],[3,-36+cy],[4,-19+cy],[-4,-19+cy]],'#eee7d4');
      line(c,[[-5,-36+cy],[-7,-29+cy],[-3,-25+cy]],'#a9ded2',1.2);
      line(c,[[5,-36+cy],[7,-29+cy],[4,-25+cy]],'#a9ded2',1.2);
      rr(c,-3,-36+cy,6,2,1,'#d58d79');
    } else line(c,[[0,-31+cy],[0,-18+cy]],'#345c66',.7);
    if(boss||isEnemy)poly(c,[[1,-34+cy],[4,-30+cy],[2,-20+cy],[-1,-24+cy]],boss?'#f5ae74':'#cf8593');
    else {line(c,[[3,-35+cy],[5,-25+cy]],'#e8e9ca',1.2);rr(c,3,-27+cy,6,8,1,'#e9dfba');rr(c,4,-25+cy,4,2,.3,'#ffac72');}
    rr(c,-9,-18+cy,18,3,1,'#203847');
    // Neck, ears, face and hair silhouette.
    if (heroine) rr(c,-13,-65+cy,27,22,11,grad(c,-10,-65,18,28,'#624738','#302f36'));
    rr(c,-3,-44+cy,7,7,2,'#d99371');ellipse(c,-10,-49+cy,3,4,'#dba17d');
    rr(c,heroine?-10:-11,-62+cy,heroine?22:24,23,heroine?10:9,grad(c,-8,-59,22,18,'#ffe0ad','#dc9876'),'#644e42');
    // Her three-quarter face has its visible ear behind the hair, never over the front cheek.
    if (!heroine) { ellipse(c,11,-48+cy,3,4,'#efbd94');ellipse(c,11,-49+cy,1.2,2,'#c9846b'); }
    // Hair with offset fringe and a highlight — readable even at gameplay scale.
    if (heroine) {
      c.beginPath();c.moveTo(-12,-47+cy);
      c.bezierCurveTo(-17,-60+cy,-9,-69+cy,1,-66+cy);
      c.bezierCurveTo(11,-68+cy,17,-59+cy,13,-53+cy);
      c.bezierCurveTo(10,-53+cy,8,-57+cy,6,-60+cy);
      c.bezierCurveTo(2,-54+cy,-4,-52+cy,-9,-54+cy);
      c.lineTo(-9,-43+cy);c.lineTo(-12,-46+cy);c.closePath();
      c.fillStyle=grad(c,-9,-65,18,22,'#70503d','#332f34');c.fill();
      c.beginPath();c.moveTo(-8,-60+cy);c.quadraticCurveTo(-1,-65+cy,6,-62+cy);
      c.strokeStyle='#af8163';c.lineWidth=1.2;c.stroke();
      line(c,[[8,-59+cy],[11,-56+cy]],'#f4c487',1.6);
    } else {
    c.beginPath();c.moveTo(-12,-49+cy);c.bezierCurveTo(-16,-61+cy,-8,-68+cy,1,-65+cy);c.bezierCurveTo(8,-69+cy,17,-63+cy,14,-57+cy);c.lineTo(7,-54+cy);c.lineTo(5,-59+cy);c.lineTo(-3,-55+cy);c.lineTo(-9,-57+cy);c.lineTo(-9,-48+cy);c.closePath();c.fillStyle=grad(c,0,-66,10,16,boss?'#665344':'#35434b','#172530');c.fill();
    }
    if (isEnemy && e.type === 'hr') { ellipse(c,-10,-63+cy,6,6,'#5b4547'); line(c,[[-13,-59+cy],[-13,-44+cy]],'#654d50',4); }
    if (isEnemy && e.type === 'intern') poly(c,[[-9,-62+cy],[-11,-70+cy],[-4,-65+cy],[1,-71+cy],[4,-63+cy]],'#293d45');
    if (!heroine) line(c,[[-7,-62+cy],[0,-63+cy],[6,-61+cy]],'#68747a',1.2);
    const blink=(clock%4.7)>4.55;
    const eyeY=-49+cy;
    if(blink){line(c,[[-3,eyeY],[0,eyeY]],'#263d43',1.3);line(c,[[6,eyeY],[9,eyeY]],'#263d43',1.3);}
    else if (heroine) {
      ellipse(c,-1,eyeY,2.8,2.8,'#fff2dc');ellipse(c,7.5,eyeY,2.8,2.8,'#fff2dc');
      ellipse(c,-.2,eyeY,1.65,2.3,'#513e38');ellipse(c,8.1,eyeY,1.65,2.3,'#513e38');
      ellipse(c,.2,eyeY-.8,.65,.8,'#fff');ellipse(c,8.5,eyeY-.8,.65,.8,'#fff');
      line(c,[[-4,-51+cy],[-2,-52+cy],[1,-51.5+cy]],'#594039',.9);
      line(c,[[5,-51.5+cy],[8,-52+cy],[10,-53+cy]],'#594039',.9);
    } else {ellipse(c,-1,eyeY,1.4,2,'#233e47');ellipse(c,8,eyeY,1.5,2,'#233e47');ellipse(c,8.4,eyeY-.6,.45,.65,'#fff');}
    line(c,[[-4,-54+cy],[0,-55+cy]],'#65463b',heroine?1:1.5);line(c,[[6,-55+cy],[10,-54+cy]],'#65463b',heroine?1:1.5);
    if(!heroine && (!isEnemy||e.type==='hr')){rr(c,-5,eyeY-3,8,6,2,null,'#29474d');rr(c,5,eyeY-3,8,6,2,null,'#29474d');line(c,[[3,eyeY-1],[5,eyeY-1]],'#29474d',1);}
    line(c,[[5,-47+cy],[6,-45+cy],[4,-45+cy]],'#bd7a61',.8);
    if(attacking||boss)line(c,[[1,-42+cy],[6,-43+cy]],'#754b42',1.2);else {c.beginPath();c.arc(3,-45+cy,4,.4,1.8);c.strokeStyle='#ad6856';c.lineWidth=1;c.stroke();}
    ellipse(c,-4,-45+cy,2.5,1,heroine?'#d8877788':'#e68a7566');
    if (heroine) ellipse(c,7,-44.8+cy,1.7,.8,'#d8877755');
    // Forward arm drives weapon along a continuous arc.
    c.save();c.translate(8,-33+cy);
    const restAngle=Math.sin(stride+.8)*speed*.28-.28;
    let armAngle=restAngle;
    if(attacking) {
      // Join windup, strike and recovery at the idle pose, with zero endpoint velocity.
      if(e.attackKind==='enemyMelee' && e.meleeAttack) {
        const elapsed=e.attackDuration-e.attackTimer, windup=e.meleeAttack.windup;
        armAngle=elapsed<windup ? mix(restAngle,-1.65,elapsed/windup)
          : elapsed<windup+.12 ? mix(-1.65,.95,(elapsed-windup)/.12)
          : mix(.95,restAngle,(elapsed-windup-.12)/.28);
      } else if(e.attackKind==='thrust'||e.attackKind==='reflect') armAngle=mix(restAngle,-1.15,Math.sin(Math.PI*atk));
      else armAngle=atk<.22 ? mix(restAngle,-1.35,atk/.22)
        : atk<.62 ? mix(-1.35,.95,(atk-.22)/.4) : mix(.95,restAngle,(atk-.62)/.38);
    }
    c.rotate(armAngle);
    line(c,[[0,0],[4,8],[7,11]],coat,7);line(c,[[4,7],[7,11]],'#cce6d5',5.8);ellipse(c,8,12,3.5,3.8,'#f3bd91');
    if(!isEnemy||boss)keyboard(c,6,12,-.3);
    else {rr(c,5,5,13,17,2,'#e7debc','#8c988d');line(c,[[8,9],[14,9]],'#829d9b',1);line(c,[[8,13],[14,13]],'#829d9b',1);}
    c.restore();
    if(boss&&e.floorIndex===4){poly(c,[[-10,-66+cy],[-12,-75+cy],[-4,-71+cy],[1,-79+cy],[6,-71+cy],[14,-75+cy],[11,-65+cy]],'#ffc573','#96734c');}
    c.restore();
    if(e.parryTimer>0){c.save();const sx=x+dir*27;glow(c,sx,y-30,40,'#8eeee044');c.beginPath();c.ellipse(sx,y-30,12,30,dir*.15,-Math.PI/2,Math.PI/2);c.strokeStyle='#c8fff4';c.lineWidth=3;c.stroke();c.restore();}
  }

  function city(c,theme,cam=0,time=0){
    c.fillStyle=grad(c,0,0,0,H,theme.sky||'#192c3e','#486c73');c.fillRect(0,0,W,H);
    glow(c,340,168,190,'#edc68e25');ellipse(c,342,144,24,24,'#d6d7ba');ellipse(c,335,139,24,24,'#263e4b');
    for(let layer=0;layer<3;layer++){
      const spacing=layer===0?82:110,parallax=[.08,.16,.28][layer];
      for(let i=-2;i<9;i++){
        const x=i*spacing-((cam*parallax)%(spacing*3)),height=90+((i+12)*47%114),base=405+layer*26;
        const color=['#283e51','#2b4b5c','#335768'][layer];
        rr(c,x,base-height,spacing-13,height,2,color);
        poly(c,[[x+spacing-13,base-height],[x+spacing-4,base-height-7],[x+spacing-4,base],[x+spacing-13,base]],'#1d3749');
        if(i%3===0){line(c,[[x+18,base-height],[x+18,base-height-26]],'#58717a',1);ellipse(c,x+18,base-height-27,1.5,1.5,'#f9a67f');}
        for(let row=0;row<8;row++)for(let col=0;col<4;col++){
          const yy=base-height+14+row*19;if(yy>base-10)continue;
          c.fillStyle=(row*3+col+i+12)%5===0?'#e7be8377':'#85afb12c';c.fillRect(x+10+col*17,yy,7,10);
        }
      }
    }
    // Window mullions, interior ceiling and angled light pools.
    c.fillStyle='#112a37';c.fillRect(0,0,W,24);
    for(let i=-1;i<5;i++){const x=i*165-(cam*.38%165);c.fillStyle='#1a3341';c.fillRect(x,20,9,440);c.fillStyle='#55717b';c.fillRect(x+9,20,2,440);}
    c.fillStyle='#1a3341';c.fillRect(0,285,W,7);c.fillRect(0,451,W,20);
    c.fillStyle='#8aaca52a';c.fillRect(0,453,W,3);
    poly(c,[[300,24],[347,24],[430,470],[120,470]],'#d6e6be06');
    c.fillStyle=grad(c,0,470,0,290,theme.floor||'#344d59','#142937');c.fillRect(0,470,W,290);
    for(let i=-5;i<10;i++)line(c,[[i*80-cam*.35,470],[i*170-cam*.8-200,H]],'#9ab5ad12',1);
    [500,535,590,670,750].forEach(y=>line(c,[[0,y],[W,y]],'#9ab5ad14',1));
    glow(c,210,GROUND,170,'#94c7af0e');
  }
  function desk(c,x,y){
    ellipse(c,x+40,y+69,56,6,'#0c1e2955');
    line(c,[[x+4,y+30],[x+4,y+65]],'#233e4b',5);line(c,[[x+84,y+30],[x+84,y+65]],'#233e4b',5);
    poly(c,[[x-6,y+23],[x+77,y+23],[x+91,y+33],[x+4,y+33]],grad(c,x,y,100,20,'#a29a80','#677c78'));
    poly(c,[[x+4,y+33],[x+91,y+33],[x+91,y+39],[x+4,y+39]],'#4a5b59');
    rr(c,x+20,y-7,43,29,3,grad(c,x,y,40,30,'#657a80','#203b4b'),'#759496');
    rr(c,x+23,y-4,37,22,2,'#163b4a');glow(c,x+42,y+8,30,'#73e2dc18');
    line(c,[[x+27,y+2],[x+39,y+2]],'#82c8bf',1.5);line(c,[[x+27,y+7],[x+52,y+7]],'#518d92',1.2);line(c,[[x+27,y+12],[x+45,y+12]],'#e6bd84',1.2);
    rr(c,x+39,y+22,5,5,1,'#3d5b63');rr(c,x+32,y+27,21,2,1,'#28414e');
    rr(c,x+68,y+17,8,12,2,'#e7cf9a');ellipse(c,x+72,y+18,4,1.5,'#634e41');
  }
  function plant(c,x,y){
    ellipse(c,x,y+2,15,4,'#0b202955');poly(c,[[x-11,y-24],[x+11,y-24],[x+8,y],[x-8,y]],grad(c,x-8,y-20,20,10,'#c2ad85','#7b7f6c'));
    line(c,[[x,y-24],[x-1,y-63]],'#4b887c',2);
    for(let i=0;i<5;i++){c.save();c.translate(x,y-32-i*6);c.rotate((i%2?1:-1)*.75);ellipse(c,0,-10,5,13,i%2?'#7aa98a':'#4c8e80');c.restore();}
  }
  function office(c,g){
    for(let x=100;x<g.bossGate-80;x+=230){if(x<g.camera.x-130||x>g.camera.x+W+80)continue;desk(c,x,GROUND-73);if(x%460===100)plant(c,x+132,GROUND-7);}
    const x=g.bossGate;
    rr(c,x-8,GROUND-151,93,153,5,'#18333f','#7b9595');rr(c,x,GROUND-142,76,142,2,grad(c,x,GROUND-140,76,0,'#526f76','#29434f'));
    line(c,[[x+38,GROUND-140],[x+38,GROUND]],'#112c39',2);rr(c,x+8,GROUND-129,60,23,4,'#172f3c');text(c,'验收通道',x+38,GROUND-113,10,C.orange,600,'center');
    text(c,g.level.requiredProgress+'% 解锁',x+38,GROUND-91,9,'#b5d4ca',500,'center');ellipse(c,x+65,GROUND-65,2.4,2.4,g.canEnterBoss()?C.cyan:C.orange);
  }
  function title(c,g){
    city(c,g.level.theme,Math.sin(g.time*.12)*20,g.time);
    c.fillStyle=grad(c,0,0,0,290,'#0b202ced','transparent');c.fillRect(0,0,W,290);
    pill(c,'AFTER HOURS / 下班特别行动',28,30,C.orange);text(c,'VOL. 01',399,46,9,'#adc4bb',500,'right');
    c.save();c.translate(32,119);c.transform(1,0,-.08,1,0,0);
    text(c,'社畜',2,3,64,'#0a1d2b',900);text(c,'社畜',0,0,64,'#f2edd9',900);
    text(c,'反击战',2,72,64,'#775539',900);text(c,'反击战',0,67,64,C.orange,900);c.restore();
    line(c,[[35,207],[107,207]],'#d59866',2);text(c,'今天的 KPI：准点下班。',34,236,14,'#d8e1cf',500);
    rr(c,312,103,81,63,9,'#243f4ccc','#6c8987');text(c,'下班倒计时',352,123,9,'#adbfba',500,'center');text(c,'18:00',352,148,21,C.orange,700,'center');
    // Office stage with desk, warm desk lamps, and an oversized animated protagonist.
    desk(c,22,407);desk(c,308,412);plant(c,374,494);
    glow(c,217,425,133,'#ffce8b27');
    ellipse(c,212,522,133,24,'#0b1c2866');
    poly(c,[[79,516],[262,474],[354,515],[168,565]],'#536d70');poly(c,[[79,516],[168,565],[168,576],[79,527]],'#2f4d59');poly(c,[[168,565],[354,515],[354,526],[168,576]],'#203d4c');
    line(c,[[80,516],[168,565],[353,515]],'#9db6a2',1.2);
    // Three sheets suspended in the office breeze.
    for(let i=0;i<3;i++){c.save();c.translate(98+i*110,352+Math.sin(g.time*1.2+i)*9+i%2*65);c.rotate(Math.sin(g.time+i)*.12+(i-1)*.2);rr(c,-12,-16,24,32,2,'#dce4cb','#91a69b');line(c,[[-7,-8],[6,-8]],'#84aaa3',2);line(c,[[-7,-2],[7,-2]],'#84aaa3',1);line(c,[[-7,4],[3,4]],'#84aaa3',1);c.restore();}
    character(c,{x:195,y:450,w:34,h:58,dir:1,animTime:g.time,onGround:true,walkCycle:0},{x:0,y:0},{scale:2.75,portrait:true});
    pill(c,'打工人 · Lv. 01',32,262,C.cyan);
    c.fillStyle=grad(c,0,574,0,186,'transparent','#0f2532');c.fillRect(0,574,W,186);
  }
  function hud(c,g){
    rr(c,14,14,402,117,13,'#112834f0','#5a7478');
    rr(c,24,25,34,35,8,'#42564f','#a3aa88');text(c,g.level.floor,41,48,17,C.orange,800,'center');
    text(c,g.level.title,68,39,15,'#f1eddb',700);text(c,g.level.taskName,68,56,10,'#9bb7b3');
    text(c,`${g.elapsedSeconds()}s`,397,37,11,'#abc5c0',600,'right');text(c,`质量 ${Math.round(g.task.quality)}%`,397,55,10,C.cyan,500,'right');
    text(c,'体力',25,78,9,'#b1c4bf');gauge(c,53,71,135,7,g.player.health/g.player.maxHealth,'#ef9e88');text(c,Math.ceil(Math.max(0,g.player.health)),196,78,9,'#edc1a8');
    text(c,'心态',234,78,9,'#b1c4bf');gauge(c,262,71,107,7,g.player.mind/g.player.maxMind,C.cyan);
    text(c,'事项',25,99,9,'#b1c4bf');gauge(c,53,92,135,7,g.task.progress/100,'#dfc37f');text(c,Math.round(g.task.progress)+'%',196,99,9,C.orange);
    text(c,'怒气',234,99,9,'#b1c4bf');gauge(c,262,92,107,7,g.player.rage/100,'#e8b777');
    text(c,`门槛 ${g.level.requiredProgress}%`,25,119,9,'#a7b7ac');text(c,`订书机 ${g.player.ammo}/${g.player.maxAmmo}`,113,119,9,'#a7b7ac');
    const move=g.player.currentMove();text(c,`${move.name}${g.player.specialCd>0?' · '+g.player.specialCd.toFixed(1)+'s':''}`,397,119,9,C.cyan,500,'right');
    let sx=17;[[g.player.broken,'破防',C.pink],[g.player.meetingTrap,'会议中',C.orange],[g.player.moyu,'摸鱼回血',C.cyan],[g.privilegeTimer,'专注加成',C.orange]].forEach(([show,t,col])=>{if(show)sx+=pill(c,t,sx,141,col)+6;});
    if(g.phase!=='boss'){text(c,'推进至验收通道',29,181,10,'#aac7c3');text(c,'→',400,183,18,C.orange,600,'right');gauge(c,29,192,371,2,(g.player.x-20)/(g.bossGate-20),C.cyan);}
  }
  function slash(c,s){
    const t=clamp(1-s.life/s.maxLife),a=s.area,dir=s.dir;
    c.save();c.globalAlpha=Math.sin(Math.PI*Math.pow(t,.55));
    const x=dir>0?a.x:a.x+a.w,y=a.y+a.h*.5;c.translate(x,y);c.scale(dir,1);
    if(s.kind==='reflect'){
      glow(c,35,0,55,'#8feee85a');
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(36+i*6+t*8,0,15+i*4,29+i*5,0,-1.5,1.5);c.strokeStyle=i===0?'#ddfff1':'#8bdddc55';c.lineWidth=3-i*.6;c.stroke();}
    } else if(s.kind==='resign'){
      const length=a.w*(.45+t*.65);poly(c,[[-20,0],[length,-11],[length+20,0],[length,11]],grad(c,-20,0,length,0,'transparent','#fff2be'));
      for(let i=0;i<5;i++)line(c,[[-24-i*8,-19+i*9],[length-8-i*9,-19+i*9]],i%2?'#f7ae9b':'#ffdc9d',1.6);
    }else if(s.kind==='enemy'){
      const radius=a.w*(.65+t*.25);
      for(let i=2;i>=0;i--){c.beginPath();c.ellipse(0,0,radius-i*4,26-i*2,0,-1.3+t*.8,1.1+t*.5);c.strokeStyle=i===0?'#ffe0cc':i===1?'#f39687':'#f3968735';c.lineWidth=i===0?2:6;c.stroke();}
    }else{
      const radius=a.w*.85,start=-1.35+t*.65,end=start+.5+Math.sin(Math.PI*t)*1.8;
      for(let i=3;i>=0;i--){c.beginPath();c.ellipse(-3,3,radius-i*4,34-i*2,-.22,start,end);c.strokeStyle=i===0?'#fff6d6':i===1?(s.combo===3?'#f9a392':'#ffd18a'):'#ffd18a35';c.lineWidth=i===0?2:7;c.stroke();}
      const px=-3+Math.cos(end)*radius,py=3+Math.sin(end)*34;glow(c,px,py,18,'#fff2b675');
    }c.restore();
  }
  function pickup(c,p,cam){
    if(p.used&&p.type!=='toilet')return;const x=p.x-cam.x,y=p.y-cam.y,bob=Math.sin((p.animTime||0)*3+p.x)*2;
    c.save();ellipse(c,x+p.w/2,y+p.h+2,p.w*.55,3,'#0b202c55');c.translate(x,y+bob);
    if(p.type==='coffee'){
      glow(c,13,10,26,'#ffd19022');rr(c,4,4,17,20,4,grad(c,0,0,20,20,'#f9e6ba','#b9976a'));ellipse(c,12,5,8,2.8,'#5b4536');rr(c,8,10,9,7,2,'#638d80');c.beginPath();c.arc(22,12,5,-1.7,1.7);c.strokeStyle='#e0c497';c.lineWidth=3;c.stroke();line(c,[[10,-1],[8,-5],[11,-9]],'#e9e9c766',1);
    }else if(p.type==='brief'){
      glow(c,16,18,34,'#ffd3992d');rr(c,5,3,24,31,3,'#9c936f');rr(c,3,0,24,31,3,grad(c,0,0,20,30,'#fff2d1','#d5d7b1'));rr(c,8,-2,13,5,1,'#7e9893');line(c,[[8,10],[21,10]],'#6b9b98',2);line(c,[[8,16],[19,16]],'#91ada1',1.5);line(c,[[8,22],[18,22]],'#91ada1',1.5);
    }else if(p.type==='stapler'){keyboard(c,0,12,-.15);}else{
      rr(c,1,0,40,61,5,p.used?'#435c65':'#6d9894','#abc4b2');rr(c,6,5,30,52,2,'#264650');text(c,'WC',21,21,11,'#dfebd6',700,'center');rr(c,15,30,13,12,4,'#dce3cd');rr(c,18,25,9,9,2,'#c6d8c7');text(c,p.used?'已休息':'摸鱼点',21,72,9,C.cyan,500,'center');
    }c.restore();
  }
  function projectile(c,p,cam){
    const x=p.x-cam.x,y=p.y-cam.y;
    c.save();
    const len=Math.min(36,Math.hypot(p.vx,p.vy)*.06),angle=Math.atan2(p.vy,p.vx);
    c.translate(x+p.w/2,y+p.h/2);c.rotate(angle);
    c.fillStyle=grad(c,-len,0,len,0,'transparent',p.owner==='player'?'#91dfd4aa':'#ffb18c88');c.fillRect(-len,-p.h*.3,len,p.h*.6);c.rotate(-angle);
    if(p.kind==='pot'){ellipse(c,0,4,p.w/2,p.h*.34,'#223d4a');ellipse(c,0,-2,p.w/2,4,'#667d80');line(c,[[-p.w*.65,0],[-p.w*.5,0]],'#607780',3);line(c,[[p.w*.5,0],[p.w*.65,0]],'#607780',3);}
    else if(p.kind==='pancake'){ellipse(c,0,0,p.w/2,p.h/2,'#e4a95f');ellipse(c,-2,-2,p.w/2-3,p.h/2-3,'#f3cc86');ellipse(c,-4,-3,2.5,2,'#ba844c');ellipse(c,5,3,3,2,'#ba844c');}
    else if(p.kind==='wave'){glow(c,0,0,p.w,'#f9b47d22');rr(c,-p.w/2,-p.h/2,p.w,p.h,p.h/2,grad(c,0,-p.h/2,0,p.h,'#fff6d6',p.color));}
    else if(p.kind==='ppt'){rr(c,-p.w/2,-p.h/2,p.w,p.h,5,'#f0dbac','#b3916a');text(c,'PPT',0,4,11,'#614b3c',700,'center');}
    else{c.rotate((p.animTime||0)*3);keyboard(c,-12,-4,0);}c.restore();
  }
  function particle(c,p,cam){const ratio=clamp(p.life/p.maxLife);c.save();c.globalAlpha=ratio;c.translate(p.x-cam.x,p.y-cam.y);c.rotate(Math.atan2(p.vy,p.vx));rr(c,-p.size/2,-1,Math.max(p.size,Math.hypot(p.vx,p.vy)*.025),2,1,p.color);c.restore();}
  function vitals(c,p,x,y){gauge(c,x+p.w/2-22,y-26,44,3,p.health/p.maxHealth,'#a4e5cf');text(c,`${Math.ceil(Math.max(0,p.health))}`,x+p.w/2,y-31,8,'#dbf0db',600,'center');}
  function enemy(c,e,cam,boss=false){character(c,e,cam,{scale:boss?1.55:1.04,enemy:!boss,boss,color:e.color});const x=e.x-cam.x+e.w/2,y=e.y-cam.y;
    if(!boss){text(c,e.title,x,y-30,9,'#e1d9be',600,'center');gauge(c,x-22,y-23,44,3,e.hp/e.maxHp,'#eda98d');}
    if(e.meleeAttack && e.attackPhase==='windup'){
      const label='! '+e.actionText, py=boss?y-38:y-63;
      c.font=`600 10px ${font}`;const w=c.measureText(label).width+20;
      pill(c,label,x-w/2,py,C.pink);
      gauge(c,x-19,py+25,38,2,(e.attackDuration-e.attackTimer)/e.meleeAttack.windup,C.pink);
    } else if(boss && e.actionTimer>0 && !e.meleeAttack){c.font=`600 10px ${font}`;const w=c.measureText(e.actionText).width+16;pill(c,e.actionText,x-w/2,y-31,C.orange);}
    else if(!boss && e.alertTimer>0 && !(e.hitStun>0) && !e.meleeAttack){text(c,'!',x,y-44,13,C.orange,800,'center');}
  }
  function toast(c,g){const t=g.message; c.font=`500 11px ${font}`;const w=Math.min(396,c.measureText(t).width+30);c.save();c.globalAlpha=Math.min(1,g.messageTimer*3);rr(c,(W-w)/2,214,w,28,8,'#213d48ed','#678982');text(c,t,W/2,233,11,'#ece6c8',500,'center');c.restore();}
  function callout(c,g){const v=g.callout;c.save();c.globalAlpha=Math.min(1,v.life*4);text(c,v.text,215,278,13,C.orange,700,'center');c.restore();}
  function floating(c,v){c.save();c.globalAlpha=clamp(v.life/v.maxLife);text(c,v.text,v.x,v.y,12,v.color,750,'center');c.restore();}
  function cheer(c,v){if(!/下线|过关|资料/.test(v.text))return;c.save();c.globalAlpha=clamp(v.life/v.maxLife);text(c,v.text,v.x,v.y-20,14,C.orange,800,'center');c.restore();}
  function bossHp(c,g){if(!g.boss)return;rr(c,24,144,382,47,9,'#342c35ed','#997d73');text(c,g.boss.name,37,162,11,'#f4d5ba',700);text(c,`P${g.boss.phase}`,392,162,10,'#d4a78b',600,'right');gauge(c,37,173,355,6,g.boss.hp/g.boss.maxHp,'#e6a08d');}
  function overlay(c,title,sub){c.fillStyle='#0c2026b8';c.fillRect(0,0,W,H);rr(c,35,272,360,145,18,'#243e49','#73928b');text(c,title,215,330,27,C.orange,800,'center');text(c,sub,215,364,13,'#c2d2c7',500,'center');}
  function ending(c,g){c.fillStyle='#102935f2';c.fillRect(0,0,W,H);text(c,'DELIVERY COMPLETE',215,58,10,C.cyan,600,'center');text(c,'今天，准点下班。',215,101,29,C.orange,800,'center');character(c,{x:198,y:214,w:34,h:58,dir:1,animTime:g.time},{x:0,y:0},{scale:1.9,portrait:true});const score=g.settlementScore();pill(c,`${g.settlementGrade(score)} 级交付 · ${score} 分`,145,297,C.orange);const rows=[['通关用时',g.elapsedSeconds()+' 秒'],['交付质量',Math.round(g.task.quality)+'%'],['验收通过',g.stats.bosses+' / 5'],['处理阻碍',g.stats.defeated+' 个'],['本局称号',g.title()]];rows.forEach(([label,value],i)=>{text(c,label,51,355+i*35,12,'#a5bfba');text(c,value,379,355+i*35,13,'#ede7ce',650,'right');line(c,[[50,367+i*35],[380,367+i*35]],'#3a545d',.7);});text(c,'按 ENTER 再来一轮',215,554,12,C.cyan,600,'center');}
  function ultimate(c,g){const t=1-g.freezeTimer/3;c.save();c.globalAlpha=.25*(1-t);glow(c,g.player.x-g.camera.x,GROUND-35,150+300*t,'#ffe4a180');c.restore();pill(c,'✦ 已读不回 · '+g.freezeTimer.toFixed(1)+'s',132,302,C.orange);}
  window.GameArt={rr,text,character,city,office,desk,title,hud,slash,pickup,projectile,particle,vitals,enemy,toast,callout,floating,cheer,bossHp,overlay,ending,ultimate};
}());
