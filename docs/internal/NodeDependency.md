# Node Dependency

Using node related dependency in scripts that will loaded in to preload script will cause error `ReferenceError: __dirname is not defined` and `Uncaught TypeError: Cannot destructure property 'descriptors' of 'window.service' as it is undefined.`.

What you need to do is separate ts file that requires node dependencies, from ts file that only use things available in browser environments.
