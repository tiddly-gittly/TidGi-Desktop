export function fixZxPath(content: string): string {
  let shellPathModification = ``;
  if (process.platform === 'win32') {
    shellPathModification = `$.prefix = '';
    $.shell = 'pwsh.exe';`;
  }
  return `${shellPathModification}
  ${content}`;
}
