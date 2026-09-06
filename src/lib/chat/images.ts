import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { BUCKET } from "@/lib/deliverables/files";

/**
 * 대화에서 그린 그림은 **행이 아니라 저장소**에 둔다.
 *
 * 09-06 19:30 DB 가 25분씩 두 번 멈췄다. 원인: 대화 한 턴의 attachments 에 base64
 * 그림 3 MB 가 들어 있었고, 일이 걸려 있는 동안 화면이 6초마다 그 대화의 메시지
 * 전부를 다시 읽었다(collectWorkReturns). 작은 인스턴스는 그 IO 로 예산이 바닥나
 * 한 줄짜리 조회도 30초를 넘겼다. 산출물의 콘셉트 그림을 파일로 뺀 것(13:38)과
 * 같은 병이다. 그림은 `<회사>/chat/<uuid>.png` 에 두고 행에는 경로만 남긴다.
 */
export type StoredChatImage = { path: string; prompt: string };

export async function stashChatImages(
  companyId: string,
  images: { dataUrl: string; prompt: string }[],
): Promise<StoredChatImage[]> {
  const db = createServiceClient();
  const out: StoredChatImage[] = [];
  for (const img of images) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(img.dataUrl);
    if (!m) continue;
    const ext = m[1] === "image/jpeg" ? "jpg" : m[1].split("/")[1];
    const path = `${companyId}/chat/${randomUUID()}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(m[2], "base64"), { contentType: m[1] });
    if (error) {
      console.warn("[chat] 그림 저장 실패 — 이 그림은 대화 행에 남기지 않는다:", error.message);
      continue;
    }
    out.push({ path, prompt: img.prompt });
  }
  return out;
}

/** 저장된 경로를 한 시간짜리 링크로. 옛 행의 base64 는 그대로 통과. */
export async function signChatImages(
  images: { path?: string; dataUrl?: string; prompt: string }[],
): Promise<{ dataUrl: string; prompt: string }[]> {
  const paths = images.map((i) => i.path).filter((p): p is string => typeof p === "string");
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await createServiceClient().storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    for (const e of data ?? []) if (e.path && e.signedUrl) signed.set(e.path, e.signedUrl);
  }
  return images
    .map((i) => ({ dataUrl: i.path ? signed.get(i.path) ?? "" : i.dataUrl ?? "", prompt: i.prompt }))
    .filter((i) => i.dataUrl);
}
