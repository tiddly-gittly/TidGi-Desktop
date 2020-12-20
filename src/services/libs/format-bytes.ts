// https://stackoverflow.com/a/18650828
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'formatByte... Remove this comment to see the full error message
function formatBytes(bytes: any, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const index = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** index).toFixed(dm))} ${sizes[index]}`;
}

module.exports = formatBytes;
