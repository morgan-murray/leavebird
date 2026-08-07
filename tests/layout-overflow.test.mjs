import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("keeps the app shell in normal document flow", () => {
  const appShell = rule(".app-shell");
  assert.match(appShell, /min-height:\s*100vh/);
  assert.match(appShell, /min-height:\s*100dvh/);
  assert.match(appShell, /overflow:\s*visible/);
  assert.doesNotMatch(appShell, /overflow:\s*hidden/);
});

test("clips only unintended horizontal overflow", () => {
  assert.match(rule("body"), /max-width:\s*100%/);
  assert.match(rule("body"), /overflow-x:\s*hidden/);
  assert.match(css, /@supports\(overflow:\s*clip\)\s*\{\s*body,\.app-shell\s*\{\s*overflow-x:\s*clip/);
});
