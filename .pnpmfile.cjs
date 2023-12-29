function readPackage(pkg, context) {
  if (process.platform !== 'win32') {
    delete pkg.optionalDependencies['registry-js'];
  }

  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
