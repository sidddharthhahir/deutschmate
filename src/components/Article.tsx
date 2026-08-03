import type { ReactNode } from "react";

/**
 * A noun with its article, colour-coded.
 *
 * der = blue · die = amber · das = pink
 *
 * This is a mnemonic, not a status indicator. The article word is ALWAYS
 * written out, so colour is reinforcement and never the sole carrier of
 * meaning — the whole thing still reads correctly in greyscale or with any
 * form of colour blindness.
 */
const COLOUR: Record<string, string> = {
  der: "text-der",
  die: "text-die",
  das: "text-das",
};

export function ArticleWord({ article }: { article: string }) {
  return <span className={COLOUR[article.toLowerCase()] ?? "text-muted"}>{article}</span>;
}

export default function Noun({
  article,
  children,
  gap = "mr-[0.3em]",
}: {
  article?: string | null;
  children: ReactNode;
  gap?: string;
}) {
  if (!article) return <>{children}</>;
  return (
    <>
      <span className={`${COLOUR[article.toLowerCase()] ?? "text-muted"} ${gap}`}>
        {article}
      </span>
      {children}
    </>
  );
}
