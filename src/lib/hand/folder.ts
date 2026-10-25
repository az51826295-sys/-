/**
 * **손 — 결과물을 사장님 컴퓨터 폴더에 직접 넣는다** (10-25).
 *
 * 왜 필요한가: 지금은 결과물을 받으려면 다운로드를 눌러야 하고, 게다가
 * `a.download = path.split("/").pop()` 이라 **폴더 구조가 통째로 사라진다** —
 * `Assets/Scripts/Player.cs` 가 그냥 `Player.cs` 로 다운로드 폴더에 떨어진다.
 * 유니티 프로젝트에 넣으려면 사람이 손으로 다시 자리를 잡아 줘야 했다.
 *
 * 그래서 **폴더를 한 번 고르면** 그 뒤로는 로키가 거기에 **경로 그대로** 쓴다.
 *
 * 한계(솔직히): 크로미움 데스크톱(크롬·엣지)에서만 된다. 사파리·파이어폭스엔 없고,
 * **안드로이드 크롬에도 없는 것으로 안다** — 그래서 플레이 스토어 앱에서는 못 쓴다.
 * 확인은 `canUseFolder()` 한 줄이다. 없으면 부르는 쪽이 다운로드로 떨어진다.
 *
 * 이름을 영문으로 내보내는 까닭: 한글 export 는 tsx 런타임이 조용히 흘려서
 * 자가 import 를 못 한다(10-25에 걸렸다).
 */

export type 넣을파일 = { path: string; contents?: string; href?: string };
export type 넣은결과 = { 넣음: number; 건너뜀: number; 탈: string[] };

const 저장소 = "rookery-hand";
const 칸 = "folder";
const 열쇠 = "root";

/** 이 브라우저가 폴더에 쓸 수 있나 — 부르기 전에 반드시 본다 */
export function canUseFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/* ── 사장님이 고치는 것 ─────────────────────────────────────
   폴더 핸들은 IndexedDB 에 있고(위), **설정은 localStorage** 에 둔다.
   화면 두 곳(설정 메뉴·결과물 단추)이 같은 것을 봐야 해서 한 자리에 모은다. */

export type 설정 = {
  /** 결과물이 오면 묻지 않고 바로 넣는다 */
  자동: boolean;
  /** 대화마다 하위 폴더를 따로 만든다 — 한 폴더에 여러 대화가 섞이지 않게 */
  대화별폴더: boolean;
  /** 모든 것 앞에 붙일 자리. 비면 고른 폴더 바로 아래. 예: `Assets/Rookery` */
  앞길: string;
};
const 기본설정: 설정 = { 자동: false, 대화별폴더: true, 앞길: "" };
const 설정키 = "rookery.hand.folder";

export function getSettings(): 설정 {
  if (typeof localStorage === "undefined") return 기본설정;
  try {
    const v = JSON.parse(localStorage.getItem(설정키) ?? "{}") as Partial<설정>;
    return { ...기본설정, ...v };
  } catch { return 기본설정; }
}
export function setSettings(바꿀것: Partial<설정>): 설정 {
  const 다음 = { ...getSettings(), ...바꿀것 };
  try { localStorage.setItem(설정키, JSON.stringify(다음)); } catch { /* 저장소 없음 */ }
  return 다음;
}

/**
 * 설정대로 앞길을 붙인다. 폴더 이름에 못 쓰는 글자는 `_` 로 바꾼다 —
 * 대화 제목이 그대로 폴더 이름이 되는데 거기 `:` 나 `?` 가 섞이면 쓰기가 통째로 실패한다.
 */
export function withPrefix(files: 넣을파일[], 대화이름?: string | null): 넣을파일[] {
  const s = getSettings();
  const 씻기 = (x: string) => x.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 60);
  const 앞 = [s.앞길, s.대화별폴더 && 대화이름 ? 씻기(대화이름) : ""]
    .filter(Boolean).join("/").split("/").filter((x) => x && x !== "." && x !== "..");
  if (!앞.length) return files;
  return files.map((f) => ({ ...f, path: 앞.join("/") + "/" + f.path }));
}

