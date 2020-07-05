module.exports = {
  "globDirectory": "public/",
  "maximumFileSizeToCacheInBytes": 1024 * 1024 * 256,
  "globPatterns": [
    "**/*.{ico,html,js,json,png}"
  ],
  "swDest": "public/service-worker.js",
  "swSrc": "public/service-worker.js"
};