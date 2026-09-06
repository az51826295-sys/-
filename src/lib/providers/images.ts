import OpenAI from "openai";
import { isPriced, UnpricedBackendError } from "@/lib/costs/pricing";

/**
 * 그림을 만드는 자리.
 *
 * 글 쓰는 모델과 다른 계약이다 — 스키마에 맞춘 구조가 아니라 픽셀이 나온다.
 * 그래서 `AIProvider` 에 억지로 끼우지 않고 따로 둔다.
 *
 * 배경은 투명으로 요청한다. 대화창에 얹을 때 흰 사각형이 따라오면 그림이
 * 아니라 스티커처럼 보이고, 나중에 다른 데 쓰려면 다시 잘라야 한다.
 */

const MODEL = "gpt-image-2";
/** 이 모델이 내는 가장 작은 정사각형. 대화창에 얹기엔 이걸로 충분하다. */
const SIZE = "1024x1024";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export type MadeImage = {
  /** data: URL. 파일 저장소를 붙이기 전까지는 이대로 대화에 실린다. */
  dataUrl: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function createImageProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const client = new OpenAI({ apiKey, maxRetries: 3 });

  return {
    name: "openai-images",
    model: MODEL,

    /**
     * 있는 그림을 참조로 새 그림. 같은 사람의 얼굴 클로즈업·뒷모습을 만들 때 쓴다
     * (09-06 18회차). 생성기가 참조를 보고 그리니 얼굴이 유지된다.
     */
    async edit(imageDataUrl: string, prompt: string, size: ImageSize = "1024x1024", quality: "low" | "medium" | "high" = "high"): Promise<MadeImage> {
      if (!isPriced(MODEL)) throw new UnpricedBackendError(MODEL);
      const { toFile } = await import("openai");
      const b64 = imageDataUrl.split(",")[1] ?? imageDataUrl;
      const file = await toFile(Buffer.from(b64, "base64"), "reference.png", { type: "image/png" });
      const res = await client.images.edit({ model: MODEL, image: file, prompt, n: 1, size, quality, output_format: "png" });
      const out = res.data?.[0]?.b64_json;
      if (!out) throw new Error("IMAGE_EMPTY");
      return { dataUrl: `data:image/png;base64,${out}`, model: MODEL, inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
    },

    async draw(prompt: string, quality: "low" | "medium" | "high" = "low", size: ImageSize = SIZE): Promise<MadeImage> {
      // 값이 안 매겨진 백엔드는 요청 전에 막는다. 회사 한도가 볼 수 없는 돈을
      // 쓰는 것이 이 규칙이 막는 유일한 실패다.
      if (!isPriced(MODEL)) throw new UnpricedBackendError(MODEL);

      const res = await client.images.generate({
        model: MODEL,
        prompt,
        n: 1,
        size,
        quality,
        background: "transparent",
        output_format: "png",
      });

      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("IMAGE_EMPTY");

      return {
        dataUrl: `data:image/png;base64,${b64}`,
        model: MODEL,
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
      };
    },
  };
}
