import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { appVersionLabel } from './app-version';

const mockConfig: { version?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const mockUpdates: { channel: string | null; updateId: string | null; isEmbeddedLaunch: boolean } = {
  channel: null,
  updateId: null,
  isEmbeddedLaunch: true,
};
jest.mock('expo-updates', () => ({
  get channel() {
    return mockUpdates.channel;
  },
  get updateId() {
    return mockUpdates.updateId;
  },
  get isEmbeddedLaunch() {
    return mockUpdates.isEmbeddedLaunch;
  },
}));

beforeEach(() => {
  mockConfig.version = '1.0.0';
  mockUpdates.channel = 'staging';
  mockUpdates.updateId = '0123abcd-4567-89ef-0123-456789abcdef';
  mockUpdates.isEmbeddedLaunch = true;
});

describe('appVersionLabel', () => {
  it('says the JavaScript built into the binary is running', () => {
    expect(appVersionLabel()).toBe('Version 1.0.0 · staging · built-in');
  });

  it('names the over-the-air update running, by the start of its id', () => {
    mockUpdates.isEmbeddedLaunch = false;

    expect(appVersionLabel()).toBe('Version 1.0.0 · staging · update 0123abcd');
  });

  it('calls a build without a channel a development build', () => {
    mockUpdates.channel = null;
    mockUpdates.updateId = null;

    expect(appVersionLabel()).toBe('Version 1.0.0 · development · built-in');
  });
});
