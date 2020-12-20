import isUrl from './is-url';

const kits = {
  required: (value: any, ruleValue: any, fieldName: any) => {
    if (!value || value === '') {
      return '{fieldName} is required.'.replace('{fieldName}', fieldName);
    }

    return null;
  },
  url: (value: any, maxLength: any, fieldName: any) => {
    if (value && !isUrl(value)) {
      return '{fieldName} is not valid.'.replace('{fieldName}', fieldName);
    }
    return null;
  },
  // accept link without protocol prefix
  lessStrictUrl: (value: any, _: any, fieldName: any) => {
    if (value && !isUrl(value) && !isUrl(`http://${value}`)) {
      return '{fieldName} is not valid.'.replace('{fieldName}', fieldName);
    }
    return null;
  },
};

const validate = (changes: any, rules: any) => {
  const newChanges = { ...changes };

  Object.keys(changes).forEach((key) => {
    if (key.endsWith('Error')) return;

    let error = null;

    const value = newChanges[key];

    if (rules[key]) {
      const { fieldName } = rules[key];

      Object.keys(rules[key]).find((ruleName) => {
        if (ruleName === 'fieldName') return false;

        const ruleValue = rules[key][ruleName];

        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        error = kits[ruleName](value, ruleValue, fieldName);

        return error !== null;
      });
    }

    newChanges[`${key}Error`] = error;
  });

  return newChanges;
};

export default validate;
