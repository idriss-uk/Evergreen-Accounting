"use strict";
const fs = require("node:fs"),
  { execFileSync } = require("node:child_process");
for (const name of fs
  .readdirSync("tests")
  .filter((name) => name.endsWith("-browser.test.cjs"))
  .sort()) {
  execFileSync(process.execPath, ["tests/" + name], { stdio: "inherit" });
}
