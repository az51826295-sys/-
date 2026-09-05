import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signedUrlFor } from "@/lib/deliverables/files";

/**
 * 저장된 파일 하나를 연다. 주인만.
 *
 * 저장소는 비공개 버킷이라 링크가 서명돼야 열리고, 서명 링크는 한 시간이면
 * 죽는다. 그래서 대화에는 이 주소(영구)를 박고, 열 때마다 여기서 새 서명 링크로
 * 보낸다. 남의 파일 id 를 넣으면 행이 안 보여서(RLS) 404 다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: row } = await supabase
    .from("deliverable_files")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const url = await signedUrlFor(supabase, row.storage_path as string);
  if (!url) return NextResponse.json({ error: "Could not sign." }, { status: 500 });
  return NextResponse.redirect(url, { status: 302 });
}
