module.exports = function deepEqual(x, y) {
  if (x === y) {
    return true;
  } else if (titleListEqual(x, y)) {
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
  } else if (timeStampEqual(x, y)) {
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
  } else if (typeof x === 'object' && x !== null && typeof y === 'object' && y !== null) {
    if (Object.keys(x).length != Object.keys(y).length) return false;

    for (var prop in x) {
      if (!deepEqual(x[prop], y[prop])) return false;
    }

    return true;
  } else {
    return false;
  }
};

function titleListEqual(x, y) {
  // y is like "GettingStarted [[Discover TiddlyWiki]] Upgrading", and x is an array
  if (typeof x === 'string' && Array.isArray(y)) {
    // $tw.utils.parseStringArray is heavy, so we use $tw.utils.stringifyList instead
    return $tw.utils.stringifyList(y) === x;
  } else if (typeof y === 'string' && Array.isArray(x)) {
    return $tw.utils.stringifyList(x) === y;
  }
  return false;
}

function timeStampEqual(x, y) {
  // strangely, `created` and `modified` field is not instanceof Date, so have to use x === 'object' to check it
  if (typeof y === 'object' && y.toString && Object.keys(y).length === 0 && typeof x === 'string') {
    return JSON.stringify(y).replace(/["\-T:Z.]/g, '') === x;
  } else if (typeof x === 'object' && x.toString && Object.keys(x).length === 0 && typeof y === 'string') {
    return JSON.stringify(x).replace(/["\-T:Z.]/g, '') === y;
  } else if (typeof x === 'string' && typeof y === 'string') {
    return x.replace(/[\-T:Z.]/g, '') === y || y.replace(/[\-T:Z.]/g, '') === x;
  }
  return false;
}
