import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * 대화 칸 안의 마크다운.
 *
 * `Markdown.tsx` 는 밝은 종이 위 보고서용이라 글자색이 박혀 있다(zinc-700). 대화
 * 화면은 어두운 바탕이라 그대로 쓰면 안 읽힌다. 여기서는 색을 정하지 않고
 * **바깥을 따른다** — 칸이 어떤 색이든 글자는 그 칸의 글자색이다.
 *
 * 그림은 데이터 URL 을 허용한다. Nova 가 그린 후보는 파일이 아니라 데이터 URL 로
 * 본문에 실려 오고, 기본 정화 규칙은 그것을 지운다 — 그러면 "통과 3" 이라면서
 * 그림이 하나도 안 보인다.
 */
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), "data"],
  },
};

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, schema]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
