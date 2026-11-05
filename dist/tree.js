import { ui } from "../vendor/krad-ade-extension/index.js";
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
};
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
        items.splice(1, 0, { action: ACTIONS.exec, label: "Open a shell", icon: "terminal" });
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
export function containersView(containers) {
    const body = typeof containers === "string"
        ? ui.text(MESSAGE_KEY, containers, { color: "text_muted", wrap: "wrap" })
        : containers.length === 0
            ? ui.text(MESSAGE_KEY, "No containers", { color: "text_muted" })
            : ui.tree(TREE_KEY, containersTree(containers));
    return ui.column(ROOT_KEY, [body], { padding: "sm", gap: "sm", height: "fill" });
}
export const DETAILS_KEY = "details";
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
        ui.details(DETAILS_KEY, inspectedDetails(inspected)),
        ui.divider("rule"),
        ui.text("logs-title", "Logs", { weight: "medium" }),
        ui.stream(LOGS_KEY, [], LOG_LINES),
    ], { padding: "md", gap: "sm", height: "fill" });
}
