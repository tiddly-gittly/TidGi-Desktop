/*\
This specifies logic for updating filters to reflect title changes.
\*/

var refHandler = require("$:/plugins/flibbles/relink/js/fieldtypes/reference");
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");
var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');

exports.name = "filter";

var FilterEntry = EntryNode.newType("filter");

FilterEntry.prototype.report = function() {
	return this.children.map(function(child) {
		if (!child.report) {
			return "";
		}
		return child.report();
	});
};

function OperatorEntry(operandEntry) { this.entry = operandEntry; };
OperatorEntry.prototype.name = "operator";

OperatorEntry.prototype.eachChild = function(method) { method(this.entry); }

OperatorEntry.prototype.report = function() {
	var operand = "";
	if (this.entry.report) {
		operand = this.entry.report();
	}
	var op = this.operator;
	var brackets = '[]';
	if (this.type === "indirect") {
		operand = "{" + operand + "}";
	} else {
		operand = "[" + operand + "]";
	}
	var suffix = '';
	if (op.suffix) {
		suffix = ":" + op.suffix;
	}
	return "[" + (op.prefix || '') + op.operator + suffix + operand + "]";
};

/**Returns undefined if no change was made.
 */
exports.relink = function(filter, fromTitle, toTitle, options) {
	if (!options.settings.survey(filter, fromTitle, options)) {
		return undefined;
	}
	var filterEntry = new FilterEntry();
	var relinker = new Rebuilder(filter);
	var whitelist = options.settings.getOperators();
	var p = 0, // Current position in the filter string
		match, noPrecedingWordBarrier,
		wordBarrierRequired=false;
	var whitespaceRegExp = /\s+/mg,
		operandRegExp = /((?:\+|\-|~|=)?)(?:(\[)|(?:"([^"]*)")|(?:'([^']*)')|([^\s\[\]]+))/mg;
	while(p < filter.length) {
		// Skip any whitespace
		whitespaceRegExp.lastIndex = p;
		match = whitespaceRegExp.exec(filter);
		noPrecedingWordBarrier = false;
		if(match && match.index === p) {
			p = p + match[0].length;
		} else if (p != 0) {
			if (wordBarrierRequired) {
				relinker.add(' ', p, p);
				wordBarrierRequired = false;
			} else {
				noPrecedingWordBarrier = true;
			}
		}
		// Match the start of the operation
		if(p < filter.length) {
			var val;
			operandRegExp.lastIndex = p;
			match = operandRegExp.exec(filter);
			if(!match || match.index !== p) {
				// It's a bad filter
				return undefined;
			}
			if(match[1]) { // prefix
				p++;
			}
			if(match[2]) { // Opening square bracket
				// We check if this is a standalone title,
				// like `[[MyTitle]]`. We treat those like
				// `"MyTitle"` or `MyTitle`. Not like a run.
				var standaloneTitle = /\[\[([^\]]+)\]\]/g;
				standaloneTitle.lastIndex = p;
				var alone = standaloneTitle.exec(filter);
				if (!alone || alone.index != p) {
					// It's a legit run
					p =parseFilterOperation(relinker,fromTitle,toTitle,filterEntry,filter,p,whitelist,options);
					if (p === undefined) {
						// The filter is malformed
						// We do nothing.
						return undefined;
					}
					continue;
				}
				bracketTitle = alone[1];
				operandRegExp.lastIndex = standaloneTitle.lastIndex;
				val = alone[1];
			} else {
				// standalone Double quoted string, single
				// quoted string, or noquote ahead.
				val = match[3] || match[4] || match[5];
			}
			// From here on, we're dealing with a standalone title
			// expression. like `"MyTitle"` or `[[MyTitle]]`
			// We're much more flexible about relinking these.
			var preference = undefined;
			if (match[3]) {
				preference = '"';
			} else if (match[4]) {
				preference = "'";
			} else if (match[5]) {
				preference = '';
			}
			if (val === fromTitle) {
				var entry = {name: "title"};
				var newVal = wrapTitle(toTitle, preference);
				if (newVal === undefined || (options.inBraces && newVal.indexOf('}}}') >= 0)) {
					if (!options.placeholder) {
						entry.impossible = true;
						filterEntry.add(entry);
						p = operandRegExp.lastIndex;
						continue;
					}

					newVal = "[<"+options.placeholder.getPlaceholderFor(toTitle,undefined,options)+">]";
				}
				if (newVal[0] != '[') {
					// not bracket enclosed
					// this requires whitespace
					// arnound it
					if (noPrecedingWordBarrier && !match[1]) {
						relinker.add(' ', p, p);
					}
					wordBarrierRequired = true;
				}
				entry.output = toTitle;
				entry.operator = {operator: "title"};
				entry.quotation = preference;
				filterEntry.add(entry);
				relinker.add(newVal,p,operandRegExp.lastIndex);
			}
			p = operandRegExp.lastIndex;
		}
	}
	if (filterEntry.children.length > 0) {
		filterEntry.output = relinker.results();
		return filterEntry;
	}
	return undefined;
};

/* Same as this.relink, except this has the added constraint that the return
 * value must be able to be wrapped in curly braces. (i.e. '{{{...}}}')
 */
