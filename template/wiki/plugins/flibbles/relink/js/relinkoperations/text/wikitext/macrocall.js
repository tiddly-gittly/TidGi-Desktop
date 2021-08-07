/*\
module-type: relinkwikitextrule

Handles macro calls.

<<myMacro '[[MyFilter]]' 'myTitle'>>

\*/

var utils = require("./utils.js");
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");
var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');

exports.name = ["macrocallinline", "macrocallblock"];

// Error thrown when a macro's definition is needed, but can't be found.
function CannotFindMacroDef() {};
CannotFindMacroDef.prototype.impossible = true;
CannotFindMacroDef.prototype.name = "macroparam";
// Failed relinks due to missing definitions aren't reported for now.
// I may want to do something special later on.
CannotFindMacroDef.prototype.report = function() { return []; };

exports.report = function(text, callback, options) {
	var macroInfo = getInfoFromRule(this);
	this.parser.pos = macroInfo.end;
	this.reportAttribute(this.parser, macroInfo, callback, options);
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var macroInfo = getInfoFromRule(this);
	var managedMacro = this.parser.context.getMacro(macroInfo.name);
	this.parser.pos = macroInfo.end;
	if (!managedMacro) {
		// We don't manage this macro. Bye.
		return undefined;
	}
	var mayBeWidget = this.parser.context.allowWidgets();
	var names = getParamNames(this.parser, macroInfo.name, macroInfo.params, options);
	if (names === undefined) {
		// Needed the definition, and couldn't find it. So if a single
		// parameter needs to placeholder, just fail.
		mayBeWidget = false;
	}
	var entry = relinkMacroInvocation(this.parser, macroInfo, text, fromTitle, toTitle, mayBeWidget, options);
	if (entry && entry.output) {
		entry.output = macroToString(entry.output, text, names, options);
	}
	return entry;
};

/** Relinks macros that occur as attributes, like <$element attr=<<...>> />
 *  Processes the same, except it can't downgrade into a widget if the title
 *  is complicated.
 */
exports.relinkAttribute = function(parser, macro, text, fromTitle, toTitle, options) {
	var entry = relinkMacroInvocation(parser, macro, text, fromTitle, toTitle, false, options);
	if (entry && entry.output) {
		entry.output = macroToStringMacro(entry.output, text, options);
	}
	return entry;
};

/** As in, report a macrocall invocation that is an html attribute. */
exports.reportAttribute = function(parser, macro, callback, options) {
	var managedMacro = parser.context.getMacro(macro.name);
	if (!managedMacro) {
		// We don't manage this macro. Bye.
		return undefined;
	}
	for (var managedArg in managedMacro) {
		var index;
		try {
			index = getParamIndexWithinMacrocall(parser, macro.name, managedArg, macro.params, options);
		} catch (e) {
			continue;
		}
		if (index < 0) {
			// The argument was not supplied. Move on to next.
			continue;
		}
		var param = macro.params[index];
		var handler = managedMacro[managedArg];
		var nestedOptions = Object.create(options);
		nestedOptions.settings = parser.context;
		var entry = handler.report(param.value, function(title, blurb) {
			var rtn = managedArg;
			if (blurb) {
				rtn += ': "' + blurb + '"';
			}
			callback(title, '<<' + macro.name + ' ' + rtn + '>>');
		}, nestedOptions);
	}
};

/**Processes the given macro,
 * macro: {name:, params:, start:, end:}
 * each parameters: {name:, end:, value:}
 * Macro invocation returned is the same, but relinked, and may have new keys:
 * parameters: {type: macro, start:, newValue: (quoted replacement value)}
 * Output of the returned entry isn't a string, but a macro object. It needs
 * to be converted.
 */
function relinkMacroInvocation(parser, macro, text, fromTitle, toTitle, mayBeWidget, options) {
	var managedMacro = parser.context.getMacro(macro.name);
	var modified = false;
	if (!managedMacro) {
		// We don't manage this macro. Bye.
		return undefined;
	}
	var outMacro = $tw.utils.extend({}, macro);
	var macroEntry = {};
	outMacro.params = macro.params.slice();
	for (var managedArg in managedMacro) {
		var index;
		try {
			index = getParamIndexWithinMacrocall(parser, macro.name, managedArg, macro.params, options);
		} catch (e) {
			if (e instanceof CannotFindMacroDef) {
				macroEntry.impossible = true;
				continue;
			}
		}
		if (index < 0) {
			// this arg either was not supplied, or we can't find
			// the definition, so we can't tie it to an anonymous
			// argument. Either way, move on to the next.
			continue;
		}
		var param = macro.params[index];
		var handler = managedMacro[managedArg];
		var nestedOptions = Object.create(options);
		nestedOptions.settings = parser.context;
		var entry = handler.relink(param.value, fromTitle, toTitle, nestedOptions);
		if (entry === undefined) {
			continue;
		}
		// Macro parameters can only be string parameters, not
		// indirect, or macro, or filtered
		if (entry.impossible) {
			macroEntry.impossible = true;
		}
		if (!entry.output) {
			continue;
		}
		var quote = utils.determineQuote(text, param);
		var quoted = utils.wrapParameterValue(entry.output, quote);
		var newParam = $tw.utils.extend({}, param);
		if (quoted === undefined) {
			if (!mayBeWidget || !options.placeholder) {
				macroEntry.impossible = true;
				continue;
			}
			var ph = options.placeholder.getPlaceholderFor(entry.output,handler.name);
			newParam.newValue = "<<"+ph+">>";
			newParam.type = "macro";
		} else {
			newParam.start = newParam.end - (newParam.value.length + (quote.length*2));
			newParam.value = entry.output;
			newParam.newValue = quoted;
		}
		outMacro.params[index] = newParam;
		modified = true;
	}
	if (modified || macroEntry.impossible) {
		if (modified) {
			macroEntry.output = outMacro;
		}
		return macroEntry;
	}
	return undefined;
};

