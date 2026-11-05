/**
 * **화면 하나를 재는 자** — `dot_ui_audit`(진짜 서버)와 `dot_room_shot`(조각으로 그린 방)이
 * 같은 것을 쓴다. 11-06 에 꺼냈다.
 *
 * 왜 꺼냈나: 광고 단추가 그려진 방은 **한도에 닿은 계정**이 있어야 서버에서 나온다.
 * 그걸 보려고 공유 DB 에 상태를 심는 것은 자가 눈 먼 길이다([[ash-rulers-must-not-seed]]) —
 * 게다가 남의 운영 표다. 그래서 **제품 조각을 그대로 그린 화면**에 같은 자를 대기로 했다.
 * 자가 둘로 갈라져 있으면 한쪽만 고쳐지고 다른 쪽은 조용히 옛 기준으로 남는다(실제로
 * `dot_limit_card_shot` 이 "회사 기준 44px" 을 인용했는데 그 44 는 어디에도 없었다).
 *
 * 재는 것:
 *  ① 넘침 ② 깨진 그림 ③ 가로 스크롤 ④ 작은 누를 자리 ⑤ 아래 탭에 가림 ⑥ 빈 글자 단추
 *
 * ④ 의 문턱은 **바깥 기준**이다 — WCAG 2.2 AA(2.5.8) 24×24, AAA(2.5.5) 44×44,
 * 그리고 2.5.8 의 **inline 예외**(문장 속 링크는 줄 높이에 묶여 있다).
 */

/**
 * **도트 껍데기 한 겹** — `/dot` 아래 모든 화면은 `src/app/dot/layout.tsx` 가 화면 CSS *뒤에*
 * `PIXEL_CSS` 를 싣고 갈무리 글꼴을 붙인다. 조각으로 그려서 재는 자들(`dot_room_shot`,
 * `dot_limit_card_shot`)은 **그 한 겹을 안 입히고 재고 있었다**(11-06 에 잡았다):
 * 같은 `.kk-title` 이 서버에서 213×41, 조각 화면에서 206×20 이었고 **조각 쪽이 틀렸다**
 * (껍데기가 `padding:10px 0 !important; min-height:40px` 을 얹는다).
 * 껍데기 없이 잰 크기는 사람이 보는 크기가 아니다 — 그걸로 "통과" 를 적으면 안 된다.
 *
 * 글꼴도 같이 싣는다(글자 크기가 달라 높이가 바뀐다). `file://` 은 막히니 base64 로 박는다.
 */
export async function dotSkin(): Promise<{ 앞: string; 뒤: string }> {
  const { readFileSync } = await import("node:fs");
  const { PIXEL_CSS } = await import("../../src/app/dot/pixel-skin.js");
  const b64 = (p: string) => readFileSync(p).toString("base64");
  const 글꼴 = ["Galmuri11", "Galmuri14"].map((f) =>
    `@font-face{font-family:${f};font-style:normal;font-weight:400;` +
    `src:url(data:font/woff2;base64,${b64(`public/fonts/${f}-ko.woff2`)}) format('woff2');}`).join("");
  return { 앞: `<style>${글꼴}</style>`, 뒤: `<style>${PIXEL_CSS}</style>` };
}

export type Small = { 이름: string; w: number; h: number; 어디: string; 문장속: boolean };
export type Measured = {
  넘침: string[]; 깨짐: string[]; 작음: Small[]; 가림: string[]; 빈단추: string[];
  가로스크롤: boolean; 폭: number;
};

/**
 * 검사는 **글자로 넘긴다.**
 *
 * `page.evaluate(() => {...})` 에 화살표 함수를 넣으면 tsx(esbuild)가 그 안에 `__name(...)` 헬퍼를
 * 끼워 넣는데, 브라우저 안에는 그 헬퍼가 없어서 `__name is not defined` 로 죽는다(09-29 실제로 죽었다).
 * 글자로 주면 esbuild 가 건드리지 않는다.
 */
