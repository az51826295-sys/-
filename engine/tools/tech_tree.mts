/**
 * 기술 나무 — 보기 / 예측 잠그기 / 채점 (193회차 09-20).
 *   npx tsx engine/tools/tech_tree.mts                     — 나무 상태·지금 열릴 준비가 된 칸. 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/tech_tree.mts --predict --horizon 2027-03 --label fwd1   — 예측을 적고 **잠근다**. ≈$0.01
 *   npx tsx engine/tools/rookery_env.mts engine/tools/tech_tree.mts --predict --as-of 2026-05-31 --horizon 2026-09 --label back1   — 후향(오염 표시)
 *   npx tsx engine/tools/tech_tree.mts --grade             — 잠긴 예측을 지금 나무에 대 본다. 돈 0.
 */
const { loadTree, treeAt, ready, unusedOpen, predict, lock, loadLocked, grade, predictable, independentGroups, guessedEdges } = await import("../../src/lib/genesis/techTree");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const tree = loadTree();
const today = new Date().toISOString().slice(0, 10);

if (process.argv.includes("--grade")) {
  const files = loadLocked();
  if (!files.length) { console.log("잠긴 예측이 없다."); process.exit(0); }
  for (const g of grade(tree, files)) { console.log(`\n${g.id}: 맞음 ${g.hit} · 틀림 ${g.miss} · 아직 ${g.pending}`); for (const l of g.lines) console.log("  " + l); }
  process.exit(0);
}

const asOf = arg("--as-of");
const view = asOf ? treeAt(tree, asOf) : tree;
const open = view.nodes.filter((n) => n.state === "open");
console.log(`기술 나무 ${tree.version} · 칸 ${tree.nodes.length}개 · 열림 ${open.length} · 닫힘 ${tree.nodes.length - open.length}${asOf ? ` (${asOf} 기준으로 자름 → 열림 ${open.length})` : ""}`);
const r = ready(view);
console.log("\n지금 열릴 준비가 된 칸 (선행조건이 다 찼다 — 사장님 가설대로면 곧 열려야 한다):");
for (const x of r.filter((y) => !y.missing.length)) console.log(`  ● [${x.node.id}] ${x.node.name} — ${x.node.unlocks}`);
console.log("\n아직 막힌 칸 (무엇이 모자란가):");
for (const x of r.filter((y) => y.missing.length)) console.log(`  ○ [${x.node.id}] ${x.node.name} ← 모자람: ${x.missing.join(", ")}`);
// 09-20 나무 1: 조건이 잠긴 칸만 예측을 받는다 · 출처 없는 선은 추측
const pick = predictable(view);
console.log(`
예측을 받을 수 있는 칸(열림 조건이 잠긴 것): ${pick.length}/${view.nodes.filter((n) => n.state === "closed").length}`);
for (const n of pick) console.log(`  ${n.condHash} [${n.id}] ${n.name}${n.kind === "가정" ? " (가정)" : ""}`);
const guessed = guessedEdges(view);
console.log(`
선행조건 주장 ${view.nodes.reduce((a, n) => a + n.needs.length, 0)}개 중 **출처 없는 추측 ${guessed.length}개**`);
if (process.argv.includes("--guesses")) for (const g of guessed) console.log(`  ${g.node} ← ${g.need}: ${g.why}`);
const ids = pick.map((n) => n.id);
const withWeak = independentGroups(view, ids);
const noWeak = independentGroups(view, ids, { dropWeak: true });
console.log(`독립 묶음 — 약한 선 넣으면 ${withWeak.count}개: ${withWeak.groups.map((g) => g.join("+")).join(" / ")}`);
console.log(`           약한 선 빼면 ${noWeak.count}개: ${noWeak.groups.map((g) => g.join("+")).join(" / ")}`);
const unused = unusedOpen(view);
if (unused.length) { console.log("\n열렸는데 우리가 안 줍는 것:"); for (const n of unused) console.log(`  · [${n.id}] ${n.name} — ${n.ourUse}`); }

if (process.argv.includes("--predict")) {
  const horizon = arg("--horizon") ?? "2027-03";
  const label = arg("--label") ?? "p";
  const { defaultProviders } = await import("../../src/lib/execution/shared");
  const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
  const model = arg("--model") ?? "gpt-5.6-luna";
  const ai = model === "router" ? defaultProviders().ai : createOpenAIProvider({ judgmentModel: model });
  console.log(`\n예측 중 (${model}, 기준 ${asOf ?? today}, 기한 ${horizon})…`);
  const out = await predict(ai, view, { horizon: `${asOf ?? today} 부터 ${horizon} 까지` });
  const file = lock({
    id: `${today.replace(/-/g, "")}-${label}`, madeAt: new Date().toISOString(), by: model,
    treeVersion: tree.version, frozenAt: asOf ?? today, horizon,
    contaminationRisk: asOf && asOf < today ? "high" : "none",
    gradeAfter: `${horizon}-28`, items: out.items,
  });
  console.log(`잠갔다 → ${file}`);
  for (const it of out.items) console.log(`  [${it.nodeId}${it.newNode ? ` / 새 칸: ${it.newNode}` : ""}] ${it.opensBy} 까지 ${Math.round(it.probability * 100)}%\n     왜: ${it.why}\n     증거가 되려면: ${it.evidenceWouldBe}\n     틀렸다고 할 것: ${it.wouldFalsify}`);
}
