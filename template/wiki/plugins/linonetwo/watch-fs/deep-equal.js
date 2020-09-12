module.exports = function deepEqual(x, y) {
  if (x === y) {
    return true;
  }
  if (titleListEqual(x, y)) {
    // handle title list https://tiddlywiki.com/#Title%20List
    /* tiddler {
      "title": "$:/StoryList",
      "list": "Index"
    }
    tiddlerInWiki {
      "title": "$:/StoryList",
      "list": [
        "Index"
      ]
    } */
    return true;
  }
  if (timeStampEqual(x, y)) {
    // handles time stamp format
    /* tiddler {
      "title": "$:/StoryList",
      "created": "20200806161101351",
      "list": "Index",
      "modified": "20200806161101351",
      "type": "text/vnd.tiddlywiki"
    }
    tiddlerInWiki {
      "title": "$:/StoryList",
      "created": "2020-08-06T16:11:01.351Z",
      "list": [
        "Index"
      ],
      "modified": "2020-08-06T16:11:01.351Z",
      "type": "text/vnd.tiddlywiki"
    } */
    return true;
  }
  if (typeof x === 'object' && x !== null && typeof y === 'object' && y !== null) {
    deleteRuntimeFieldsFromTiddler(x);
    deleteRuntimeFieldsFromTiddler(y);
    if (Object.keys(x).length !== Object.keys(y).length) return false;

    for (const property in x) {
      if (!deepEqual(x[property], y[property])) return false;
    }

    return true;
  }
  return false;
};

function titleListEqual(x, y) {
  // y is like "GettingStarted [[Discover TiddlyWiki]] Upgrading", and x is an array
  if (typeof x === 'string' && Array.isArray(y)) {
    // $tw.utils.parseStringArray is heavy, so we use $tw.utils.stringifyList instead
    return $tw.utils.stringifyList(y) === x;
  }
  if (typeof y === 'string' && Array.isArray(x)) {
    return $tw.utils.stringifyList(x) === y;
  }
  return false;
}

function timeStampEqual(x, y) {
  // strangely, `created` and `modified` field is not instanceof Date, so have to use x === 'object' to check it
  if (typeof y === 'object' && y.toString && Object.keys(y).length === 0 && typeof x === 'string') {
    return JSON.stringify(y).replace(/[".:TZ-]/g, '') === x;
  }
  if (typeof x === 'object' && x.toString && Object.keys(x).length === 0 && typeof y === 'string') {
    return JSON.stringify(x).replace(/[".:TZ-]/g, '') === y;
  }
  if (typeof x === 'string' && typeof y === 'string') {
    return x.replace(/[.:TZ-]/g, '') === y || y.replace(/[.:TZ-]/g, '') === x;
  }
  return false;
}

const fieldsToDelete = ['bag', 'revision'];
/**
 * Delete things like "bag" and "revision" that doesn't save to file
 * @param {tiddler.fields} tiddlerFields
 */
function deleteRuntimeFieldsFromTiddler(tiddlerFields) {
  for (const fieldName of fieldsToDelete) {
    if (fieldName in tiddlerFields) {
      delete tiddlerFields[fieldName];
    }
  }
}
