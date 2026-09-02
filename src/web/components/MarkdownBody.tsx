import { ContactPeek } from "@/components/contacts/ContactPeek";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import { linkifyHashtags } from "@shared/mentions";
import { cn } from "@/lib/utils";

/**
 * Markdown with opsec▮ conventions: `[@Name](/contacts/id)` mentions and
 * `#tag` hashtags become in-app links styled as chips; other links open in a
 * new tab.
 */
export function MarkdownBody({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("[&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc", className)}>
      <ReactMarkdown
        components={{
          a: ({ href, children: label }) => {
            const text = Array.isArray(label) ? label.join("") : String(label ?? "");
            if (href?.startsWith("/")) {
              const mention = text.startsWith("@");
              const hashtag = text.startsWith("#");
              const contactId = mention ? /^\/contacts\/([^/?#]+)$/.exec(href)?.[1] : undefined;
              if (contactId) {
                return (
                  <ContactPeek id={contactId} className="rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20">
                    {label}
                  </ContactPeek>
                );
              }
              const interaction = href.startsWith("/interactions/");
              return (
                <Link
                  to={href}
                  className={cn(
                    "no-underline!",
                    mention && "rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20",
                    hashtag && "rounded bg-muted px-1 text-foreground/80 hover:bg-muted/70",
                    interaction && "rounded border border-border bg-background px-1 text-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {label}
              </a>
            );
          },
        }}
      >
        {linkifyHashtags(children)}
      </ReactMarkdown>
    </div>
  );
}
