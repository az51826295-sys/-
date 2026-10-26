import { NextResponse } from "next/server";
import { connections } from "@/lib/hand/connected";

export const dynamic = "force-dynamic";

/**
 * **무엇이 붙어 있나** — 화면이 묻는 문 (10-26). 사장님: "연결된거 유아이로 표시해야해."
 *
 * 로키 DB 를 안 쓴다. 열쇠가 있나 · 판정 서비스가 사나 · 마지막으로 누가 붙었나뿐이다.
 * 그래서 DB 가 멈춰 있어도 이 문은 답한다.
 *
 * **폴더는 여기 없다** — 폴더가 붙었는지는 브라우저만 안다(File System Access 핸들이
 * IndexedDB 에 있고 권한이 살아 있나). 서버가 아는 척하면 거짓말이 된다.
 */
export async function GET() {
  return NextResponse.json({ ok: true, 연결: await connections() });
}
