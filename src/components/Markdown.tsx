import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/**
 * Renders deliverable bodies as a document. Sanitised on every render — the
 * content is not user-authored today, but it is stored text rendered back into
 * the page, so it goes through the same gate either way.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="deliverable-body text-[15px] leading-7 text-zinc-700">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
