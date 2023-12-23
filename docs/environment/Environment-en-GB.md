
<!-- Exported from TiddlyWiki at 00:22, 19th 七月 2023 -->

# TidGi development environment configuration (Linux)

System environment: Linux Mint 21.1

Required tools: Watt Toolkit(Steam++), git, nvm, pnpm, node-gyp, vscode

## 1. Watt Toolkit (Steam++)

Download link: https://github.com/BeyondDimension/SteamTools

1. Download and install Watt Toolkit, then open the software. In the Network Acceleration side options page, check GIthub Acceleration and check Enable Scripting.
2. Select System Proxy for Acceleration Mode and tap One Click Acceleration. After that, set the certificate verification to complete to use it, otherwise you can't use it.

### Certificate verification

- firefox suggests that there is a potential security problem with the connection:
    - Settings->Privacy and Security->Certificates->View Certificates->Certificate Authorities, import `/home/username/.local/share/Steam++/SteamTools.Certificate`, and check the box of "Trust this certificate authority to identify the website! Certificate`, check the box "Trust this certificate authority to identify the site".
- SSL certificate problem with git:
    - You need to turn off git's certificate verification: `git config --global http.sslverify false`.


### 2. nvm

<https://github.com/nvm-sh/nvm#installing-and-updating>

Execute `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash` and wait for it to finish.

If there is a network problem, refer to fastgithub to solve it.

To install NodeJS, you can enter the command `nvm install --lts` to install the long term support version of NodeJS.

### 3. pnpm

To use, install pnpm with the npm command in nvm install NodeJS, command `npm install pnpm -g` global install.

### Modify pnpm to be an npmmirror source

```sh
pnpm config set registry https://registry.npmmirror.com
pnpm config set electron_mirror https://npmmirror.com/mirrors/electron/

npm config set registry https://registry.npmmirror.com/
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
```

### 4. node-gyp

> dependent environment: g++, make, python>3.7

Please make sure to check if g++, make, python packages are installed correctly, otherwise you may face a lot of error reports, most of them are because of this dependency software.

Some dependency errors are due to network problems, while some dependency errors are due to not installing the dependencies correctly.

These are probably the only two types of errors.

### 5. git

Install git `sudo apt install git`.

Configure username & email:

```sh
git config --global user.name "github name"
git config --global user.email "user@outlook.com"
```

Authentication for Git push

* Username: github username
* Password: github -> setting -> Developer settings -> Personal access tokens

### 6. vscode

Download: <https://code.visualstudio.com/download>

## Attach fastgithub accelerator tool

> fastgithub: only one proxy for linux and host can be opened.

Repositories & downloads: <https://github.com/dotnetcore/FastGithub>

```sh
sudo . /fastgithub start // Install and start as systemd service
sudo . /fastgithub stop // Uninstall and remove as systemd service
```

To set the system autoproxy to <http://localhost:38457>, select Autoproxy in System Settings - Network - Network Proxy, and enter <http://localhost:38457> as the configuration URL. Sometimes you may need to set up a temporary manual proxy in the terminal, refer to the following.

```sh
export ALL_PROXY=http://localhost:38457
export http_proxy=http://localhost:38457
export https_proxy=https://localhost:38457
```

Manually proxy http/https to localhost:38457 or just type `export ALL_PROXY=http://localhost:38457`. Only works in the current terminal.
