# TiddlyGit [![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](LICENSE)

| macOS                                                                                                                                                                                                   | Linux                                                                                                                                                                                                   | Windows                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![GitHub Actions macOS Build Status](https://github.com/tiddly-gittly/TiddlyGit-Desktop/workflows/macOS/badge.svg)](https://github.com/tiddly-gittly/TiddlyGit-Desktop/actions?query=workflow%3AmacOS) | [![GitHub Actions Linux Build Status](https://github.com/tiddly-gittly/TiddlyGit-Desktop/workflows/Linux/badge.svg)](https://github.com/tiddly-gittly/TiddlyGit-Desktop/actions?query=workflow%3ALinux) | [![GitHub Actions Windows Build Status](https://github.com/tiddly-gittly/TiddlyGit-Desktop/workflows/Windows/badge.svg)](https://github.com/tiddly-gittly/TiddlyGit-Desktop/actions?query=workflow%3AWindows) |

**TiddlyGit** - Customizable personal knowledge-base with Github as unlimited storage and blogging platform.

[![GitHub Releases](https://img.shields.io/github/downloads/tiddly-gittly/TiddlyGit-Desktop/latest/total?label=Download%20Latest%20Release&style=for-the-badge)](https://github.com/tiddly-gittly/TiddlyGit-Desktop/releases/latest)

For windows users (I'm personally using MacOS), I'm recently lacking time to maintain the Windows build, so there are some bug on it, but I know where the issue is, if you can help please contact me via email or issue.

<details>
<summary>For mac users, since I haven't buy Apple developer key yet, so you have to entrust App to open it ◀</summary>

Click "Cancel" ↓

![step00001](https://user-images.githubusercontent.com/3746270/87882506-eb1ddd80-ca32-11ea-942f-1f530767db02.png)

![step00002](https://user-images.githubusercontent.com/3746270/87882509-ece7a100-ca32-11ea-8d29-a4977201090d.png)

![step00003](https://user-images.githubusercontent.com/3746270/87882510-ed803780-ca32-11ea-8996-0f3c7060131a.png)

Click "Open" ↓

![step00004](https://user-images.githubusercontent.com/3746270/87882512-ee18ce00-ca32-11ea-8225-045ffc0a8b86.png)

Click "OK" ↓

![step00005](https://user-images.githubusercontent.com/3746270/87882514-eeb16480-ca32-11ea-9afd-cae6f2bea2db.png)

</details>

## About TiddlyGit-Desktop

TiddlyGit is a cross-platform Note Taking & GTD & Fragment Knowledge Management desktop app powered by [nodejs-TiddlyWiki](https://github.com/Jermolene/TiddlyWiki5#installing-tiddlywiki-on-nodejs) and Github, it ship with a lot of tiddlywiki plugins from the [TiddlyWiki community](https://groups.google.com/forum/#!forum/tiddlywiki).

You can call it TG-Note, it is totally free and you own all your data. Code by the people, build for the people.

![Screenshot of main-window](./docs/images/main-window.png)
![Screenshot of add-workspace](./docs/images/add-workspace.png)
![Screenshot of preference](./docs/images/preference.png)

### Why Github?

Because Github is one of the best free civil level [BaaS](https://www.alibabacloud.com/blog/backend-as-a-service-baas-for-efficient-software-development_519851):

1. Its storage is basically free, allow us to store unlimited images and pdf files, which can have permanent URIs for public download
1. It has GraphQL API that allow us programmatically update our wiki
1. It has free [CI](https://github.com/features/actions) to automatically deploy our TiddlyWiki blog
1. It provides unlimited repository, public and private, which enables us to store private content into our TiddlyWiki

### Why not [TiddlyDesktop](https://github.com/Jermolene/TiddlyDesktop)?

Main reasons:

1. NodeJS version of TiddlyWiki have seamless auto-save experience, which is taking the advantage of SyncAdaptor instead of Saver, TG have better support for NodeJS wiki
1. Using NodeJS wiki, We can have separated tiddler files, which can be modified by hand, or by other programs (e.g. VSCode with [VSCode-TW5-Syntax](https://github.com/joshuafontany/VSCode-TW5-Syntax))
1. Though TiddlyDesktop can load wiki folder generated by nodejs-TiddlyWiki, it can't backup that folder to the Github easily like TG does
1. With the electron as a shell, I can use `fs`, `git` and many other nodejs things within TiddlyWiki, which greatly extend the hackability, which is the reason why I choose TiddlyWiki as my daily KM tool

### Download

Just download it from Github Release [Free Download](https://github.com/tiddly-gittly/TiddlyGit-Desktop/releases/latest)

You can also find changelog in the Release.

## Development

Development plan of TiddlyGit-Desktop is listed in these [Kanban](https://github.com/tiddly-gittly/TiddlyGit-Desktop/projects).

Explanation of our code can be found in the [Wiki](https://github.com/tiddly-gittly/TiddlyGit-Desktop/wiki).

<details>
<summary>To contribute, fork this repo, then clone it and setup development environment</summary>
 
```shell
# First, clone the project:
git clone https://github.com/YOUR_ACCOUNT/TiddlyGit-Desktop.git
cd TiddlyGit-Desktop
# Or maybe you are just using Github Desktop
# or GitKraken to clone this repo,
# and open it in your favorite code editor and terminal app

# install the dependencies

npm i

# Run development mode

npm run electron-dev

# Build for production

npm run dist

```

### Publish

Add a tag like `vx.x.x` to a commit, and push it to the origin, Github will start building App for all three platforms.

After Github Action completed, you can open Releases to see the Draft release created by Github, add some comment and publish it.

</details>

## Credits

The desktop app shell is based on [https://github.com/atomery/singlebox](atomery/singlebox) and [atomery/webcatalog](https://github.com/atomery/webcatalog), they provide lots of utils around website-generated-app, much powerful than generating app from website simply using Chrome. Also the independent developer @quanglam2807 behind these great tools helps me a lot when I develop TiddlyGit.

Current Icon is download from [iconsdb](https://www.iconsdb.com/custom-color/github-11-icon.html) under Creative Commons Attribution-NoDerivs 3.0 , if you are a designer, please feel free to contribute your ICON if you have a better idea.
