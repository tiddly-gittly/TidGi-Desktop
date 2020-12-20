import fetch from 'node-fetch';
import ProxyAgent from 'proxy-agent';

// somehow, ELECTRON_RUN_AS_NODE is set to '1' instead of 'true' as specified
// so use generic process.env.ELECTRON_RUN_AS_NODE condition instead of
// something like process.env.ELECTRON_RUN_AS_NODE === 'true'
const { getPreference }: any = process.env.ELECTRON_RUN_AS_NODE ? {} : require('./preferences');

// @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
const customizedFetch = (url: any, _options: any, ...arguments_) => {
  let proxyPacScript = process.env.PROXY_PAC_SCRIPT;
  let proxyRules = process.env.PROXY_RULES;
  let proxyType = process.env.PROXY_TYPE;
  if (getPreference) {
    proxyPacScript = getPreference('proxyPacScript');
    proxyRules = getPreference('proxyRules');
    proxyType = getPreference('proxyType');
  }

  const options = { ..._options };
  if (proxyType === 'rules') {
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'string | undefined' is not assig... Remove this comment to see the full error message
    const agent = new ProxyAgent(proxyRules);
    options.agent = agent;
  } else if (proxyType === 'pacScript') {
    const agent = new ProxyAgent(`pac+${proxyPacScript}`);
    options.agent = agent;
  }

  // @ts-expect-error ts-migrate(2556) FIXME: Expected 1-2 arguments, but got 3 or more.
  return fetch(url, options, ...arguments_);
};

export default customizedFetch;
