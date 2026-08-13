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
