/*\
module-type: relinkmarkdownrule
title: $:/plugins/flibbles/relink/js/relinkoperations/text/markdowntext/codeblock.js
type: application/javascript

```javascript
code
```

\*/

var utils = require("$:/plugins/flibbles/relink/js/utils/markdown");

exports.name = "codeblock";
exports.types = {inline: true};

exports.init = function(parser) {
	this.parser = parser;
	this.matchRegExp = /(```+)[^\n`]*(?:\n|$)/mg;
	this.maxIndent = 3;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var endRegExp = new RegExp("^ {0,3}" + this.match[1] + "+[^\\S\\n]*\\n", "mg");
	endRegExp.lastIndex = this.matchRegExp.lastIndex;
	var endMatch = endRegExp.exec(this.parser.source);
	if (endMatch) {
		this.parser.pos = endRegExp.lastIndex;
	} else {
		this.parser.pos = this.parser.sourceLength;
	}
	return undefined;
};

exports.report = exports.relink;
