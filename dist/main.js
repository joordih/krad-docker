// src/main.ts
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

// node_modules/@krad-ade/extension/dist/view.js
function node(type, key, fields) {
  return { key, type, ...fields };
}
var ui = {
  flex: (key, children, options2 = {}) => node("flex", key, { ...options2, children }),
  row: (key, children, style = {}) => node("flex", key, { direction: "row", style, children }),
  column: (key, children, style = {}) => node("flex", key, { direction: "column", align: "stretch", style, children }),
  stack: (key, children, style = {}) => node("stack", key, { style, children }),
  grid: (key, columns, children, style = {}) => node("grid", key, { columns, style, children }),
  scroll: (key, children, direction = "column") => node("scroll", key, { direction, children }),
  text: (key, text, style = {}) => node("text", key, { text, style }),
  markdown: (key, text) => node("markdown", key, { text }),
  icon: (key, icon, color) => node("icon", key, { icon, color: color ?? null }),
  image: (key, source, width = "auto", height = "auto") => node("image", key, { source, width, height }),
  badge: (key, text, tone = "neutral") => node("badge", key, { text, tone }),
  spinner: (key) => node("spinner", key, {}),
  divider: (key) => node("divider", key, {}),
  button: (key, action, options2 = {}) => node("button", key, { action, ...options2 }),
  input: (key, action, options2 = {}) => node("input", key, { action, ...options2 }),
  toggle: (key, action, value, label) => node("toggle", key, { action, value, label: label ?? null }),
  select: (key, action, options2, value) => node("select", key, { action, options: options2, value: value ?? null }),
  list: (key, count, selection = "none") => node("list", key, { count, selection }),
  tree: (key, items) => node("tree", key, { items }),
  table: (key, columns, count, sort) => node("table", key, { columns, count, sort: sort ?? null }),
  form: (key, submit, fields, submitLabel) => node("form", key, { submit, fields, submit_label: submitLabel ?? null }),
  details: (key, entries) => node("details", key, { entries }),
  stream: (key, lines = [], maxLines) => node("stream", key, maxLines === void 0 ? { lines } : { lines, max_lines: maxLines }),
  terminal: (key, terminal) => node("terminal", key, { terminal })
};
var patch = {
  replace: (node2) => ({ op: "replace", node: node2 }),
  insert: (parent, index, node2) => ({ op: "insert", parent, index, node: node2 }),
  remove: (key) => ({ op: "remove", key }),
  setCount: (key, count) => ({ op: "set_count", key, count }),
  invalidate: (key) => ({ op: "invalidate", key }),
  replaceItem: (tree, item) => ({ op: "replace_item", tree, item }),
  append: (key, lines) => ({ op: "append", key, lines })
};

