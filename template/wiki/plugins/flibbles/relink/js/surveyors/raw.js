/*\

This looks at text and sees if fromTitle is inside of it. That's all.

SURVEYORS

Surveyors are an optimization. They are way of quick-discarding text so it
doesn't have to be interpreted by the wikitext parser, the filter parser,
etc...

The reason I split this off into a module type is in case anyone wants to
relink patterns which might NOT contain the fromTitle in raw text.

They return false for "no", and true for "maybe". If any surveyor returns
"maybe", the text in question is fully parsed.

See the documentation for more details.

\*/

exports.survey = function(text, fromTitle, options) {
	return text.indexOf(fromTitle) >= 0;
};
