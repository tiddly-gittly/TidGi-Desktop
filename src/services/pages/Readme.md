# Pages

## User point of view

Wiki workspaces are one kind of page.

Guide and Help are two kind of other pages, which are build-in utility pages.

## Developer point of view

When click on a Wiki workspace on sidebar, we switch to `src/pages/WikiBackground` page, and put a WebContentsView on top of it (by realign this WebContentsView). If WebContentsView load url with error, we realign the WebContentsView to hide it, and reveal the WikiBackground below of it, show error message on the WikiBackground page.

When click on other pages like Guide page, we realign the WebContentsView to hide it, and show the Guide page in the `src/pages/Main/index.tsx`.
