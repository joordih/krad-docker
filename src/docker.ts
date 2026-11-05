import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";
const LABEL_SEPARATOR = ",";
const LABEL_ASSIGN = "=";
const LOG_TAIL = "200";
const OUTPUT_LIMIT = 16 * 1024 * 1024;

export type ContainerState = "running" | "paused" | "restarting" | "exited" | "created" | "dead" | "removing";

export interface Container {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  project: string | null;
  service: string | null;
}

export type ContainerAction = "start" | "stop" | "restart" | "remove";

export interface Image {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

interface ImageLine {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedSince: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

const DIR_MARK = "/";
const ROOT = "/";

export function childPath(dir: string, name: string): string {
  return dir.endsWith(DIR_MARK) ? `${dir}${name}` : `${dir}${DIR_MARK}${name}`;
}

export function parseListing(dir: string, output: string): DirEntry[] {
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

const SHELL_PROBE = "command -v bash >/dev/null 2>&1 && exec bash || exec sh";

export function shellArgs(id: string): string[] {
  return ["exec", "-it", id, "sh", "-c", SHELL_PROBE];
}

export function parseImages(output: string): Image[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const image = JSON.parse(line) as ImageLine;
      return {
        id: image.ID,
        repository: image.Repository,
        tag: image.Tag,
        size: image.Size,
        created: image.CreatedSince,
      };
    });
}

interface PsLine {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Labels?: string;
}

const STATES: readonly ContainerState[] = ["running", "paused", "restarting", "exited", "created", "dead", "removing"];

function state(text: string): ContainerState {
  const lowered = text.toLowerCase() as ContainerState;
  return STATES.includes(lowered) ? lowered : "exited";
}

function labels(text: string | undefined): Map<string, string> {
  const found = new Map<string, string>();
  for (const pair of (text ?? "").split(LABEL_SEPARATOR)) {
    const at = pair.indexOf(LABEL_ASSIGN);
    if (at > 0) {
      found.set(pair.slice(0, at), pair.slice(at + 1));
    }
  }
  return found;
}

export function parsePs(output: string): Container[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const ps = JSON.parse(line) as PsLine;
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

export interface Inspected {
  id: string;
  name: string;
  image: string;
  created: string;
  state: string;
  startedAt: string;
  restartCount: number;
  ports: string[];
  mounts: string[];
  networks: string[];
  command: string;
}

interface InspectJson {
  Id: string;
  Name: string;
  Created: string;
  RestartCount?: number;
  Path?: string;
  Args?: string[];
  Config?: { Image?: string };
  State?: { Status?: string; StartedAt?: string };
  NetworkSettings?: {
    Ports?: Record<string, { HostIp: string; HostPort: string }[] | null>;
    Networks?: Record<string, unknown>;
  };
  Mounts?: { Source?: string; Destination?: string }[];
}

export function parseInspect(output: string): Inspected | null {
  const [found] = JSON.parse(output) as InspectJson[];
  if (found === undefined) {
    return null;
  }
  const ports = Object.entries(found.NetworkSettings?.Ports ?? {}).flatMap(([port, bindings]) =>
    (bindings ?? []).length === 0
      ? [port]
      : (bindings ?? []).map((binding) => `${binding.HostIp || "0.0.0.0"}:${binding.HostPort} → ${port}`),
  );
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

const ACTION_ARGS: Record<ContainerAction, string[]> = {
  start: ["start"],
  stop: ["stop"],
  restart: ["restart"],
  remove: ["rm", "--force"],
};

export class Docker {
  constructor(public program: string) {}

  private async output(args: string[]): Promise<string> {
    const { stdout } = await run(this.program, args, { maxBuffer: OUTPUT_LIMIT });
    return stdout;
  }

  async containers(all: boolean): Promise<Container[]> {
    const args = ["ps", "--no-trunc", "--format", "{{json .}}"];
    return parsePs(await this.output(all ? [...args, "--all"] : args));
  }

  async inspect(id: string): Promise<Inspected | null> {
    return parseInspect(await this.output(["inspect", id]));
  }

  async act(action: ContainerAction, id: string): Promise<void> {
    await this.output([...ACTION_ARGS[action], id]);
  }

  async images(): Promise<Image[]> {
    return parseImages(await this.output(["image", "ls", "--format", "{{json .}}"]));
  }

  async removeImage(id: string): Promise<void> {
    await this.output(["image", "rm", id]);
  }

  async listDir(id: string, dir: string): Promise<DirEntry[]> {
    return parseListing(dir, await this.output(["exec", id, "ls", "-1Ap", "--", dir]));
  }

  async copyOut(id: string, path: string, destination: string): Promise<void> {
    await this.output(["cp", `${id}:${path}`, destination]);
  }

  async copyIn(id: string, source: string, path: string): Promise<void> {
    await this.output(["cp", source, `${id}:${path}`]);
  }

  async prune(): Promise<string> {
    return this.output(["container", "prune", "--force"]);
  }

  followLogs(id: string, line: (text: string, isError: boolean) => void): ChildProcess {
    const child = spawn(this.program, ["logs", "--follow", "--tail", LOG_TAIL, id], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const forward = (isError: boolean) => {
      let rest = "";
      return (chunk: Buffer) => {
        const lines = (rest + chunk.toString("utf8")).split("\n");
        rest = lines.pop() ?? "";
        for (const text of lines) line(text, isError);
      };
    };
    child.stdout?.on("data", forward(false));
    child.stderr?.on("data", forward(true));
    return child;
  }
}
