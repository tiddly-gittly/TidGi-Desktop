import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const moduleDirectory = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Audit the complete production tree. Tests and fixtures are intentionally
// excluded: this is a production-contract scanner, not a general style check.
const defaultTargetRoots = [
  resolve(repositoryRoot, 'src'),
  resolve(repositoryRoot, 'packages/tidgi-shared/src'),
];
const rendererEntry = 'src/renderer.tsx';
const rendererNodeI18nImport = '@services/libs/i18n';

/**
 * A repository contract violation includes a source location so one run can
 * report every occurrence instead of stopping at the first matching rule.
 *
 * @typedef {{ code: string, file: string, line: number, column: number, index: number }} Violation
 */

/**
 * Return production source files below a directory.
 *
 * @param {string} directory
 * @returns {string[]}
 */
export function productionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (
      entry.name === '__tests__' ||
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '__mocks__'
    ) {
      return [];
    }
    const child = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(child);
    // A colocated test file is not necessarily inside __tests__. Exclude it
    // here so fixture text cannot mask a production violation.
    return entry.isFile() &&
        sourceExtensions.has(extname(entry.name)) &&
        !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(entry.name)
      ? [child]
      : [];
  });
}

/**
 * Resolve an internal source import from the same aliases used by Vite.
 * External packages and browser-safe subpaths are intentionally ignored.
 *
 * @param {string} root
 * @param {string} importer
 * @param {string} specifier
 * @returns {string | undefined}
 */
