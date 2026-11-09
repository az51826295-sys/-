/**
 * # 게시물이 얼마나 **제각각인가** 재는 자
 *
 * 11-09 사장님: *"지금 게시물 올리는 게 다양하지 않아. 다양하게 만들어."*
 *
 * "다양하다"는 형용사라 그대로는 못 고친다([[adjectives-dont-survive-the-ruler]]).
 * 한 사람의 글 묶음을 놓고 **네 가지**를 센다. 넷 다 **낮을수록 다양하다.**
 *
 * | 잴 것 | 왜 |
 * |---|---|
 * | `똑같은글` | 글자까지 같은 글의 비율. 제일 심한 반복. |
 * | `같은첫머리` | 첫 어절이 겹치는 비율. 린은 글 37개 중 대부분이 "어," 로 시작한다 — 읽는 사람이 제일 먼저 느끼는 반복이다. |
 * | `소재겹침` | 두 글씩 짝지어 **글자 2-gram 자카드**의 가운데값. 말을 바꿔 써도 같은 소재면 올라간다. |
 * | `사진반복` | 1 − (다른 사진 수 ÷ 글 수). 같은 사진이 계속 나오면 글이 달라도 피드는 같아 보인다. |
 *
 * ## 문턱은 바깥에서 가져온다
 *
 * 글 다양성의 바깥 기준으로 흔히 쓰는 것이 **distinct-2**(서로 다른 2-gram 수 ÷ 전체 2-gram 수)
 * 로, 대화 생성 논문들이 0.2~0.3 을 "단조롭다"의 자리로 쓴다. 여기서는 짝 겹침으로 뒤집어 쓰되
 * 같은 자리를 잡는다: **소재겹침 0.20 을 넘으면 단조롭다**(= 평균적으로 두 글이 2-gram 의
 * 5분의 1을 공유한다). 첫머리·똑같은글은 **0.25 / 0** 을 자리로 둔다 — 넷 중 하나라도 넘으면
 * 그 사람 피드는 "비슷하다" 쪽이다.
 *
 * 이 숫자들은 **고치기 전에 먼저 지금 글로 재서** 어디가 문제인지 가른 다음에 쓴다.
 * 좋은 쪽(사장님이 괜찮다고 한 것)이 있으면 같은 자로 꼭 같이 재야 한다([[palette-overlap-is-not-style]]).
 */

export const 문턱 = { 똑같은글: 0, 같은첫머리: 0.25, 소재겹침: 0.2, 사진반복: 0.5 };

/** 글자 2-gram 묶음. 띄어쓰기·문장부호는 뺀다 — "밥 먹었어?" 와 "밥먹었어" 를 같게 본다. */
export function 두글자들(s: string): Set<string> {
  const t = s.replace(/[\s.,!?~…·'"()\[\]]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function 자카드(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let 겹침 = 0;
  for (const x of a) if (b.has(x)) 겹침++;
  return 겹침 / (a.size + b.size - 겹침);
}

const 가운데값 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((p, q) => p - q);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export type VarietyReport = {
  글수: number;
  똑같은글: number;
  같은첫머리: number;
  소재겹침: number;
  사진반복: number;
  단조로운가: boolean;
  어긴것: string[];
};

/**
 * 한 사람의 글 묶음을 잰다. `사진들` 을 주면 사진 반복까지 본다.
 *
 * 글이 **둘보다 적으면 못 잰다** — 짝이 없으면 겹침이 정의되지 않는다. 그때는 0 을 내지 않고
 * `글수` 만 채워 돌려준다([[zero-can-mean-i-cannot-see]]).
 */
export function measureVariety(글들: string[], 사진들: string[] = []): VarietyReport {
  const n = 글들.length;
  if (n < 2) return { 글수: n, 똑같은글: NaN, 같은첫머리: NaN, 소재겹침: NaN, 사진반복: NaN, 단조로운가: false, 어긴것: [] };

  const 똑같은글 = 1 - new Set(글들).size / n;

  /** 첫 어절(최대 네 글자) — "어," "...오락실에" 처럼 버릇이 드러나는 자리. */
  const 첫머리 = 글들.map((s) => s.trim().split(/\s+/)[0]?.replace(/[.,!?~…]/g, "").slice(0, 4) ?? "");
  const 첫머리수 = new Map<string, number>();
  for (const h of 첫머리) 첫머리수.set(h, (첫머리수.get(h) ?? 0) + 1);
  /** 혼자가 아닌 첫머리를 쓴 글의 비율 */
  const 같은첫머리 = [...첫머리수.values()].filter((v) => v > 1).reduce((s, v) => s + v, 0) / n;

  const 묶음 = 글들.map(두글자들);
  const 짝: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) 짝.push(자카드(묶음[i], 묶음[j]));
  const 소재겹침 = 가운데값(짝);

  const 사진반복 = 사진들.length ? 1 - new Set(사진들).size / 사진들.length : NaN;

  const 어긴것: string[] = [];
  if (똑같은글 > 문턱.똑같은글) 어긴것.push(`똑같은 글 ${(똑같은글 * 100).toFixed(0)}%`);
  if (같은첫머리 > 문턱.같은첫머리) 어긴것.push(`같은 첫머리 ${(같은첫머리 * 100).toFixed(0)}%`);
  if (소재겹침 > 문턱.소재겹침) 어긴것.push(`소재 겹침 ${소재겹침.toFixed(2)}`);
  if (Number.isFinite(사진반복) && 사진반복 > 문턱.사진반복) 어긴것.push(`사진 반복 ${(사진반복 * 100).toFixed(0)}%`);

  return { 글수: n, 똑같은글, 같은첫머리, 소재겹침, 사진반복, 단조로운가: 어긴것.length > 0, 어긴것 };
}