/* ── 고른 폴더를 기억해 둔다(IndexedDB). 핸들은 구조적 복제가 되므로 그대로 넣는다. ── */
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(저장소, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(칸)) r.result.createObjectStore(칸); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function 꺼내기(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await db();
    return await new Promise((ok) => {
      const r = d.transaction(칸, "readonly").objectStore(칸).get(열쇠);
      r.onsuccess = () => ok((r.result as FileSystemDirectoryHandle) ?? null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function 넣어두기(h: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const d = await db();
    const t = d.transaction(칸, "readwrite").objectStore(칸);
    if (h) t.put(h, 열쇠); else t.delete(열쇠);
  } catch { /* 저장소가 막혀 있으면 이번 판만 기억한다 */ }
}

/**
 * 권한이 아직 살아 있나. 브라우저를 껐다 켜면 `prompt` 로 돌아오므로,
 * **사람이 누른 그 순간에** 다시 물어야 한다(`사용자 동작` 안에서만 허용된다).
 */
async function 권한있나(h: FileSystemDirectoryHandle, 물어도되나: boolean): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  type P = { queryPermission?: (o: unknown) => Promise<PermissionState>; requestPermission?: (o: unknown) => Promise<PermissionState> };
  const p = h as unknown as P;
  if ((await p.queryPermission?.(opts)) === "granted") return true;
  if (!물어도되나) return false;
  return (await p.requestPermission?.(opts)) === "granted";
}

/** 지금 이어져 있는 폴더 이름. 없거나 권한이 끊겼으면 null. */
export async function folderName(): Promise<string | null> {
  const h = await 꺼내기();
  if (!h) return null;
  return (await 권한있나(h, false)) ? h.name : null;
}

/** 폴더 고르기 — **사람이 누른 순간에만** 부를 수 있다. 고르면 기억한다. */
export async function pickFolder(): Promise<string | null> {
  if (!canUseFolder()) return null;
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o: unknown) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    const h = await picker({ mode: "readwrite", id: "rookery-out" });
    await 넣어두기(h);
    return h.name;
  } catch { return null; }   // 사람이 창을 닫은 것 — 고장이 아니다
}

/** 이어 둔 폴더를 끊는다 */
export async function forgetFolder(): Promise<void> { await 넣어두기(null); }

/** `a/b/c.txt` 에서 `a/b` 를 따라 내려가며 없으면 만든다 */
async function 길따라(root: FileSystemDirectoryHandle, 길: string[]): Promise<FileSystemDirectoryHandle> {
  let 여기 = root;
  for (const 칸이름 of 길) 여기 = await 여기.getDirectoryHandle(칸이름, { create: true });
  return 여기;
}

/**
 * 파일들을 **경로 그대로** 폴더에 쓴다.
 *
 * `contents` 가 있으면 그대로, `href` 뿐이면 받아서 쓴다(그림처럼 글자가 아닌 것).
 * 한 파일이 실패해도 나머지는 계속 쓴다 — 하나 때문에 전부 날리면 안 된다.
 */
export async function putFiles(files: 넣을파일[], 물어도되나 = true): Promise<넣은결과> {
  const 결과: 넣은결과 = { 넣음: 0, 건너뜀: 0, 탈: [] };
  const root = await 꺼내기();
  if (!root) { 결과.탈.push("고른 폴더가 없다"); return 결과; }
  if (!(await 권한있나(root, 물어도되나))) { 결과.탈.push("폴더 권한이 없다"); return 결과; }

  for (const f of files) {
    /**
     * 10-25: 처음엔 `..` 을 **걷어내고 썼다.** 폴더 밖으로는 안 나가니 안전해 보였지만,
     * `../../etc/passwd` 가 고른 폴더 안에 **조용히 `etc/passwd` 로 들어앉았다**(자가 잡았다).
     * 유니티 프로젝트에 그런 게 생기면 나중에 아무도 왜 있는지 모른다.
     * → **이상한 경로는 안 쓰고 까닭을 남긴다.** 결과물에 `..` 이 나왔다면 그건 고칠 신호다.
     */
    const 날것 = f.path.split("/");
    if (날것.some((x) => x === "..")) { 결과.탈.push(f.path + ": 경로에 `..` 이 있다"); continue; }
    if (/^[A-Za-z]:/.test(f.path) || /[:*?"<>|]/.test(f.path)) { 결과.탈.push(f.path + ": 쓸 수 없는 글자"); continue; }
    /* 앞의 `/` 나 `./` 는 군더더기라 걷어내고 쓴다 */
    const 조각 = 날것.filter((x) => x && x !== ".");
    if (!조각.length) { 결과.건너뜀++; continue; }
    const 이름 = 조각.pop()!;
    try {
      const 자리 = await 길따라(root, 조각);
      const fh = await 자리.getFileHandle(이름, { create: true });
      const w = await fh.createWritable();
      if (typeof f.contents === "string") await w.write(f.contents);
      else if (f.href) await w.write(await (await fetch(f.href)).blob());
      else { await w.close(); 결과.건너뜀++; continue; }
      await w.close();
      결과.넣음++;
    } catch (e) {
      결과.탈.push(f.path + ": " + (e instanceof Error ? e.message : String(e)).slice(0, 60));
    }
  }
  return 결과;
}
