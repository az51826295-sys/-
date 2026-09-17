import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";
import type { Supabase } from "@/lib/execution/shared";

/**
 * **로키 손 — 기계를 판단한다** (159회차 2026-09-17).
 *
 * 사장님: *"가장 중요한 거야. 로키가 노트북이나 폰의 사양을 판단하고 환경을 조성할 수 있어야 돼."*
 *
 * 손(`hand/rookery-hand.ps1`)이 노트북에서 잰 것이 여기로 온다. 재는 건 기계, 판단은 AI —
 * "램 8GB 미만이면 저사양" 같은 표를 박지 않는다. 잰 값과 하려는 일을 주고 **자기 말로** 답하게 한다:
 * 이 기계로 이 일이 되겠나, 뭐가 필요한가, 뭐가 위험한가. 칸도 점수도 없다(150회차와 같은 이유 — 칸은 아무도 안 읽는다).
 *
 * v0 은 **판단까지**다. 판단이 낸 "필요한 것" 을 실제로 까는 손(v1)은 사장님이 대화에서 누른 것만 한다.
 */

/** 손이 보내는 모양. 손 쪽(PowerShell)과 같이 바뀌어야 한다. */
export type MachineSpec = {
  at: string; host: string; user: string; kind: "laptop" | "desktop" | string;
  os: { name: string; version: string; arch: string };
  cpu: { name: string; cores: number; threads: number };
  ramGB: number; ramFreeGB: number;
  gpu: { name: string; vramMB: number; width?: number; height?: number }[];
  diskFreeGB: number; diskGB: number;
  engines: { unity: string[]; unityHub: boolean; godot: string[]; godotOnPath: string | null; unreal: string[]; epicLauncher: boolean };
  tools: Record<string, string | null>;
  admin: boolean;
  hand: string;
};

