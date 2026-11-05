import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
const LABEL_SEPARATOR = ",";
const LABEL_ASSIGN = "=";
const LOG_TAIL = "200";
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const DIR_MARK = "/";
const ROOT = "/";
export function childPath(dir, name) {
    return dir.endsWith(DIR_MARK) ? `${dir}${name}` : `${dir}${DIR_MARK}${name}`;
}
export function parseListing(dir, output) {
    return output
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .filter((line) => line.length > 0 && line !== "./" && line !== "../")
        .map((line) => {
        const isDir = line.endsWith(DIR_MARK);
        const name = isDir ? line.slice(0, -1) : line;
        return { name, path: childPath(dir === "" ? ROOT : dir, name), isDir };
    })
        .sort((left, right) => Number(right.isDir) - Number(left.isDir) || left.name.localeCompare(right.name));
}
export const RESTART_POLICIES = ["no", "unless-stopped", "always", "on-failure"];
const LIST_SEPARATOR = /[,\n]/;
const PORT_PATTERN = /^(\d{1,5}(-\d{1,5})?:)?\d{1,5}(-\d{1,5})?(\/(tcp|udp))?$|^[\d.]+:\d{1,5}:\d{1,5}(\/(tcp|udp))?$/;
const ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const VOLUME_PATTERN = /^[^:]+:\/[^:]*(:(ro|rw))?$/;
export function listOf(text) {
    return text
        .split(LIST_SEPARATOR)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}
export function wordsOf(text) {
    return text.trim() === "" ? [] : text.trim().split(/\s+/);
}
export function checkRun(spec) {
    const problems = [];
    if (spec.image.trim() === "")
        problems.push({ field: "image", message: "Name the image to run." });
    if (spec.name !== "" && !NAME_PATTERN.test(spec.name)) {
        problems.push({ field: "name", message: "A name holds letters, digits, '_', '.' and '-'." });
    }
    const bad = (values, pattern) => values.filter((value) => !pattern.test(value));
    for (const port of bad(spec.ports, PORT_PATTERN)) {
        problems.push({ field: "ports", message: `${port} is not host:container, e.g. 8080:80` });
    }
    for (const variable of bad(spec.env, ENV_PATTERN)) {
        problems.push({ field: "env", message: `${variable} is not NAME=value` });
    }
    for (const volume of bad(spec.volumes, VOLUME_PATTERN)) {
        problems.push({ field: "volumes", message: `${volume} is not source:/path, e.g. ./data:/data` });
    }
    return problems;
}
export function runArgs(spec) {
    const args = ["run", "--detach"];
    if (spec.name !== "")
        args.push("--name", spec.name);
    if (spec.restart !== "no")
        args.push("--restart", spec.restart);
    for (const port of spec.ports)
        args.push("--publish", port);
    for (const variable of spec.env)
        args.push("--env", variable);
    for (const volume of spec.volumes)
        args.push("--volume", volume);
    return [...args, spec.image.trim(), ...spec.command];
}
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
    async listDir(id, dir) {
        return parseListing(dir, await this.output(["exec", id, "ls", "-1Ap", "--", dir]));
    }
    async copyOut(id, path, destination) {
        await this.output(["cp", `${id}:${path}`, destination]);
    }
    async copyIn(id, source, path) {
        await this.output(["cp", source, `${id}:${path}`]);
    }
    async run(spec) {
        return (await this.output(runArgs(spec))).trim();
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
