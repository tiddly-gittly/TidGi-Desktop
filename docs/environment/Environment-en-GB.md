
<!-- Exported from TiddlyWiki at 00:22, 19th 七月 2023 -->

# TidGi development environment configuration (Linux)

System environment: Linux Mint 21.1

Required tools: fastgithub, git, nvm, pnpm, node-gyp, vscode

### 1. fastgithub

> Only one proxy can be opened for linux and the host.

The repository & download address: <https://github.com/dotnetcore/FastGithub>

```sh
sudo . /fastgithub start // install and start with systemd service
sudo . /fastgithub stop // uninstall and remove with systemd service
```

Set the system auto-proxy to <http://localhost:38457>, select the auto-proxy method in System Settings - Network - Network Proxy, and fill in the URL <http://localhost:38457>即可. Sometimes inaccessible may need to set their own temporary manual proxy in the terminal, refer to the following written.

Manual proxy http/https is localhost:38457, or just type `export ALL_PROXY=http://localhost:38457`. Only valid in the current terminal.

```sh
export ALL_PROXY=http://localhost:38457
export http_proxy=http://localhost:38457
export https_proxy=https://localhost:38457
```

You also need to set up certificate validation, otherwise it won't work oh.

### Certificate validation

git operation prompts SSL certificate problem
You need to turn off git's certificate validation: `git config --global http.sslverify false`

firefox prompts for a potential security issue with the connection
Settings->Privacy and Security->Certificates->View Certificates->Certificate Authority, import `cacert/fastgithub.cer`, check the box "Trust this certificate authority to identify the site"

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