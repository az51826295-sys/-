/** 지금 어떤 3D 손이 있고 무엇이 없나 — 값 0. */
const { 손현황, 쓸수있는손 } = await import("../../src/lib/providers/mesh3dRegistry");
console.log(손현황());
console.log(`\n지금 쓸 수 있는 손 ${쓸수있는손().length}개`);
