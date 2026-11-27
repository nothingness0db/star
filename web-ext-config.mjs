export default {
  ignoreFiles: [
    "web-ext-artifacts/**",
    ".github/**",
    ".eta/**",
    ".git/**",
    "docs/**",
    "docs",
    "scripts/**",
    "scripts",
    "updates.json",
    ".amo-upload-uuid",
    "FEATURES-GAP.md",
    "REVIEW*.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "web-ext-config.mjs",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    "*.zip",
    "*.xpi"
  ],
  build: {
    overwriteDest: true
  }
};
