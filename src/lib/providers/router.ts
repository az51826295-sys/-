import type { AIProvider, Routing, WorkTier } from "./types";

/**
 * One provider on the outside, several vendors on the inside.
 *
 * Every call site already names the *work* rather than the model, which is what
 * makes this possible: a skill says "this is conversation" and never learns
 * that conversation went to a different company than the report did. The person
 * talking to an employee sees one voice; underneath, a short reply cost a tenth
 * of a cent and the report that followed cost a hundred times that.
 *
 * The split is by consequence, not by length:
 *
 *   judgment      the answer *is* the product — reports, plans, decisions the
 *                 manager will act on. Never routed to a cheaper vendor, no
 *                 matter how short the request looked.
 *   verification  checking a claim against evidence that already exists. Bounded
 *                 — wrong answers show up the moment someone opens the link.
 *   conversation  talking. Nothing is written down as a result.
 *   routine       restating what is already in the input.
 *
 * Missing vendors are not an error. A company with one key configured gets that
 * vendor for everything, which is the behaviour it had before this file existed.
 */

export interface VendorSet {
  /** Where judgment work goes. Required — this is the tier that must not degrade. */
  primary: AIProvider;
  /** Cheaper vendor for the tiers that can take it. Optional. */
  economy?: AIProvider;
  /**
   * 같은 등급의 예비 벤더. 값이 싼 자리가 아니라 **옆자리**다.
   *
   * 벤더 하나가 잔액이 떨어지거나 죽으면, 그 회사의 판단 등급 일이 통째로
   * 멈춘다 — 답의 품질과 아무 상관 없는 이유로. 아래로 내려가는 것은 여전히
   * 안 되지만, 옆으로 가는 것은 품질을 깎지 않는다.
   *
   * 조용히 넘어가지는 않는다. 넘어간 사실을 로그에 남기고, 원장에는 실제로
   * 부른 모델이 적힌다 — 안 그러면 나중에 비용을 설명할 수 없다.
   */
  standby?: AIProvider;
  /**
   * 152회차: 판단 자리를 싼 쪽으로 내려도 되나. 기본은 지금까지대로 `true`(내려간다).
   *
   * 배치 담당(`providers/place.ts`)이 이 일을 **주 벤더의 어느 모델**에 앉히기로 정했으면 `false` 로 온다 —
   * 안 그러면 골라 놓고도 싼 자리로 내려가 그 모델이 아예 안 불린다(126회차에 아스트라를 재려다 걸린 함정과 같은 것).
   */
  judgmentToEconomy?: boolean;
}

/**
 * 126회차 09-15: **모델을 견주려면 자리를 고정해야 한다.** 판단 자리가 싼 벤더로 먼저 가기 때문에,
 * `OPENAI_JUDGMENT_MODEL` 만 바꿔서는 그 모델이 아예 안 불린다 — 시험판으로 모델을 A/B 하려면 이 스위치가 필요하다.
 * `ROOKERY_FORCE_PRIMARY=1` 이면 모든 자리가 주 벤더로 간다. **시험용이다** — 평소에는 끄고 둔다(값이 몇 배로 뛴다).
 */
const FORCE_PRIMARY = () => process.env.ROOKERY_FORCE_PRIMARY === "1";

/** Which tiers may leave the primary vendor. */
const ECONOMY_TIERS: ReadonlySet<WorkTier> = new Set<WorkTier>([
  "conversation",
  "routine",
  "verification",
  // 09-06 사장님 지시로 판단 자리도 싼 쪽이 먼저. 실패하면 아래 재시도가 primary 로 올린다.
  // 그림이 붙은 호출은 여전히 primary(시각 모델)다.
  "judgment",
]);

/**
 * 벤더를 바꿔서 될 일인가.
 *
 * 잔액 부족이나 벤더가 죽은 것은 옆자리로 가면 풀린다. 반대로 우리가 잘못 만든
 * 요청(스키마가 틀렸다든지)은 어느 벤더에 보내도 똑같이 틀리므로, 그걸 넘겨서
 * 두 번 돈을 쓰면 안 된다.
 */
function worthRetryingElsewhere(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("credit balance") ||
    message.includes("insufficient") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("overloaded") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    isTransportCut(message) ||
    hasRetryableStatus(message)
  );
}

