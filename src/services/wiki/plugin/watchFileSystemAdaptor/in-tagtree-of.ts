/**
  Finds out where a tiddler originates from, is it in a tag tree with xxx as root?

  based on:

  - https://github.com/tiddly-gittly/in-tagtree-of/
  - https://github.com/bimlas/tw5-kin-filter/blob/master/plugins/kin-filter/kin.js
  - https://talk.tiddlywiki.org/t/recursive-filter-operators-to-show-all-tiddlers-beneath-a-tag-and-all-tags-above-a-tiddler/3814
*/

import type { IFilterOperator, IFilterOperatorParameterOperator, SourceIterator, Tiddler } from 'tiddlywiki';

declare const exports: Record<string, IFilterOperator>;
exports['in-tagtree-of'] = function inTagTreeOfFilterOperator(
  source: (iter: SourceIterator) => void,
  operator: IFilterOperatorParameterOperator,
): ReturnType<IFilterOperator> {
  const rootTiddler = operator.operand;
  /**
   * By default we check tiddler passed-in is tagged with the operand (or is its child), we output the tiddler passed-in, otherwise output empty.
   * But if `isInclusive` is true, if tiddler operand itself is passed-in, we output it, even if the operand itself is not tagged with itself.
   */
  const isInclusive = operator.suffix === 'inclusive';
  /**
   * If add `!` prefix, means output the input if input is not in rootTiddlerChildren
   */
  const isNotInTagTreeOf = operator.prefix === '!';

  const sourceTiddlers = new Set<string>();
  let firstTiddler: Tiddler | undefined;
  source((tiddler, title) => {
    sourceTiddlers.add(title);
    if (firstTiddler === undefined) {
      firstTiddler = tiddler;
    }
  });

  // optimize for fileSystemPath and cascade usage, where input will only be one tiddler, and often is just tagged with the rootTiddler
  if (sourceTiddlers.size === 1 && !isNotInTagTreeOf) {
    const [theOnlyTiddlerTitle] = sourceTiddlers;
    if (firstTiddler?.fields?.tags?.includes(rootTiddler) === true) {
      return [theOnlyTiddlerTitle];
    }
    if (isInclusive && theOnlyTiddlerTitle === rootTiddler) {
      return [theOnlyTiddlerTitle];
    }
  }

  const rootTiddlerChildren = $tw.wiki.getGlobalCache(`in-tagtree-of-${rootTiddler}`, () => {
    const results = new Set<string>();
    getTiddlersRecursively(rootTiddler, results);
    return results;
  });

  if (isInclusive) {
    rootTiddlerChildren.add(rootTiddler);
  }
  if (isNotInTagTreeOf) {
    const sourceTiddlerCheckedToNotBeChildrenOfRootTiddler: string[] = [...sourceTiddlers].filter(title => !rootTiddlerChildren.has(title));
    return sourceTiddlerCheckedToNotBeChildrenOfRootTiddler;
  }
  const sourceTiddlerCheckedToBeChildrenOfRootTiddler: string[] = [...sourceTiddlers].filter(title => rootTiddlerChildren.has(title));
  return sourceTiddlerCheckedToBeChildrenOfRootTiddler;
};

function getTiddlersRecursively(title: string, results: Set<string>) {
  // get tagging[] list at this level
  const intermediate = new Set<string>($tw.wiki.getTiddlersWithTag(title));
  // remove any TiddlersWithTag in intermediate that are already in the results set to avoid loops
  // code adapted from $tw.utils.pushTop
  if (intermediate.size > 0) {
    if (results.size > 0) {
      if (results.size < intermediate.size) {
        results.forEach(alreadyExisted => {
          if (intermediate.has(alreadyExisted)) {
            intermediate.delete(alreadyExisted);
          }
        });
      } else {
        intermediate.forEach(alreadyExisted => {
          if (results.has(alreadyExisted)) {
            intermediate.delete(alreadyExisted);
          }
        });
      }
    }
    // add the remaining intermediate results and traverse the hierarchy further
    intermediate.forEach((title) => results.add(title));
    intermediate.forEach((title) => {
      getTiddlersRecursively(title, results);
    });
  }
}
