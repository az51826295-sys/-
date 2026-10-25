/**
 * **폴더 손이 경로를 지키나** (10-25). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/hand-folder-test.mts
 *
 * 진짜 `showDirectoryPicker` 는 사람이 눌러야 뜨므로 헤드리스로 못 돈다.
 * 그래서 **가짜 폴더 핸들**을 끼워 `putFiles` 를 그대로 부르고, 어디에 뭘 썼는지 본다.
 * 재는 것은 하나다: **지금 다운로드가 납작하게 만드는 경로를 폴더 손은 지키나.**
 */
import { putFiles } from "@/lib/hand/folder";

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/** 쓴 것을 전부 기억하는 가짜 폴더 — 진짜 핸들과 같은 모양만 흉내낸다 */
const 쓴것: Record<string, string> = {};
const 만든폴더: string[] = [];
function 가짜폴더(이름: string, 앞길 = ""): unknown {
  const 내길 = 앞길 ? 앞길 + "/" + 이름 : 이름;
  return {
    name: 이름,
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    getDirectoryHandle: async (n: string) => { 만든폴더.push((내길 === "ROOT" ? "" : 내길 + "/") + n); return 가짜폴더(n, 내길 === "ROOT" ? "" : 내길); },
    getFileHandle: async (n: string) => ({
      createWritable: async () => {
        const 길 = (내길 === "ROOT" ? "" : 내길 + "/") + n;
        let 쌓임 = "";
        return { write: async (v: unknown) => { 쌓임 += String(v); }, close: async () => { 쓴것[길] = 쌓임; } };
      },
    }),
  };
}

/** `putFiles` 는 IndexedDB 에서 핸들을 꺼낸다 — 그 자리를 가짜로 바꿔 끼운다 */
const g = globalThis as unknown as { indexedDB: unknown };
const 루트 = 가짜폴더("ROOT");
g.indexedDB = {
  open: () => {
    const req: Record<string, unknown> = { result: null };
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({
          objectStore: () => ({
            get: () => { const r: Record<string, unknown> = {}; setTimeout(() => { r.result = 루트; (r.onsuccess as () => void)?.(); }, 0); return r; },
            put: () => {}, delete: () => {},
          }),
        }),
      };
      (req.onsuccess as () => void)?.();
    }, 0);
    return req;
  },
};

const r = await putFiles([
  { path: "Assets/Scripts/Player.cs", contents: "class Player {}" },
  { path: "Assets/Scenes/Main.unity", contents: "scene" },
  { path: "README.md", contents: "hi" },
  { path: "../../etc/passwd", contents: "나쁜 것" },
  { path: "/absolute/x.txt", contents: "앞 슬래시" },
]);

재기("다섯 중 멀쩡한 넷을 썼다", r.넣음 === 4, { 넣음: r.넣음, 건너뜀: r.건너뜀, 탈: r.탈 });
재기("`..` 은 쓰지 않고 까닭을 남긴다", r.탈.some((x) => x.includes("..")), { 탈: r.탈 });
재기("중첩 경로가 안 납작해진다", !!쓴것["Assets/Scripts/Player.cs"], { 쓴것: Object.keys(쓴것) });
재기("폴더를 만들어 가며 내려간다", 만든폴더.includes("Assets") && 만든폴더.includes("Assets/Scripts"), { 만든폴더 });
재기("`..` 짜리는 아예 안 써진다", !쓴것["etc/passwd"] && !Object.keys(쓴것).some((k) => k.includes("..")), { 쓴것: Object.keys(쓴것) });
재기("앞 슬래시도 안쪽으로 들어온다", !!쓴것["absolute/x.txt"], { 쓴것: Object.keys(쓴것) });
재기("내용이 그대로 들어간다", 쓴것["README.md"] === "hi", { 값: 쓴것["README.md"] });

console.log("\n못 잰 것: 진짜 `showDirectoryPicker` 창과 권한 — 사람이 눌러야 떠서 헤드리스로 못 돈다.");
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
