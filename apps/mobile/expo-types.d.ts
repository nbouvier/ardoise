// Expo's global types (CSS modules, `process.env.EXPO_PUBLIC_*`, fetch…). Expo also writes
// this reference into `expo-env.d.ts`, but only when its dev server starts, and that file
// is git-ignored: without this one, a fresh checkout (the CI) fails `tsc`.
// Keep it at the workspace root: loaded after the test files, it no longer wins over
// `@jest/globals` and every fetch mock stops typechecking.
/// <reference types="expo/types" />
