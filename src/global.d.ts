// Global type declarations for CSS imports

// Catch-all for CSS files
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

// Specific declarations for font files
declare module '@fontsource/roboto/300.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '@fontsource/roboto/400.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '@fontsource/roboto/500.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '@fontsource/roboto/700.css' {
  const content: Record<string, string>;
  export default content;
}

// Simplebar CSS
declare module 'simplebar/dist/simplebar.min.css' {
  const content: Record<string, string>;
  export default content;
}
