import { z } from "zod";
import type { Supabase } from "@/lib/execution/shared";
import type { Providers } from "@/lib/execution/shared";

/**
 * 대화에서 회사에 대한 사실을 줍는다.
 *
 * 지금까지 회사 지식은 **교육 설문**으로 들어왔다. 새 직원을 뽑을 때마다
 * "회사가 뭘 하나요"를 묻는 방식인데, 매니저 입장에서 그건 일을 맡기려다 숙제를
 * 받은 것이고, 이미 세 번쯤 대답한 이야기다.
 *
 * 그런데 그 답은 **대화 안에 이미 있다.** "유니티로 게임 만들고 있어",
 * "우린 픽셀아트 48px 써" 같은 말은 설문 답변과 같은 종류의 사실이고, 묻지
 * 않아도 나온다. 그걸 주우면 설문이 필요 없어진다.
 *
 * ## 무엇을 줍고 무엇을 안 줍나
 *
 * **오래 가는 사실만** 줍는다. "이거 파란색으로 해줘"는 지금 이 일에 대한
 * 지시이지 회사에 대한 사실이 아니고, 그걸 회사 지식에 넣으면 반년 뒤 모든
 * 직원이 파란색을 쓴다.
 *
 * **매니저가 말한 것만** 줍는다. 우리가 답으로 한 말을 다시 주워 담으면, AI가
 * 자기 추측을 회사의 사실로 승격시키게 된다 — 한 바퀴 돌면 아무도 그것이
 * 어디서 왔는지 모른다.
 *
 * ## 왜 바로 쓰지 않고 후보로 두지 않는가
 *
 * 이 제품에는 지식 후보를 사람이 승인하는 경로가 이미 있다. 그런데 대화에서
 * 주운 것을 거기 넣으면 승인 대기가 쌓이고, 매니저는 설문 대신 **승인 목록**을
 * 받게 된다 — 이름만 바뀐 같은 숙제다.
 *
 * 그래서 바로 활성으로 넣되 **출처를 제목에 남긴다.** 대화에서 왔다는 것이
 * 보이면 틀렸을 때 지울 수 있고, 그 정도가 이 크기의 사실에 맞는 무게다.
 */

const factsSchema = z.object({
  facts: z.array(
    z.object({
      /** 짧은 이름. 목록에서 알아볼 수 있을 만큼. */
      title: z.string(),
      /** 한두 문장. 나중에 다른 직원이 읽고 바로 쓸 수 있게. */
      description: z.string(),
      /**
       * 사실인가 규칙인가.
       *
       * "우린 유니티로 만든다" 는 **사실**이고, "보고서는 표부터 시작해라" 는
       * **규칙**이다. 둘 다 오래 가지만 성격이 다르고, 목록에서 구분되지 않으면
       * 매니저가 자기가 정한 규칙을 나중에 못 찾는다.
       */
      kind: z.enum(["fact", "rule"]),
    }),
  ),
});

/** 한 턴에서 주울 수 있는 사실의 수. 넘게 주우면 지시를 사실로 착각한 것이다. */
const MAX_PER_TURN = 3;

export async function learnFromChat(
  db: Supabase,
  providers: Providers,
  companyId: string,
  managerSaid: string,
): Promise<{ saved: number }> {
  if (managerSaid.trim().length < 10) return { saved: 0 };

  // 이미 아는 것은 다시 담지 않는다.
  const { data: known } = await db
    .from("organization_knowledge")
    .select("title")
    .eq("company_id", companyId)
    .eq("status", "active")
    .limit(100);
  const titles = ((known ?? []) as { title: string }[]).map((k) => k.title);

  const { output } = await providers.ai.generateStructuredOutput({
    systemInstructions: [
      "매니저가 방금 한 말에서 **회사에 대한 오래 가는 사실**만 골라 담는다.",
      "",
      "담을 것:",
      "- **사실**(kind: fact) — 무엇을 만드는 회사인지, 고객이 누구인지,",
      "  어떤 도구·기술을 쓰는지.",
      "- **규칙**(kind: rule) — 매니저가 \"앞으로 이렇게 해\", \"항상 ~해\",",
      "  \"~하지 마\" 처럼 **앞으로 계속 지키라고** 말한 것. 이건 사실이 아니지만",
      "  오래 가고, 놓치면 매니저가 같은 말을 반복하게 된다.",
      "",
      "담지 **않을** 것:",
      "- 지금 이 일에 대한 지시 (\"이건 파란색으로\") — 그건 사실이 아니라 요청이고,",
      "  회사 지식에 넣으면 반년 뒤 모든 직원이 파란색을 쓴다.",
      "- 질문, 인사, 감정 표현",
      "- 이미 아는 것 (아래 목록에 있는 것)",
      "",
      "확실하지 않으면 담지 마라. **아무것도 안 담는 것이 기본값이다** —",
      "회사에 대한 잘못된 사실은 그 위에서 도는 모든 일을 조용히 망친다.",
      "",
      "이미 아는 것:",
      titles.length ? titles.map((t) => `- ${t}`).join("\n") : "(없음)",
    ].join("\n"),
    input: managerSaid,
    schema: factsSchema,
    schemaName: "chat_facts",
    maxTokens: 2000,
    // 새 판단이 아니라 방금 들은 말에서 꺼내는 일이다.
    tier: "routine",
  });

  const facts = output.facts.slice(0, MAX_PER_TURN).filter((f) => f.title.trim());
  if (facts.length === 0) return { saved: 0 };

  await db.from("organization_knowledge").insert(
    facts.map((f) => ({
      company_id: companyId,
      // 출처를 제목에 남긴다. 대화에서 왔다는 것이 보이면 틀렸을 때 지울 수 있다.
      title: `${f.title} (${f.kind === "rule" ? "규칙" : "대화에서"})`,
      description: f.description,
      // 있는 분류 중 맞는 것을 쓴다. 새 분류를 만들면 이걸 읽는 화면들이
      // 모르는 값을 만나 조용히 빈칸을 낸다.
      category: f.kind === "rule" ? "best_practice" : "process_improvement",
      status: "active",
    })),
  );

  return { saved: facts.length };
}
