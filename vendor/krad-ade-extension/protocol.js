export const PROGRAM_REQUESTS = [
    "initialize", "shutdown", "command/execute", "view/render", "view/rows", "tool/call", "host/list",
    "host/connect",
];
export const APP_REQUESTS = [
    "command/run", "view/open", "view/close", "window/confirm", "window/pick", "window/input",
    "terminal/open", "workspace/context", "file/open", "settings/get", "secret/get", "secret/set",
];
export const PROGRAM_NOTIFICATIONS = [
    "initialized", "exit", "view/event", "view/closed", "workspace/event", "settings/changed",
];
export const APP_NOTIFICATIONS = [
    "window/log", "view/patch", "window/toast", "window/progress", "terminal/send",
];
