import { ui } from "../vendor/krad-ade-extension/index.js";
import { RESTART_POLICIES } from "./docker.js";
export const TREE_KEY = "containers";
export const ROOT_KEY = "root";
export const MESSAGE_KEY = "message";
const PROJECT_PREFIX = "project:";
const STANDALONE_LABEL = "Standalone";
const STANDALONE_KEY = "standalone";
export const ACTIONS = {
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
    create: "create-container",
};
export const FORM_KEY = "new-container-form";
export const PROBLEMS_KEY = "new-container-problems";
export const FIELDS = {
    image: "image",
    name: "name",
    ports: "ports",
    env: "env",
    volumes: "volumes",
    command: "command",
    restart: "restart",
};
export const FILES_TREE_KEY = "files";
export const PATH_PREFIX = "path:";
const FILES_TITLE_KEY = "files-title";
const FILES_HINT_KEY = "files-hint";
const FILES_HINT = "Files open as a local copy; upload a changed copy back to the container.";
export const IMAGE_PREFIX = "image:";
const IMAGES_KEY = "images";
const IMAGES_LABEL = "Images";
const UNTAGGED = "<none>";
const BADGES = {
    running: { text: "running", tone: "success" },
    paused: { text: "paused", tone: "warning" },
    restarting: { text: "restarting", tone: "warning" },
    exited: { text: "exited", tone: "neutral" },
    created: { text: "created", tone: "neutral" },
    dead: { text: "dead", tone: "error" },
    removing: { text: "removing", tone: "warning" },
};
function inlineActions(container) {
    const running = container.state === "running" || container.state === "restarting";
    const lifecycle = running
        ? [
            { action: ACTIONS.stop, label: "Stop", icon: "stop" },
            { action: ACTIONS.restart, label: "Restart", icon: "repeat" },
        ]
        : [{ action: ACTIONS.start, label: "Start", icon: "play" }];
    return [...lifecycle, { action: ACTIONS.remove, label: "Remove", icon: "close", tone: "error" }];
}
function menu(container) {
    const items = [
        { action: ACTIONS.logs, label: "Show logs", icon: "list-view" },
        { action: ACTIONS.inspect, label: "Inspect", icon: "search" },
    ];
    if (container.state === "running") {
        items.splice(1, 0, { action: ACTIONS.exec, label: "Open a shell", icon: "terminal" }, { action: ACTIONS.files, label: "Browse files", icon: "folder" });
    }
    return items;
}
export function containerItem(container) {
    return {
        key: container.id,
        label: container.service ?? container.name,
        description: container.image,
        icon: "layers",
        badge: BADGES[container.state],
        expansion: "leaf",
        actions: inlineActions(container),
        menu: menu(container),
    };
}
export function containersTree(containers) {
    const byProject = new Map();
    const standalone = [];
    for (const container of containers) {
        if (container.project === null) {
            standalone.push(container);
        }
        else {
            byProject.set(container.project, [...(byProject.get(container.project) ?? []), container]);
        }
    }
    const projects = [...byProject.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([project, members]) => {
        const running = members.filter((member) => member.state === "running").length;
        return {
            key: `${PROJECT_PREFIX}${project}`,
            label: project,
            description: `${running}/${members.length} running`,
            icon: "workflow",
            expansion: "expanded",
            children: members.sort((left, right) => left.name.localeCompare(right.name)).map(containerItem),
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
        children: standalone.sort((left, right) => left.name.localeCompare(right.name)).map(containerItem),
    };
    return [...projects, loose];
}
function imageName(image) {
    if (image.repository === UNTAGGED)
        return image.id.replace(/^sha256:/, "").slice(0, 12);
    return image.tag === UNTAGGED ? image.repository : `${image.repository}:${image.tag}`;
}
export function imagesItem(images) {
    return {
        key: IMAGES_KEY,
        label: IMAGES_LABEL,
        description: `${images.length}`,
        icon: "layers",
        expansion: "collapsed",
        children: images
            .map((image) => ({ image, name: imageName(image) }))
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(({ image, name }) => ({
            key: `${IMAGE_PREFIX}${image.id}`,
            label: name,
            description: `${image.size} · ${image.created}`,
            icon: "file",
            expansion: "leaf",
            actions: [
                { action: ACTIONS.runImage, label: "Run container", icon: "play" },
                { action: ACTIONS.removeImage, label: "Remove image", icon: "close", tone: "error" },
            ],
        })),
    };
}
export function containersView(containers, images = []) {
    if (typeof containers === "string") {
        const message = ui.text(MESSAGE_KEY, containers, { color: "text_muted", wrap: "wrap" });
        return ui.column(ROOT_KEY, [message], { padding: "sm", gap: "sm", height: "fill" });
    }
    const items = containersTree(containers);
    if (images.length > 0)
        items.push(imagesItem(images));
    const body = items.length === 0
        ? ui.text(MESSAGE_KEY, "No containers", { color: "text_muted" })
        : ui.tree(TREE_KEY, items);
    const toolbar = ui.row("containers-toolbar", [ui.button("containers-new", ACTIONS.newContainer, { label: "New container", icon: "add", variant: "primary" })], { gap: "sm" });
    return ui.column(ROOT_KEY, [toolbar, body], { padding: "sm", gap: "sm", height: "fill" });
}
export const DETAILS_KEY = "details";
export const CONTROLS_KEY = "controls";
export function containerControls(inspected) {
    const running = inspected.state === "running" || inspected.state === "restarting";
    const buttons = running
        ? [
            ui.button("control-stop", ACTIONS.stop, { label: "Stop", icon: "stop" }),
            ui.button("control-restart", ACTIONS.restart, { label: "Restart", icon: "repeat" }),
            ui.button("control-shell", ACTIONS.exec, { label: "Open a shell", icon: "terminal", variant: "primary" }),
        ]
        : [ui.button("control-start", ACTIONS.start, { label: "Start", icon: "play", variant: "primary" })];
    return ui.row(CONTROLS_KEY, buttons, { gap: "sm" });
}
export const LOGS_KEY = "logs";
export const LOG_LINES = 5000;
export function inspectedDetails(inspected) {
    const mono = { font: "mono" };
    const rows = [
        { label: "Name", value: inspected.name },
        { label: "Id", value: inspected.id.slice(0, 12), style: mono },
        { label: "Image", value: inspected.image },
        { label: "State", value: inspected.state },
        { label: "Started", value: inspected.startedAt },
        { label: "Restarts", value: String(inspected.restartCount) },
        { label: "Command", value: inspected.command, style: mono },
    ];
    const lists = [
        ["Ports", inspected.ports],
        ["Mounts", inspected.mounts],
        ["Networks", inspected.networks],
    ];
    for (const [label, values] of lists) {
        if (values.length > 0)
            rows.push({ label, value: values.join("\n"), style: mono });
    }
    return rows;
}
export function containerView(inspected, id) {
    if (inspected === null) {
        return ui.column(ROOT_KEY, [ui.text(MESSAGE_KEY, `No container ${id}`, { color: "text_muted" })], { padding: "md" });
    }
    return ui.column(ROOT_KEY, [
        ui.text("title", inspected.name, { size: "lg", weight: "bold" }),
        containerControls(inspected),
        ui.details(DETAILS_KEY, inspectedDetails(inspected)),
        ui.divider("rule"),
        ui.text("logs-title", "Logs", { weight: "medium" }),
        ui.stream(LOGS_KEY, [], LOG_LINES),
    ], { padding: "md", gap: "sm", height: "fill" });
}
export function fileItem(entry, children = null) {
    if (entry.isDir) {
        return {
            key: `${PATH_PREFIX}${entry.path}`,
            label: entry.name,
            icon: "folder",
            expansion: children === null ? "collapsed" : "expanded",
            children: children ?? [],
        };
    }
    return {
        key: `${PATH_PREFIX}${entry.path}`,
        label: entry.name,
        icon: "file",
        expansion: "leaf",
        actions: [
            { action: ACTIONS.openFile, label: "Open a copy", icon: "open-external" },
            { action: ACTIONS.upload, label: "Upload to container", icon: "exchange" },
        ],
    };
}
export function filesView(name, entries) {
    const header = ui.row("files-header", [
        ui.text(FILES_TITLE_KEY, `${name}:/`, { size: "md", weight: "bold", font: "mono" }),
        ui.button("files-refresh", ACTIONS.refreshFiles, { label: "Refresh", icon: "refresh", variant: "ghost" }),
    ], { gap: "sm" });
    const body = typeof entries === "string"
        ? ui.text(MESSAGE_KEY, entries, { color: "text_muted", wrap: "wrap" })
        : ui.tree(FILES_TREE_KEY, entries.map((entry) => fileItem(entry)));
    return ui.column(ROOT_KEY, [header, ui.text(FILES_HINT_KEY, FILES_HINT, { size: "xs", color: "text_muted" }), body], { padding: "md", gap: "sm", height: "fill" });
}
export function newContainerView(image, problems = []) {
    const text = (key, label, placeholder, value = "") => ({
        key,
        label,
        type: "text",
        value,
        placeholder,
    });
    const form = ui.form(FORM_KEY, ACTIONS.create, [
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
            value: "no",
        },
    ], "Create and start");
    const messages = problems.map((problem, index) => ui.text(`problem-${index}`, problem.message, { color: "error", wrap: "wrap" }));
    return ui.column(ROOT_KEY, [
        ui.text("new-container-title", "New container", { size: "lg", weight: "bold" }),
        ui.column(PROBLEMS_KEY, messages, { gap: "xs" }),
        form,
    ], { padding: "md", gap: "md", height: "fill" });
}
