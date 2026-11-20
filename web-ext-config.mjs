export default {
  ignoreFiles: [
    "web-ext-artifacts/**",
    ".github/**",
    ".eta/**",
    ".git/**",
    "docs/**",
    "docs",
    "FEATURES-GAP.md",
    "REVIEW*.md",
    "package.json",
    "package-lock.json",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "web-ext-config.mjs",
    "*.zip",
    "*.xpi"
  ],
  build: {
    overwriteDest: true
  }
};
