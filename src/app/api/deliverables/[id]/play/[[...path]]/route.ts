import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * **결과물(웹 게임)을 그 자리에서 연다** (185회차 09-19).
 *
 * 사장님: *"아니 게임 어떻게 하란 거야 — 파일도 안 올려주고 v7 눌러도 아무 반응이 없는데."* 오른쪽 미리보기엔 게임을 여는 자리가
 * 아예 없었다(저장소 파일만 나열). 이 문이 `content_json.files` 의 HTML 을 그대로 내보내고, 미리보기가 iframe 으로 띄운다.
 *
 * 안전: 만든 코드를 **우리 주소에서** 내보내는 것이라 그 코드가 우리 API 를 사장님 쿠키로 부를 수 있다 — 그래서 CSP `sandbox` 를 건다
 * (`allow-same-origin` 없음 = 불투명 출처: 쿠키도 저장소도 우리 것이 아니다). `/play/` 뒤의 경로는 그 판의 다른 파일(js·css)을 댄다.
 * 주인만: deliverables 행은 RLS 가 가린다.
 */
const MIME: Record<string, string> = { html: "text/html", htm: "text/html", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", txt: "text/plain", md: "text/markdown" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  const dl = new URL(req.url).searchParams.get("dl") === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("로그인이 필요해요.", { status: 401 });
  const { data: row } = await supabase.from("deliverables").select("deliverable_type, files:content_json->files").eq("id", id).maybeSingle();
  if (!row) return new NextResponse("그런 결과물이 없어요.", { status: 404 });
  const files = ((row.files as { path: string; contents?: string; language?: string }[] | null) ?? []).filter((f) => typeof f.contents === "string");
  const want = (path ?? []).join("/");
  let file = want ? files.find((f) => f.path.replace(/^\.?\//, "") === want) : undefined;
  if (!want) {
    const htmls = files.filter((f) => /\.html?$/i.test(f.path));
    file = htmls.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? htmls[0];
    if (!file) return new NextResponse("이 결과물엔 브라우저에서 열 수 있는 파일이 없어요.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!file) return new NextResponse("없는 파일이에요.", { status: 404 });
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext] ?? "application/octet-stream";
  return new NextResponse(file.contents ?? "", {
    status: 200,
    headers: {
      "content-type": mime.startsWith("text/") || mime.includes("javascript") || mime.includes("json") ? `${mime}; charset=utf-8` : mime,
      // 불투명 출처: 이 문서는 우리 쿠키·저장소에 닿지 못한다. 포인터 락(FPS 시점)과 팝업은 허용.
      "content-security-policy": "sandbox allow-scripts allow-pointer-lock allow-popups allow-forms; frame-ancestors 'self'",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(dl ? { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.path.split("/").pop() ?? "file")}` } : {}),
    },
  });
}
