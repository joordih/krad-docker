import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseInspect, parsePs } from "../dist/docker.js";
import { containersTree, containersView, containerView, LOGS_KEY, TREE_KEY } from "../dist/tree.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("containers group under their compose project, loose ones last", () => {
  const tree = containersTree(parsePs(fixture("ps-all.jsonl")));
  assert.deepEqual(tree.map((item) => item.key), ["project:shop", "standalone"]);
  const shop = tree[0];
  assert.equal(shop.description, "2/3 running");
  assert.deepEqual(shop.children.map((item) => item.label), ["db", "web", "worker"]);
  assert.equal(tree[1].children[0].label, "cache");
});

test("running containers offer stop and a shell, stopped ones offer start", () => {
  const [shop] = containersTree(parsePs(fixture("ps-all.jsonl")));
  const db = shop.children[0];
  assert.deepEqual(db.badge, { text: "running", tone: "success" });
  assert.deepEqual(db.actions.map((action) => action.action), ["stop", "restart", "remove"]);
  assert.ok(db.menu.some((action) => action.action === "exec"));
  const worker = shop.children[2];
  assert.deepEqual(worker.actions.map((action) => action.action), ["start", "remove"]);
  assert.ok(!worker.menu.some((action) => action.action === "exec"));
});

test("the sidebar view is a tree, or a message when Docker is missing", () => {
  const view = containersView(parsePs(fixture("ps-running.jsonl")));
  assert.equal(view.type, "flex");
  assert.equal(view.children[0].key, TREE_KEY);
  assert.equal(view.children[0].type, "tree");
  const missing = containersView("Docker is not reachable: spawn docker ENOENT");
  assert.equal(missing.children[0].type, "text");
});

test("a container tab shows its details and a log stream", () => {
  const view = containerView(parseInspect(fixture("inspect.json")), "a1b2");
  const types = view.children.map((child) => child.type);
  assert.deepEqual(types, ["text", "details", "divider", "text", "stream"]);
  assert.equal(view.children[4].key, LOGS_KEY);
});
