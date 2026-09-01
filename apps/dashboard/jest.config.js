const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  moduleNameMapper: {
    // Resolve the workspace package from source rather than its built dist, matching what the
    // tsconfig path alias does for `next dev`/`next build`. Without this, tests would silently
    // run against a stale dist whenever shared-types changed but wasn't rebuilt.
    "^@saverlly/shared-types$": "<rootDir>/../../packages/shared-types/src/index.ts",
  },
};

const resolveConfig = createJestConfig(config);

// next/jest computes its own transformIgnorePatterns and ignores whatever we pass in `config`,
// so it's patched here after resolution — jose ships ESM-only and needs SWC to transform it.
module.exports = async () => {
  const resolved = await resolveConfig();
  resolved.transformIgnorePatterns = [
    "[\\\\/]node_modules[\\\\/](?!jose[\\\\/])",
    "^.+\\.module\\.(css|sass|scss)$",
  ];
  return resolved;
};
