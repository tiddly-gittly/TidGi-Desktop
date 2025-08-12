import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { vi } from 'vitest';

configure({ computedStyleSupportsPseudoElements: false });
// Fix for JSDOM getComputedStyle issue - strip unsupported second parameter
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt) => originalGetComputedStyle.call(window, elt);

// 全局mock引入
import './__mocks__/window';
vi.mock('react-i18next', () => import('./__mocks__/react-i18next'));
vi.mock('@services/libs/log', () => import('./__mocks__/services-log'));
vi.mock('@services/container', () => import('./__mocks__/services-container'));