exports.relinkInBraces = function(filter, fromTitle, toTitle, options) {
	var braceOptions = $tw.utils.extend({inBraces: true}, options);
	var entry = this.relink(filter, fromTitle, toTitle, braceOptions);
	if (entry && entry.output && !canBeInBraces(entry.output)) {
		// It was possible, but it won't fit in braces, so we must give up
		delete entry.output;
		entry.impossible = true;
	}
	return entry;
};

function wrapTitle(value, preference) {
	var choices = {
		"": function(v) {return /^[^\s\[\]]*[^\s\[\]\}]$/.test(v); },
		"[": canBePrettyOperand,
		"'": function(v) {return v.indexOf("'") < 0; },
		'"': function(v) {return v.indexOf('"') < 0; }
	};
	var wrappers = {
		"": function(v) {return v; },
		"[": function(v) {return "[["+v+"]]"; },
		"'": function(v) {return "'"+v+"'"; },
		'"': function(v) {return '"'+v+'"'; }
	};
	if (choices[preference]) {
		if (choices[preference](value)) {
			return wrappers[preference](value);
		}
	}
	for (var quote in choices) {
		if (choices[quote](value)) {
			return wrappers[quote](value);
		}
	}
	// No quotes will work on this
	return undefined;
}

function parseFilterOperation(relinker, fromTitle, toTitle, logger, filterString, p, whitelist, options) {
	var nextBracketPos, operator;
	// Skip the starting square bracket
	if(filterString.charAt(p++) !== "[") {
		// Missing [ in filter expression
		return undefined;
	}
	// Process each operator in turn
	do {
		operator = {};
		// Check for an operator prefix
		if(filterString.charAt(p) === "!") {
			operator.prefix = "!";
			p++;
		}
		// Get the operator name
		nextBracketPos = filterString.substring(p).search(/[\[\{<\/]/);
		if(nextBracketPos === -1) {
			// Missing [ in filter expression
			return undefined;
		}
		nextBracketPos += p;
		var bracket = filterString.charAt(nextBracketPos);
		operator.operator = filterString.substring(p,nextBracketPos);

		// Any suffix?
		var colon = operator.operator.indexOf(':');
		if(colon > -1) {
			operator.suffix = operator.operator.substring(colon + 1);
			operator.operator = operator.operator.substring(0,colon) || "field";
		}
		// Empty operator means: title
		else if(operator.operator === "") {
			operator.operator = "title";
		}

		var entry = undefined, type;

		p = nextBracketPos + 1;
		switch (bracket) {
			case "{": // Curly brackets
				type = "indirect";
				nextBracketPos = filterString.indexOf("}",p);
				var operand = filterString.substring(p,nextBracketPos);
				entry = refHandler.relinkInBraces(operand, fromTitle, toTitle, options);
				if (entry && entry.output) {
					// We don't check the whitelist.
					// All indirect operands convert.
					relinker.add(entry.output,p,nextBracketPos);
				}
				break;
			case "[": // Square brackets
				type = "string";
				nextBracketPos = filterString.indexOf("]",p);
				var operand = filterString.substring(p,nextBracketPos);
				// Check if this is a relevant operator
				var handler = fieldType(whitelist, operator);
				if (!handler) {
					// This operator isn't managed. Bye.
					break;
				}
				entry = handler.relink(operand, fromTitle, toTitle, options);
				if (!entry) {
					// The fromTitle wasn't in the operand.
					break;
				}
				if (!entry.output) {
					break;
				}
				var wrapped;
				if (!canBePrettyOperand(entry.output) || (options.inBraces && entry.output.indexOf('}}}') >= 0)) {
					if (!options.placeholder) {
						delete entry.output;
						entry.impossible = true;
						break;
					}
					var ph = options.placeholder.getPlaceholderFor(entry.output, handler.name, options);
					wrapped = "<"+ph+">";
				} else {
					wrapped = "["+entry.output+"]";
				}
				relinker.add(wrapped, p-1, nextBracketPos+1);
				break;
			case "<": // Angle brackets
				nextBracketPos = filterString.indexOf(">",p);
				break;
			case "/": // regexp brackets
				var rex = /^((?:[^\\\/]*|\\.)*)\/(?:\(([mygi]+)\))?/g,
					rexMatch = rex.exec(filterString.substring(p));
				if(rexMatch) {
					nextBracketPos = p + rex.lastIndex - 1;
				}
				else {
					// Unterminated regular expression
					return undefined;
				}
				break;
		}
		if (entry) {
			var operatorEntry = new OperatorEntry(entry);
			operatorEntry.operator = operator;
			operatorEntry.type = type;
			logger.add(operatorEntry);
		}

		if(nextBracketPos === -1) {
			// Missing closing bracket in filter expression
			// return undefined;
		}
		p = nextBracketPos + 1;

	} while(filterString.charAt(p) !== "]");
	// Skip the ending square bracket
	if(filterString.charAt(p++) !== "]") {
		// Missing ] in filter expression
		return undefined;
	}
	// Return the parsing position
	return p;
}

// Returns the relinker needed for a given operator, or returns undefined.
function fieldType(whitelist, operator) {
	return (operator.suffix &&
	        whitelist[operator.operator + ":" + operator.suffix]) ||
	        whitelist[operator.operator];
};

function canBePrettyOperand(value) {
	return value.indexOf(']') < 0;
};

function canBeInBraces(value) {
	return value.indexOf("}}}") < 0 && value.substr(value.length-2) !== '}}';
};
