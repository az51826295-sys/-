import { writeFileSync } from "node:fs";
const { gridBoard, unitTarget } = await import("../../../../src/lib/pixel/create");
for (const z of [64, 96]) { const t = unitTarget(z); writeFileSync(`C:/Users/az518/Desktop/두근도트-스레드/realdot/grid-${z}.png`, await gridBoard(t.u)); console.log(z, t); }
