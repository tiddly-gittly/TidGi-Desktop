function readPackage(pkg, context) {
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
