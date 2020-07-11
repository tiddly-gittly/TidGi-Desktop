module.exports = {
  "globDirectory": "public-dist/",
  "maximumFileSizeToCacheInBytes": 1024 * 1024 * 256,
  "globPatterns": [
    "**/*.{ico,html,js,json,png}"
  ],
  "swDest": "public-dist/service-worker.js",
  "swSrc": "public/service-worker.js"
};