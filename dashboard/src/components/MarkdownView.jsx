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

export function slugifyHeading(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}

// headingIds adds an id to h2 and h3 so a table of contents can link to them.
export function MarkdownView({ children, headingIds = false }) {
  const components = { a: MarkdownLink };
  if (headingIds) {
    components.h2 = ({ children: content }) => <h2 id={slugifyHeading(textOf(content))}>{content}</h2>;
    components.h3 = ({ children: content }) => <h3 id={slugifyHeading(textOf(content))}>{content}</h3>;
  }
  return (
    <div className="blog-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {String(children || "")}
      </ReactMarkdown>
    </div>
  );
}
