export declare const MAX_FRAME_BYTES: number;
export declare function encodeFrame(message: unknown): Buffer;
export declare class FrameError extends Error {
}
export declare class FrameDecoder {
    private buffer;
    push(chunk: Buffer): unknown[];
}