function resolveRendererImport(root, importer, specifier) {
  let base;
  if (specifier.startsWith('@/')) {
    base = join(root, 'src', specifier.slice(2));
  } else if (specifier.startsWith('@services/')) {
    base = join(root, 'src', 'services', specifier.slice('@services/'.length));
  } else if (specifier.startsWith('.')) {
    base = resolve(importer, '..', specifier);
  } else {
    return undefined;
  }

  const explicitExtension = extname(base);
  const extensionlessBase = explicitExtension ? base.slice(0, -explicitExtension.length) : base;
  const candidates = [
    base,
    ...[...sourceExtensions].map(extension => `${extensionlessBase}${extension}`),
    ...[...sourceExtensions].map(extension => join(base, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    if (!sourceExtensions.has(extname(candidate))) continue;
    if (/(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(candidate)) continue;
    return resolve(candidate);
  }
  return undefined;
}

/** @param {string} fileName @returns {import('typescript').ScriptKind} */
function scriptKindForFile(fileName) {
  const extension = extname(fileName).toLowerCase();
  return extension === '.tsx' || extension === '.jsx'
    ? ts.ScriptKind.TSX
    : extension === '.js' || extension === '.mjs' || extension === '.cjs'
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
}

/**
 * Return static internal module specifiers from one source file.
 *
 * @param {string} source
 * @param {string} fileName
 * @returns {Array<{ specifier: string, index: number }>}
 */
function rendererImportSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindForFile(fileName));
  /** @type {Array<{ specifier: string, index: number }>} */
  const imports = [];
  /** @param {import('typescript').Node} node */
  const visit = node => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ specifier: node.moduleSpecifier.text, index: node.moduleSpecifier.getStart(sourceFile) });
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ specifier: node.moduleSpecifier.text, index: node.moduleSpecifier.getStart(sourceFile) });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, index: node.arguments[0].getStart(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

/**
 * Follow internal imports from the renderer entry point. This keeps the
 * renderer boundary assertion tied to the actual Vite entry graph instead of
 * maintaining a hand-written list of UI directories.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function rendererReachableFiles(root = repositoryRoot) {
  const entry = resolve(root, rendererEntry);
  if (!existsSync(entry) || !statSync(entry).isFile()) return [];

  const reachable = [];
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) continue;
    const normalized = resolve(file);
    if (visited.has(normalized)) continue;
    visited.add(normalized);
    reachable.push(normalized);

    const source = readFileSync(normalized, 'utf8');
    for (const { specifier } of rendererImportSpecifiers(source, normalized)) {
      const dependency = resolveRendererImport(root, normalized, specifier);
      if (dependency !== undefined && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return reachable;
}

/**
 * Find imports of the Node/Electron i18n entry in a renderer-reachable module.
 * The `/renderer`, `/placeholder`, and other subpaths are separate browser-safe
 * modules and therefore do not match this exact entry-point assertion.
 *
 * @param {string} source
 * @param {string} fileName
 * @returns {number[]}
 */
export function findRendererNodeI18nImports(source, fileName) {
  return rendererImportSpecifiers(source, fileName)
    .filter(({ specifier }) => specifier === rendererNodeI18nImport)
    .map(({ index }) => index);
}

/**
 * Replace comments and string/template literal text with spaces while
 * preserving line breaks and `${...}` template expressions. This gives the
 * textual rules a small, comment-aware lexer without changing source offsets.
 *
 * @param {string} source
 * @returns {string}
 */
export function maskNonCode(source) {
  const length = source.length;
  const masked = Array.from({ length }, (_, index) => source.charAt(index));

  /** @param {number} start @param {number} end */
  function blank(start, end) {
    for (let index = start; index < end; index += 1) {
      if (masked[index] !== '\n' && masked[index] !== '\r') masked[index] = ' ';
    }
  }

  /** @param {number} start @param {string} quote @returns {number} */
  function skipQuoted(start, quote) {
    let index = start + 1;
    while (index < length) {
      if (source[index] === '\\') {
        // Escaped quotes/backslashes cannot terminate the literal.
        index += 2;
        continue;
      }
      if (source[index] === quote) {
        index += 1;
        break;
      }
      index += 1;
    }
    blank(start, index);
    return index;
  }

  /** @param {number} start @returns {number} */
  function skipLineComment(start) {
    let index = start + 2;
    while (index < length && source[index] !== '\n' && source[index] !== '\r') index += 1;
    blank(start, index);
    return index;
  }

  /** @param {number} start @returns {number} */
  function skipBlockComment(start) {
    const end = source.indexOf('*/', start + 2);
    const index = end < 0 ? length : end + 2;
    blank(start, index);
    return index;
  }

  /**
   * Scan JavaScript/TypeScript code until EOF or the closing brace belonging
   * to a `${...}` expression. Nested braces and nested template literals are
   * handled recursively so expressions remain executable code in `masked`.
   */
  /** @param {number} start @param {boolean} stopAtBrace @returns {number} */
  function scanCode(start, stopAtBrace) {
    let index = start;
    let braceDepth = 0;
    while (index < length) {
      const character = source[index];
      const next = source[index + 1];
      if (stopAtBrace && character === '}' && braceDepth === 0) return index + 1;
      if (character === '/' && next === '/') {
        index = skipLineComment(index);
        continue;
      }
      if (character === '/' && next === '*') {
        index = skipBlockComment(index);
        continue;
      }
      if (character === "'" || character === '"') {
        index = skipQuoted(index, character);
        continue;
      }
      if (character === '`') {
        index = scanTemplate(index);
        continue;
      }
      if (stopAtBrace && character === '{') braceDepth += 1;
      if (stopAtBrace && character === '}') braceDepth -= 1;
      index += 1;
    }
    return index;
  }

  /** @param {number} start @returns {number} */
  function scanTemplate(start) {
    // Template delimiters and literal text are not executable code. Keep the
    // `${` introducer and recursively scan only the expression body.
    blank(start, start + 1);
    let index = start + 1;
    while (index < length) {
      const character = source[index];
      if (character === '\\') {
        blank(index, Math.min(index + 2, length));
        index += 2;
        continue;
      }
      if (character === '`') {
        blank(index, index + 1);
        return index + 1;
      }
      if (character === '$' && source[index + 1] === '{') {
        index = scanCode(index + 2, true);
        continue;
      }
      blank(index, index + 1);
      index += 1;
    }
    return index;
  }

  scanCode(0, false);
  return masked.join('');
}

/**
 * Find catch handlers whose block contains no executable statement. The AST
 * naturally ignores comments and distinguishes `.catch(() => {})` from an
 * expression-bodied rejection handler.
 *
 * @param {string} source
 * @param {string} fileName
 * @returns {number[]}
 */
export function findSilentEmptyCatch(source, fileName = '<source>.ts') {
  const extension = extname(fileName).toLowerCase();
  const scriptKind = extension === '.tsx' || extension === '.jsx'
    ? ts.ScriptKind.TSX
    : extension === '.js' || extension === '.mjs' || extension === '.cjs'
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  /** @type {number[]} */
  const indices = [];

  /** @param {import('typescript').Block} body */
  const isEmptyBlock = body => body.statements.every(statement => ts.isEmptyStatement(statement));
  /** @param {import('typescript').Node} node */
  const visit = node => {
    if (ts.isCatchClause(node) && isEmptyBlock(node.block)) {
      indices.push(node.getStart(sourceFile));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch'
    ) {
      for (const argument of node.arguments) {
        if (
          (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) &&
          ts.isBlock(argument.body) &&
          isEmptyBlock(argument.body)
        ) {
          indices.push(argument.getStart(sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(indices)].sort((left, right) => left - right);
}

/**
 * @typedef {{
 *   code: string,
 *   pattern?: RegExp,
 *   matcher?: (source: string, fileName?: string) => number[],
 * }} ForbiddenRule
 */

/** @type {ForbiddenRule[]} */
const forbidden = [
  // `tagName` is also a valid TiddlyWiki menu/variable name. Restrict this
  // rule to the old workspace migration spellings.
  { code: 'workspace_legacy_tag_name', pattern: /\blegacyTagName\b|\b(?:effectiveWorkspace|workspaceToSanitize|workspaceConfig)\b[^;\n]*\btagName\b/u },
  { code: 'workspace_name_folder_fallback', pattern: /path\.basename\(effectiveWorkspace\.wikiFolderLocation\)/u },
  { code: 'workspace_storage_key_identity_fallback', pattern: /\bstoredID\b|\boldToNewIdMap\b/u },
  { code: 'workspace_main_path_identity_fallback', pattern: /\bmainWikiToLink\b/u },
  { code: 'workspace_http_last_url_migration', pattern: /before 0\.8\.0|lastUrl\s*&&\s*!effectiveWorkspace\.lastUrl/u },
  { code: 'workspace_home_url_migration', pattern: /!effectiveWorkspace\.homeUrl\s*\|\|\s*!effectiveWorkspace\.homeUrl\.startsWith/u },
  {
    code: 'workspace_case_insensitive_alias',
    pattern: /id\.toLowerCase\(\)\s*===\s*lower\b|workspaceIDFromHost\.toLowerCase\(\)|workspaceIDFromHost\.toLowerCase\(\)\s*!==\s*workspaceID\.toLowerCase\(\)/u,
  },
  { code: 'agent_unbounded_message_snapshot', pattern: /\bgetMessages(?:AfterCoveredVersion)?\s*\(/u },
  { code: 'workspace_remote_identity_alias', pattern: /\bremoteWorkspaceId\b/u },
  { code: 'unsafe_double_assertion', pattern: /\bas unknown as\b/u },
  { code: 'unsafe_never_assertion', pattern: /\bas never\b/u },
  { code: 'unsafe_any_assertion', pattern: /\bas any\b|<any>/u },
  {
    code: 'device_cloud_snapshot_field_redeclaration',
    pattern:
      /export\s+(?:interface\s+DeviceCloudConnectionStatus\s*\{|type\s+DeviceCloudConnectionStatus\s*=\s*\{)[\s\S]*?\b(?:status|generation|components|lastError|nextRetryAt)\s*[:?]/u,
  },
  { code: 'silent_empty_catch', matcher: findSilentEmptyCatch },
];

/** @param {RegExp} expression @returns {RegExp} */
function globalExpression(expression) {
  const flags = expression.flags.includes('g') ? expression.flags : `${expression.flags}g`;
  return new RegExp(expression.source, flags);
}

/** @param {string} source @returns {number[]} */
function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

/**
 * Scan one source string. Every match is returned, including multiple matches
 * for one rule in one file.
 *
 * @param {string} source
 * @param {string} fileName
 * @returns {Violation[]}
 */
export function scan(source, fileName = '<source>') {
  const masked = maskNonCode(source);
  const starts = lineStarts(source);
  /** @type {Violation[]} */
  const violations = [];
  /** @param {string} code @param {number} index */
  const addMatch = (code, index) => {
    const lineIndex = Math.max(0, starts.findLastIndex(start => start <= index));
    violations.push({
      code,
      file: fileName,
      line: lineIndex + 1,
      column: index - starts[lineIndex] + 1,
      index,
    });
  };

  for (const rule of forbidden) {
    let indices;
    if (rule.matcher !== undefined) {
      indices = rule.matcher(source, fileName);
    } else if (rule.pattern !== undefined) {
      indices = [...masked.matchAll(globalExpression(rule.pattern))]
        .map(match => match.index)
        .filter(index => index !== undefined);
    } else {
      throw new Error(`review rule ${rule.code} has no matcher`);
    }
    for (const index of indices) addMatch(rule.code, index);
  }
  return violations.sort((left, right) => left.index - right.index || left.code.localeCompare(right.code));
}

/**
 * Scan all configured production roots.
 *
 * @param {{ repositoryRoot?: string, targetRoots?: string[] }} [options]
 * @returns {Violation[]}
 */
export function scanRepository(options = {}) {
  const root = resolve(options.repositoryRoot ?? repositoryRoot);
  const roots = options.targetRoots ?? defaultTargetRoots.map(targetRoot => relative(repositoryRoot, targetRoot));
  const files = roots.flatMap(targetRoot => productionFiles(resolve(root, targetRoot)));
  const violations = files.flatMap(file => scan(readFileSync(file, 'utf8'), relative(root, file).split('\\').join('/')));
  const configuredFiles = new Set(files.map(file => resolve(file)));

  // Renderer modules must not import the main-process i18n entry. That entry
  // statically reaches Electron and Node filesystem APIs, which Vite turns
  // into browser shims that fail at runtime in packaged Windows builds.
  for (const file of rendererReachableFiles(root)) {
    if (!configuredFiles.has(file)) continue;
    const source = readFileSync(file, 'utf8');
    const fileName = relative(root, file).split('\\').join('/');
    const starts = lineStarts(source);
    for (const index of findRendererNodeI18nImports(source, fileName)) {
      const lineIndex = Math.max(0, starts.findLastIndex(start => start <= index));
      violations.push({
        code: 'renderer_node_i18n_import',
        file: fileName,
        line: lineIndex + 1,
        column: index - starts[lineIndex] + 1,
        index,
      });
    }
  }

  return violations.sort((left, right) => left.file.localeCompare(right.file) || left.index - right.index || left.code.localeCompare(right.code));
}

/** @param {Violation} violation @returns {string} */
export function formatViolation(violation) {
  return `${violation.code}: ${violation.file}:${String(violation.line)}:${String(violation.column)}`;
}

function isMainModule() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const violations = scanRepository();
  if (violations.length > 0) {
    for (const violation of violations) {
      globalThis.console.error(`repository contract violation: ${formatViolation(violation)}`);
    }
    process.exitCode = 1;
  } else {
    const fileCount = defaultTargetRoots.reduce((count, root) => count + productionFiles(root).length, 0);
    globalThis.console.log(`workspace compatibility audit passed across ${String(fileCount)} production files`);
  }
}
