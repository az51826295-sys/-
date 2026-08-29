import { runEverydayTurn } from "@/lib/chat/everydayService";

/**
 * 대화 하나. **모드가 없다.**
 *
 * 전에는 `/api/everyday-chat` 과 `/api/company-chat` 이 갈려 있었고, 사용자가
 * 말을 걸기 전에 자기 요청을 먼저 분류해야 했다. 이제 한 경로가 받고, 무엇을
 * 할지는 **말한 내용**이 정한다.
 *
 * **답을 한 덩어리로 주지 않는다.** 한 턴이 검색·그림·위임까지 하면 십수 초가
 * 걸리는데, 그동안 화면에 점 세 개만 있으면 사람은 멈춘 걸로 읽는다. 뒤에서
 * 여러 곳에 붙는 것이 이 제품의 값어치인데, 안 보이면 값어치가 아니라 지연으로만
 * 느껴진다. 그래서 진행 상황을 줄 단위로 흘려보내고 마지막에 답을 보낸다.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "No messages." }, 400);
  }

  const visitor = (body as { visitor?: unknown })?.visitor;
  const conversationId = (body as { conversationId?: unknown })?.conversationId;
  const images = (body as { images?: unknown })?.images;
  const taskId = (body as { taskId?: unknown })?.taskId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 한 줄에 하나씩, 줄바꿈으로 나눈다. 받는 쪽이 반쪽짜리 줄을 붙잡고
      // 있다가 다음 조각이 와야 읽을 수 있게 — 그래야 중간에 끊겨도 이미 읽은
      // 줄까지는 멀쩡하다.
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // 사용자가 창을 닫으면 여기서 터진다. 그건 오류가 아니라 끝난 것이다.
        }
      };

      try {
        const result = await runEverydayTurn({
          messages: messages.slice(-20) as {
            role: "user" | "assistant";
            content: string;
          }[],
          visitor: typeof visitor === "string" ? visitor : undefined,
          conversationId:
            typeof conversationId === "string" ? conversationId : null,
          taskId: typeof taskId === "string" ? taskId : null,
          images: Array.isArray(images)
            ? (images.filter((v) => typeof v === "string") as string[])
            : undefined,
          onStatus: (text) => send({ type: "status", text }),
        });

        if (!result.ok) {
          send({ type: "error", error: result.error, status: result.status });
        } else {
          send({ type: "done", ...result });
        }
      } catch (error) {
        // 여기까지 온 오류는 답을 못 만든 것이다. 스트림을 조용히 닫으면 화면은
        // 영영 "생각하는 중" 으로 남는다.
        send({
          type: "error",
          error: error instanceof Error ? error.message : "문제가 생겼습니다.",
          status: 500,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // 중간의 프록시가 모아 두면 진행 상황이 마지막에 한꺼번에 도착한다 —
      // 그러면 흘려보낸 의미가 없다.
      "X-Accel-Buffering": "no",
    },
  });
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
