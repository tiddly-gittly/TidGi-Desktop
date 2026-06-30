function readPackage(pkg, context) {
  // registry-js is a Windows-only native addon for reading the Windows registry.
  // It's used in src/services/native/externalApp/win32.ts via dynamic import()
  // guarded by isWin. On Linux/macOS the code path is never reached.
  // Strip it entirely so pnpm never downloads or builds it on non-Windows.
  if (process.platform !== 'win32') {
    delete pkg.dependencies?.['registry-js'];
    delete pkg.optionalDependencies?.['registry-js'];
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
