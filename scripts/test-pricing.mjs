// Free check: does an unpriced backend refuse instead of costing $0?
import { costOf, isPriced, unitFor, UnpricedBackendError } from "../src/lib/costs/pricing.ts";

const show = (label, fn) => {
  try {
    console.log("  " + label.padEnd(42) + "$" + fn().toFixed(4));
  } catch (e) {
    const kind = e instanceof UnpricedBackendError ? "REFUSED" : "ERROR";
    console.log("  " + label.padEnd(42) + kind);
  }
};

console.log("\n--- known text models ---");
show("opus-5   5k in / 2k out", () => costOf({ backend: "claude-opus-5", inputTokens: 5000, outputTokens: 2000 }));
show("haiku-4-5 5k in / 2k out", () => costOf({ backend: "claude-haiku-4-5", inputTokens: 5000, outputTokens: 2000 }));

console.log("\n--- mock (declared free) ---");
show("mock-deterministic:routine", () => costOf({ backend: "mock-deterministic:routine", inputTokens: 0, outputTokens: 0 }));

console.log("\n--- unpriced outside services ---");
show("fal-ai/flux  40 images", () => costOf({ backend: "fal-ai/flux", quantity: 40 }));
show("elevenlabs-music  180 seconds", () => costOf({ backend: "elevenlabs-music", quantity: 180 }));
show("some-model-nobody-added", () => costOf({ backend: "some-model-nobody-added", inputTokens: 99999, outputTokens: 99999 }));

console.log("\n--- isPriced gate (checked before the call) ---");
for (const b of ["claude-opus-5", "mock-deterministic", "fal-ai/flux"]) {
  console.log("  " + b.padEnd(30) + (isPriced(b) ? "allowed" : "BLOCKED"));
}

console.log("\n--- unit recorded ---");
for (const b of ["claude-opus-5", "mock-deterministic"]) {
  console.log("  " + b.padEnd(30) + unitFor(b));
}
