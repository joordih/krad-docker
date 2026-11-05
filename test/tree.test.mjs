import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseImages, parseInspect, parsePs, shellArgs } from "../dist/docker.js";
import { containerControls, containersTree, containersView, containerView, LOGS_KEY, TREE_KEY } from "../dist/tree.js";

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
  assert.equal(view.children[0].children[0].action, "new-container");
  assert.equal(view.children[1].key, TREE_KEY);
  assert.equal(view.children[1].type, "tree");
  const missing = containersView("Docker is not reachable: spawn docker ENOENT");
  assert.equal(missing.children[0].type, "text");
});

test("a container tab shows its details and a log stream", () => {
  const view = containerView(parseInspect(fixture("inspect.json")), "a1b2");
  const types = view.children.map((child) => child.type);
  assert.deepEqual(types, ["text", "flex", "details", "divider", "text", "stream"]);
  assert.equal(view.children[5].key, LOGS_KEY);
});

const IMAGES = [
  '{"ID":"sha256:aaa111","Repository":"nginx","Tag":"alpine","Size":"52MB","CreatedSince":"2 weeks ago"}',
  '{"ID":"sha256:bbb222","Repository":"<none>","Tag":"<none>","Size":"10MB","CreatedSince":"3 days ago"}',
].join("\n");

test("images list under their own collapsed group with a remove action", () => {
  const view = containersView(parsePs(fixture("ps-running.jsonl")), parseImages(IMAGES));
  const items = view.children[1].items;
  const images = items[items.length - 1];
  assert.equal(images.key, "images");
  assert.equal(images.expansion, "collapsed");
  assert.deepEqual(images.children.map((image) => image.label), ["bbb222", "nginx:alpine"]);
  assert.equal(images.children[1].key, "image:sha256:aaa111");
  assert.deepEqual(images.children[1].actions.map((action) => action.action), ["run-image", "remove-image"]);
});

test("a running container tab offers stop, restart and a shell; a stopped one offers start", () => {
  const running = parseInspect(fixture("inspect.json"));
  const actions = (node) => node.children.map((button) => button.action);
  assert.deepEqual(actions(containerControls({ ...running, state: "running" })), ["stop", "restart", "exec"]);
  assert.deepEqual(actions(containerControls({ ...running, state: "exited" })), ["start"]);
});

test("the shell prefers bash and falls back to sh", () => {
  const args = shellArgs("web");
  assert.deepEqual(args.slice(0, 4), ["exec", "-it", "web", "sh"]);
  assert.match(args[5], /bash/);
  assert.match(args[5], /exec sh/);
});

test("a listing puts folders first and builds absolute paths", async () => {
  const { parseListing, childPath } = await import("../dist/docker.js");
  const entries = parseListing("/etc", "nginx/\nhostname\napk/\n./\n../\n");
  assert.deepEqual(entries.map((entry) => entry.name), ["apk", "nginx", "hostname"]);
  assert.equal(entries[2].path, "/etc/hostname");
  assert.equal(entries[0].isDir, true);
  assert.equal(childPath("/", "bin"), "/bin");
});

test("folders expand lazily and files offer open and upload", async () => {
  const { fileItem } = await import("../dist/tree.js");
  const folder = fileItem({ name: "etc", path: "/etc", isDir: true });
  assert.equal(folder.key, "path:/etc");
  assert.equal(folder.expansion, "collapsed");
  const opened = fileItem({ name: "etc", path: "/etc", isDir: true }, []);
  assert.equal(opened.expansion, "expanded");
  const file = fileItem({ name: "hostname", path: "/etc/hostname", isDir: false });
  assert.deepEqual(file.actions.map((action) => action.action), ["open-file", "upload-file"]);
});

test("a run spec is checked and turned into docker run arguments", async () => {
  const { checkRun, listOf, runArgs, wordsOf } = await import("../dist/docker.js");
  const spec = {
    image: "nginx:alpine",
    name: "web-2",
    ports: listOf("8081:80, 8443:443/tcp"),
    env: listOf("MODE=dev\nDEBUG=1"),
    volumes: listOf("./site:/usr/share/nginx/html:ro"),
    command: wordsOf("nginx -g 'daemon off;'"),
    restart: "unless-stopped",
  };
  assert.deepEqual(checkRun(spec), []);
  assert.deepEqual(runArgs(spec).slice(0, 8), ["run", "--detach", "--name", "web-2", "--restart", "unless-stopped", "--publish", "8081:80"]);
  assert.ok(runArgs(spec).includes("--env") && runArgs(spec).includes("--volume"));
  const fields = (problems) => problems.map((problem) => problem.field);
  assert.deepEqual(fields(checkRun({ ...spec, image: "" })), ["image"]);
  assert.deepEqual(fields(checkRun({ ...spec, ports: ["80"] , env: ["nope"], volumes: ["data"] })), ["env", "volumes"]);
  assert.deepEqual(fields(checkRun({ ...spec, name: "bad name" })), ["name"]);
});

test("the new container form is prefilled with the chosen image", async () => {
  const { newContainerView } = await import("../dist/tree.js");
  const view = newContainerView("alpine:3");
  const form = view.children.find((child) => child.type === "form");
  assert.equal(form.submit, "create-container");
  assert.equal(form.fields.find((field) => field.key === "image").value, "alpine:3");
});
