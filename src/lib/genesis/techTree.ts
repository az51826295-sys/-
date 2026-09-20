import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **기술 나무 — 제네시스의 진짜 세계모델** (193회차 09-20).
 *
 * 사장님(09-20 새벽): *"제네시스는 '발명이란 건 없고 일정 수준에 과학이 도달하면 자연스럽게 해금된다' 고 생각해서 시작한 프로젝트야.
 * 발명을 예측한다는 거지."*
 *
 * 그때까지 나는 제네시스를 "로키가 자기 일을 더 잘하게 되는 고리" 로 다뤘다. 기계(예측 잠금·검증된 판정·기호적 세계모델·학습 진도)는
 * 맞게 만들고 있었는데 **무엇을 예측하는가** 를 내 멋대로 줄여 놓은 것이다. 겨눌 곳은 이쪽이다: **다음에 무엇이 열리는가.**
 *
 * 사장님 가설을 코드로 적으면 함수 하나다 — `ready()`: **선행조건이 모두 열린 닫힌 칸.**
 * 가설이 맞으면 그 칸들은 곧 열려야 하고, 틀리면 안 열린 채 남는다. 둘 다 숫자로 남는다.
 *
 * 규율(제네시스 1번 원칙): **열리기 전에 적고 잠근다.** 예측은 git 에 파일로 박히고(`engine/docs/genesis/predictions/`),
 * 채점은 나중에 증거가 왔을 때 따로 한다. 사후에 "그럴 줄 알았다" 가 되면 이 프로젝트 전체가 의미가 없다.
 *
 * **오염 주의**: 지난 일을 맞히는 시험(후향)은 예측하는 모델이 답을 이미 외우고 있을 수 있다. 그건 기계를 점검하는 용도일 뿐이고,
 * 진짜 성적은 **앞으로** 예측한 것에서만 나온다. 예측마다 `contaminationRisk` 를 적는다.
 */

export const DIR = "engine/docs/genesis";
export const TREE = `${DIR}/tech-tree-ai-v0.json`;
export const PRED_DIR = `${DIR}/predictions`;

export type TechNode = {
  id: string;
  name: string;
  unlocks: string;
  needs: string[];
  state: "open" | "closed";
  /** **채점 기준 날** — 공개 API 로 지을 수 있게 된 날. 기계가 확인할 수 있어서 이것으로만 채점한다(09-20 확정). */
  openedAt?: string;
  /** 능력이 세상에 먼저 나온 날(앱·데모). 채점엔 안 쓴다 — '발명 → 지을 수 있음' 시차를 재는 재료. */
  capableAt?: string;
  capableNote?: string;
  evidence?: string[];
  confidence: number;
  ourUse?: string;
};
export type TechTree = { version: string; seededAt: string; note: string; nodes: TechNode[] };

export function loadTree(file = TREE): TechTree {
  return JSON.parse(readFileSync(file, "utf8")) as TechTree;
}

/** 어느 날 기준으로 열려 있던 칸만 — 후향 시험에서 그래프를 과거로 자를 때 쓴다. */
export function treeAt(tree: TechTree, asOf: string): TechTree {
  return {
    ...tree,
    nodes: tree.nodes.map((n) =>
      n.state === "open" && n.openedAt && n.openedAt > asOf ? { ...n, state: "closed" as const, openedAt: undefined } : n,
    ),
  };
}

/**
 * **사장님 가설, 한 함수.** 선행조건이 모두 열린 닫힌 칸 = 지금 열릴 준비가 된 칸.
 * 모델을 안 부른다 — 이건 계산이다. `missing` 은 아직 안 찬 선행조건(있으면 준비 안 된 것).
 */
export function ready(tree: TechTree): { node: TechNode; missing: string[] }[] {
  const open = new Set(tree.nodes.filter((n) => n.state === "open").map((n) => n.id));
  return tree.nodes
    .filter((n) => n.state === "closed")
    .map((n) => ({ node: n, missing: n.needs.filter((d) => !open.has(d)) }))
    .sort((a, b) => a.missing.length - b.missing.length);
}

/** 열린 칸인데 우리가 안 쓰는 것 — "열렸는데 안 줍는 것" 도 사실이다. */
export function unusedOpen(tree: TechTree): TechNode[] {
  return tree.nodes.filter((n) => n.state === "open" && /안 쓴다|모름|반쯤/.test(n.ourUse ?? ""));
}

export const predictionSchema = z.object({
  items: z.array(z.object({
    nodeId: z.string().describe("기술 나무의 닫힌 칸 id. 나무에 없는 칸이면 새 칸을 제안하는 것이니 newNode 에 적어라."),
    newNode: z.string().nullable().describe("나무에 없는 칸을 새로 주장하면 그 이름(한국어 한 줄). 없으면 null."),
    opensBy: z.string().describe("언제까지 열린다고 보나. YYYY-MM 형식."),
    probability: z.number().describe("그때까지 열릴 확률 0~1. 0.5 를 남발하지 마라 — 0.5 는 아무 말도 안 한 것이다."),
    why: z.string().describe("**어떤 선행조건이 언제 찼길래** 이 칸이 열린다고 보나. 유행·소문이 아니라 나무의 칸 이름을 대라."),
    evidenceWouldBe: z.string().describe("무엇이 나타나면 '열렸다' 고 채점할 것인가. 구체적으로 — 모델 목록에 무엇이 뜨면, 값이 얼마 아래로 내려가면. 이게 모호하면 나중에 우겨 맞추게 된다."),
    wouldFalsify: z.string().describe("무엇을 보면 이 예측이 **틀렸다**고 할 것인가."),
  })),
});
export type Predictions = z.infer<typeof predictionSchema>;

