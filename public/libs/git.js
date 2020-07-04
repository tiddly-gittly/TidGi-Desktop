const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');

async function initWikiGit(wikiFolderPath, githubRepoUrl, userInfo) {
  const gitUrl = `${githubRepoUrl}.git`;
  const { login: name, email, accessToken } = userInfo;
  const author = {
    name,
    email,
  };
  const onAuth = () => ({
    username: name,
    password: accessToken,
  });
  await git.init({ fs, dir: wikiFolderPath });
  await git.add({ fs, dir: wikiFolderPath, filepath: '.' });
  await git.commit({
    fs,
    dir: wikiFolderPath,
    author,
    message: 'Initialize with TiddlyGit-Desktop',
  });
  await git.addRemote({
    fs,
    dir: wikiFolderPath,
    remote: 'origin',
    url: gitUrl,
  });
  try {
    await git.pull({
      fs,
      http,
      author,
      onAuth,
      dir: wikiFolderPath,
      ref: 'origin',
      singleBranch: true,
    });
  } catch {
    await git.push({
      fs,
      http,
      dir: wikiFolderPath,
      remote: 'origin',
      ref: 'master',
      onAuth,
    });
  }
}

module.exports = {
  initWikiGit,
};
