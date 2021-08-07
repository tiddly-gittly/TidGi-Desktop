/*\
This specifies logic for updating filters to reflect title changes.
\*/

var refHandler = require("$:/plugins/flibbles/relink/js/fieldtypes/reference");
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");

exports.name = "filter";

exports.report = function(filter, callback, options) {
	// I cheat here for now. Relink handles reporting too in cases where
	// fromTitle is undefined. toTitle is the callback in those cases.
	exports.relink(filter, undefined, callback, options);
};

/**Returns undefined if no change was made.
 */
exports.relink = function(filter, fromTitle, toTitle, options) {
	var relinker = new Rebuilder(filter),
		p = 0, // Current position in the filter string
		match, noPrecedingWordBarrier,
		wordBarrierRequired=false;
	var whitespaceRegExp = /\s+/mg,
		operandRegExp = /((?:\+|\-|~|=|\:\w+)?)(?:(\[)|(?:"([^"]*)")|(?:'([^']*)')|([^\s\[\]]+))/mg,
		blurbs = [];
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
				p += match[1].length;
			}
			if(match[2]) { // Opening square bracket
				// We check if this is a standalone title,
				// like `[[MyTitle]]`. We treat those like
				// `"MyTitle"` or `MyTitle`. Not like a run.
				var standaloneTitle = /\[\[([^\]]+)\]\]/g;
				standaloneTitle.lastIndex = p;
				var alone = standaloneTitle.exec(filter);
				if (!alone || alone.index != p) {
					if (fromTitle === undefined) {
						// toTitle is a callback method in this case.
						p =reportFilterOperation(filter, function(title, blurb){
							if (match[1]) {
								blurbs.push([title, match[1] + (blurb || '')]);
							} else {
								blurbs.push([title, blurb]);
							}
						},p,options.settings,options);
					} else {
						p =relinkFilterOperation(relinker,fromTitle,toTitle,filter,p,options.settings,options);
					}
					// It's a legit run
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
			if (fromTitle === undefined) {
				// Report it
				blurbs.push([val, match[1]]);
			} else if (val === fromTitle) {
				// Relink it
				var entry = {name: "title"};
				var newVal = wrapTitle(toTitle, preference);
				if (newVal === undefined || (options.inBraces && newVal.indexOf('}}}') >= 0)) {
					if (!options.placeholder) {
						relinker.impossible = true;
						p = operandRegExp.lastIndex;
						continue;
					}

					newVal = "[<"+options.placeholder.getPlaceholderFor(toTitle)+">]";
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
				if (entry.impossible) {
					relinker.impossible = true;
				}
				relinker.add(newVal,p,operandRegExp.lastIndex);
			}
			p = operandRegExp.lastIndex;
		}
	}
	if (fromTitle === undefined) {
		// We delay the blurb calls until now in case it's a malformed
		// filter string. We don't want to report some, only to find out
		// it's bad.
		for (var i = 0; i < blurbs.length; i++) {
			toTitle(blurbs[i][0], blurbs[i][1]);
		}
	}
	if (relinker.changed() || relinker.impossible) {
		return {output: relinker.results(), impossible: relinker.impossible };
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

function relinkFilterOperation(relinker, fromTitle, toTitle, filterString, p, context, options) {
	var nextBracketPos, operator;
	// Skip the starting square bracket
	if(filterString.charAt(p++) !== "[") {
		// Missing [ in filter expression
		return undefined;
	}
	// Process each operator in turn
	operator = parseOperator(filterString, p);
	do {
		var entry = undefined, type;
		if (operator === undefined) {
			return undefined;
		}
		p = operator.opStart;
		switch (operator.bracket) {
			case "{": // Curly brackets
				type = "indirect";
				nextBracketPos = filterString.indexOf("}",p);
				var operand = filterString.substring(p,nextBracketPos);
				// We've got a live reference. relink or report
				entry = refHandler.relinkInBraces(operand, fromTitle, toTitle, options);
				if (entry && entry.output) {
					// We don't check the context.
					// All indirect operands convert.
					relinker.add(entry.output,p,nextBracketPos);
				}
				break;
			case "[": // Square brackets
				type = "string";
				nextBracketPos = filterString.indexOf("]",p);
				var operand = filterString.substring(p,nextBracketPos);
				// Check if this is a relevant operator
				var handler = fieldType(context, operator);
				if (!handler) {
					// This operator isn't managed. Bye.
					break;
				}
				entry = handler.relink(operand, fromTitle, toTitle, options);
				if (!entry || !entry.output) {
					// The fromTitle wasn't in the operand.
					break;
				}
				var wrapped;
				if (!canBePrettyOperand(entry.output) || (options.inBraces && entry.output.indexOf('}}}') >= 0)) {
					if (!options.placeholder) {
						delete entry.output;
						entry.impossible = true;
						break;
					}
					var ph = options.placeholder.getPlaceholderFor(entry.output, handler.name);
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
			if (entry.impossible) {
				relinker.impossible = true;
			}
		}

		if(nextBracketPos === -1) {
			// Missing closing bracket in filter expression
			return undefined;
		}
		p = nextBracketPos + 1;
		// Check for multiple operands
		switch (filterString.charAt(p)) {
		case ',':
			p++;
			if(/^[\[\{<\/]/.test(filterString.substring(p))) {
				operator.bracket = filterString.charAt(p);
				operator.opStart = p + 1;
				operator.index++;
			} else {
				return undefined;
			}
			continue;
		default:
			operator = parseOperator(filterString, p);
			continue;
		case ']':
		}
		break;
	} while(true);
	// Skip the ending square bracket
	if(filterString.charAt(p++) !== "]") {
		// Missing ] in filter expression
		return undefined;
	}
	// Return the parsing position
	return p;
}

function reportFilterOperation(filterString, callback, p, context, options) {
	var nextBracketPos, operator;
	// Skip the starting square bracket
	if(filterString.charAt(p++) !== "[") {
		// Missing [ in filter expression
		return undefined;
	}
	operator = parseOperator(filterString, p);
	// Process each operator in turn
	do {
		if (operator === undefined) {
			return undefined;
		}
		p = operator.opStart;
		switch (operator.bracket) {
			case "{": // Curly brackets
				nextBracketPos = filterString.indexOf("}",p);
				var operand = filterString.substring(p,nextBracketPos);
				// Just report it
				refHandler.report(operand, function(title, blurb) {
					callback(title, operatorBlurb(operator, '{' + (blurb || '') + '}'));
				}, options);
				break;
			case "[": // Square brackets
				nextBracketPos = filterString.indexOf("]",p);
				var operand = filterString.substring(p,nextBracketPos);
				// Check if this is a relevant operator
				var handler = fieldType(context, operator);
				if (!handler) {
					// This operator isn't managed. Bye.
					break;
				}
				// We just have to report it. Nothing more.
				handler.report(operand, function(title, blurb) {
					callback(title, operatorBlurb(operator, '[' + (blurb || '') + ']'));
				}, options);
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

		if(nextBracketPos === -1) {
			// Missing closing bracket in filter expression
			return undefined;
		}
		p = nextBracketPos + 1;
		// Check for multiple operands
		switch (filterString.charAt(p)) {
		case ',':
			p++;
			if(/^[\[\{<\/]/.test(filterString.substring(p))) {
				operator.bracket = filterString.charAt(p);
				operator.opStart = p + 1;
				operator.index++;
			} else {
				return undefined;
			}
			continue;
		default:
			operator = parseOperator(filterString, p);
			continue;
		case ']':
		}
		break;
	} while(true);
	// Skip the ending square bracket
	if(filterString.charAt(p++) !== "]") {
		// Missing ] in filter expression
		return undefined;
	}
	// Return the parsing position
	return p;
}

function parseOperator(filterString, p) {
	var nextBracketPos, operator = {index: 1};
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
	operator.bracket = filterString.charAt(nextBracketPos);
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
		operator.default = true;
	}
	operator.opStart = nextBracketPos + 1;
	return operator;
};

function operatorBlurb(operator, enquotedOperand) {
	var suffix = operator.suffix ? (':' + operator.suffix) : '';
	// commas to indicate which number operand
	suffix += (new Array(operator.index)).join(',');
	var op = operator.default ? '' : operator.operator;
	return '[' + (operator.prefix || '') + op + suffix + enquotedOperand + ']';
};

// Returns the relinker needed for a given operator, or returns undefined.
function fieldType(context, operator) {
	return (operator.suffix &&
	        context.getOperator(operator.operator + ':' + operator.suffix, operator.index)) ||
	        context.getOperator(operator.operator, operator.index);
};

function canBePrettyOperand(value) {
	return value.indexOf(']') < 0;
};

function canBeInBraces(value) {
	return value.indexOf("}}}") < 0 && value.substr(value.length-2) !== '}}';
};
