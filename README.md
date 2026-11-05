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
carries its built program (`dist/`) and the SDK it uses (`vendor/krad-ade-extension/`, a copy of
the built `@krad-ade/extension` from `sdk/typescript` in the Krad ADE repository), so nothing is
installed when it is added.

1. Settings → Languages → Extensions → Add folder, and pick this folder (or add it by its git
   address).
2. Trust it when Krad shows what it declares.

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

`npm test` builds `dist/` and runs the tests against a fake `docker` in `test/fixtures/bin`.
After changing `src/`, commit the rebuilt `dist/`. To update the SDK, build it in
`sdk/typescript` and copy its `dist/` over `vendor/krad-ade-extension/`.
