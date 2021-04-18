/* eslint-disable @typescript-eslint/no-unused-expressions */
import { setWorldConstructor, Given, Then, When } from '@cucumber/cucumber';
import { expect } from 'chai';
import { TiddlyGitWorld } from '../supports/world';

setWorldConstructor(TiddlyGitWorld);

Given('the app is launched', { timeout: 120 * 1000 }, async function (this: TiddlyGitWorld) {
  await this.start();
});

Then('the element {string} is on the page', { timeout: 120 * 1000 }, async function (this: TiddlyGitWorld, elementSelector: string) {
  const result = await this.getElement(elementSelector);
  expect(result).to.not.be.undefined;
  this.updateContext({ previousElement: result });
});
