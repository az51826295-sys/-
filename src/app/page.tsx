import { redirect } from "next/navigation";

/**
 * 정문은 대화다. 09-05 사장님: "/ask 가 진짜 로키다."
 *
 * 전에는 여기 고용할 직원 목록이 있는 소개 페이지가 있었다. 그 목록이 가리키던
 * 화면들(대시보드 40개)은 같은 날 지웠다 — 소개할 것이 대화 하나뿐이면 소개
 * 페이지는 문 앞의 문이다.
 */
export default function Home() {
  redirect("/ask");
}
