/**
 * 홍보 출처 꼬리표(11-22). 화면(FromTag)과 서버(/api/dot/guest)가 같이 쓰므로 여기 한 곳에 둔다.
 * 링크 예: https://…/dot?from=x  → 쿠키 dot_from=x → 손님 계정 user_metadata.came_from = "x"
 */
export const FROM_COOKIE = "dot_from";
export const cleanFrom = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
