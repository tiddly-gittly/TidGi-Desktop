export function toParameters(query) {
  const q = query.replace(/^\??\//, '');

  return q.split('&').reduce((values, parameter) => {
    const [key, value] = parameter.split('=');
    const nextValues = values;
    nextValues[key] = value;
    return nextValues;
  }, {});
}

export function toQuery(parameters, delimiter = '&') {
  const keys = Object.keys(parameters);

  return keys.reduce((string, key, index) => {
    let query = `${string}${key}=${parameters[key]}`;

    if (index < keys.length - 1) {
      query += delimiter;
    }

    return query;
  }, '');
}