const SYS = [
  "너는 기술 나무를 읽고 **다음에 무엇이 열리는지** 예측한다.",
  "",
  "바탕에 깔린 주장: **발명은 없다.** 선행 조건이 다 차면 그 칸은 열리고, 열리면 누군가는 반드시 도달한다.",
  "그러니 네가 볼 것은 천재도 회사도 아니라 **선행조건이 언제 찼는가** 다.",
  "",
  "규칙:",
  "- 나무에 있는 **닫힌 칸** 중에서 고른다. 선행조건이 이미 다 찬 칸이 1순위다(계산은 이미 되어 있다 — `지금 열릴 준비` 목록).",
  "- `why` 에는 **선행조건 칸 이름과 그게 찬 날**을 대라. '요즘 추세' 같은 말은 근거가 아니다.",
  "- `evidenceWouldBe` 와 `wouldFalsify` 는 **다른 사람이 채점할 수 있게** 적어라. 값·날짜·목록에 뜰 이름처럼.",
  "- 확률은 정직하게. 다 열린다고 하면 아무 말도 안 한 것이고, 다 안 열린다고 해도 같다.",
  "- 나무에 없는 칸이 곧 열릴 것 같으면 `newNode` 로 제안해라 — 나무가 틀린 것도 배울 거리다.",
].join("\n");

export async function predict(ai: AIProvider, tree: TechTree, o: { horizon: string; extra?: string }): Promise<Predictions> {
  const r = ready(tree);
  const nl = String.fromCharCode(10);
  const open = tree.nodes.filter((n) => n.state === "open").map((n) => `- [${n.id}] ${n.name} — ${n.openedAt ?? "?"} 열림 · ${n.unlocks}`).join(nl);
  const closed = tree.nodes.filter((n) => n.state === "closed").map((n) => `- [${n.id}] ${n.name} — 필요: ${n.needs.join(", ") || "(없음)"} · ${n.unlocks}`).join(nl);
  const readyLines = r.filter((x) => x.missing.length === 0).map((x) => `- [${x.node.id}] ${x.node.name}`).join(nl) || "(없음)";
  const input = [
    `## 열린 칸 (언제 열렸나)`, open, "",
    `## 닫힌 칸`, closed, "",
    `## 지금 열릴 준비가 된 칸 (선행조건이 이미 다 찼다 — 계산된 것)`, readyLines, "",
    `## 예측 기간`, o.horizon,
    o.extra ?? "",
  ].join(nl);
  const { output } = await ai.generateStructuredOutput({
    systemInstructions: SYS, input, schema: predictionSchema, schemaName: "tech_predictions", maxTokens: 8000, tier: "judgment",
  });
  return output;
}

export type LockedPrediction = Predictions["items"][number] & {
  outcome?: { at: string; verdict: "열림" | "안 열림" | "아직"; note: string } | null;
};
export type PredictionFile = {
  id: string;
  madeAt: string;
  by: string;
  treeVersion: string;
  /** 그래프를 언제 기준으로 잘라서 예측했나. 후향 시험이면 과거 날짜. */
  frozenAt: string;
  horizon: string;
  /** 앞으로 예측(clean) / 지난 일 맞히기(모델이 답을 외웠을 수 있음). */
  contaminationRisk: "none" | "possible" | "high";
  gradeAfter: string;
  items: LockedPrediction[];
};

/** 잠근다 — git 에 박히는 파일. 한 번 쓴 뒤에는 `outcome` 말고 고치지 않는다. */
export function lock(p: PredictionFile): string {
  mkdirSync(PRED_DIR, { recursive: true });
  const file = path.join(PRED_DIR, `${p.id}.json`);
  if (existsSync(file)) throw new Error(`이미 잠긴 예측이다: ${file}`);
  writeFileSync(file, JSON.stringify(p, null, 2) + "\n", "utf8");
  return file;
}

export function loadLocked(): PredictionFile[] {
  if (!existsSync(PRED_DIR)) return [];
  return readdirSync(PRED_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(PRED_DIR, f), "utf8")) as PredictionFile);
}

/** 채점 — 증거가 온 뒤에만. 열린 칸이 된 것, 기한이 지났는데 안 열린 것. */
export function grade(tree: TechTree, files: PredictionFile[], today = new Date().toISOString().slice(0, 10)): { id: string; hit: number; miss: number; pending: number; lines: string[] }[] {
  const openAt = new Map(tree.nodes.filter((n) => n.state === "open").map((n) => [n.id, n.openedAt ?? ""]));
  return files.map((f) => {
    let hit = 0, miss = 0, pending = 0;
    const lines: string[] = [];
    for (const it of f.items) {
      const opened = openAt.get(it.nodeId);
      // 예측을 적은 뒤에 열렸어야 맞힌 것이다 — 이미 열려 있던 칸을 맞혔다고 세지 않는다.
      if (opened && opened > f.frozenAt) { hit++; lines.push(`맞음  [${it.nodeId}] ${it.opensBy} 까지 → ${opened} 열림`); }
      else if (it.opensBy < today.slice(0, 7)) { miss++; lines.push(`틀림  [${it.nodeId}] ${it.opensBy} 까지라 했는데 아직`); }
      else { pending++; lines.push(`아직  [${it.nodeId}] ${it.opensBy} 까지`); }
    }
    return { id: f.id, hit, miss, pending, lines };
  });
}
