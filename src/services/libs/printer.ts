/**
 * print page just like cmd+P
 */
export function printTiddler(tiddlerTitle: string): Window | undefined {
  const page = window.open('about:blank', '_blank');
  if (page === null) {
    return;
  }
  page.document.write('<h1>' + tiddlerTitle + '</h1>');
  /* eslint-disable @typescript-eslint/no-unsafe-call */
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  page.document.write($tw.wiki.renderTiddler('text/html', tiddlerTitle));
  /* eslint-enable @typescript-eslint/no-unsafe-call */
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  // Markdown CSS
  const markdownLink = page.document.createElement('link');
  markdownLink.setAttribute('rel', 'stylesheet');
  markdownLink.setAttribute('href', 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/4.0.0/github-markdown.min.css');
  markdownLink.setAttribute('type', 'text/css');
  page.document.head.append(markdownLink);
  // KaTeX CSS
  const kaTeXLink = page.document.createElement('link');
  kaTeXLink.setAttribute('rel', 'stylesheet');
  kaTeXLink.setAttribute('href', 'https://cdn.jsdelivr.net/npm/katex@0.13.18/dist/katex.min.css');
  kaTeXLink.setAttribute('type', 'text/css');
  page.document.head.append(kaTeXLink);
  // Highlight JS CSS
  const highlightLink = page.document.createElement('link');
  highlightLink.setAttribute('rel', 'stylesheet');
  highlightLink.setAttribute('href', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/default.min.css');
  highlightLink.setAttribute('type', 'text/css');
  page.document.head.append(highlightLink);
  page.document.title = tiddlerTitle;
  page.document.body.className = 'markdown-body';
  // return for print
  return page;
}
