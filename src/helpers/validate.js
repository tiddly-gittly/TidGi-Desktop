import isUrl from './is-url';
import isValidLicenseKey from './is-valid-license-key';

const kits = {
  required: (val, ruleVal, fieldName) => {
    if (!val || val === '') {
      return '{fieldName} is required.'.replace('{fieldName}', fieldName);
    }

    return null;
  },
  url: (val, maxLength, fieldName) => {
    if (!isUrl(val)) {
      return '{fieldName} is not valid.'.replace('{fieldName}', fieldName);
    }
    return null;
  },
  licenseKey: (val, ruleVal, fieldName) => {
    if (!isValidLicenseKey(val)) {
      return '{fieldName} is not valid.'.replace('{fieldName}', fieldName);
    }
    return null;
  },
};

const validate = (changes, rules) => {
  const newChanges = { ...changes };

  Object.keys(changes).forEach((key) => {
    let err = null;

    const val = newChanges[key];

    if (rules[key]) {
      const { fieldName } = rules[key];

      Object.keys(rules[key]).find((ruleName) => {
        if (ruleName === 'fieldName') return false;

        const ruleVal = rules[key][ruleName];

        err = kits[ruleName](val, ruleVal, fieldName);

        return err !== null;
      });
    }

    newChanges[`${key}Error`] = err;
  });

  return newChanges;
};

export default validate;
