const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');

function processUserInfo(userInfo) {
  const { login: name, email, accessToken } = userInfo;
  const author = {
    name,
    email,
  };
  const committer = {
    name: 'tiddly-git',
    email: 'tiddlygit@gmail.com',
  }
  const onAuth = () => ({
    username: name,
    password: accessToken,
  });
  return {
    author,
    committer,
    onAuth,
  };
}

async function commitFiles(wikiFolderPath, author, message = 'Initialize with TiddlyGit-Desktop') {
  await git.add({ fs, dir: wikiFolderPath, filepath: '.' });
  await git.commit({
    fs,
    dir: wikiFolderPath,
    author,
    message,
  });
}

async function initWikiGit(wikiFolderPath, githubRepoUrl, userInfo) {
  const gitUrl = `${githubRepoUrl}.git`;
  const { author, onAuth } = processUserInfo(userInfo);
  await git.init({ fs, dir: wikiFolderPath });
  await commitFiles(wikiFolderPath, author);
  await git.addRemote({
    fs,
    dir: wikiFolderPath,
    remote: 'origin',
    url: gitUrl,
  });
  await git.push({
    fs,
    http,
    dir: wikiFolderPath,
    remote: 'origin',
    ref: 'master',
    force: true,
    onAuth,
  });
}

async function commitAndSync(wikiFolderPath, githubRepoUrl, userInfo) {
  const { author, onAuth } = processUserInfo(userInfo);
  console.log(`Sync to cloud for ${wikiFolderPath} under ${JSON.stringify(author)}`);
  await commitFiles(wikiFolderPath, author, 'Wiki updated with TiddlyGit-Desktop');
  await git.pull({
    fs,
    http,
    author,
    onAuth,
    dir: wikiFolderPath,
    ref: 'master',
    // singleBranch: true,
  });
  await git.push({
    fs,
    http,
    dir: wikiFolderPath,
    remote: 'origin',
    ref: 'master',
    force: true,
    onAuth,
  });
  console.log(`${wikiFolderPath} Sync completed`);
}

module.exports = {
  initWikiGit,
  commitAndSync,
};