/**
 * 연결이 **중간에 끊긴** 것인가. 모델이 거절한 것이 아니라 선이 끊긴 것이다.
 *
 * 59회차 09-08: gpt-5 계획 호출이 2분쯤 돌다가 `terminated` 하나만 남기고 죽었다.
 * 그것은 undici(Node fetch)가 응답 몸통이 끊겼을 때 내는 말인데, 우리 분류표에 없어서
 * **아무 데도 다시 안 해 보고** 그대로 업무가 실패했다. 사장님이 시킨 일이 통째로 날아갔다.
 * 이런 것은 벤더를 옮길 일이 아니라 **같은 자리에서 한 번 더** 하면 되는 것이다.
 */
function isTransportCut(message: string): boolean {
  return (
    message.includes("terminated") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("other side closed") ||
    message.includes("epipe")
  );
}

/**
 * **지갑이 빈 것**인가. 이건 고장이 아니라 청구서다.
 *
 * 09-09 사장님 지시로 도트 채팅을 붙이다 알았다: DeepSeek 잔액이 09-07 저녁에
 * 떨어져 있었고, 그 뒤로 **싼 자리로 갈 일이 전부 gpt-5 로 새고 있었다.**
 * 사흘에 $17.9. 화면에는 아무 표시가 없었고, 회사는 멀쩡히 돌았다 — 위로 새는
 * 것은 답이 나빠지지 않으니 아무도 못 알아챈다. 그게 이 고장의 성질이다.
 *
 * 다른 실패와 갈라 놓는 이유: 연결이 끊긴 것은 **다음 번에 낫는다.** 잔액은
 * 사람이 충전할 때까지 **한 번도 안 낫는다.** 같은 목소리로 말하면 안 된다.
 */
function isOutOfBalance(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("insufficient balance") ||
    m.includes("credit balance is too low") ||
    m.includes("insufficient_quota") ||
    m.includes("exceeded your current quota") ||
    m.includes("billing")
  );
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/**
 * 메시지에 실린 상태 코드가 "다시 해 볼 만한" 것인가.
 *
 * 숫자를 통째로 꺼내 비교한다. 부분 문자열로 찾으면 요청 아이디 안에 우연히
 * 들어 있는 "500" 같은 것에 걸려서, 우리가 잘못 만든 요청을 옆 벤더에 또
 * 보내고 값만 두 번 치르게 된다.
 */
function hasRetryableStatus(message: string): boolean {
  const numbers = message.match(/[0-9]+/g) ?? [];
  return numbers.some((n) => RETRYABLE_STATUS.has(Number(n)));
}

/**
 * 어느 자리에서 왜 돌았는지를 결과에 붙인다.
 *
 * 값은 그대로 두고 칸 하나만 더한다. 원장을 쓰는 쪽은 라우터 사정을 모르고,
 * 알 필요도 없다 — 대신 이 한 칸을 받아 적는다.
 */
