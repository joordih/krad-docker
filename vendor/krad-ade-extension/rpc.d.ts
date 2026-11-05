import type { Readable, Writable } from "node:stream";
export declare const METHOD_NOT_FOUND = -32601;
export declare const INVALID_PARAMS = -32602;
export declare const INTERNAL_ERROR = -32603;
export declare const REQUEST_FAILED = -32803;
export interface ResponseError {
    code: number;
    message: string;
}
export declare class RpcError extends Error {
    readonly code: number;
    constructor(code: number, message: string);
}
export type RequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;
export type NotificationHandler = (method: string, params: unknown) => void;
export declare class Connection {
    private readonly output;
    private nextId;
    private readonly pending;
    private readonly decoder;
    private onRequest;
    private onNotification;
    private onClose;
    constructor(input: Readable, output: Writable);
    handleRequests(handler: RequestHandler): void;
    handleNotifications(handler: NotificationHandler): void;
    handleClose(handler: () => void): void;
    request(method: string, params: unknown): Promise<unknown>;
    notify(method: string, params: unknown): void;
    private write;
    private receive;
    private dispatch;
    private answer;
    private close;
}
