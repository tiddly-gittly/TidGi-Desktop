/*\
module-type: library

Utility methods for the wikitext relink rules.

\*/

/**Finds an appropriate quote mark for a given value.
 *
 *Tiddlywiki doesn't have escape characters for attribute values. Instead,
 * we just have to find the type of quotes that'll work for the given title.
 * There exist titles that simply can't be quoted.
 * If it can stick with the preference, it will.
 *
 * return: Returns the wrapped value, or undefined if it's impossible to wrap
 */
exports.wrapAttributeValue = function(value, preference) {
	var whitelist = ["", "'", '"', '"""'];
	var choices = {
		"": function(v) {return !/([\/\s<>"'=])/.test(v); },
		"'": function(v) {return v.indexOf("'") < 0; },
		'"': function(v) {return v.indexOf('"') < 0; },
		'"""': function(v) {return v.indexOf('"""') < 0 && v[v.length-1] != '"';}
	};
	if (choices[preference] && choices[preference](value)) {
		return wrap(value, preference);
	}
	for (var i = 0; i < whitelist.length; i++) {
		var quote = whitelist[i];
		if (choices[quote](value)) {
			return wrap(value, quote);
		}
	}
	// No quotes will work on this
	return undefined;
};

/**Like wrapAttribute value, except for macro parameters, not attributes.
 *
 * These are more permissive. Allows brackets,
 * and slashes and '<' in unquoted values.
 */
exports.wrapParameterValue = function(value, preference) {
	var whitelist = ["", "'", '"', '[[', '"""'];
	var choices = {
		"": function(v) {return !/([\s>"'=])/.test(v); },
		"'": function(v) {return v.indexOf("'") < 0; },
		'"': function(v) {return v.indexOf('"') < 0; },
		"[[": exports.canBePrettyOperand,
		'"""': function(v) {return v.indexOf('"""') < 0 && v[v.length-1] != '"';}
	};
	if (choices[preference] && choices[preference](value)) {
		return wrap(value, preference);
	}
	for (var i = 0; i < whitelist.length; i++) {
		var quote = whitelist[i];
		if (choices[quote](value)) {
			return wrap(value, quote);
		}
	}
	// No quotes will work on this
	return undefined;
};

function wrap(value, wrapper) {
	var wrappers = {
		"": function(v) {return v; },
		"'": function(v) {return "'"+v+"'"; },
		'"': function(v) {return '"'+v+'"'; },
		'"""': function(v) {return '"""'+v+'"""'; },
		"[[": function(v) {return "[["+v+"]]"; }
	};
	var chosen = wrappers[wrapper];
	if (chosen) {
		return chosen(value);
	} else {
		return undefined;
	}
};

exports.canBePrettyOperand = function(value) {
	return value.indexOf(']') < 0;
};

/**Given some text, and a param or  attribute within that text, this returns
 * what type of quotation that attribute is using.
 *
 * param: An object in the form {end:, ...}
 */
exports.determineQuote = function(text, param) {
	var pos = param.end-1;
	if (text[pos] === "'") {
		return "'";
	}
	if (text[pos] === '"') {
		if (text.substr(pos-2, 3) === '"""') {
			return '"""';
		} else {
			return '"';
		}
	}
	if (text.substr(pos-1,2) === ']]' && text.substr((pos-param.value.length)-3, 2) === '[[') {
		return "[[";
	}
	return '';
};

// Finds the newline at the end of a string and returns it. Empty string if
// none exists.
exports.getEndingNewline = function(string) {
	var l = string.length;
	if (string[l-1] === '\n') {
		return (string[l-2] === '\r') ? "\r\n" : "\n";
	}
	return "";
};
