import type { Readable, Writable } from "node:stream";
import type { AppNotifications, AppRequests, CallToolResult, CommandTarget, InitializeParams, Machine, MachineChannel, RowsParams, RowsResult, SettingsValues, ViewRef, WorkspaceEvent } from "./protocol.js";
import { Connection } from "./rpc.js";
import type { Node, Patch, ViewEvent } from "./view.js";
type Params<M, K extends keyof M> = M[K] extends [infer P, unknown] ? P : never;
type Result<M, K extends keyof M> = M[K] extends [unknown, infer R] ? R : never;
export declare class App {
    private readonly connection;
    constructor(connection: Connection);
    request<K extends keyof AppRequests>(method: K, params: Params<AppRequests, K>): Promise<Result<AppRequests, K>>;
    notify<K extends keyof AppNotifications>(method: K, params: AppNotifications[K]): void;
    log(level: AppNotifications["window/log"]["level"], message: string): void;
    toast(message: string, tone?: AppNotifications["window/toast"]["tone"]): void;
    progress(params: AppNotifications["window/progress"]): void;
    patchView(view: ViewRef, patches: Patch[]): void;
    sendTerminal(terminal: number, text: string): void;
    confirm(params: Params<AppRequests, "window/confirm">): Promise<import("./protocol.js").Answer>;
    pick(params: Params<AppRequests, "window/pick">): Promise<string[] | null>;
    input(params: Params<AppRequests, "window/input">): Promise<string | null>;
    openTerminal(params: Params<AppRequests, "terminal/open">): Promise<number>;
    openFile(params: Params<AppRequests, "file/open">): Promise<import("./protocol.js").Empty>;
    workspaceContext(): Promise<import("./protocol.js").WorkspaceContextResult>;
    getSettings(): Promise<SettingsValues>;
    getSecret(name: string): Promise<string | null>;
    setSecret(name: string, value: string | null): Promise<import("./protocol.js").Empty>;
    runCommand(params: Params<AppRequests, "command/run">): Promise<import("./protocol.js").Empty>;
    openView(params: Params<AppRequests, "view/open">): Promise<import("./protocol.js").Empty>;
    closeView(view: ViewRef): Promise<import("./protocol.js").Empty>;
}
export interface Context {
    app: App;
    init: InitializeParams;
}
export interface ViewDefinition {
    render(view: ViewRef, context: Context): Promise<Node> | Node;
    rows?(params: RowsParams, context: Context): Promise<RowsResult> | RowsResult;
    onEvent?(event: ViewEvent, view: ViewRef, context: Context): Promise<void> | void;
    onClose?(view: ViewRef, context: Context): void;
}
export type CommandHandler = (target: CommandTarget | null, context: Context) => Promise<void> | void;
export type ToolHandler = (args: unknown, root: string | null, context: Context) => Promise<CallToolResult | string> | CallToolResult | string;
export interface HostKindDefinition {
    list(context: Context): Promise<Machine[]> | Machine[];
    connect(machine: string, context: Context): Promise<MachineChannel> | MachineChannel;
}
export interface ExtensionDefinition {
    onInitialize?(context: Context): Promise<void> | void;
    onShutdown?(context: Context): Promise<void> | void;
    commands?: Record<string, CommandHandler>;
    views?: Record<string, ViewDefinition>;
    tools?: Record<string, ToolHandler>;
    hostKinds?: Record<string, HostKindDefinition>;
    onWorkspaceEvent?(event: WorkspaceEvent, context: Context): void;
    onSettingsChanged?(settings: SettingsValues, context: Context): void;
}
export interface Extension {
    app: App;
    connection: Connection;
}
export declare function createExtension(definition: ExtensionDefinition, io?: {
    input: Readable;
    output: Writable;
    exit?: (code: number) => void;
}): Extension;
export {};
