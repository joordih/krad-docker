import { Connection, METHOD_NOT_FOUND, RpcError } from "./rpc.js";
export class App {
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
}
const EXIT_CODE = 0;
function features(definition) {
    const offered = ["window", "workspace", "settings", "secrets", "terminals", "files"];
    if (definition.commands !== undefined)
        offered.push("commands");
    if (definition.views !== undefined)
        offered.push("views");
    if (definition.tools !== undefined)
        offered.push("tools");
    if (definition.hostKinds !== undefined)
        offered.push("host_kinds");
    return offered;
}
function lookup(table, name, what) {
    const found = table?.[name];
    if (found === undefined) {
        throw new RpcError(METHOD_NOT_FOUND, `the extension has no ${what} ${name}`);
    }
    return found;
}
export function createExtension(definition, io = {
    input: process.stdin,
    output: process.stdout,
}) {
    const connection = new Connection(io.input, io.output);
    const app = new App(connection);
    const exit = io.exit ?? ((code) => process.exit(code));
    let context;
    const ready = () => {
        if (context === undefined) {
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
            if (rows === undefined) {
                throw new RpcError(METHOD_NOT_FOUND, `the view ${params.view} has no rows`);
            }
            return rows(params, ready());
        },
        "tool/call": async ({ tool, arguments: args, root }) => {
            const answer = await lookup(definition.tools, tool, "tool")(args ?? {}, root ?? null, ready());
            return typeof answer === "string" ? { content: [{ type: "text", text: answer }], outcome: "done" } : answer;
        },
        "host/list": async ({ kind }) => lookup(definition.hostKinds, kind, "host kind").list(ready()),
        "host/connect": async ({ kind, machine }) => lookup(definition.hostKinds, kind, "host kind").connect(machine, ready()),
    };
    const notifications = {
        initialized: () => { },
        exit: () => exit(EXIT_CODE),
        "view/event": ({ event, ...view }) => {
            const handler = definition.views?.[view.view]?.onEvent;
            if (handler !== undefined) {
                Promise.resolve(handler(event, view, ready())).catch((error) => app.log("error", `view event failed: ${String(error)}`));
            }
        },
        "view/closed": (view) => definition.views?.[view.view]?.onClose?.(view, ready()),
        "workspace/event": (event) => definition.onWorkspaceEvent?.(event, ready()),
        "settings/changed": (settings) => definition.onSettingsChanged?.(settings, ready()),
    };
    connection.handleRequests((method, params) => {
        const handler = requests[method];
        if (handler === undefined) {
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