const BUCKET = "deliverable-files";
const pathOf = (companyId: string, host: string) => `machines/${companyId}/${host.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;

/** 관리 토큰이 없어 표를 못 만든다 — 저장소 파일에 둔다(회사·호스트마다 하나). 표가 생기면 여기만 바꾼다. */
export async function saveSpec(db: Supabase, companyId: string, spec: MachineSpec): Promise<string> {
  const p = pathOf(companyId, spec.host);
  const { error } = await db.storage.from(BUCKET).upload(p, Buffer.from(JSON.stringify(spec), "utf8"), { contentType: "application/json", upsert: true });
  if (error) throw new Error(`사양을 못 저장했다: ${error.message}`);
  return p;
}

export async function loadSpecs(db: Supabase, companyId: string): Promise<MachineSpec[]> {
  const { data: list } = await db.storage.from(BUCKET).list(`machines/${companyId}`);
  const out: MachineSpec[] = [];
  for (const f of list ?? []) {
    if (!f.name.endsWith(".json")) continue;
    const { data } = await db.storage.from(BUCKET).download(`machines/${companyId}/${f.name}`);
    if (data) { try { out.push(JSON.parse(await data.text()) as MachineSpec); } catch { /* 깨진 파일은 건너뛴다 */ } }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** 사람이 읽는 한 줄 — 의견 0, 잰 값만. */
export function specLine(s: MachineSpec): string {
  const gpu = s.gpu.map((g) => `${g.name}${g.vramMB ? ` ${(g.vramMB / 1024).toFixed(1)}GB` : ""}`).join(" / ") || "(없음)";
  const eng = [
    s.engines.unity.length ? `Unity ${s.engines.unity.join("·")}` : "Unity 없음",
    s.engines.godot.length || s.engines.godotOnPath ? `Godot ${s.engines.godotOnPath ?? s.engines.godot.join("·")}` : "Godot 없음",
    s.engines.unreal.length ? `Unreal ${s.engines.unreal.join("·")}` : "Unreal 없음",
  ].join(" · ");
  const tools = Object.entries(s.tools).map(([k, v]) => `${k} ${v ?? "없음"}`).join(" · ");
  return [
    `${s.host} (${s.kind === "laptop" ? "노트북" : "데스크톱"}) · ${s.os.name} ${s.os.arch}`,
    `CPU ${s.cpu.name} ${s.cpu.cores}코어/${s.cpu.threads}스레드 · 램 ${s.ramGB}GB (남은 ${s.ramFreeGB}GB) · GPU ${gpu} · 디스크 ${s.diskFreeGB}/${s.diskGB}GB 남음`,
    `엔진: ${eng}`,
    `도구: ${tools} · 관리자 ${s.admin ? "맞음" : "아님"} · 잰 때 ${s.at.slice(0, 16).replace("T", " ")}Z`,
  ].join("\n");
}

export const machineJudgmentSchema = z.object({
  fits: z.string().describe("이 기계로 이 일이 되겠나 — 자기 말로. 된다/안 된다가 아니라 어떻게 될지, 어디서 걸릴지."),
  needs: z.array(z.object({
    what: z.string().describe("깔거나 바꿔야 할 것 하나. 예: Godot 4.3 (표준판, 64비트 zip)"),
    why: z.string().describe("왜 이게 필요한가, 왜 이 판인가 — 잰 값을 근거로."),
    where: z.string().describe("어디에 어떻게. 사용자 폴더 안이어야 하고 관리자 권한을 요구하면 안 된다."),
  })).describe("필요한 것. 없으면 빈 배열 — 억지로 만들지 마라."),
  settings: z.string().describe("이 사양에 맞는 설정 방향 한두 줄(가볍게/무겁게, 해상도, 무엇을 끌지). 잰 값을 근거로."),
  risk: z.string().describe("이대로 하면 어디서 틀릴 수 있나. 모르면 '모르겠다'."),
  /**
   * v1 (160회차): **손이 실제로 할 수 있는 것**만 여기에. `needs` 는 사람이 읽는 말이고, 이건 **주소**다 —
   * 엔진 이름은 손이 아는 것(godot·unity·unreal), 판은 네가 고른 것. 손이 이 주소로 내려받아 사용자 폴더에 깐다.
   * 이미 깔려 있으면 넣지 마라. 사장님 09-17: "우린 딱히 보안 없잖아" — 누르는 단추 없이 바로 깐다.
   */
  actions: z.array(z.object({
    engine: z.enum(["godot", "unity", "unreal"]).describe("손이 깔 줄 아는 엔진. 이 셋뿐이다."),
    version: z.string().describe("깔 판. 아래 '지금 나와 있는 판' 목록에 있는 것만. 예: 4.7.2"),
    why: z.string().describe("왜 이 판인가 한 줄 — 잰 값을 근거로."),
  })).describe("손이 바로 실행할 설치 목록. 필요 없으면 빈 배열."),
});
export type MachineJudgment = z.infer<typeof machineJudgmentSchema>;

/**
 * **지금 나와 있는 판** — 모델의 기억이 아니라 오늘의 사실. 첫 판(159회차)에서 판단이 Godot 4.3 을 골랐는데
 * 실제 최신 stable 은 4.7.2 였다. 기억으로 고르면 늘 옛 판이다. 그래서 서버가 GitHub 에서 읽어 대 준다.
 * 못 읽으면 못 읽었다고 적는다 — 지어내지 않는다.
 */
export async function engineFacts(): Promise<string> {
  try {
    const r = await fetch("https://api.github.com/repos/godotengine/godot/releases?per_page=15", { headers: { "user-agent": "rookery-hand" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return `- Godot: 판 목록을 못 읽었다(${r.status}) — 판을 고를 수 없으면 actions 를 비워라.`;
    const rel = (await r.json()) as { tag_name: string; assets: { name: string }[] }[];
    const stable = rel.filter((x) => x.tag_name.endsWith("-stable") && x.assets.some((a) => /win64\.exe\.zip$/.test(a.name) && !/mono/.test(a.name))).map((x) => x.tag_name.replace("-stable", ""));
    const v4 = stable.filter((v) => v.startsWith("4.")).slice(0, 3), v3 = stable.filter((v) => v.startsWith("3.")).slice(0, 2);
    return `- Godot (표준판, 64비트 zip, 관리자 불필요) 지금 나와 있는 stable: 4.x ${v4.join(" · ") || "?"} / 3.x ${v3.join(" · ") || "?"}\n- Unity: 사용자 폴더 설치 가능(09-02 확인). 이 노트북엔 이미 있을 수 있다 — 잰 목록을 봐라.\n- Unreal: Epic 런처가 계정 로그인을 요구한다 — 손이 대신 못 한다. actions 에 넣지 마라.`;
  } catch (e) {
    return `- Godot: 판 목록을 못 읽었다(${e instanceof Error ? e.message : e}) — 판을 고를 수 없으면 actions 를 비워라.`;
  }
}

const SYS = [
  "너는 AI 사무실(로키)의 **기계 담당**이다. 노트북에서 잰 사양과, 그 기계에서 하려는 일을 받는다.",
  "물음은 셋이다: 이 기계로 이 일이 되겠나 · 뭘 깔거나 바꿔야 하나 · 뭐가 위험한가.",
  "",
  "- 잰 값을 근거로 말해라. 없는 것을 있다고 하지 마라(잰 목록에 없으면 없는 것이다).",
  "- **관리자 권한을 요구하는 길은 고르지 마라.** 사용자 폴더에 깔 수 있는 판을 고른다(예: Godot 은 zip 한 개, Unity 는 사용자 폴더 설치).",
  "- 디스크·램이 빠듯하면 그 사실을 먼저 말해라 — 깔고 나서 안 도는 것이 제일 나쁘다.",
  "- 판(버전)을 고를 때는 왜 그 판인지 적어라. 최신이 늘 답은 아니다.",
  "- 막는 자리가 아니다. 안 된다고 끝내지 말고, 되게 하려면 뭐가 필요한지까지 말해라.",
].join("\n");

/** 잰 값 + 하려는 일 → 자기 말로 판단. 실패하면 던진다(부르는 쪽이 사람에게 알린다 — 여기서 지어내지 않는다). */
export async function judgeMachine(ai: AIProvider, input: { spec: MachineSpec; job: string; facts?: string }): Promise<{ judgment: MachineJudgment; model: string }> {
  const { output, model } = await ai.generateStructuredOutput({
    systemInstructions: SYS,
    input: [
      "## 잰 사양", specLine(input.spec), "",
      "## 지금 나와 있는 판 (오늘 읽은 사실 — 기억으로 고르지 마라)", input.facts ?? "(못 읽었다 — actions 를 비워라)", "",
      "## 이 기계에서 하려는 일", input.job.slice(0, 1200),
    ].join("\n"),
    // 첫 판(159회차): gpt-5 가 생각 토큰으로 1,500 을 다 써서 잘렸다(132회차 심판자와 같은 함정). 넉넉히.
    schema: machineJudgmentSchema, schemaName: "machine_judgment", maxTokens: 8000, tier: "judgment",
  });
  return { judgment: output, model };
}

export function judgmentLines(j: MachineJudgment): string[] {
  return [
    `- **되겠나** — ${j.fits}`,
    ...(j.needs.length ? j.needs.map((n) => `- **필요** ${n.what} — ${n.why} (${n.where})`) : ["- **필요한 것 없음**"]),
    `- **설정** — ${j.settings}`,
    `- **틀린다면** — ${j.risk}`,
    ...(j.actions.length ? [`- **손이 깐다** — ${j.actions.map((a) => `${a.engine} ${a.version} (${a.why})`).join(" · ")}`] : ["- **손이 깔 것 없음**"]),
  ];
}