export const CHECK_CODE = `(() => {
  var W = document.documentElement.clientWidth;
  var tabs = document.querySelector('.dt-tabs');
  var tabTop = tabs ? tabs.getBoundingClientRect().top : Infinity;
  var over = [], broken = [], small = [], hidden = [], unnamed = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    var name = (el.textContent || '').trim().slice(0, 18) || el.getAttribute('aria-label') || el.tagName.toLowerCase();
    if (r.right > W + 1 && r.width <= W) over.push(name + ' (오른쪽 ' + Math.round(r.right) + ' > 폭 ' + W + ')');
    if (el.tagName === 'IMG' && el.naturalWidth === 0) broken.push(String(el.src).slice(-50));
    if (el.matches('button, a[href], input, textarea, [role=button]')) {
      if (!String(name).trim()) unnamed.push(el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(' ')[0]);
      if (r.height > 0 && Math.min(r.height, r.width) < 44) {
        /* WCAG 2.5.8 의 inline 예외 — 바로 옆에 글자 노드가 있으면 문장 속 링크다. */
        var 문장속 = false, kids = el.parentNode ? el.parentNode.childNodes : [];
        for (var k = 0; k < kids.length; k++) {
          if (kids[k].nodeType === 3 && (kids[k].textContent || '').trim().length > 0) { 문장속 = true; break; }
        }
        small.push({
          이름: String(name), w: Math.round(r.width), h: Math.round(r.height), 문장속: 문장속,
          어디: el.tagName.toLowerCase() + '.' + String(el.getAttribute('class') || '').split(' ')[0]
        });
      }
      if (r.top < tabTop && r.bottom > tabTop + r.height / 2) hidden.push(name);
    }
  }
  return {
    넘침: over, 깨짐: broken, 작음: small, 가림: hidden, 빈단추: unnamed,
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    폭: W
  };
})()`;

/* 내보내는 이름은 **ASCII** 다 — 한글 이름을 export 하면 tsx 가 조용히 흘려서
   `does not provide an export named` 로 죽는다([[ascii-export-names]], 11-06 에 또 밟았다). */

/**
 * **낱말 가운데서 줄이 잘렸나** (11-06. 사진에서 *"오늘 5번 남 / 음"*, *"다시 10번 이야 / 기할"* 을 보고 만들었다.)
 *
 * 한국어는 기본값(`word-break: normal`)이면 **글자 단위로** 줄을 바꾼다 — 영어는 낱말째 내려가는데
 * 한국어만 낱말이 두 동강 난다. 눈으로는 금방 보이는데 자가 하나도 없었다([[one-ruler-per-complaint]]).
 *
 * 재는 법: 글자마다 상자를 받아 **줄이 바뀐 자리**를 찾고, 그 앞뒤가 둘 다 한글이면 낱말이 잘린 것이다
 * (띄어쓰기에서 바뀐 것은 앞 글자가 공백이라 안 걸린다). 규칙(`word-break`)을 보는 게 아니라
 * **그려진 결과**를 본다 — 규칙을 봤다면 `keep-all` 을 적어 놓고 안 먹는 자리를 놓쳤을 것이다.
 */
export const WORDBREAK_CODE = `(() => {
  var 한글 = /[가-힣]/, out = [], 글자수 = 0;
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n, r = document.createRange();
  while ((n = w.nextNode())) {
    var s = n.nodeValue || '';
    if (s.trim().length < 4 || 글자수 > 6000) continue;
    var p = n.parentElement;
    if (!p) continue;
    var cs = getComputedStyle(p);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    글자수 += s.length;
    var prevTop = null, prev = '';
    for (var i = 0; i < s.length; i++) {
      r.setStart(n, i); r.setEnd(n, i + 1);
      var b = r.getBoundingClientRect();
      if (!b.width && !b.height) { prev = s[i]; continue; }
      if (prevTop !== null && b.top > prevTop + 2 && 한글.test(prev) && 한글.test(s[i])) {
        out.push({
          어디: p.tagName.toLowerCase() + '.' + String(p.getAttribute('class') || '').split(' ')[0],
          자리: s.slice(Math.max(0, i - 6), i) + '／' + s.slice(i, i + 6)
        });
      }
      prevTop = b.top; prev = s[i];
    }
  }
  return out;
})()`;

export type WordBreak = { 어디: string; 자리: string };

/** 24px 미만(문장 속 예외 빼고) · 아슬(24~44) · 문장 속 예외 — 셋으로 가른다. */
export function split(작음: Small[]) {
  const 어긋남 = 작음.filter((s) => Math.min(s.w, s.h) < 24 && !s.문장속);
  const 예외 = 작음.filter((s) => Math.min(s.w, s.h) < 24 && s.문장속);
  const 아슬 = 작음.filter((s) => !어긋남.includes(s) && !예외.includes(s));
  return { 어긋남, 아슬, 예외 };
}

/**
 * 같은 조각이 목록에서 여러 번 나온다(피드 카드 10장 = 같은 단추 10개).
 * 고칠 자리는 **조각 하나**라 `어디+크기` 로 묶어 센다 — 10번 적으면 10개 일처럼 보인다.
 */
export function group(xs: Small[]): string[] {
  const m = new Map<string, { 본: Small; n: number }>();
  for (const s of xs) {
    const k = `${s.어디} ${s.w}×${s.h}`;
    const 있던 = m.get(k);
    if (있던) 있던.n++; else m.set(k, { 본: s, n: 1 });
  }
  return [...m.entries()].map(([k, v]) => `${k}${v.n > 1 ? ` ×${v.n}` : ""} "${v.본.이름}"`);
}
