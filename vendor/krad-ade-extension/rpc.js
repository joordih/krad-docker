import { encodeFrame, FrameDecoder } from "./framing.js";
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const REQUEST_FAILED = -32803;
const JSONRPC = "2.0";
export class RpcError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export class Connection {
    output;
    nextId = 1;
    pending = new Map();
    decoder = new FrameDecoder();
    onRequest = (method) => {
        throw new RpcError(METHOD_NOT_FOUND, method);
    };
    onNotification = () => { };
    onClose = () => { };
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
        if (message.method !== undefined && message.id !== undefined) {
            void this.answer(message.id, message.method, message.params);
            return;
        }
        if (message.method !== undefined) {
            this.onNotification(message.method, message.params);
            return;
        }
        if (message.id === undefined) {
            return;
        }
        const pending = this.pending.get(message.id);
        if (pending === undefined) {
            return;
        }
        this.pending.delete(message.id);
        if (message.error !== undefined) {
            pending.reject(new RpcError(message.error.code, message.error.message));
        }
        else {
            pending.resolve(message.result ?? null);
        }
    }
    async answer(id, method, params) {
        try {
            const result = await this.onRequest(method, params);
            this.write({ jsonrpc: JSONRPC, id, result: result ?? {} });
        }
        catch (error) {
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
}