// node_modules/@krad-ade/extension/dist/framing.js
var HEADER_SEPARATOR = "\r\n\r\n";
var CONTENT_LENGTH = "content-length:";
var MAX_FRAME_BYTES = 64 * 1024 * 1024;
function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}${HEADER_SEPARATOR}`, "ascii"), body]);
}
var FrameError = class extends Error {
};
var FrameDecoder = class {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    for (; ; ) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) {
        return messages;
      }
      const length = contentLength(this.buffer.subarray(0, headerEnd).toString("ascii"));
      const start = headerEnd + HEADER_SEPARATOR.length;
      if (this.buffer.length < start + length) {
        return messages;
      }
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      messages.push(JSON.parse(body));
    }
  }
};
function contentLength(header) {
  const line = header.split("\r\n").find((candidate) => candidate.toLowerCase().startsWith(CONTENT_LENGTH));
  if (line === void 0) {
    throw new FrameError("a frame arrived without its Content-Length");
  }
  const length = Number.parseInt(line.slice(CONTENT_LENGTH.length).trim(), 10);
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_FRAME_BYTES) {
    throw new FrameError(`a frame announced an invalid length: ${line}`);
  }
  return length;
}

// node_modules/@krad-ade/extension/dist/rpc.js
var METHOD_NOT_FOUND = -32601;
var REQUEST_FAILED = -32803;
var JSONRPC = "2.0";
var RpcError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var Connection = class {
  output;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  decoder = new FrameDecoder();
  onRequest = (method) => {
    throw new RpcError(METHOD_NOT_FOUND, method);
  };
  onNotification = () => {
  };
  onClose = () => {
  };
  constructor(input, output) {
    this.output = output;
    input.on("data", (chunk) => this.receive(chunk));
    input.on("end", () => this.close());
  }
  handleRequests(handler) {
    this.onRequest = handler;
  }
  handleNotifications(handler) {
    this.onNotification = handler;
  }
  handleClose(handler) {
    this.onClose = handler;
  }
  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: JSONRPC, id, method, params });
    });
  }
  notify(method, params) {
    this.write({ jsonrpc: JSONRPC, method, params });
  }
  write(message) {
    this.output.write(encodeFrame(message));
  }
  receive(chunk) {
    for (const message of this.decoder.push(chunk)) {
      this.dispatch(message);
    }
  }
  dispatch(message) {
    if (message.method !== void 0 && message.id !== void 0) {
      void this.answer(message.id, message.method, message.params);
      return;
    }
    if (message.method !== void 0) {
      this.onNotification(message.method, message.params);
      return;
    }
    if (message.id === void 0) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === void 0) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error !== void 0) {
      pending.reject(new RpcError(message.error.code, message.error.message));
    } else {
      pending.resolve(message.result ?? null);
    }
  }
  async answer(id, method, params) {
    try {
      const result = await this.onRequest(method, params);
      this.write({ jsonrpc: JSONRPC, id, result: result ?? {} });
    } catch (error) {
      const code = error instanceof RpcError ? error.code : REQUEST_FAILED;
      const text = error instanceof Error ? error.message : String(error);
      this.write({ jsonrpc: JSONRPC, id, error: { code, message: text } });
    }
  }
  close() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("the app closed the connection"));
    }
    this.pending.clear();
    this.onClose();
  }
};

// node_modules/@krad-ade/extension/dist/extension.js
var App = class {
  connection;
  constructor(connection) {
    this.connection = connection;
  }
  request(method, params) {
    return this.connection.request(method, params);
  }
  notify(method, params) {
    this.connection.notify(method, params);
  }
  log(level, message) {
    this.notify("window/log", { level, message });
  }
  toast(message, tone = "neutral") {
    this.notify("window/toast", { message, tone });
  }
  progress(params) {
    this.notify("window/progress", params);
  }
  patchView(view, patches) {
    this.notify("view/patch", { ...view, patches });
  }
  sendTerminal(terminal, text) {
    this.notify("terminal/send", { terminal, text });
  }
  confirm(params) {
    return this.request("window/confirm", params);
  }
  pick(params) {
    return this.request("window/pick", params);
  }
  input(params) {
    return this.request("window/input", params);
  }
  openTerminal(params) {
    return this.request("terminal/open", params);
  }
  openFile(params) {
    return this.request("file/open", params);
  }
  workspaceContext() {
    return this.request("workspace/context", {});
  }
  getSettings() {
    return this.request("settings/get", {});
  }
  getSecret(name) {
    return this.request("secret/get", { name });
  }
  setSecret(name, value) {
    return this.request("secret/set", { name, value });
  }
  runCommand(params) {
    return this.request("command/run", params);
  }
  openView(params) {
    return this.request("view/open", params);
  }
  closeView(view) {
    return this.request("view/close", view);
  }
};
var EXIT_CODE = 0;
function features(definition) {
  const offered = ["window", "workspace", "settings", "secrets", "terminals", "files"];
  if (definition.commands !== void 0)
    offered.push("commands");
  if (definition.views !== void 0)
    offered.push("views");
  if (definition.tools !== void 0)
    offered.push("tools");
  if (definition.hostKinds !== void 0)
    offered.push("host_kinds");
  return offered;
}
function lookup(table, name, what) {
  const found = table?.[name];
  if (found === void 0) {
    throw new RpcError(METHOD_NOT_FOUND, `the extension has no ${what} ${name}`);
  }
  return found;
}
function createExtension(definition, io = {
  input: process.stdin,
  output: process.stdout
}) {
  const connection = new Connection(io.input, io.output);
  const app = new App(connection);
  const exit = io.exit ?? ((code) => process.exit(code));
  let context;
  const ready = () => {
    if (context === void 0) {
      throw new RpcError(METHOD_NOT_FOUND, "the app has not initialized the extension");
    }
    return context;
  };
  const requests = {
    initialize: async (params) => {
      context = { app, init: params };
      await definition.onInitialize?.(context);
      return { features: features(definition) };
    },
    shutdown: async () => {
      await definition.onShutdown?.(ready());
      return {};
    },
    "command/execute": async ({ command, target }) => {
      await lookup(definition.commands, command, "command")(target ?? null, ready());
      return {};
    },
    "view/render": async (view) => lookup(definition.views, view.view, "view").render(view, ready()),
    "view/rows": async (params) => {
      const rows = lookup(definition.views, params.view, "view").rows;
      if (rows === void 0) {
        throw new RpcError(METHOD_NOT_FOUND, `the view ${params.view} has no rows`);
      }
      return rows(params, ready());
    },
    "tool/call": async ({ tool, arguments: args, root }) => {
      const answer = await lookup(definition.tools, tool, "tool")(args ?? {}, root ?? null, ready());
      return typeof answer === "string" ? { content: [{ type: "text", text: answer }], outcome: "done" } : answer;
    },
    "host/list": async ({ kind }) => lookup(definition.hostKinds, kind, "host kind").list(ready()),
    "host/connect": async ({ kind, machine }) => lookup(definition.hostKinds, kind, "host kind").connect(machine, ready())
  };
  const notifications = {
    initialized: () => {
    },
    exit: () => exit(EXIT_CODE),
    "view/event": ({ event, ...view }) => {
      const handler = definition.views?.[view.view]?.onEvent;
      if (handler !== void 0) {
        Promise.resolve(handler(event, view, ready())).catch((error) => app.log("error", `view event failed: ${String(error)}`));
      }
    },
    "view/closed": (view) => definition.views?.[view.view]?.onClose?.(view, ready()),
    "workspace/event": (event) => definition.onWorkspaceEvent?.(event, ready()),
    "settings/changed": (settings) => definition.onSettingsChanged?.(settings, ready())
  };
  connection.handleRequests((method, params) => {
    const handler = requests[method];
    if (handler === void 0) {
      throw new RpcError(METHOD_NOT_FOUND, method);
    }
    return handler(params);
  });
  connection.handleNotifications((method, params) => {
    const handler = notifications[method];
    handler?.(params);
  });
  connection.handleClose(() => exit(EXIT_CODE));
  return { app, connection };
}

// src/docker.ts
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
var run = promisify(execFile);
var COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
var COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
var LABEL_SEPARATOR = ",";
var LABEL_ASSIGN = "=";
var LOG_TAIL = "200";
var OUTPUT_LIMIT = 16 * 1024 * 1024;
var DIR_MARK = "/";
var ROOT = "/";
function childPath(dir, name) {
  return dir.endsWith(DIR_MARK) ? `${dir}${name}` : `${dir}${DIR_MARK}${name}`;
}
function parseListing(dir, output) {
  return output.split("\n").map((line) => line.replace(/\r$/, "")).filter((line) => line.length > 0 && line !== "./" && line !== "../").map((line) => {
    const isDir = line.endsWith(DIR_MARK);
    const name = isDir ? line.slice(0, -1) : line;
    return { name, path: childPath(dir === "" ? ROOT : dir, name), isDir };
  }).sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name));
}
var RESTART_POLICIES = ["no", "unless-stopped", "always", "on-failure"];
var LIST_SEPARATOR = /[,\n]/;
var PORT_PATTERN = /^(\d{1,5}(-\d{1,5})?:)?\d{1,5}(-\d{1,5})?(\/(tcp|udp))?$|^[\d.]+:\d{1,5}:\d{1,5}(\/(tcp|udp))?$/;
var ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
var NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
var VOLUME_PATTERN = /^[^:]+:\/[^:]*(:(ro|rw))?$/;
function listOf(text) {
  return text.split(LIST_SEPARATOR).map((part) => part.trim()).filter((part) => part.length > 0);
}
function wordsOf(text) {
  return text.trim() === "" ? [] : text.trim().split(/\s+/);
}
function checkRun(spec) {
  const problems = [];
  if (spec.image.trim() === "") problems.push({ field: "image", message: "Name the image to run." });
  if (spec.name !== "" && !NAME_PATTERN.test(spec.name)) {
    problems.push({ field: "name", message: "A name holds letters, digits, '_', '.' and '-'." });
  }
  const bad = (values, pattern) => values.filter((value) => !pattern.test(value));
  for (const port of bad(spec.ports, PORT_PATTERN)) {
    problems.push({ field: "ports", message: `${port} is not host:container, e.g. 8080:80` });
  }
  for (const variable of bad(spec.env, ENV_PATTERN)) {
    problems.push({ field: "env", message: `${variable} is not NAME=value` });
  }
  for (const volume of bad(spec.volumes, VOLUME_PATTERN)) {
    problems.push({ field: "volumes", message: `${volume} is not source:/path, e.g. ./data:/data` });
  }
  return problems;
}
function runArgs(spec) {
  const args = ["run", "--detach"];
  if (spec.name !== "") args.push("--name", spec.name);
  if (spec.restart !== "no") args.push("--restart", spec.restart);
  for (const port of spec.ports) args.push("--publish", port);
  for (const variable of spec.env) args.push("--env", variable);
  for (const volume of spec.volumes) args.push("--volume", volume);
  return [...args, spec.image.trim(), ...spec.command];
}
var SHELL_PROBE = "command -v bash >/dev/null 2>&1 && exec bash || exec sh";
function shellArgs(id) {
  return ["exec", "-it", id, "sh", "-c", SHELL_PROBE];
}
function parseImages(output) {
  return output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => {
    const image = JSON.parse(line);
    return {
      id: image.ID,
      repository: image.Repository,
      tag: image.Tag,
      size: image.Size,
      created: image.CreatedSince
    };
  });
}
var STATES = ["running", "paused", "restarting", "exited", "created", "dead", "removing"];
function state(text) {
  const lowered = text.toLowerCase();
  return STATES.includes(lowered) ? lowered : "exited";
}
function labels(text) {
  const found = /* @__PURE__ */ new Map();
  for (const pair of (text ?? "").split(LABEL_SEPARATOR)) {
    const at = pair.indexOf(LABEL_ASSIGN);
    if (at > 0) {
      found.set(pair.slice(0, at), pair.slice(at + 1));
    }
  }
  return found;
}
function parsePs(output) {
  return output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => {
    const ps = JSON.parse(line);
    const tags = labels(ps.Labels);
    return {
      id: ps.ID,
      name: ps.Names,
      image: ps.Image,
      state: state(ps.State),
      status: ps.Status,
      project: tags.get(COMPOSE_PROJECT_LABEL) ?? null,
      service: tags.get(COMPOSE_SERVICE_LABEL) ?? null
    };
  });
}
function parseInspect(output) {
  const [found] = JSON.parse(output);
  if (found === void 0) {
    return null;
  }
  const ports = Object.entries(found.NetworkSettings?.Ports ?? {}).flatMap(
    ([port, bindings]) => (bindings ?? []).length === 0 ? [port] : (bindings ?? []).map((binding) => `${binding.HostIp || "0.0.0.0"}:${binding.HostPort} \u2192 ${port}`)
  );
  return {
    id: found.Id,
    name: found.Name.replace(/^\//, ""),
    image: found.Config?.Image ?? "",
    created: found.Created,
    state: found.State?.Status ?? "",
    startedAt: found.State?.StartedAt ?? "",
    restartCount: found.RestartCount ?? 0,
    ports,
    mounts: (found.Mounts ?? []).map((mount) => `${mount.Source ?? ""} \u2192 ${mount.Destination ?? ""}`),
    networks: Object.keys(found.NetworkSettings?.Networks ?? {}),
    command: [found.Path ?? "", ...found.Args ?? []].join(" ").trim()
  };
}
var ACTION_ARGS = {
  start: ["start"],
  stop: ["stop"],
  restart: ["restart"],
  remove: ["rm", "--force"]
};
var Docker = class {
  constructor(program) {
    this.program = program;
  }
  async output(args) {
    const { stdout } = await run(this.program, args, { maxBuffer: OUTPUT_LIMIT });
    return stdout;
  }
  async containers(all) {
    const args = ["ps", "--no-trunc", "--format", "{{json .}}"];
    return parsePs(await this.output(all ? [...args, "--all"] : args));
  }
  async inspect(id) {
    return parseInspect(await this.output(["inspect", id]));
  }
  async act(action, id) {
    await this.output([...ACTION_ARGS[action], id]);
  }
  async images() {
    return parseImages(await this.output(["image", "ls", "--format", "{{json .}}"]));
  }
  async removeImage(id) {
    await this.output(["image", "rm", id]);
  }
  async listDir(id, dir) {
    return parseListing(dir, await this.output(["exec", id, "ls", "-1Ap", "--", dir]));
  }
  async copyOut(id, path, destination) {
    await this.output(["cp", `${id}:${path}`, destination]);
  }
  async copyIn(id, source, path) {
    await this.output(["cp", source, `${id}:${path}`]);
  }
  async run(spec) {
    return (await this.output(runArgs(spec))).trim();
  }
  async prune() {
    return this.output(["container", "prune", "--force"]);
  }
  followLogs(id, line) {
    const child = spawn(this.program, ["logs", "--follow", "--tail", LOG_TAIL, id], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const forward = (isError) => {
      let rest = "";
      return (chunk) => {
        const lines = (rest + chunk.toString("utf8")).split("\n");
        rest = lines.pop() ?? "";
        for (const text of lines) line(text, isError);
      };
    };
    child.stdout?.on("data", forward(false));
    child.stderr?.on("data", forward(true));
    return child;
  }
};

// src/tree.ts
var TREE_KEY = "containers";
var ROOT_KEY = "root";
var MESSAGE_KEY = "message";
var PROJECT_PREFIX = "project:";
var STANDALONE_LABEL = "Standalone";
var STANDALONE_KEY = "standalone";
var ACTIONS = {
  start: "start",
  stop: "stop",
  restart: "restart",
  remove: "remove",
  logs: "logs",
  exec: "exec",
  inspect: "inspect",
  removeImage: "remove-image",
  files: "files",
  openFile: "open-file",
  upload: "upload-file",
  refreshFiles: "refresh-files",
  newContainer: "new-container",
  runImage: "run-image",
  create: "create-container"
};
var FORM_KEY = "new-container-form";
var PROBLEMS_KEY = "new-container-problems";
var FIELDS = {
  image: "image",
  name: "name",
  ports: "ports",
  env: "env",
  volumes: "volumes",
  command: "command",
  restart: "restart"
};
var FILES_TREE_KEY = "files";
var PATH_PREFIX = "path:";
var FILES_TITLE_KEY = "files-title";
var FILES_HINT_KEY = "files-hint";
var FILES_HINT = "Files open as a local copy; upload a changed copy back to the container.";
var IMAGE_PREFIX = "image:";
var IMAGES_KEY = "images";
var IMAGES_LABEL = "Images";
var UNTAGGED = "<none>";
var BADGES = {
  running: { text: "running", tone: "success" },
  paused: { text: "paused", tone: "warning" },
  restarting: { text: "restarting", tone: "warning" },
  exited: { text: "exited", tone: "neutral" },
  created: { text: "created", tone: "neutral" },
  dead: { text: "dead", tone: "error" },
  removing: { text: "removing", tone: "warning" }
};
function inlineActions(container) {
  const running = container.state === "running" || container.state === "restarting";
  const lifecycle = running ? [
    { action: ACTIONS.stop, label: "Stop", icon: "stop" },
    { action: ACTIONS.restart, label: "Restart", icon: "repeat" }
  ] : [{ action: ACTIONS.start, label: "Start", icon: "play" }];
  return [...lifecycle, { action: ACTIONS.remove, label: "Remove", icon: "close", tone: "error" }];
}
function menu(container) {
  const items = [
    { action: ACTIONS.logs, label: "Show logs", icon: "list-view" },
    { action: ACTIONS.inspect, label: "Inspect", icon: "search" }
  ];
  if (container.state === "running") {
    items.splice(
      1,
      0,
      { action: ACTIONS.exec, label: "Open a shell", icon: "terminal" },
      { action: ACTIONS.files, label: "Browse files", icon: "folder" }
    );
  }
  return items;
}
function containerItem(container) {
  return {
    key: container.id,
    label: container.service ?? container.name,
    description: container.image,
    icon: "layers",
    badge: BADGES[container.state],
    expansion: "leaf",
    actions: inlineActions(container),
    menu: menu(container)
  };
}
function containersTree(containers) {
  const byProject = /* @__PURE__ */ new Map();
  const standalone = [];
  for (const container of containers) {
    if (container.project === null) {
      standalone.push(container);
    } else {
      byProject.set(container.project, [...byProject.get(container.project) ?? [], container]);
    }
  }
  const projects = [...byProject.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([project, members]) => {
    const running = members.filter((member) => member.state === "running").length;
    return {
      key: `${PROJECT_PREFIX}${project}`,
      label: project,
      description: `${running}/${members.length} running`,
      icon: "workflow",
      expansion: "expanded",
      children: members.sort((left, right) => left.name.localeCompare(right.name)).map(containerItem)
    };
  });
  if (standalone.length === 0) {
    return projects;
  }
  const loose = {
    key: STANDALONE_KEY,
    label: STANDALONE_LABEL,
    icon: "layers",
    expansion: "expanded",
    children: standalone.sort((left, right) => left.name.localeCompare(right.name)).map(containerItem)
  };
  return [...projects, loose];
}
function imageName(image) {
  if (image.repository === UNTAGGED) return image.id.replace(/^sha256:/, "").slice(0, 12);
  return image.tag === UNTAGGED ? image.repository : `${image.repository}:${image.tag}`;
}
function imagesItem(images) {
  return {
    key: IMAGES_KEY,
    label: IMAGES_LABEL,
    description: `${images.length}`,
    icon: "layers",
    expansion: "collapsed",
    children: images.map((image) => ({ image, name: imageName(image) })).sort((left, right) => left.name.localeCompare(right.name)).map(({ image, name }) => ({
      key: `${IMAGE_PREFIX}${image.id}`,
      label: name,
      description: `${image.size} \xB7 ${image.created}`,
      icon: "file",
      expansion: "leaf",
      actions: [
        { action: ACTIONS.runImage, label: "Run container", icon: "play" },
        { action: ACTIONS.removeImage, label: "Remove image", icon: "close", tone: "error" }
      ]
    }))
  };
}
function containersView(containers, images = []) {
  if (typeof containers === "string") {
    const message = ui.text(MESSAGE_KEY, containers, { color: "text_muted", wrap: "wrap" });
    return ui.column(ROOT_KEY, [message], { padding: "sm", gap: "sm", height: "fill" });
  }
  const items = containersTree(containers);
  if (images.length > 0) items.push(imagesItem(images));
  const body = items.length === 0 ? ui.text(MESSAGE_KEY, "No containers", { color: "text_muted" }) : ui.tree(TREE_KEY, items);
  const toolbar = ui.row(
    "containers-toolbar",
    [ui.button("containers-new", ACTIONS.newContainer, { label: "New container", icon: "add", variant: "primary" })],
    { gap: "sm" }
  );
  return ui.column(ROOT_KEY, [toolbar, body], { padding: "sm", gap: "sm", height: "fill" });
}
var DETAILS_KEY = "details";
var CONTROLS_KEY = "controls";
function containerControls(inspected) {
  const running = inspected.state === "running" || inspected.state === "restarting";
  const buttons = running ? [
    ui.button("control-stop", ACTIONS.stop, { label: "Stop", icon: "stop" }),
    ui.button("control-restart", ACTIONS.restart, { label: "Restart", icon: "repeat" }),
    ui.button("control-shell", ACTIONS.exec, { label: "Open a shell", icon: "terminal", variant: "primary" })
  ] : [ui.button("control-start", ACTIONS.start, { label: "Start", icon: "play", variant: "primary" })];
  return ui.row(CONTROLS_KEY, buttons, { gap: "sm" });
}
var LOGS_KEY = "logs";
var LOG_LINES = 5e3;
function inspectedDetails(inspected) {
  const mono = { font: "mono" };
  const rows = [
    { label: "Name", value: inspected.name },
    { label: "Id", value: inspected.id.slice(0, 12), style: mono },
    { label: "Image", value: inspected.image },
    { label: "State", value: inspected.state },
    { label: "Started", value: inspected.startedAt },
    { label: "Restarts", value: String(inspected.restartCount) },
    { label: "Command", value: inspected.command, style: mono }
  ];
  const lists = [
    ["Ports", inspected.ports],
    ["Mounts", inspected.mounts],
    ["Networks", inspected.networks]
  ];
  for (const [label, values] of lists) {
    if (values.length > 0) rows.push({ label, value: values.join("\n"), style: mono });
  }
  return rows;
}
function containerView(inspected, id) {
  if (inspected === null) {
    return ui.column(ROOT_KEY, [ui.text(MESSAGE_KEY, `No container ${id}`, { color: "text_muted" })], { padding: "md" });
  }
  return ui.column(
    ROOT_KEY,
    [
      ui.text("title", inspected.name, { size: "lg", weight: "bold" }),
      containerControls(inspected),
      ui.details(DETAILS_KEY, inspectedDetails(inspected)),
      ui.divider("rule"),
      ui.text("logs-title", "Logs", { weight: "medium" }),
      ui.stream(LOGS_KEY, [], LOG_LINES)
    ],
    { padding: "md", gap: "sm", height: "fill" }
  );
}
function fileItem(entry, children = null) {
  if (entry.isDir) {
    return {
      key: `${PATH_PREFIX}${entry.path}`,
      label: entry.name,
      icon: "folder",
      expansion: children === null ? "collapsed" : "expanded",
      children: children ?? []
    };
  }
  return {
    key: `${PATH_PREFIX}${entry.path}`,
    label: entry.name,
    icon: "file",
    expansion: "leaf",
    actions: [
      { action: ACTIONS.openFile, label: "Open a copy", icon: "open-external" },
      { action: ACTIONS.upload, label: "Upload to container", icon: "exchange" }
    ]
  };
}
function filesView(name, entries) {
  const header = ui.row(
    "files-header",
    [
      ui.text(FILES_TITLE_KEY, `${name}:/`, { size: "md", weight: "bold", font: "mono" }),
      ui.button("files-refresh", ACTIONS.refreshFiles, { label: "Refresh", icon: "refresh", variant: "ghost" })
    ],
    { gap: "sm" }
  );
  const body = typeof entries === "string" ? ui.text(MESSAGE_KEY, entries, { color: "text_muted", wrap: "wrap" }) : ui.tree(FILES_TREE_KEY, entries.map((entry) => fileItem(entry)));
  return ui.column(
    ROOT_KEY,
    [header, ui.text(FILES_HINT_KEY, FILES_HINT, { size: "xs", color: "text_muted" }), body],
    { padding: "md", gap: "sm", height: "fill" }
  );
}
function newContainerView(image, problems = []) {
  const text = (key, label, placeholder, value = "") => ({
    key,
    label,
    type: "text",
    value,
    placeholder
  });
  const form = ui.form(
    FORM_KEY,
    ACTIONS.create,
    [
      text(FIELDS.image, "Image", "nginx:alpine", image),
      text(FIELDS.name, "Name", "optional, e.g. web"),
      text(FIELDS.ports, "Ports", "host:container, comma separated, e.g. 8080:80"),
      text(FIELDS.env, "Environment", "NAME=value, comma separated"),
      text(FIELDS.volumes, "Volumes", "source:/path, comma separated"),
      text(FIELDS.command, "Command", "optional, overrides the image's command"),
      {
        key: FIELDS.restart,
        label: "Restart",
        type: "select",
        options: RESTART_POLICIES.map((policy) => ({ value: policy, label: policy })),
        value: "no"
      }
    ],
    "Create and start"
  );
  const messages = problems.map(
    (problem, index) => ui.text(`problem-${index}`, problem.message, { color: "error", wrap: "wrap" })
  );
  return ui.column(
    ROOT_KEY,
    [
      ui.text("new-container-title", "New container", { size: "lg", weight: "bold" }),
      ui.column(PROBLEMS_KEY, messages, { gap: "xs" }),
      form
    ],
    { padding: "md", gap: "md", height: "fill" }
  );
}

// src/main.ts
var CONTAINERS_VIEW = "containers";
var CONTAINER_VIEW = "container";
var FILES_VIEW = "files";
var NEW_VIEW = "new-container";
var ROOT_DIR = "/";
var COPIES_DIR = join(tmpdir(), "krad-docker");
var SHORT_ID = 12;
var HOST_KIND = "container";
var SHELL = "sh";
var MILLISECONDS = 1e3;
var SETTING = {
  dockerPath: "docker-path",
  showStopped: "show-stopped",
  pollSeconds: "poll-seconds"
};
var DEFAULTS = { program: "docker", showStopped: true, pollSeconds: 5 };
function options(values) {
  const program = values[SETTING.dockerPath];
  const showStopped = values[SETTING.showStopped];
  const pollSeconds = values[SETTING.pollSeconds];
  return {
    program: typeof program === "string" && program.trim() !== "" ? program.trim() : DEFAULTS.program,
    showStopped: typeof showStopped === "boolean" ? showStopped : DEFAULTS.showStopped,
    pollSeconds: typeof pollSeconds === "number" && pollSeconds >= 1 ? pollSeconds : DEFAULTS.pollSeconds
  };
}
var current = DEFAULTS;
var docker = new Docker(DEFAULTS.program);
var containersOpen = false;
var poller;
var lastTree = "";
var followers = /* @__PURE__ */ new Map();
function failure(error) {
  return error instanceof Error ? error.message.split("\n")[0] ?? String(error) : String(error);
}
async function containersNode() {
  try {
    const [containers, images] = await Promise.all([
      docker.containers(current.showStopped),
      docker.images().catch(() => [])
    ]);
    return containersView(containers, images);
  } catch (error) {
    return containersView(`Docker is not reachable: ${failure(error)}`);
  }
}
async function refresh({ app }) {
  if (!containersOpen) return;
  const node2 = await containersNode();
  const text = JSON.stringify(node2);
  if (text === lastTree) return;
  lastTree = text;
  app.patchView({ view: CONTAINERS_VIEW }, [patch.replace(node2)]);
}
function schedule(context) {
  clearInterval(poller);
  poller = containersOpen ? setInterval(() => void refresh(context), current.pollSeconds * MILLISECONDS) : void 0;
}
function targetPath(target) {
  return target !== null && (target.kind === "file" || target.kind === "folder") ? target.path : null;
}
async function pickedComposeFile(target, { app }) {
  const path = targetPath(target);
  if (path !== null) return path;
  const answer = await app.input({ title: "Compose file", placeholder: "/path/to/docker-compose.yml" });
  return answer === null || answer.trim() === "" ? null : answer.trim();
}
var ACTION_TITLES = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  remove: "Removing"
};
var nextProgress = 0;
async function withProgress(action, id, { app }) {
  const token = `docker-${nextProgress++}`;
  app.progress({ token, state: "begin", title: `${ACTION_TITLES[action]} ${id.slice(0, 12)}` });
  try {
    await docker.act(action, id);
  } catch (error) {
    app.toast(`Could not ${action} the container: ${failure(error)}`, "error");
  } finally {
    app.progress({ token, state: "end" });
  }
}
async function containerAction(action, id, context) {
  if (action === "remove") {
    const answer = await context.app.confirm({
      title: "Remove this container?",
      detail: "It is stopped first if it is running. Its writable layer is lost.",
      confirm: "Remove",
      tone: "error"
    });
    if (answer !== "confirmed") return;
  }
  await withProgress(action, id, context);
  await refresh(context);
}
async function openShell(id, { app }) {
  await app.openTerminal({
    title: `shell \xB7 ${id.slice(0, 12)}`,
    command: { program: current.program, args: shellArgs(id) }
  });
}
async function removeImage(item, context) {
  const id = item.slice(IMAGE_PREFIX.length);
  const answer = await context.app.confirm({
    title: "Remove this image?",
    detail: "Containers that still use it keep it until they are removed.",
    confirm: "Remove",
    tone: "error"
  });
  if (answer !== "confirmed") return;
  try {
    await docker.removeImage(id);
  } catch (error) {
    context.app.toast(`Could not remove the image: ${failure(error)}`, "error");
  }
  await refresh(context);
}
async function refreshContainerTab(id, context) {
  const inspected = await docker.inspect(id).catch(() => null);
  if (inspected === null) return;
  context.app.patchView({ view: CONTAINER_VIEW, instance: id }, [
    patch.replace(containerControls(inspected)),
    patch.replace(ui.details(DETAILS_KEY, inspectedDetails(inspected)))
  ]);
  if (inspected.state === "running" && !followers.has(id)) follow(id, context);
}
function localCopy(id, path) {
  return join(COPIES_DIR, id.slice(0, SHORT_ID), path);
}
async function filesNode(id) {
  const inspected = await docker.inspect(id).catch(() => null);
  const name = inspected?.name ?? id.slice(0, SHORT_ID);
  try {
    return filesView(name, await docker.listDir(id, ROOT_DIR));
  } catch (error) {
    return filesView(name, `Could not list the container's files: ${failure(error)}`);
  }
}
async function browseFiles(id, { app }) {
  await app.openView({ view: FILES_VIEW, instance: id, title: `files \xB7 ${id.slice(0, SHORT_ID)}` });
}
async function expandFolder(id, item, { app }) {
  const path = item.slice(PATH_PREFIX.length);
  try {
    const children = (await docker.listDir(id, path)).map((entry) => fileItem(entry));
    const folder = fileItem({ name: basename(path) || ROOT_DIR, path, isDir: true }, children);
    app.patchView({ view: FILES_VIEW, instance: id }, [patch.replaceItem(FILES_TREE_KEY, folder)]);
  } catch (error) {
    app.toast(`Could not open ${path}: ${failure(error)}`, "error");
  }
}
async function openCopy(id, item, { app }) {
  const path = item.slice(PATH_PREFIX.length);
  const local = localCopy(id, path);
  try {
    mkdirSync(dirname(local), { recursive: true });
    await docker.copyOut(id, path, local);
    await app.openFile({ path: local });
  } catch (error) {
    app.toast(`Could not copy ${path}: ${failure(error)}`, "error");
  }
}
async function uploadCopy(id, item, { app }) {
  const path = item.slice(PATH_PREFIX.length);
  const local = localCopy(id, path);
  if (!existsSync(local)) {
    app.toast(`Open ${basename(path)} first; there is no local copy to upload.`, "info");
    return;
  }
  try {
    await docker.copyIn(id, local, path);
    app.toast(`Uploaded ${path}`, "success");
  } catch (error) {
    app.toast(`Could not upload ${path}: ${failure(error)}`, "error");
  }
}
function textValue(values, key) {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}
function runSpec(values) {
  const restart = textValue(values, FIELDS.restart);
  return {
    image: textValue(values, FIELDS.image),
    name: textValue(values, FIELDS.name),
    ports: listOf(textValue(values, FIELDS.ports)),
    env: listOf(textValue(values, FIELDS.env)),
    volumes: listOf(textValue(values, FIELDS.volumes)),
    command: wordsOf(textValue(values, FIELDS.command)),
    restart: RESTART_POLICIES.includes(restart) ? restart : "no"
  };
}
async function newContainer(image, { app }) {
  await app.openView({ view: NEW_VIEW, instance: image === "" ? null : image, title: "New container" });
}
async function imageReference(item) {
  const id = item.slice(IMAGE_PREFIX.length);
  const found = (await docker.images().catch(() => [])).find((image) => image.id === id);
  if (found === void 0 || found.repository === "<none>") return id;
  return found.tag === "<none>" ? found.repository : `${found.repository}:${found.tag}`;
}
async function createContainer(values, view, context) {
  const { app } = context;
  const spec = runSpec(values);
  const problems = checkRun(spec);
  const show = (messages) => app.patchView(view, [
    patch.replace(
      ui.column(
        PROBLEMS_KEY,
        messages.map((problem, index) => ui.text(`problem-${index}`, problem.message, { color: "error", wrap: "wrap" })),
        { gap: "xs" }
      )
    )
  ]);
  if (problems.length > 0) {
    show(problems);
    return;
  }
  show([]);
  const token = `docker-${nextProgress++}`;
  app.progress({ token, state: "begin", title: `Creating a container from ${spec.image}` });
  try {
    const id = await docker.run(spec);
    app.toast(`Started ${spec.name || id.slice(0, SHORT_ID)}`, "success");
    lastTree = "";
    await refresh(context);
    await app.closeView(view);
    await showLogs(id, context);
  } catch (error) {
    show([{ field: "image", message: failure(error) }]);
  } finally {
    app.progress({ token, state: "end" });
  }
}
async function showLogs(id, { app }) {
  await app.openView({ view: CONTAINER_VIEW, instance: id, title: id.slice(0, 12) });
}
function stopFollowing(id) {
  followers.get(id)?.kill();
  followers.delete(id);
}
function follow(id, { app }) {
  stopFollowing(id);
  const view = { view: CONTAINER_VIEW, instance: id };
  followers.set(
    id,
    docker.followLogs(
      id,
      (text, isError) => app.patchView(view, [patch.append(LOGS_KEY, [{ text, tone: isError ? "warning" : "neutral" }])])
    )
  );
}
async function inTerminal(title, args, cwd, { app }) {
  await app.openTerminal({ title, command: { program: current.program, args }, cwd, zone: "utilities" });
}
function describe(containers) {
  if (containers.length === 0) return "No containers.";
  return containers.map(
    (container) => [container.name, container.image, container.state, container.status, container.project ?? "-"].join("	")
  ).join("\n");
}
createExtension({
  async onInitialize(context) {
    current = options(await context.app.getSettings());
    docker.program = current.program;
  },
  onSettingsChanged(values, context) {
    current = options(values);
    docker.program = current.program;
    schedule(context);
    void refresh(context);
  },
  onShutdown() {
    clearInterval(poller);
    for (const id of followers.keys()) stopFollowing(id);
  },
  commands: {
    "containers.refresh": async (_target, context) => {
      lastTree = "";
      await refresh(context);
    },
    "compose.up": async (target, context) => {
      const file = await pickedComposeFile(target, context);
      if (file === null) return;
      await inTerminal("compose up", ["compose", "-f", file, "up", "-d"], dirname(file), context);
    },
    "compose.down": async (target, context) => {
      const file = await pickedComposeFile(target, context);
      if (file === null) return;
      await inTerminal("compose down", ["compose", "-f", file, "down"], dirname(file), context);
    },
    "image.build": async (target, context) => {
      const file = targetPath(target);
      if (file === null) {
        context.app.toast("Build an image from a Dockerfile's menu in the file tree.", "info");
        return;
      }
      const folder = dirname(file);
      const tag = basename(folder).toLowerCase().replace(/[^a-z0-9._-]/g, "-");
      await inTerminal("docker build", ["build", "-f", file, "-t", tag, folder], folder, context);
    },
    "container.new": async (_target, context) => {
      await newContainer("", context);
    },
    "image.pull": async (_target, context) => {
      const name = await context.app.input({ title: "Image to pull", placeholder: "nginx:alpine" });
      if (name === null || name.trim() === "") return;
      await inTerminal(`docker pull ${name.trim()}`, ["pull", name.trim()], null, context);
    },
    "containers.prune": async (_target, context) => {
      const answer = await context.app.confirm({
        title: "Remove every stopped container?",
        confirm: "Remove",
        tone: "error"
      });
      if (answer !== "confirmed") return;
      try {
        await docker.prune();
        context.app.toast("Stopped containers removed", "success");
      } catch (error) {
        context.app.toast(`Prune failed: ${failure(error)}`, "error");
      }
      await refresh(context);
    }
  },
  views: {
    [CONTAINERS_VIEW]: {
      async render(_view, context) {
        containersOpen = true;
        schedule(context);
        const node2 = await containersNode();
        lastTree = JSON.stringify(node2);
        return node2;
      },
      async onEvent(event, _view, context) {
        if (event.kind === "click" && event.action === ACTIONS.newContainer) {
          await newContainer("", context);
          return;
        }
        if (event.kind !== "item_action") return;
        const { action, item } = event;
        switch (action) {
          case ACTIONS.start:
          case ACTIONS.stop:
          case ACTIONS.restart:
          case ACTIONS.remove:
            await containerAction(action, item, context);
            return;
          case ACTIONS.exec:
            await openShell(item, context);
            return;
          case ACTIONS.files:
            await browseFiles(item, context);
            return;
          case ACTIONS.runImage:
            await newContainer(await imageReference(item), context);
            return;
          case ACTIONS.removeImage:
            await removeImage(item, context);
            return;
          case ACTIONS.logs:
          case ACTIONS.inspect:
            await showLogs(item, context);
            return;
          default:
            context.app.log("debug", `unknown container action ${action}`);
        }
      },
      onClose(_view, context) {
        containersOpen = false;
        schedule(context);
      }
    },
    [CONTAINER_VIEW]: {
      async render(view, context) {
        const id = view.instance ?? "";
        const inspected = id === "" ? null : await docker.inspect(id).catch(() => null);
        if (inspected !== null) follow(id, context);
        return containerView(inspected, id);
      },
      async onEvent(event, view, context) {
        const id = view.instance ?? "";
        if (event.kind !== "click" || id === "") return;
        switch (event.action) {
          case ACTIONS.start:
          case ACTIONS.stop:
          case ACTIONS.restart:
            await withProgress(event.action, id, context);
            if (event.action !== "stop") stopFollowing(id);
            await refreshContainerTab(id, context);
            await refresh(context);
            return;
          case ACTIONS.exec:
            await openShell(id, context);
            return;
          default:
            context.app.log("debug", `unknown container tab action ${event.action}`);
        }
      },
      onClose(view) {
        if (view.instance) stopFollowing(view.instance);
      }
    },
    [NEW_VIEW]: {
      render(view) {
        return newContainerView(view.instance ?? "");
      },
      async onEvent(event, view, context) {
        if (event.kind !== "form" || event.action !== ACTIONS.create) return;
        await createContainer(event.values, view, context);
      }
    },
    [FILES_VIEW]: {
      async render(view) {
        return filesNode(view.instance ?? "");
      },
      async onEvent(event, view, context) {
        const id = view.instance ?? "";
        if (id === "") return;
        if (event.kind === "expand") {
          await expandFolder(id, event.item, context);
          return;
        }
        if (event.kind === "click" && event.action === ACTIONS.refreshFiles) {
          context.app.patchView(view, [patch.replace(await filesNode(id))]);
          return;
        }
        if (event.kind !== "item_action") return;
        if (event.action === ACTIONS.openFile) await openCopy(id, event.item, context);
        if (event.action === ACTIONS.upload) await uploadCopy(id, event.item, context);
      }
    }
  },
  tools: {
    list_containers: async (args) => {
      const all = typeof args === "object" && args !== null && args.all === true;
      return describe(await docker.containers(all));
    },
    restart_container: async (args) => {
      const container = typeof args === "object" && args !== null ? args.container : void 0;
      if (typeof container !== "string" || container === "") {
        return { content: [{ type: "text", text: "Name the container to restart." }], outcome: "failed" };
      }
      try {
        await docker.act("restart", container);
        return `Restarted ${container}.`;
      } catch (error) {
        return { content: [{ type: "text", text: failure(error) }], outcome: "failed" };
      }
    }
  },
  hostKinds: {
    [HOST_KIND]: {
      list: async () => (await docker.containers(false)).map((container) => ({
        id: container.id,
        label: container.name,
        description: container.image,
        state: container.state === "running" ? "running" : "stopped"
      })),
      connect: (machine) => ({ command: { program: current.program, args: ["exec", "-i", machine, SHELL] } })
    }
  }
});
