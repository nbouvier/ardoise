/* global jest */
// Gestures and animations run in plain JS under Jest: gesture-handler's own
// mocks, and Reanimated's worklets as ordinary functions.
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

require('react-native-reanimated').setUpTests();
