import React from 'react';

interface HighlightTextProps {
  query: string;
  text: string;
}

/**
 * Wraps matched substrings with a yellow highlight span.
 * Comparison is case-insensitive.
 */
export function HighlightText({ text, query }: HighlightTextProps): React.JSX.Element {
  if (!query) return <>{text}</>;

  const escaped = query.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1
          ? (
            <mark
              key={index}
              style={{
                backgroundColor: 'var(--color-search-highlight, rgba(255, 200, 0, 0.4))',
                borderRadius: 2,
                padding: '0 1px',
                color: 'inherit',
              }}
            >
              {part}
            </mark>
          )
          : part
      )}
    </>
  );
}
