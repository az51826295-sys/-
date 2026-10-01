// 로키가 뽑은 도트 조각 꾸러미. **이 파일은 고치지 마라.**
// 그림을 글자로 담아 뒀다 — 판은 바깥 요청이 막힌 창에서 돌아서 주소로는 못 불러온다.
// 쓰는 법:  import { SPRITES, sprite } from './sprites.js';
//           ctx.drawImage(sprite('enemy_fast'), x - 24, y - 24, 48, 48);
//
// **규격**: 한 장 48×48 · 도트 한 칸 2픽셀(격자 24칸) · 조각마다 키가 다르고 **바닥이 맞다**.
// 그러니 **늘 48×48 그대로 그려라.** 크기를 조각마다 다르게 늘리면 도트 칸이 어긋나고 덩치 차이가 깨진다.
// 발이 닿는 선은 그림의 아래끝이다 — 길 위에 세울 때 `y + 24` 가 발밑이 되게 그린다.
//   enemy_weak    키 13/24칸
//   enemy_fast    키 17/24칸
//   enemy_tank    키 22/24칸
//   tower_arrow   키 19/24칸
//   tower_cannon  키 16/24칸
//   tower_frost   키 21/24칸

export const SPRITES = {
  // 약한 적
  enemy_weak: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEVMaXFUoCtMmCczcCopUiRssUMZPhwMJhN8t1gACgoAAABAfi6x0Zebs4oIIhF0fXI7jJMHAAAAEHRSTlMA/v7+8/3zp/5IFvz+/Xj9yYUCeQAAAAlwSFlzAAAD6AAAA+gBtXtSawAAAKRJREFUeJzt0EENxTAMA9BRMIVQKIVQCIVQCIVQKIVQKIVQKIVS6Fdv09cmBcB89JN88HV9+VJOdFVV7lGG1WYKiFcV1sgUAGirBsHuBIAIHFEBg4gDcAGZFaAP+JyT5kwn5go05Nak5J1orQY+t8P3FPxNPQMDJOcREdB96h1OeS4BjVaCNYTGuePUqgUI46EMYtWh9xNf4bq69TC16Nbv9QP8AEJFiKvDQpitAAAAAElFTkSuQmCC",
  // 빠른 적
  enemy_fast: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEVMaXESN3sZWbkFHkoROXwAABUKMXERSp8SKmMEFTsADjErNVQ3THpAYKATLFwdb+TR7UNxAAAAD3RSTlMA+vtjuhiU8PqjNI78/M/W9d+eAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAvElEQVR4nO3SQY1FMQgFUCxcC9cCFrCABSxgoRZqoRZqoRZqoRbeZDKLyUv+f+1fzG5YEU4CJCDyH38esfwn8RVHEAxt4i6uwTiAAKybZqp1A2ILigLY5HVxGgDoDqygFIxJzvGdFdvBUpQKjjkHUUvRuoMmtTuZY2SmapW2A5Hmlkoy3cx/yw8gnqmVrBJ5P9RbEKUFQDU7BdFGrkvFj0HEWHFbdQuRtbxo9Ai9fwb+evQD6O1rT6CvfgJfF2KFe95fNwwAAAAASUVORK5CYII=",
  // 튼튼한 적
  enemy_tank: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEVMaXEkJik7PEFwTzsVFRVnZGhRT1KOY0c5ODxNNywkJigmJiZ6fICdiHywdkozMTSrUnJsAAAAEHRSTlMA8/r8I/z9/sz8eFD8/v2gfutzDAAAAAlwSFlzAAAD6AAAA+gBtXtSawAAASBJREFUeJy901FthDEIAOBawAIWsIAFLGABC1jAAhawgIVaqIUu/yXb3WX71z2tLzT5EkiBjvGPh3mk5RX+BpziqUvSJfkvUG0NoRIBbV1nqJ7LQEOCwNbsqhNsmU3RAtRIc8reJ3ASAZpzrqkgQu4nYEAEXb3WpOv61ZdbyEAACDO9IkbmAUqCvCCWUUA5hcgB3ARyVJho1EgQswPgat0jg5Qix9Ze6wDbCJgJdRESM9BnqltAIx97Elyd3MPP4ASaPg0cbHopEB0gr0476R5bya8Z4AFGOlcr8GDQLvbnPO5gDEYh4sFEgu/bfgeFYVqj1AJflv0XYBS7tszte42fobTjAdH6XuMG2EXx8UBU8Zdct5CoiNdv2YiKz4b8BB90aCxa81zWMAAAAABJRU5ErkJggg==",
  // 화살 타워
  tower_arrow: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEVMaXE8MS9NS051c3M2MjJnZGQ/PUA0Ihg8LCQLCwBmOyF3RSQqVIhva2lriayNiYdrJKFAAAAAD3RSTlMAd+f9PfyqwvcX/vz7u/pmPG/5AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlUlEQVR4nO3RQQ0FMQgEUCyMBSxgAQtYqAUsYKEWamEt1MJaWAvd7PEnNCn3z/UlA2GI/kMd6CVAc2+oQO/uvVeAEJEl7QHjugYK4OOD4eeAcMCT9VvQYFUOPQeYMZvhHJRjzmA9B2J5HmEqQLM5pVUAIiYowRJZJWgfpFftYa0a8DJb6a82oPZFWdLHFpjvm9MGf+EFdgFqySvGpDwAAAAASUVORK5CYII=",
  // 대포 타워
  tower_cannon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEUAAABaWl01MzWKUxZlZmuBXjEbGR06Kx8zJh8GBgaebCtqRRwvLzR3dnfIeh5FTFi/PX9/AAAAD3RSTlMB/fz9/vz+oHgo/fXM/f5pxqBqAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAw0lEQVR4nO3QQY2EMQgF4N8CFrCABSxgoRZqAQtYqAUsYAELtcCmO5fOZJr0uId9hzbplzxSnuc/fzGmPaCrXkNEypieEHYHJuOVSWa6FR7hcQCowkIMHEQXoMBIDRELnVq7AAPAsQCb+yVwo/YK7cOPoMDg2BDD9G2VRwiGhJX43O4BDDiBpiez3oEyM4gLM8cdBCfXGASZ9Tb9BOZDROaYIkL9Bjr5eiJZp29dR6CJzEWzOAvn9sUjaF9xit97q/oGP1pQxaHziF5MAAAAAElFTkSuQmCC",
  // 얼음 타워
  tower_frost: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAAMFBMVEUAAAAnOFiJqbYgRGpUc4tJgJcsZ5Ks5fEpNEt7nKpRnLEbRGZvobPU9/gzgO6Uy9dJCKpqAAAAD3RSTlMBbf2lo/7z/kT3/OT+/f2KUtj8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAArklEQVR4nM3SQY1FMQgF0FrAAhawgAUsYAELtYAFLNRCLdRCLfD389qE7obtSbi5hNb++7DSG8C2DS/Qx7Y9eq8DIyk5cx36ZOd5yrhBIzE5NrwC40R+Ak1MfQIQF3gBoLAggDpwikmernsDSETPU8YNmqL7ufkZOoxcOb6rrgAmkSFmZeixJGVF1GEYCtoYZfAZ6BhzloFSdenILAMoignq54xX6MTkxPR567/wA9WMjMnv9kG6AAAAAElFTkSuQmCC",
};

const _이미지 = {};
/** 키를 주면 그려 넣을 수 있는 그림을 돌려준다(한 번만 만든다). */
export function sprite(key) {
  if (!_이미지[key]) { const im = new Image(); im.src = SPRITES[key]; _이미지[key] = im; }
  return _이미지[key];
}

/** 다 읽힐 때까지 기다린다. 첫 화면에서 빈 칸이 보이지 않게. */
export function spritesReady() {
  return Promise.all(Object.keys(SPRITES).map((k) => new Promise((done) => {
    const im = sprite(k);
    if (im.complete) done(); else { im.onload = () => done(); im.onerror = () => done(); }
  })));
}
