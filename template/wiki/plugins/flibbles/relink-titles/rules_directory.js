/*\
caption: {{$:/plugins/flibbles/relink-titles/language/Directory/Caption}}
description: {{$:/plugins/flibbles/relink-titles/language/Directory/Description}}
module-type: relinktitlesrule
title: $:/plugins/flibbles/relink-titles/rules/directory
type: application/javascript

Handles subdirectory renaming.

\*/

/*jslint node: false, browser: true */
/*global $tw: false */
"use strict";

exports.name = 'directory';

/**The report returns all parent directories of a given title which exist.
 */
exports.report = function(title, callback, options) {
	var index = -1;
	while ((index = title.indexOf('/', index+1)) >= 0) {
		var dir = title.substr(0, index);
		callback(dir, '.' + title.substr(index));
	}
};

/**The relink returns the new title (if any) derived from title for a given
 * rename of fromTitle to toTitle.
 */
exports.relink = function(title, fromTitle, toTitle, options) {
	var length = fromTitle.length;
	if (title.charAt(length) === '/' && title.substr(0, length) === fromTitle) {
		return {output: toTitle + title.substr(length)};
	}
	return undefined;
};
