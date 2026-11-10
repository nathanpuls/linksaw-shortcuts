# Linksaw Automations

This directory contains the executable side of the command launcher. The
[Linksaw workbook](https://docs.google.com/spreadsheets/d/1oUzfeQwyfHmvrO7Rf2I2ryPT-eR6PNN_z1MmwtCM7fI/edit)
controls command names, aliases, descriptions, order, enabled state, and stable
Command IDs. It never stores executable action JSON.

## Edit an automation

Each command lives in its own file under `commands/`. A command file returns a
table with its stable `id` and a `run(context, done)` function:

```lua
return {
  id = "example.command",
  run = function(context, done)
    -- Perform the command, then call done().
    -- Call done("message") to show an error.
    done()
  end,
}
```

After adding a file, add the same ID and relative filename to `manifest.json`.
Use that ID in the workbook's **Command ID** column. Commit and push the change,
then open Linksaw and press **Command-R**. Linksaw downloads the manifest and
every listed command, validates the complete set, refreshes the workbook, and
reloads Hammerspoon only when command code changed.

## Local files

Synced files are installed in `~/.hammerspoon/linksaw-actions/`. The stable
loader is `~/.hammerspoon/linksaw-actions.lua`. Do not put secrets in this
public repository; keep machine-specific or sensitive configuration in a
separate local file.

## Launcher controls

- **Right Command:** show or hide Linksaw
- **Escape:** hide Linksaw
- **Command-1** through **Command-9:** run the matching visible command
- **Command-R:** sync GitHub commands and Sheet metadata
