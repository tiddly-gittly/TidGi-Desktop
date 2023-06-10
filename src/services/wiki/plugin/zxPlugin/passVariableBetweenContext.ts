/* eslint-disable security-node/detect-eval-with-expr */
/* eslint-disable no-eval */
/* eslint-disable security/detect-eval-with-expression */
import * as espree from 'espree';

/**
 * The values will still be string, if original value is an object.
 * We will JSON.stringify it in vm context, not in the worker_thread
 */
export type IVariableContext = Record<string, string | number | boolean>;
/**
 * Variable from each context separated by TW_SCRIPT_SEPARATOR
 */
export type IVariableContextList = IVariableContext[];

/**
 * Extract variables from script content. We will use these variables to construct a `console.dir` that serialize all these variables, and deserialize them in next code context.
 *
 * Use https://esprima.org/demo/parse.html# as playground to see the AST.
 * @param scriptContent string that is already separated by TW_SCRIPT_SEPARATOR.
 * @returns variables that we need to extract, serialize, and deserialize, then send to next code context
 * @url https://stackoverflow.com/a/25473571/4617295
 */
export function getVariablesFromScript(scriptContent: string): string[] {
  try {
    const tree = espree.parse(scriptContent, { sourceType: 'module', ecmaVersion: 'latest' }) as EspreeASTRoot;
    const topLevelVariables = tree.body.filter(node => node.type === 'VariableDeclaration' && node.declarations?.length > 0).flatMap(node =>
      node.declarations.map(declaration => declaration.id.name)
    );
    return topLevelVariables;
  } catch (error) {
    console.error('espree.parse', error);
    // Can't use logger in this file to log error, because it runs in the worker. Just return empty variable list, let user to guess...
    return [];
  }
}

export const VARIABLES_MAP_LOG_PREFIX = 'zx-plugin-variables-map';
/**
 * This gets a string that can be eval in the zx code context, and it will serialize all variables in that context, and deserialize them in this worker_thread or next context.
 */
export function getSerializeAllVariablesInContextSnippet(content: string): string {
  const variables = getVariablesFromScript(content);
  /**
   * Serialize all variables that is primitive in the context using JSONStringify.
   * This is a helper function that will not be executed. We toString it, and concat it to the JS script that will be executed.
   */
  const toStringHelper = () => {
    const variableMap = variables.reduce((accumulator, variable) => {
      try {
        return { ...accumulator, [variable]: JSON.stringify(eval(variable)) };
      } catch {
        return accumulator;
      }
    }, {});
  };
  // after minify, the `() => {` will become `()=>{`, so we need to replace both, otherwise after bundle, this will cause error.
  const stringScriptWithoutPrefix = toStringHelper.toString().replace('() => {', '').replace('()=>{', '');
  // replace tailing `}`, and replace `variables` string with actuarial variables
  const variablesToStringScript = stringScriptWithoutPrefix.substring(0, stringScriptWithoutPrefix.length - 1).replace('variables', JSON.stringify(variables));
  return variablesToStringScript;
}
/**
 * Used in context that can't return value, like in the zx script.
 */
export function addVariableIOToContentLogVersion(content: string, variables: IVariableContext | undefined): string {
  const setVariablesScript = variables === undefined ? '' : getDeserializeAllVariablesInContextSnippet(variables);
  const variablesToStringScript = getSerializeAllVariablesInContextSnippet(content);
  return `${setVariablesScript}
${content}
${variablesToStringScript}
console.log('${VARIABLES_MAP_LOG_PREFIX}', JSON.stringify(variableMap));`;
}
export function extractVariablesFromExecutionLog(logString: string): IVariableContext {
  // extract variables from `console.log('${VARIABLES_MAP_LOG_PREFIX}', variableMap);`;
  const JSONString = logString.replace(VARIABLES_MAP_LOG_PREFIX, '').trimStart();
  try {
    // we only parse the outer keys, the values will still be string, if original value is an object.
    return JSON.parse(JSONString) as IVariableContext;
  } catch {
    return {};
  }
}

/**
 * Used in context that can inject api, like vm context.
 * Use `pushVariablesToTWContext` in `additionalVMContext`
 */
export function addVariableIOToContentAPIVersion(content: string, variables: IVariableContext | undefined): string {
  const setVariablesScript = variables === undefined ? '' : getDeserializeAllVariablesInContextSnippet(variables);
  const variablesToStringScript = getSerializeAllVariablesInContextSnippet(content);
  return `${setVariablesScript}
${content}
${variablesToStringScript}
pushVariablesToTWContext(variableMap);`;
}

export function getDeserializeAllVariablesInContextSnippet(variables: IVariableContext): string {
  const setVariablesScript = Object.keys(variables).reduce((accumulator, variable) => {
    const variableValue = variables[variable];
    // try to parse JSON in vm/zx context
    if (typeof variableValue === 'string') {
      if (variableValue.includes('{')) {
        // parse json with default "" quote
        return `${accumulator}
        try {
          var ${variable} = JSON.parse('${variableValue}');
        } catch {
          // this is a normal string, not json
          var ${variable} = ${variableValue};
        }
        `;
      } else {
        // for string, not need extra quote, because it was stringified in zx context and parsed back
        return `${accumulator}
        var ${variable} = ${variableValue};`;
      }
    }
    // for number boolean
    return `${accumulator}
      var ${variable} = ${String(variableValue)};`;
  }, '');
  return setVariablesScript;
}

export interface EspreeASTRoot {
  body: Body[];
  sourceType: string;
  type: string;
}
export interface Body {
  declarations: EspreeASTVariableDeclarator[];
  kind: string;
  type: string;
}
export interface EspreeASTVariableDeclarator {
  id: EspreeASTId;
  type: string;
}

export interface EspreeASTId {
  name: string;
  type: string;
}
