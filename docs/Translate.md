# How to translate

## Add your language to supportedLanguages.json

It is located in `localization/supportedLanguages.json`.

Add your language, make it looks like:

```json
{
  "en": "English",
  "fr": "Français",
  "ja": "日本語",
  "ru": "русский",
  "vi": "Tiếng Việt",
  "zh_CN": "简中"
}
```

And update `localization/tiddlywikiLanguages.json` too!

## Add translate

Create a folder like `localization/locales/en`, with `localization/locales/yourlanguagename/translation.json` inside.

Fill in the JSON like how other `translation.json` fills.

You can use [i18n ally vscode plugin](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally) to speed it up! It can auto translate, and count the missing translate keys in each languages.
