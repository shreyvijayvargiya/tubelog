import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MarkdownLink({ href, children }) {
  const external = /^https?:/i.test(href || "");
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

export function MarkdownView({ children }) {
  return (
    <div className="blog-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {String(children || "")}
      </ReactMarkdown>
    </div>
  );
}
