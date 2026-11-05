import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
const LABEL_SEPARATOR = ",";
const LABEL_ASSIGN = "=";
const LOG_TAIL = "200";
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const SHELL_PROBE = "command -v bash >/dev/null 2>&1 && exec bash || exec sh";
export function shellArgs(id) {
    return ["exec", "-it", id, "sh", "-c", SHELL_PROBE];
}
export function parseImages(output) {
    return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const image = JSON.parse(line);
        return {
            id: image.ID,
            repository: image.Repository,
            tag: image.Tag,
            size: image.Size,
            created: image.CreatedSince,
        };
    });
}
const STATES = ["running", "paused", "restarting", "exited", "created", "dead", "removing"];
function state(text) {
    const lowered = text.toLowerCase();
    return STATES.includes(lowered) ? lowered : "exited";
}
function labels(text) {
    const found = new Map();
    for (const pair of (text ?? "").split(LABEL_SEPARATOR)) {
        const at = pair.indexOf(LABEL_ASSIGN);
        if (at > 0) {
            found.set(pair.slice(0, at), pair.slice(at + 1));
        }
    }
    return found;
}
export function parsePs(output) {
    return output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const ps = JSON.parse(line);
        const tags = labels(ps.Labels);
        return {
            id: ps.ID,
            name: ps.Names,
            image: ps.Image,
            state: state(ps.State),
            status: ps.Status,
            project: tags.get(COMPOSE_PROJECT_LABEL) ?? null,
            service: tags.get(COMPOSE_SERVICE_LABEL) ?? null,
        };
    });
}
export function parseInspect(output) {
    const [found] = JSON.parse(output);
    if (found === undefined) {
        return null;
    }
    const ports = Object.entries(found.NetworkSettings?.Ports ?? {}).flatMap(([port, bindings]) => (bindings ?? []).length === 0
        ? [port]
        : (bindings ?? []).map((binding) => `${binding.HostIp || "0.0.0.0"}:${binding.HostPort} → ${port}`));
    return {
        id: found.Id,
        name: found.Name.replace(/^\//, ""),
        image: found.Config?.Image ?? "",
        created: found.Created,
        state: found.State?.Status ?? "",
        startedAt: found.State?.StartedAt ?? "",
        restartCount: found.RestartCount ?? 0,
        ports,
        mounts: (found.Mounts ?? []).map((mount) => `${mount.Source ?? ""} → ${mount.Destination ?? ""}`),
        networks: Object.keys(found.NetworkSettings?.Networks ?? {}),
        command: [found.Path ?? "", ...(found.Args ?? [])].join(" ").trim(),
    };
}
const ACTION_ARGS = {
    start: ["start"],
    stop: ["stop"],
    restart: ["restart"],
    remove: ["rm", "--force"],
};
export class Docker {
    program;
    constructor(program) {
        this.program = program;
    }
    async output(args) {
        const { stdout } = await run(this.program, args, { maxBuffer: OUTPUT_LIMIT });
        return stdout;
    }
    async containers(all) {
        const args = ["ps", "--no-trunc", "--format", "{{json .}}"];
        return parsePs(await this.output(all ? [...args, "--all"] : args));
    }
    async inspect(id) {
        return parseInspect(await this.output(["inspect", id]));
    }
    async act(action, id) {
        await this.output([...ACTION_ARGS[action], id]);
    }
    async images() {
        return parseImages(await this.output(["image", "ls", "--format", "{{json .}}"]));
    }
    async removeImage(id) {
        await this.output(["image", "rm", id]);
    }
    async prune() {
        return this.output(["container", "prune", "--force"]);
    }
    followLogs(id, line) {
        const child = spawn(this.program, ["logs", "--follow", "--tail", LOG_TAIL, id], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const forward = (isError) => {
            let rest = "";
            return (chunk) => {
                const lines = (rest + chunk.toString("utf8")).split("\n");
                rest = lines.pop() ?? "";
                for (const text of lines)
                    line(text, isError);
            };
        };
        child.stdout?.on("data", forward(false));
        child.stderr?.on("data", forward(true));
        return child;
    }
}
