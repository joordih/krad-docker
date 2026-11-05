import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { encodeFrame, FrameDecoder } from "@krad-ade/extension";

const root = fileURLToPath(new URL("..", import.meta.url));
const fakeBin = fileURLToPath(new URL("./fixtures/bin", import.meta.url));

function start() {
  const calls = join(mkdtempSync(join(tmpdir(), "krad-docker-")), "calls.log");
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: root,
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_DOCKER_CALLS: calls },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const decoder = new FrameDecoder();
  const inbox = [];
  const waiting = [];
  child.stdout.on("data", (chunk) => {
    for (const message of decoder.push(chunk)) {
      const waiter = waiting.shift();
      if (waiter) waiter(message);
      else inbox.push(message);
    }
  });
  const next = () => (inbox.length > 0 ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiting.push(resolve)));
  const send = (message) => child.stdin.write(encodeFrame({ jsonrpc: "2.0", ...message }));
  async function expectReply(id) {
    for (;;) {
      const message = await next();
      if (message.method === "settings/get") {
        send({ id: message.id, result: { "show-stopped": true } });
        continue;
      }
      if (message.id === id && message.method === undefined) return message;
    }
  }
  return { child, send, next, expectReply, calls: () => readFileSync(calls, "utf8") };
}

const INIT = {
  app: { name: "Krad ADE", version: "0.3.0" },
  api: "1.0",
  placement: "app",
  extension_folder: root,
  features: ["views", "commands", "tools", "host_kinds"],
};

test("the program renders containers, answers tools and lists machines through the fake docker", async (t) => {
  const program = start();
  t.after(() => program.child.kill());
  program.send({ id: 1, method: "initialize", params: INIT });
  const init = await program.expectReply(1);
  assert.ok(init.result.features.includes("host_kinds"));

  program.send({ id: 2, method: "view/render", params: { view: "containers" } });
  const view = await program.expectReply(2);
  const tree = view.result.children[1];
  assert.equal(tree.type, "tree");
  assert.deepEqual(tree.items.map((item) => item.label), ["shop", "Standalone"]);
  assert.equal(tree.items[0].children.length, 3);

  program.send({ id: 3, method: "tool/call", params: { tool: "restart_container", arguments: { container: "cache" } } });
  const restarted = await program.expectReply(3);
  assert.deepEqual(restarted.result.content, [{ type: "text", text: "Restarted cache." }]);
  assert.match(program.calls(), /^restart cache$/m);

  program.send({ id: 4, method: "host/list", params: { kind: "container" } });
  const machines = await program.expectReply(4);
  assert.deepEqual(machines.result.map((machine) => machine.label), ["shop-db-1", "shop-web-1", "cache"]);

  program.send({ id: 5, method: "host/connect", params: { kind: "container", machine: "cache" } });
  const channel = await program.expectReply(5);
  assert.deepEqual(channel.result.command, { program: "docker", args: ["exec", "-i", "cache", "sh"] });

  program.send({ id: 6, method: "tool/call", params: { tool: "drop_tables", arguments: {} } });
  assert.ok((await program.expectReply(6)).error);
});
