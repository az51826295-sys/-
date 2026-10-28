/**
 * **손맛 — 소리·진동·먼지** (10-28 사장님 기획 5번).
 *
 * 소리 파일을 안 싣는다. 레트로 효과음은 **그 자리에서 만든다**(WebAudio 사각파) —
 * 두근도트는 "느림 = 첫 글자까지" 라서 0.5초 로딩도 손해고, 파일은 캐시가 비면 안 난다.
 * 만들면 용량 0, 지연 0, 오프라인에서도 난다.
 *
 * 전부 **조용히 실패한다.** 소리·진동은 없어도 앱이 돌아야 한다 —
 * 아이폰 사파리는 진동이 없고, 소리는 사람이 한 번 건드리기 전엔 안 난다.
 *
 * 이름은 ASCII 로 둔다(한글 export 는 tsx 가 조용히 흘린다 — 10-25).
 */

let ctx: AudioContext | null = null;
let 꺼짐 = false;

/** 사람이 끈 적 있나. 설정에서 끄면 전부 조용해진다. */
export function setFeelOff(off: boolean): void {
  꺼짐 = off;
  try { localStorage.setItem("dot_feel_off", off ? "1" : "0"); } catch { /* 없어도 된다 */ }
}
export function feelOff(): boolean {
  if (꺼짐) return true;
  try { return localStorage.getItem("dot_feel_off") === "1"; } catch { return false; }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || feelOff()) return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    /* 사람이 건드리기 전엔 멈춰 있다 — 건드린 김에 깨운다 */
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

type 음 = { hz: number; ms: number; type?: OscillatorType; gain?: number; slide?: number };

/** 한 음. 사각파가 도트 결에 맞는다. */
function tone({ hz, ms, type = "square", gain = 0.05, slide = 0 }: 음, delay = 0): void {
  const c = audio();
  if (!c) return;
  try {
    const o = c.createOscillator(), g = c.createGain();
    const t0 = c.currentTime + delay / 1000;
    o.type = type;
    o.frequency.setValueAtTime(hz, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, hz + slide), t0 + ms / 1000);
    /* 딱 끊으면 "틱" 이 난다 — 끝을 부드럽게 내린다 */
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
  } catch { /* 소리는 없어도 된다 */ }
}

/** 자주 쓰는 소리들. 이름으로 부른다 — 부르는 쪽이 음을 몰라야 나중에 바꾸기 쉽다. */
export const SFX = {
  type: () => tone({ hz: 1400, ms: 18, gain: 0.025 }),              // 글자 하나
  tap: () => tone({ hz: 660, ms: 40, gain: 0.05 }),                 // 단추
  send: () => { tone({ hz: 520, ms: 50 }); tone({ hz: 780, ms: 60 }, 50); },
  recv: () => { tone({ hz: 880, ms: 60 }); tone({ hz: 660, ms: 80 }, 60); },
  flip: () => { tone({ hz: 300, ms: 70, slide: 600 }); tone({ hz: 1200, ms: 90, gain: 0.04 }, 70); },
  /** 멘헤라 알림 — 아래로 미끄러지는 음. 다른 소리와 섞이면 안 된다. */
  menhera: () => { tone({ hz: 440, ms: 140, type: "sawtooth", slide: -260, gain: 0.06 }); tone({ hz: 220, ms: 220, type: "sawtooth", gain: 0.05 }, 140); },
  heart: () => { tone({ hz: 90, ms: 90, type: "sine", gain: 0.12 }); tone({ hz: 70, ms: 130, type: "sine", gain: 0.1 }, 170); },
};

/** 진동. 없는 기기(아이폰)에서는 조용히 넘어간다. */
export function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || feelOff()) return;
  try { navigator.vibrate?.(pattern); } catch { /* 없어도 된다 */ }
}

/** 두-근. 심장 소리와 같은 간격으로. */
export const BUZZ = {
  tap: 12,
  send: 18,
  heart: [60, 90, 110],
  menhera: [30, 40, 30, 40, 160],
};

/**
 * 도트 먼지. 요소 가운데에서 네모 몇 개가 튄다.
 *
 * 캔버스를 안 쓴다 — 화면마다 캔버스를 띄우면 메모리가 는다. `div` 몇 개를 띄우고
 * 애니메이션이 끝나면 **스스로 지운다**. 지우는 걸 빼먹으면 대화 한 판에 수천 개가 쌓인다.
 */
export function burst(el: HTMLElement | null, opts: { n?: number; color?: string; size?: number; spread?: number } = {}): void {
  if (!el || typeof document === "undefined" || feelOff()) return;
  const { n = 10, color = "currentColor", size = 4, spread = 46 } = opts;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = spread * (0.5 + Math.random());
    p.style.cssText = [
      "position:fixed", `left:${cx}px`, `top:${cy}px`,
      `width:${size}px`, `height:${size}px`, `background:${color}`,
      "pointer-events:none", "z-index:9999", "image-rendering:pixelated",
    ].join(";");
    document.body.appendChild(p);
    const anim = p.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d - 50}%, ${Math.sin(a) * d - 50}%) scale(0.4)`, opacity: 0 },
      ],
      { duration: 420 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    /* 끝나면 반드시 지운다 — 안 지우면 한 판에 수천 개가 남는다 */
    anim.onfinish = () => p.remove();
    anim.oncancel = () => p.remove();
  }
}

/** 화면 쿵. 집착 대사가 뜰 때. */
export function shake(el: HTMLElement | null, 세기 = 6): void {
  if (!el || feelOff()) return;
  try {
    el.animate(
      [
        { transform: "translate(0,0)" }, { transform: `translate(${세기}px,-${세기 / 2}px)` },
        { transform: `translate(-${세기}px,${세기 / 2}px)` }, { transform: `translate(${세기 / 2}px,${세기 / 3}px)` },
        { transform: "translate(0,0)" },
      ],
      { duration: 260, easing: "ease-out" },
    );
  } catch { /* 없어도 된다 */ }
}
