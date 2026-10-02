import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ children }) {
  return (
    <div className="blog-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(children || "")}</ReactMarkdown>
    </div>
  );
}
