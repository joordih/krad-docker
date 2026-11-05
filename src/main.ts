import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { CommandTarget, Context, SettingsValues, ViewRef } from "@krad-ade/extension";
import { createExtension, patch, ui } from "@krad-ade/extension";

import {
  checkRun,
  Docker,
  listOf,
  RESTART_POLICIES,
  shellArgs,
  wordsOf,
  type Container,
  type ContainerAction,
  type RestartPolicy,
  type RunSpec,
} from "./docker.js";
import {
  ACTIONS,
  containerControls,
  containersView,
  containerView,
  DETAILS_KEY,
  FIELDS,
  fileItem,
  filesView,
  FILES_TREE_KEY,
  IMAGE_PREFIX,
  PATH_PREFIX,
  inspectedDetails,
  LOGS_KEY,
  newContainerView,
  PROBLEMS_KEY,
} from "./tree.js";

const CONTAINERS_VIEW = "containers";
const CONTAINER_VIEW = "container";
const FILES_VIEW = "files";
const NEW_VIEW = "new-container";
const ROOT_DIR = "/";
const COPIES_DIR = join(tmpdir(), "krad-docker");
const SHORT_ID = 12;
const HOST_KIND = "container";
const SHELL = "sh";
const MILLISECONDS = 1000;

const SETTING = {
  dockerPath: "docker-path",
  showStopped: "show-stopped",
  pollSeconds: "poll-seconds",
} as const;

interface Options {
  program: string;
  showStopped: boolean;
  pollSeconds: number;
}

const DEFAULTS: Options = { program: "docker", showStopped: true, pollSeconds: 5 };

function options(values: SettingsValues): Options {
  const program = values[SETTING.dockerPath];
  const showStopped = values[SETTING.showStopped];
  const pollSeconds = values[SETTING.pollSeconds];
  return {
    program: typeof program === "string" && program.trim() !== "" ? program.trim() : DEFAULTS.program,
    showStopped: typeof showStopped === "boolean" ? showStopped : DEFAULTS.showStopped,
    pollSeconds: typeof pollSeconds === "number" && pollSeconds >= 1 ? pollSeconds : DEFAULTS.pollSeconds,
  };
}

let current = DEFAULTS;
const docker = new Docker(DEFAULTS.program);
let containersOpen = false;
let poller: NodeJS.Timeout | undefined;
let lastTree = "";
const followers = new Map<string, ChildProcess>();

function failure(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] ?? String(error) : String(error);
}

async function containersNode() {
  try {
    const [containers, images] = await Promise.all([
      docker.containers(current.showStopped),
      docker.images().catch(() => []),
    ]);
    return containersView(containers, images);
  } catch (error) {
    return containersView(`Docker is not reachable: ${failure(error)}`);
  }
}

async function refresh({ app }: Context): Promise<void> {
  if (!containersOpen) return;
  const node = await containersNode();
  const text = JSON.stringify(node);
  if (text === lastTree) return;
  lastTree = text;
  app.patchView({ view: CONTAINERS_VIEW }, [patch.replace(node)]);
}

function schedule(context: Context): void {
  clearInterval(poller);
  poller = containersOpen
    ? setInterval(() => void refresh(context), current.pollSeconds * MILLISECONDS)
    : undefined;
}

function targetPath(target: CommandTarget | null): string | null {
  return target !== null && (target.kind === "file" || target.kind === "folder") ? target.path : null;
}

async function pickedComposeFile(target: CommandTarget | null, { app }: Context): Promise<string | null> {
  const path = targetPath(target);
  if (path !== null) return path;
  const answer = await app.input({ title: "Compose file", placeholder: "/path/to/docker-compose.yml" });
  return answer === null || answer.trim() === "" ? null : answer.trim();
}

const ACTION_TITLES: Record<ContainerAction, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  remove: "Removing",
};
let nextProgress = 0;

