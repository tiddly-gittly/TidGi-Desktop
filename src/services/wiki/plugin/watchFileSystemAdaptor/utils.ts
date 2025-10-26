export function pad(number: number) {
  if (number < 10) {
    return `0${number}`;
  }
  return String(number);
}

export function toTWUTCString(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${
    pad(
      date.getUTCHours(),
    )
  }${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${
    (date.getUTCMilliseconds() / 1000)
      .toFixed(3)
      .slice(2, 5)
  }`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeStringifyHugeTiddler(tiddlerToStringify: any, _fileExtensionOfTiddler: string) {
  try {
    return JSON.stringify(tiddlerToStringify, undefined, '  ').substring(0, 1000);
  } catch {
    return String(tiddlerToStringify).substring(0, 1000);
  }
}

export function getTwCustomMimeType(fileExtension: string) {
  // If the new type matches a known extention, use that MIME type's encoding, empty means fallback to tid.
  const extensionInfo = $tw.utils.getFileExtensionInfo(fileExtension);
  let officialMimeType = extensionInfo ? extensionInfo.type : '';
  if (officialMimeType === 'text/markdown') {
    officialMimeType = 'text/x-markdown';
  }
  return officialMimeType;
}
