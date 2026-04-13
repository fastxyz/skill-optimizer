# taskfile CLI

A simple command-line task manager.

## Usage

```bash
taskfile add --title "Buy groceries"
taskfile list
taskfile done --id abc123
```

## Commands

### add

Add a new task.

```bash
taskfile add --title "Task title"
```

### list

List your current tasks.

```bash
taskfile list
```

### done

Mark a task as done using its ID.

```bash
taskfile done --id <id>
```