async function withProgress(action: ContainerAction, id: string, { app }: Context): Promise<void> {
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

async function containerAction(action: ContainerAction, id: string, context: Context): Promise<void> {
  if (action === "remove") {
    const answer = await context.app.confirm({
      title: "Remove this container?",
      detail: "It is stopped first if it is running. Its writable layer is lost.",
      confirm: "Remove",
      tone: "error",
    });
    if (answer !== "confirmed") return;
  }
  await withProgress(action, id, context);
  await refresh(context);
}

async function openShell(id: string, { app }: Context): Promise<void> {
  await app.openTerminal({
    title: `shell · ${id.slice(0, 12)}`,
    command: { program: current.program, args: shellArgs(id) },
  });
}

async function removeImage(item: string, context: Context): Promise<void> {
  const id = item.slice(IMAGE_PREFIX.length);
  const answer = await context.app.confirm({
    title: "Remove this image?",
    detail: "Containers that still use it keep it until they are removed.",
    confirm: "Remove",
    tone: "error",
  });
  if (answer !== "confirmed") return;
  try {
    await docker.removeImage(id);
  } catch (error) {
    context.app.toast(`Could not remove the image: ${failure(error)}`, "error");
  }
  await refresh(context);
}

async function refreshContainerTab(id: string, context: Context): Promise<void> {
  const inspected = await docker.inspect(id).catch(() => null);
  if (inspected === null) return;
  context.app.patchView({ view: CONTAINER_VIEW, instance: id }, [
    patch.replace(containerControls(inspected)),
    patch.replace(ui.details(DETAILS_KEY, inspectedDetails(inspected))),
  ]);
  if (inspected.state === "running" && !followers.has(id)) follow(id, context);
}

function localCopy(id: string, path: string): string {
  return join(COPIES_DIR, id.slice(0, SHORT_ID), path);
}

async function filesNode(id: string) {
  const inspected = await docker.inspect(id).catch(() => null);
  const name = inspected?.name ?? id.slice(0, SHORT_ID);
  try {
    return filesView(name, await docker.listDir(id, ROOT_DIR));
  } catch (error) {
    return filesView(name, `Could not list the container's files: ${failure(error)}`);
  }
}

async function browseFiles(id: string, { app }: Context): Promise<void> {
  await app.openView({ view: FILES_VIEW, instance: id, title: `files · ${id.slice(0, SHORT_ID)}` });
}

async function expandFolder(id: string, item: string, { app }: Context): Promise<void> {
  const path = item.slice(PATH_PREFIX.length);
  try {
    const children = (await docker.listDir(id, path)).map((entry) => fileItem(entry));
    const folder = fileItem({ name: basename(path) || ROOT_DIR, path, isDir: true }, children);
    app.patchView({ view: FILES_VIEW, instance: id }, [patch.replaceItem(FILES_TREE_KEY, folder)]);
  } catch (error) {
    app.toast(`Could not open ${path}: ${failure(error)}`, "error");
  }
}

async function openCopy(id: string, item: string, { app }: Context): Promise<void> {
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

async function uploadCopy(id: string, item: string, { app }: Context): Promise<void> {
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

function textValue(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}

function runSpec(values: Record<string, unknown>): RunSpec {
  const restart = textValue(values, FIELDS.restart);
  return {
    image: textValue(values, FIELDS.image),
    name: textValue(values, FIELDS.name),
    ports: listOf(textValue(values, FIELDS.ports)),
    env: listOf(textValue(values, FIELDS.env)),
    volumes: listOf(textValue(values, FIELDS.volumes)),
    command: wordsOf(textValue(values, FIELDS.command)),
    restart: RESTART_POLICIES.includes(restart as RestartPolicy) ? (restart as RestartPolicy) : "no",
  };
}

async function newContainer(image: string, { app }: Context): Promise<void> {
  await app.openView({ view: NEW_VIEW, instance: image === "" ? null : image, title: "New container" });
}

async function imageReference(item: string): Promise<string> {
  const id = item.slice(IMAGE_PREFIX.length);
  const found = (await docker.images().catch(() => [])).find((image) => image.id === id);
  if (found === undefined || found.repository === "<none>") return id;
  return found.tag === "<none>" ? found.repository : `${found.repository}:${found.tag}`;
}

async function createContainer(values: Record<string, unknown>, view: ViewRef, context: Context): Promise<void> {
  const { app } = context;
  const spec = runSpec(values);
  const problems = checkRun(spec);
  const show = (messages: { field: string; message: string }[]) =>
    app.patchView(view, [
      patch.replace(
        ui.column(
          PROBLEMS_KEY,
          messages.map((problem, index) => ui.text(`problem-${index}`, problem.message, { color: "error", wrap: "wrap" })),
          { gap: "xs" },
        ),
      ),
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

async function showLogs(id: string, { app }: Context): Promise<void> {
  await app.openView({ view: CONTAINER_VIEW, instance: id, title: id.slice(0, 12) });
}

function stopFollowing(id: string): void {
  followers.get(id)?.kill();
  followers.delete(id);
}

function follow(id: string, { app }: Context): void {
  stopFollowing(id);
  const view: ViewRef = { view: CONTAINER_VIEW, instance: id };
  followers.set(
    id,
    docker.followLogs(id, (text, isError) =>
      app.patchView(view, [patch.append(LOGS_KEY, [{ text, tone: isError ? "warning" : "neutral" }])]),
    ),
  );
}

async function inTerminal(title: string, args: string[], cwd: string | null, { app }: Context): Promise<void> {
  await app.openTerminal({ title, command: { program: current.program, args }, cwd, zone: "utilities" });
}

function describe(containers: Container[]): string {
  if (containers.length === 0) return "No containers.";
  return containers
    .map((container) =>
      [container.name, container.image, container.state, container.status, container.project ?? "-"].join("\t"),
    )
    .join("\n");
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
        tone: "error",
      });
      if (answer !== "confirmed") return;
      try {
        await docker.prune();
        context.app.toast("Stopped containers removed", "success");
      } catch (error) {
        context.app.toast(`Prune failed: ${failure(error)}`, "error");
      }
      await refresh(context);
    },
  },
  views: {
    [CONTAINERS_VIEW]: {
      async render(_view, context) {
        containersOpen = true;
        schedule(context);
        const node = await containersNode();
        lastTree = JSON.stringify(node);
        return node;
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
      },
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
      },
    },
    [NEW_VIEW]: {
      render(view) {
        return newContainerView(view.instance ?? "");
      },
      async onEvent(event, view, context) {
        if (event.kind !== "form" || event.action !== ACTIONS.create) return;
        await createContainer(event.values, view, context);
      },
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
      },
    },
  },
  tools: {
    list_containers: async (args) => {
      const all = typeof args === "object" && args !== null && (args as { all?: unknown }).all === true;
      return describe(await docker.containers(all));
    },
    restart_container: async (args) => {
      const container = typeof args === "object" && args !== null ? (args as { container?: unknown }).container : undefined;
      if (typeof container !== "string" || container === "") {
        return { content: [{ type: "text", text: "Name the container to restart." }], outcome: "failed" };
      }
      try {
        await docker.act("restart", container);
        return `Restarted ${container}.`;
      } catch (error) {
        return { content: [{ type: "text", text: failure(error) }], outcome: "failed" };
      }
    },
  },
  hostKinds: {
    [HOST_KIND]: {
      list: async () =>
        (await docker.containers(false)).map((container) => ({
          id: container.id,
          label: container.name,
          description: container.image,
          state: container.state === "running" ? "running" : "stopped",
        })),
      connect: (machine) => ({ command: { program: current.program, args: ["exec", "-i", machine, SHELL] } }),
    },
  },
});
