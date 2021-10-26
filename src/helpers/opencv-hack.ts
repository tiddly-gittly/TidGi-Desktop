/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// https://github.com/gallagherrchris/opencv4nodejs-electron-test/blob/36a4f212aaa55d27ec628ed787e104108d6a38d0/src/main.js#L12-L21
// Hacks to make opencv4nodejs detect electron
// https://github.com/justadudewhohacks/opencv4nodejs/blob/4425af57cada1753d13c7f4bbd3fe562e9d85985/lib/opencv4nodejs.js#L4-L11
// https://github.com/electron/electron/issues/2288
delete process.env.path;
(global as any).window = {
  process,
};
(global as any).navigator = {
  userAgent: ' electron/',
};