function tag<R extends { routing?: Routing }>(result: R, routing: Routing): R {
  return { ...result, routing };
}
export function createRoutedProvider(vendors: VendorSet): AIProvider {
  const { primary, economy, standby } = vendors;
  const judgmentMayGoCheap = vendors.judgmentToEconomy !== false;

  return {
    // Named for what it is so a ledger row is never mistaken for a single
    // vendor's bill. The per-call `model` is what the cost table reads.
    name: economy ? `routed(${primary.name}+${economy.name})` : primary.name,
    model: primary.model,

    async generateStructuredOutput(params) {
      const tier: WorkTier = params.tier ?? "judgment";

      // 그림이 딸린 호출은 싼 자리로 보내지 않는다.
      //
      // 값싼 벤더 중에는 그림을 아예 못 보는 것이 있고, 그러면 조용히 글만 읽고
      // 답한다. 사용자는 자기 사진을 보고 한 말인 줄 알고, 그 오해는 답 안에
      // 아무 표시도 남기지 않는다 — 조용한 고장 중에 가장 나쁜 종류다.
      const hasImages = (params.images?.length ?? 0) > 0;
      const cheapEnough = ECONOMY_TIERS.has(tier) && !FORCE_PRIMARY() && (tier !== "judgment" || judgmentMayGoCheap);
      const pick = economy && !hasImages && cheapEnough ? economy : primary;

      /**
       * 왜 이 자리에서 돌았는지. **원장에 남는 것은 이 한 칸이다.**
       *
       * 모델 이름만으로는 "싼 등급이 비싼 모델로 돌았다"까지만 보이고, 그게
       * 새는 것인지 원래 그런 것인지가 안 보인다. 그 구분이 없으면 원장을 봐도
       * 손쓸 데를 모른다 — 싼 자리가 통째로 새고 있었을 때 화면은 멀쩡했고
       * 로그에만 남았는데, 그 로그는 아무도 안 본다.
       */
      const why: Routing = !cheapEnough
        ? "planned"
        : !economy
          ? "no_economy"
          : hasImages
            ? "images"
            : "planned";

      try {
        return tag(await pick.generateStructuredOutput(params), why);
      } catch (first) {
        // 선이 끊긴 것이면 **같은 자리에서 한 번 더**. 옮기기 전에 이것부터 한다 —
        // 옆자리는 값도 성질도 다르고, 끊김은 대개 두 번 연달아 나지 않는다.
        let error = first;
        if (isTransportCut(String(first instanceof Error ? first.message : first).toLowerCase())) {
          console.warn(
            `${pick.name} 연결이 끊겼다(tier "${tier}") — 같은 자리에서 한 번 더.`,
            first instanceof Error ? first.message : first,
          );
          try {
            return tag(await pick.generateStructuredOutput(params), why);
          } catch (second) {
            error = second;
          }
        }
        // A cheap vendor being down must not stop the company. Falling back
        // upward is always safe: it costs more and answers better. Falling back
        // *downward* would be the dangerous direction, so it is not offered.
        if (pick !== primary) {
          const why = error instanceof Error ? error.message : String(error);
          // 09-10 사장님: "크레딧 사용 차단 못 해?" — 못 할 이유가 없다. 이 스위치가 켜져 있으면
          // 싼 자리가 죽었을 때 **비싼 자리로 올리지 않고 그 일을 실패시킨다.** 회사가 잠깐 멈추는 것이
          // 사흘에 $18 이 조용히 새는 것보다 낫다. 멈춘 것은 보이고, 새는 것은 안 보인다.
          if (process.env.ROUTER_BLOCK_UP === "1") {
            throw new Error(`ROUTER_BLOCK_UP: ${pick.name} 이 tier "${tier}" 에서 실패했고 비싼 자리로 올리는 것이 차단돼 있다 — ${why}`);
          }
          if (isOutOfBalance(why)) {
            // 조용히 지나가면 안 되는 자리. 이 줄이 없어서 사흘을 새고도 몰랐다.
            console.error(
              `[돈샘] ${pick.name} 잔액이 없다 — tier "${tier}" 일이 ${primary.name}(비싼 자리)로 간다. ` +
                `충전 전까지 계속 샌다. ${why}`,
            );
          } else {
            console.warn(
              `${pick.name} failed on tier "${tier}" — retrying on ${primary.name}.`,
              why,
            );
          }
          try {
            return tag(await primary.generateStructuredOutput(params), "up");
          } catch (upward) {
            return tag(
              await sideways(upward, tier, (v) =>
                v.generateStructuredOutput(params),
              ),
              "sideways",
            );
          }
        }
        return tag(
          await sideways(error, tier, (v) =>
            v.generateStructuredOutput(params),
          ),
          "sideways",
        );
      }
    },
  };

  /**
   * 옆자리로 한 번만 옮겨 본다. 옆자리도 안 되면 원래 오류를 그대로 던진다.
   *
   * 부를 일을 통째로 넘겨받는다 — 인자만 넘기면 그 자리에서 타입이 한 번
   * 뭉개져서, 스키마가 무엇을 돌려주는지 호출한 쪽이 잃어버린다.
   */
  async function sideways<T>(
    error: unknown,
    tier: WorkTier,
    run: (vendor: AIProvider) => Promise<T>,
  ): Promise<T> {
    if (!standby || !worthRetryingElsewhere(error)) throw error;
    console.warn(
      `${primary.name} failed on tier "${tier}" — moving sideways to ${standby.name}.`,
      error instanceof Error ? error.message : error,
    );
    return await run(standby);
  }
}
