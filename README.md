# Docker for Krad ADE

Containers, images and Compose projects in Krad ADE, through the `docker` CLI.

- **Containers** view in the sidebar: containers grouped by Compose project, with their state, and
  start, stop, restart and remove (remove asks first). The menu of a container shows its logs,
  opens a shell in it or inspects it.
- **Container** tab: the inspected container (image, ports, mounts, networks, command) and its
  logs, followed live.
- Commands in the palette: refresh, Compose up and down, build an image, remove stopped containers.
  The file tree menu of a `Dockerfile` builds it, the one of a Compose file brings it up or down;
  these run in a terminal so their output stays visible.
- Agent tools: `list_containers` and `restart_container` (destructive, so each harness asks first).
- Host kind **Docker container**: an environment can live inside a running container; the app
  reaches it with `docker exec -i <container> sh`.

## Install

The extension runs on Node 20 or newer, which Krad installs when it is missing. The repository
carries its built program, `dist/main.js`, bundled with the
[`@krad-ade/extension`](https://www.npmjs.com/package/@krad-ade/extension) SDK into one file, so
nothing is installed and no `npm install` runs when it is added.

1. Settings → Extensions → Browse, and install Docker from the index (or add this folder or its
   git address).
2. Trust it when Krad shows what it declares, including the `terminals` permission it needs for
   shells, logs and Compose.

## Settings

| Setting | Default | |
|---|---|---|
| Docker program | `docker` | The CLI to run, by name on `PATH` or as a full path. |
| Show stopped containers | on | |
| Refresh every (seconds) | 5 | How often the open Containers view looks again. |

## Develop

```sh
npm install
npm test
```

`npm test` type-checks, bundles `dist/main.js` with esbuild and runs the tests against a fake
`docker` in `test/fixtures/bin`. After changing `src/` or updating `@krad-ade/extension`, commit
the rebuilt `dist/`.
