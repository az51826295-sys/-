/* 웨이브 진행과 적 생성 */
(function(){
  const E=window.TD;
  E.Waves=class{constructor(game){this.game=game;this.number=1;this.toSpawn=0;this.spawnTimer=0;this.active=false;this.breakTimer=0}start(number){this.number=number;this.toSpawn=5+number*2;this.spawnTimer=0;this.active=true;this.breakTimer=0}update(dt){if(!this.active){this.breakTimer-=dt;if(this.breakTimer<=0)this.start(this.number+1);return}if(this.toSpawn>0){this.spawnTimer-=dt;if(this.spawnTimer<=0){this.game.enemies.push(new E.Enemy(this.number));this.toSpawn--;this.spawnTimer=Math.max(.42,1.05-this.number*.025)}}else if(this.game.enemies.length===0){this.active=false;this.breakTimer=2.2}}};
})();