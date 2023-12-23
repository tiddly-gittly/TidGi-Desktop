<!-- Exported from TiddlyWiki at 01:33, 18th July 2023 -->

# TidGi开发环境配置（Linux）

系统环境：Linux Mint 21.1

需要的工具：Watt Toolkit(Steam++)、git、nvm、pnpm、node-gyp、vscode

## 1. Watt Toolkit(Steam++)

下载链接：https://github.com/BeyondDimension/SteamTools

1. 下载安装Watt Toolkit，然后打开软件。在网络加速侧边选项页面中，勾选GIthub加速，勾选启用脚本。
2. 加速模式选择系统代理，点一键加速。之后设置证书验证完成即可使用，不然无法使用哦。

### 证书验证

-  firefox提示连接有潜在的安全问题：
    - 设置->隐私与安全->证书->查看证书->证书颁发机构，导入`/home/username/.local/share/Steam++/SteamTools.Certificate`，勾选“信任由此证书颁发机构来标识网站”
- git操作提示SSL certificate problem：
    - 需要关闭git的证书验证：`git config --global http.sslverify false`

## 2. nvm

<https://github.com/nvm-sh/nvm#installing-and-updating>

执行 `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash` 等待完成。

若出现网络问题参考fastgithub解决。

安装NodeJS，你可以输入命令 `nvm install --lts` 安装长期支持版NodeJS。

## 3. pnpm

使用，用nvm安装的NodeJS中的npm命令安装pnpm，命令`npm install pnpm -g` 全局安装。

### 修改pnpm为npmmirror源

```sh
pnpm config set registry https://registry.npmmirror.com
pnpm config set electron_mirror https://npmmirror.com/mirrors/electron/

npm config set registry https://registry.npmmirror.com/
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

## 4. node-gyp

> 依赖环境： g++、make、python>3.7

请务必检查是否正确安装g++、make、python等软件包，否则你可能会面临很多报错，大部分报错都是因为这个依赖软件。

有些依赖报错是网络问题，有些依赖报错却是因为没有正确安装依赖软件。

大概也就这两类报错。

## 5. git

安装git `sudo apt install git`

配置用户名&邮箱：

```sh
git config --global user.name "github name"
git config --global user.email "user@outlook.com"
```

Git push时的鉴权

* Username：github用户名
* Password：github -> setting -> Developer settings -> Personal access tokens

## 6. vscode

下载地址： <https://code.visualstudio.com/download>

## 附加 fastgithub 加速工具

> fastgithub：linux 和 宿主机的代理只能开一个。

仓库&下载地址：<https://github.com/dotnetcore/FastGithub>

```sh
sudo ./fastgithub start // 以systemd服务安装并启动
sudo ./fastgithub stop // 以systemd服务卸载并删除
```

设置系统自动代理为<http://localhost:38457> ， 在系统设置 - 网络 - 网络代理中方法选自动代理，配置URL填入<http://localhost:38457>即可。有时无法访问可能需要自己在终端中设置临时手动代理，参考下面写的。

```sh
export ALL_PROXY=http://localhost:38457
export http_proxy=http://localhost:38457
export https_proxy=https://localhost:38457
```

手动代理http/https为localhost:38457，或者直接输入`export ALL_PROXY=http://localhost:38457`。仅在当前的终端有效。
