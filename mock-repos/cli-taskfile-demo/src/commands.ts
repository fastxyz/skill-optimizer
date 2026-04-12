/**
 * CLI command definitions for the taskfile demo.
 * Exported as a literal array so the skill-optimizer can discover the surface
 * via static analysis — no runtime evaluation needed.
 */
export const COMMANDS = [
  {
    command: "add",
    description: "Add a new task to the list",
    options: [
      { name: "title", takesValue: true, description: "Task title (required)" },
      { name: "priority", takesValue: true, description: "Priority level: low, medium, or high (default: medium)" },
      { name: "due", takesValue: true, description: "Due date in YYYY-MM-DD format" },
    ],
  },
  {
    command: "list",
    description: "List tasks, optionally filtered",
    options: [
      { name: "status", takesValue: true, description: "Filter by status: pending, done, or all (default: pending)" },
      { name: "priority", takesValue: true, description: "Filter by priority level" },
    ],
  },
  {
    command: "done",
    description: "Mark a task as completed",
    options: [
      { name: "id", takesValue: true, description: "Task ID to mark as done (required)" },
    ],
  },
  {
    command: "delete",
    description: "Permanently delete a task",
    options: [
      { name: "id", takesValue: true, description: "Task ID to delete (required)" },
      { name: "force", takesValue: false, description: "Skip the confirmation prompt" },
    ],
  },
  {
    command: "update",
    description: "Update one or more fields of an existing task",
    options: [
      { name: "id", takesValue: true, description: "Task ID to update (required)" },
      { name: "title", takesValue: true, description: "New task title" },
      { name: "priority", takesValue: true, description: "New priority level" },
      { name: "due", takesValue: true, description: "New due date in YYYY-MM-DD format" },
    ],
  },
];
