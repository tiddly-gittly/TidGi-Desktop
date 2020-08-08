/*\
module-type: relinkwikitextrule

Handles macro calls.

<<myMacro '[[MyFilter]]' 'myTitle'>>

\*/

var utils = require("./utils.js");
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder");
var settings = require('$:/plugins/flibbles/relink/js/settings.js');
var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');

exports.name = ["macrocallinline", "macrocallblock"];

// Error thrown when a macro's definition is needed, but can't be found.
function CannotFindMacroDef() {};
CannotFindMacroDef.prototype.impossible = true;
CannotFindMacroDef.prototype.name = "macroparam";
// Failed relinks due to missing definitions aren't reported for now.
// I may want to do something special later on.
CannotFindMacroDef.prototype.report = function() { return []; };

var MacrocallEntry = EntryNode.newCollection("macrocall");

MacrocallEntry.prototype.forEachChildReport = function(report, parameter, type) {
	var rtn;
	if (report.length > 0) {
		rtn = parameter + ': "' + report + '"';
	} else {
		rtn = parameter;
	}
	return "<<" + this.macro + " " + rtn + ">>";
};


exports.relink = function(text, fromTitle, toTitle, options) {
	// Get all the details of the match
	var macroName = this.match[1],
		paramString = this.match[2],
		macroText = this.match[0];
	// Move past the macro call
	this.parser.pos = this.matchRegExp.lastIndex;
	if (!options.settings.survey(macroText, fromTitle, options)) {
		return undefined;
	}
	var start = this.matchRegExp.lastIndex - this.match[0].length;
	var managedMacro = options.settings.getMacro(macroName);
	if (!managedMacro) {
		// We don't manage this macro. Bye.
		return undefined;
	}
	var offset = macroName.length+2;
	offset = $tw.utils.skipWhiteSpace(macroText, offset);
	var params = parseParams(paramString, offset+start);
	var macroInfo = {
		name: macroName,
		start: start,
		end: this.matchRegExp.lastIndex,
		params: params
	};
	var mayBeWidget = !options.noWidgets;
	var names = getParamNames(macroInfo.name, macroInfo.params, options);
	if (names === undefined) {
		// Needed the definition, and couldn't find it. So if a single
		// parameter needs to placeholder, just fail.
		mayBeWidget = false;
	}
	var entry = relinkMacroInvocation(macroInfo, text, fromTitle, toTitle, mayBeWidget, options);
	if (entry && entry.output) {
		entry.output =macroToString(entry.output, text, names, options);
	}
	return entry;
};

/** Relinks macros that occur as attributes, like <$element attr=<<...>> />
 *  Processes the same, except it can't downgrade into a widget if the title
 *  is complicated.
 */
exports.relinkAttribute = function(macro, text, fromTitle, toTitle, options) {
	var entry = relinkMacroInvocation(macro, text, fromTitle, toTitle, false, options);
	if (entry && entry.output) {
		entry.output = macroToStringMacro(entry.output, text, options);
	}
	return entry;
};

/**Processes the given macro,
 * macro: {name:, params:, start:, end:}
 * each parameters: {name:, end:, value:}
 * Macro invocation returned is the same, but relinked, and may have new keys:
 * parameters: {type: macro, start:, newValue: (quoted replacement value)}
 * Output of the returned entry isn't a string, but a macro object. It needs
 * to be converted.
 */
function relinkMacroInvocation(macro, text, fromTitle, toTitle, mayBeWidget, options) {
	var managedMacro = options.settings.getMacro(macro.name);
	var modified = false;
	if (!managedMacro) {
		// We don't manage this macro. Bye.
		return undefined;
	}
	if (macro.params.every(function(p) {
		return !options.settings.survey(p.value, fromTitle, options);
	})) {
		// We cut early if the fromTitle doesn't even appear
		// anywhere in the title. This is to avoid any headache
		// about finding macro definitions (and any resulting
		// exceptions if there isn't even a title to replace.
		return undefined;
	}
	var outMacro = $tw.utils.extend({}, macro);
	var macroEntry = new MacrocallEntry();
	macroEntry.parameters = Object.create(null);
	outMacro.params = macro.params.slice();
	for (var managedArg in managedMacro) {
		var index;
		try {
			index = getParamIndexWithinMacrocall(macro.name, managedArg, macro.params, options);
		} catch (e) {
			if (e instanceof CannotFindMacroDef) {
				macroEntry.addChild(e);
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
		var entry = handler.relink(param.value, fromTitle, toTitle, options);
		if (entry === undefined) {
			continue;
		}
		// Macro parameters can only be string parameters, not
		// indirect, or macro, or filtered
		macroEntry.addChild(entry, managedArg, "string");
		if (!entry.output) {
			continue;
		}
		var quote = utils.determineQuote(text, param);
		var quoted = utils.wrapParameterValue(entry.output, quote);
		var newParam = $tw.utils.extend({}, param);
		if (quoted === undefined) {
			if (!mayBeWidget || !options.placeholder) {
				entry.impossible = true;
				continue;
			}
			var ph = options.placeholder.getPlaceholderFor(entry.output,handler.name, options);
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
	if (macroEntry.hasChildren()) {
		macroEntry.macro = macro.name;
		if (modified) {
			macroEntry.output = outMacro;
		}
		return macroEntry;
	}
	return undefined;
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
function getParamIndexWithinMacrocall(macroName, param, params, options) {
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
	var expectedIndex = indexOfParameterDef(macroName, param, options);
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
				var indexOfOther = indexOfParameterDef(macroName, params[i].name, options);
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
function indexOfParameterDef(macroName, paramName, options) {
	var def = options.settings.getMacroDefinition(macroName);
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

function getParamNames(macroName, params, options) {
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
		var def = options.settings.getMacroDefinition(macroName);
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
		var paramInfo = {
			value: paramMatch[2] || paramMatch[3] || paramMatch[4] || paramMatch[5] || paramMatch[6]
		};
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