function getInfoFromRule(rule) {
	// Get all the details of the match
	var macroInfo = rule.nextCall;
	if (!macroInfo) {
		//  rule.match is used <v5.1.24
		var match = rule.match,
			offset = $tw.utils.skipWhiteSpace(match[0], match[1].length+2);
		macroInfo = {
			name: match[1],
			start: rule.matchRegExp.lastIndex - match[0].length,
			end: rule.matchRegExp.lastIndex,
		};
		macroInfo.params = parseParams(match[2], offset+macroInfo.start);
	}
	return macroInfo;
};

function mustBeAWidget(macro) {
	for (var i = 0; i < macro.params.length; i++) {
		if (macro.params[i].type === "macro") {
			return true;
		}
	}
	return false
};

/**Given a macro object ({name:, params:, start: end:}), and the text where
 * it was parsed from, returns a new macro that maintains any syntactic
 * structuring.
 */
function macroToString(macro, text, names, options) {
	if (mustBeAWidget(macro)) {
		var attrs = [];
		for (var i = 0; i < macro.params.length; i++) {
			var p = macro.params[i];
			var val;
			if (p.newValue) {
				val = p.newValue;
			} else {
				val = utils.wrapAttributeValue(p.value);
			}
			attrs.push(" "+names[i]+"="+val);
		}
		return "<$macrocall $name="+utils.wrapAttributeValue(macro.name)+attrs.join('')+"/>";
	} else {
		return macroToStringMacro(macro, text, options);
	}
};

function macroToStringMacro(macro, text, options) {
	var builder = new Rebuilder(text, macro.start);
	for (var i = 0; i < macro.params.length; i++) {
		var param = macro.params[i];
		if (param.newValue) {
			builder.add(param.newValue, param.start, param.end);
		}
	}
	return builder.results(macro.end);
};

/** Returns -1 if param definitely isn't in macrocall.
 */
function getParamIndexWithinMacrocall(parser, macroName, param, params, options) {
	var index, i, anonsExist = false;
	for (i = 0; i < params.length; i++) {
		var name = params[i].name;
		if (name === param) {
			return i;
		}
		if (name === undefined) {
			anonsExist = true;
		}
	}
	if (!anonsExist) {
		// If no anonymous parameters are present, and we didn't find
		// it among the named ones, it must not be there.
		return -1;
	}
	var expectedIndex = indexOfParameterDef(parser, macroName, param, options);
	// We've got to skip over all the named parameter instances.
	if (expectedIndex >= 0) {
		var anonI = 0;
		for (i = 0; i < params.length; i++) {
			if (params[i].name === undefined) {
				if (anonI === expectedIndex) {
					return i;
				}
				anonI++;
			} else {
				var indexOfOther = indexOfParameterDef(parser, macroName, params[i].name, options);
				if (indexOfOther < expectedIndex) {
					anonI++;
				}
			}
		}
	}
	return -1;
};

// Looks up the definition of a macro, and figures out what the expected index
// is for the given parameter.
function indexOfParameterDef(parser, macroName, paramName, options) {
	var def = parser.context.getMacroDefinition(macroName);
	if (def === undefined) {
		throw new CannotFindMacroDef();
	}
	var params = def.params || [];
	for (var i = 0; i < params.length; i++) {
		if (params[i].name === paramName) {
			return i;
		}
	}
	return -1;
};

function getParamNames(parser, macroName, params, options) {
	var used = Object.create(null);
	var rtn = new Array(params.length);
	var anonsExist = false;
	var i;
	for (i = 0; i < params.length; i++) {
		var name = params[i].name;
		if (name) {
			rtn[i] = name;
			used[name] = true;
		} else {
			anonsExist = true;
		}
	}
	if (anonsExist) {
		var def = parser.context.getMacroDefinition(macroName);
		if (def === undefined) {
			// If there are anonymous parameters, and we can't
			// find the definition, then we can't hope to create
			// a widget.
			return undefined;
		}
		var defParams = def.params || [];
		var defPtr = 0;
		for (i = 0; i < params.length; i++) {
			if (rtn[i] === undefined) {
				while(defPtr < defParams.length && used[defParams[defPtr].name]) {
					defPtr++;
				}
				if (defPtr >= defParams.length) {
					break;
				}
				rtn[i] = defParams[defPtr].name;
				used[defParams[defPtr].name] = true;
			}
		}
	}
	return rtn;
};

function parseParams(paramString, pos) {
	var params = [],
		reParam = /\s*(?:([A-Za-z0-9\-_]+)\s*:)?(?:\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)'|\[\[([^\]]*)\]\]|([^"'\s]+)))/mg,
		paramMatch = reParam.exec(paramString);
	while(paramMatch) {
		// Process this parameter
		var paramInfo = { };
		// We need to find the group match that isn't undefined.
		for (var i = 2; i <= 6; i++) {
			if (paramMatch[i] !== undefined) {
				paramInfo.value = paramMatch[i];
				break;
			}
		}
		if(paramMatch[1]) {
			paramInfo.name = paramMatch[1];
		}
		//paramInfo.start = pos;
		paramInfo.end = reParam.lastIndex + pos;
		params.push(paramInfo);
		// Find the next match
		paramMatch = reParam.exec(paramString);
	}
	return params;
};
