// Convert a date into UTC YYYYMMDDHHMMSSmmm format
export const stringifyDate = (value: Date) => {
  return value.getUTCFullYear().toString() +
    pad(value.getUTCMonth() + 1) +
    pad(value.getUTCDate()) +
    pad(value.getUTCHours()) +
    pad(value.getUTCMinutes()) +
    pad(value.getUTCSeconds()) +
    pad(value.getUTCMilliseconds(), 3);
};

function pad(value: number, length = 2) {
  let s = value.toString();
  if (s.length < length) {
    s = '000000000000000000000000000'.substring(0, length - s.length) + s;
  }
  return s;
}
