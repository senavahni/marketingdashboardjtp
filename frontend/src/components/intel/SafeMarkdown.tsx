import { useMemo } from 'react';
import { parseMarkdown, type Inline } from '../../lib/safe-markdown';

function InlineText({ inline }: { inline: Inline[] }) {
  return (
    <>
      {inline.map((i, n) =>
        i.kind === 'bold' ? (
          <strong key={n} className="font-semibold text-ink">
            {i.text}
          </strong>
        ) : i.kind === 'link' ? (
          <a
            key={n}
            href={i.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1D5FA8] underline underline-offset-2 hover:text-[#0F2340]"
          >
            {i.text}
          </a>
        ) : (
          <span key={n}>{i.text}</span>
        ),
      )}
    </>
  );
}

/** Markdown ringkasan insight — dirender sebagai elemen React (teks selalu di-escape, tanpa HTML mentah). */
export function SafeMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-soft">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          const cls = b.level === 2 ? 'text-[15px]' : 'text-[14px]';
          return (
            <h4 key={i} className={`${cls} pt-1 font-semibold text-[#0F2340]`}>
              <InlineText inline={b.inline} />
            </h4>
          );
        }
        if (b.kind === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 marker:text-[#0E9384]`}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <InlineText inline={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i}>
            <InlineText inline={b.inline} />
          </p>
        );
      })}
    </div>
  );
}
