import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseInspect, parsePs } from "../dist/docker.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("ps lines read into containers with their compose project and service", () => {
  const containers = parsePs(fixture("ps-all.jsonl"));
  assert.equal(containers.length, 4);
  assert.deepEqual(containers[0], {
    id: "a1b2c3d4e5f6a1b2c3d4e5f6",
    name: "shop-db-1",
    image: "postgres:16",
    state: "running",
    status: "Up 2 hours",
    project: "shop",
    service: "db",
  });
  assert.equal(containers[2].project, null);
  assert.equal(containers[3].state, "exited");
});

test("inspect output reads into ports, mounts and networks", () => {
  const inspected = parseInspect(fixture("inspect.json"));
  assert.equal(inspected.name, "shop-db-1");
  assert.equal(inspected.command, "docker-entrypoint.sh postgres");
  assert.deepEqual(inspected.ports, ["0.0.0.0:5432 → 5432/tcp", "9999/tcp"]);
  assert.deepEqual(inspected.networks, ["shop_default"]);
  assert.equal(inspected.restartCount, 2);
  assert.equal(parseInspect("[]"), null);
});
