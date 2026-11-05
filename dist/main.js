import { basename, dirname } from "node:path";
import { createExtension, patch, ui } from "../vendor/krad-ade-extension/index.js";
import { Docker, shellArgs } from "./docker.js";
import { ACTIONS, containerControls, containersView, containerView, DETAILS_KEY, IMAGE_PREFIX, inspectedDetails, LOGS_KEY, } from "./tree.js";
const CONTAINERS_VIEW = "containers";
const CONTAINER_VIEW = "container";
const HOST_KIND = "container";
const SHELL = "sh";
const MILLISECONDS = 1000;
const SETTING = {
    dockerPath: "docker-path",
    showStopped: "show-stopped",
    pollSeconds: "poll-seconds",
};
const DEFAULTS = { program: "docker", showStopped: true, pollSeconds: 5 };
function options(values) {
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
let poller;
let lastTree = "";
const followers = new Map();
function failure(error) {
    return error instanceof Error ? error.message.split("\n")[0] ?? String(error) : String(error);
}
async function containersNode() {
    try {
        const [containers, images] = await Promise.all([
            docker.containers(current.showStopped),
            docker.images().catch(() => []),
        ]);
        return containersView(containers, images);
    }
    catch (error) {
        return containersView(`Docker is not reachable: ${failure(error)}`);
    }
}
async function refresh({ app }) {
    if (!containersOpen)
        return;
    const node = await containersNode();
    const text = JSON.stringify(node);
    if (text === lastTree)
        return;
    lastTree = text;
    app.patchView({ view: CONTAINERS_VIEW }, [patch.replace(node)]);
}
function schedule(context) {
    clearInterval(poller);
    poller = containersOpen
        ? setInterval(() => void refresh(context), current.pollSeconds * MILLISECONDS)
        : undefined;
}
function targetPath(target) {
    return target !== null && (target.kind === "file" || target.kind === "folder") ? target.path : null;
}
async function pickedComposeFile(target, { app }) {
    const path = targetPath(target);
    if (path !== null)
        return path;
    const answer = await app.input({ title: "Compose file", placeholder: "/path/to/docker-compose.yml" });
    return answer === null || answer.trim() === "" ? null : answer.trim();
}
const ACTION_TITLES = {
    start: "Starting",
    stop: "Stopping",
    restart: "Restarting",
    remove: "Removing",
};
let nextProgress = 0;
async function withProgress(action, id, { app }) {
    const token = `docker-${nextProgress++}`;
    app.progress({ token, state: "begin", title: `${ACTION_TITLES[action]} ${id.slice(0, 12)}` });
    try {
        await docker.act(action, id);
    }
    catch (error) {
        app.toast(`Could not ${action} the container: ${failure(error)}`, "error");
    }
    finally {
        app.progress({ token, state: "end" });
    }
}
async function containerAction(action, id, context) {
    if (action === "remove") {
        const answer = await context.app.confirm({
            title: "Remove this container?",
            detail: "It is stopped first if it is running. Its writable layer is lost.",
            confirm: "Remove",
            tone: "error",
        });
        if (answer !== "confirmed")
            return;
    }
    await withProgress(action, id, context);
    await refresh(context);
}
async function openShell(id, { app }) {
    await app.openTerminal({
        title: `shell · ${id.slice(0, 12)}`,
        command: { program: current.program, args: shellArgs(id) },
    });
}
async function removeImage(item, context) {
    const id = item.slice(IMAGE_PREFIX.length);
    const answer = await context.app.confirm({
        title: "Remove this image?",
        detail: "Containers that still use it keep it until they are removed.",
        confirm: "Remove",
        tone: "error",
    });
    if (answer !== "confirmed")
        return;
    try {
        await docker.removeImage(id);
    }
    catch (error) {
        context.app.toast(`Could not remove the image: ${failure(error)}`, "error");
    }
    await refresh(context);
}
async function refreshContainerTab(id, context) {
    const inspected = await docker.inspect(id).catch(() => null);
    if (inspected === null)
        return;
    context.app.patchView({ view: CONTAINER_VIEW, instance: id }, [
        patch.replace(containerControls(inspected)),
        patch.replace(ui.details(DETAILS_KEY, inspectedDetails(inspected))),
    ]);
    if (inspected.state === "running" && !followers.has(id))
        follow(id, context);
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
    followers.set(id, docker.followLogs(id, (text, isError) => app.patchView(view, [patch.append(LOGS_KEY, [{ text, tone: isError ? "warning" : "neutral" }])])));
}
async function inTerminal(title, args, cwd, { app }) {
    await app.openTerminal({ title, command: { program: current.program, args }, cwd, zone: "utilities" });
}
function describe(containers) {
    if (containers.length === 0)
        return "No containers.";
    return containers
        .map((container) => [container.name, container.image, container.state, container.status, container.project ?? "-"].join("\t"))
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
        for (const id of followers.keys())
            stopFollowing(id);
    },
    commands: {
        "containers.refresh": async (_target, context) => {
            lastTree = "";
            await refresh(context);
        },
        "compose.up": async (target, context) => {
            const file = await pickedComposeFile(target, context);
            if (file === null)
                return;
            await inTerminal("compose up", ["compose", "-f", file, "up", "-d"], dirname(file), context);
        },
        "compose.down": async (target, context) => {
            const file = await pickedComposeFile(target, context);
            if (file === null)
                return;
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
        "image.pull": async (_target, context) => {
            const name = await context.app.input({ title: "Image to pull", placeholder: "nginx:alpine" });
            if (name === null || name.trim() === "")
                return;
            await inTerminal(`docker pull ${name.trim()}`, ["pull", name.trim()], null, context);
        },
        "containers.prune": async (_target, context) => {
            const answer = await context.app.confirm({
                title: "Remove every stopped container?",
                confirm: "Remove",
                tone: "error",
            });
            if (answer !== "confirmed")
                return;
            try {
                await docker.prune();
                context.app.toast("Stopped containers removed", "success");
            }
            catch (error) {
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
                if (event.kind !== "item_action")
                    return;
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
                if (inspected !== null)
                    follow(id, context);
                return containerView(inspected, id);
            },
            async onEvent(event, view, context) {
                const id = view.instance ?? "";
                if (event.kind !== "click" || id === "")
                    return;
                switch (event.action) {
                    case ACTIONS.start:
                    case ACTIONS.stop:
                    case ACTIONS.restart:
                        await withProgress(event.action, id, context);
                        if (event.action !== "stop")
                            stopFollowing(id);
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
                if (view.instance)
                    stopFollowing(view.instance);
            },
        },
    },
    tools: {
        list_containers: async (args) => {
            const all = typeof args === "object" && args !== null && args.all === true;
            return describe(await docker.containers(all));
        },
        restart_container: async (args) => {
            const container = typeof args === "object" && args !== null ? args.container : undefined;
            if (typeof container !== "string" || container === "") {
                return { content: [{ type: "text", text: "Name the container to restart." }], outcome: "failed" };
            }
            try {
                await docker.act("restart", container);
                return `Restarted ${container}.`;
            }
            catch (error) {
                return { content: [{ type: "text", text: failure(error) }], outcome: "failed" };
            }
        },
    },
    hostKinds: {
        [HOST_KIND]: {
            list: async () => (await docker.containers(false)).map((container) => ({
                id: container.id,
                label: container.name,
                description: container.image,
                state: container.state === "running" ? "running" : "stopped",
            })),
            connect: (machine) => ({ command: { program: current.program, args: ["exec", "-i", machine, SHELL] } }),
        },
    },
});
