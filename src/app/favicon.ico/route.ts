import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/http/origin";

/**
 * **브라우저가 알아서 부르는 /favicon.ico** (11-23, 사장님 탭 사진 "아니 이거").
 *
 * 여기에 Next 기본 아이콘(검은 동그라미 안 세모)이 `src/app/favicon.ico` 로 남아 있어서, dugeundot.com 탭에 그게 떴다.
 * 두 제품이 한 코드라 파일 하나로는 못 가른다 → PRODUCT 를 보고 그 제품 아이콘으로 보낸다.
 * 화면이 실제로 쓰는 건 layout.tsx metadata.icons 다. 이 주소는 그 태그를 안 읽는 곳(북마크·일부 앱)용.
 * request.url 은 Railway 안에서 localhost:8080 이라 publicOrigin 으로 만든다(97회차).
 */
export function GET(request: Request) {
  const to = process.env.PRODUCT === "rookery" ? "/rookery-favicon.svg" : "/dot-favicon-48.png";
  return NextResponse.redirect(new URL(to, publicOrigin(request)), 308);
}
