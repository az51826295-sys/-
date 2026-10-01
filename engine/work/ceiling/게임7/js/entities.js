/* 적, 타워, 총알, 폭발 이펙트 객체 */
(function(){
  const E=window.TD={};
  E.PATH=[{x:-30,y:210},{x:270,y:210},{x:270,y:450},{x:870,y:450},{x:930,y:450}];
  E.pathPoint=function(distance){let d=distance;for(let i=0;i<E.PATH.length-1;i++){let a=E.PATH[i],b=E.PATH[i+1],len=Math.hypot(b.x-a.x,b.y-a.y);if(d<=len){let t=d/len;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}d-=len}return E.PATH[E.PATH.length-1]};
  E.pathLength=810;
  E.Enemy=class{constructor(wave){this.distance=0;this.speed=35+wave*2;this.maxHp=70+wave*22;this.hp=this.maxHp;this.reward=12+wave*2;this.radius=17;this.dead=false;this.escaped=false}update(dt){this.distance+=this.speed*dt;if(this.distance>=E.pathLength)this.escaped=true}get pos(){return E.pathPoint(this.distance)}};
  E.Tower=class{constructor(x,y){this.x=x;this.y=y;this.level=1;this.damage=18;this.range=125;this.cooldown=0;this.cost=50}upgrade(){this.level++;this.damage+=12;this.range+=12;this.cooldown=0}shoot(target){this.cooldown=.62;return new E.Bullet(this.x,this.y,target,this.damage)}};
  E.Bullet=class{constructor(x,y,target,damage){this.x=x;this.y=y;this.target=target;this.damage=damage;this.speed=420;this.dead=false}update(dt){if(!this.target||this.target.dead||this.target.escaped){this.dead=true;return}let p=this.target.pos,dx=p.x-this.x,dy=p.y-this.y,d=Math.hypot(dx,dy),step=this.speed*dt;if(d<=step+8){this.target.hp-=this.damage;this.dead=true}else{this.x+=dx/d*step;this.y+=dy/d*step}}};
  E.Particle=class{constructor(x,y){this.x=x;this.y=y;this.life=.65;this.max=.65;this.r=5+Math.random()*8;this.vx=(Math.random()-.5)*100;this.vy=(Math.random()-.5)*100}update(dt){this.life-=dt;this.x+=this.vx*dt;this.y+=this.vy*dt}}
})();