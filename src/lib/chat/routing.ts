import { employeeSkillRegistry } from "@/lib/skills/registry";
import { selfNote, speakerNote, type Speaker } from "@/lib/chat/persona";

/**
 * 접수 — 대화 한 마디를 "답할지 · 찾을지 · **누구에게 맡길지**" 로 가른다 (40회차 09-07 분리).
 *
 * 왜 파일로 뺐나: 09-05 에 Nova·Dev 가 등록 한 줄이 빠져 **일주일 동안 일을 한 번도 못 받았다**. 그 고장은
 * 화면에도 로그에도 안 보이고, 사람이 "왜 아무 일도 안 생기지" 하고 포기할 때까지 조용하다. 새 직원(Ana·Vid)을
 * 붙일 때마다 같은 위험이 생기므로, **말 → 직원** 이 실제로 이어지는지 자로 잰다(`engine/tools/routing_test.mts`).
 * 그러려면 시험이 화면과 **같은 글**을 써야 한다 — 그래서 이 글이 여기 한 곳에 있다.
 */

/** 직원을 부르는 이름표. 기술 등록표에서 만들어지므로 직원을 더하면 여기도 저절로 는다. */
export function capabilityCatalogue() {
  return Object.values(employeeSkillRegistry).flatMap((skill) =>
    skill.capabilities.map((c) => ({
      capabilityId: c.id,
      skillId: skill.id,
      label: c.label,
      produces: c.produces,
    })),
  );
}

/**
 * 답에서 내부 이름표를 걷는다(100회차 09-13). 목록을 프롬프트에 id 로 주니 "뭘 할 수 있어?" 에
 * 모델이 "(small_app)" 처럼 id 를 괄호로 붙여 답했다 — 스토어 스크린샷에 그대로 찍혔다.
 * 프롬프트로 막고, 그래도 새면 여기서 지운다. **목록에 있는 id 만** 지운다(다른 괄호는 안 건드림).
 */
export function scrubCapabilityIds(text: string): string {
  const ids = capabilityCatalogue().map((c) => c.capabilityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ids.length) return text;
  const alt = ids.join("|");
  return text
    .replace(new RegExp(`\\s*[(（]\\s*\`?(?:${alt})\`?\\s*[)）]`, "g"), "")
    .replace(new RegExp(`\`(?:${alt})\``, "g"), "");
}

/** 접수 프롬프트. 화면(everydayService)과 시험이 같은 것을 쓴다. */
export function intakeInstructions(opts: { hasImages: boolean; speaker: Speaker | null }): string {
  const seenLen = opts.hasImages ? 1 : 0;
  return (
  "너는 유능한 조수다. 한국어로 답한다.\n\n" +
        "먼저 판단한다: **지금 아는 것으로 제대로 답할 수 있는가?**\n" +
        "- 그렇다면 `reply` 에 답을 쓰고 `searches` 는 비운다. " +
        // 137회차: 여기 "짧게 자르지 말고 물은 만큼 답한다" 가 있었다. 그 한 줄이 페르소나의 정직 규칙과
        // 겹쳐 답을 장문 보고서로 만들었다(사장님: "앞에서 다 말하지 말고 필요한 말만 해").
        "**물은 것만** 답한다 — 안 물은 것을 덧붙이지 마라.\n" +
        "- 최신 사실·가격·뉴스·특정 문서처럼 **찾아봐야 정확한 것**이면 " +
        "`reply` 를 비우고 `searches` 에 검색어를 최대 3개 쓴다.\n\n" +
        (seenLen > 0
          ? "사용자가 사진을 같이 올렸다. **보이는 것만 말하라** — 안 보이는 것을 " +
            "있는 것처럼 말하면 사용자는 자기 사진을 잘못 읽었다는 사실조차 모른다. " +
            "흐리거나 잘려서 못 읽는 부분은 못 읽겠다고 말한다.\n\n"
          : "") +
        "확실하지 않은데 아는 척하지 마라. 그럴 때가 검색할 때다.\n\n" +
        "**일 맡기기**: 조사·검증·문서·그림 제작처럼 **시간이 드는 일**이면 " +
        "`capabilityId` 에 아래 목록의 id 를 쓴다. 한 번 답하고 끝날 질문이면 " +
        "비운다 — 잡담에 사람을 붙이면 매니저가 안 시킨 일이 쌓인다.\n" +
        capabilityCatalogue()
          .map((c) => `  - ${c.capabilityId}: ${c.label} → ${c.produces}`)
          .join("\n") +
        "\n**목록에 있는 id 만 쓴다.** 없는 것을 지어내면 조용히 빗나간다. " +
        "id 는 내부 이름표다 — `reply` 에는 절대 쓰지 말고, 사람에게는 이름(→ 앞의 말)으로만 말한다.\n" +
        "**코드·앱·게임·프로그램을 만들어 달라는 요청은 답에 코드를 쓰지 않는다.** " +
        "그건 시간이 드는 일이라 `capabilityId` 로 맡기고, `reply` 는 무엇을 만들 " +
        "것인지 한두 문장이면 된다. 답에 코드를 쓰기 시작하면 길이 한도에 걸려 " +
        "답이 통째로 사라진다 — 09-05 에 실제로 그랬다.\n" +
        // 169회차: 실제로는 그 자리만(262줄 중 2줄) 고치면서 말은 "다시 만들게요·새 판을 만들겠습니다" 라고 했다. 09-17 에 사장님을
        // 가장 화나게 한 것이 "고쳐 달랬더니 통째로 새로 만든 것" 이라, 이 말은 하지도 않을 일을 예고하는 최악의 말이다.
        "**이미 만든 것을 고쳐 달라는 말**에는 \"다시 만들게요\"·\"새로 만들게요\"·\"새 판을 만들게요\" 라고 하지 않는다. " +
        "\"그 부분만 고칠게요\" 라고 말한다 — 실제로 그 자리만 고치고 나머지는 그대로 둔다.\n\n" +
        "**그림**: 사용자가 그려 달라고 하면 `drawings` 에 묘사를 쓴다(최대 2개). " +
        "묘사는 영어로, 무엇을 어떤 구도·색·분위기로 그릴지 구체적으로. " +
        "그려 달라고 하지 않았으면 비워 둔다 — 설명으로 될 것을 그림으로 내면 " +
        "느리기만 하다." +
        selfNote() +
        speakerNote(opts.speaker)
  );
}
