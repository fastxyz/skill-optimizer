import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Scaffold benchmark config, tasks, and example tools for a new project.
 */
export function initBenchmark(targetDir: string = process.cwd()): void {
  const configPath = resolve(targetDir, 'skill-optimizer.json');
  const tasksPath = resolve(targetDir, 'tasks.json');
  const toolsPath = resolve(targetDir, 'tools.json');

  // skill-optimizer.json
  if (existsSync(configPath)) {
    console.log(`[init] Skipping ${configPath} (already exists)`);
  } else {
    const config = {
      name: "my-sdk",
      target: {
        surface: "sdk",
        repoPath: ".",
        skill: "./SKILL.md",
        discovery: {
          mode: "auto",
          sources: ["./src/index.ts"]
        },
        sdk: {
          language: "typescript",
          apiSurface: [
            "MyClient.constructor",
            "MyClient.getData",
            "MyClient.sendData"
          ]
        }
      },
      benchmark: {
        tasks: "./tasks.json",
        apiKeyEnv: "OPENROUTER_API_KEY",
        format: "pi",
        timeout: 240000,
        models: [
          { id: "openrouter/openai/gpt-5.4", name: "GPT-5.4", tier: "flagship" },
          { id: "openrouter/anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", tier: "mid" }
        ],
        output: {
          dir: "./benchmark-results"
        }
      },
      optimize: {
        enabled: false,
        model: "openrouter/openai/gpt-5.4",
        apiKeyEnv: "OPENROUTER_API_KEY",
        allowedPaths: ["SKILL.md"],
        validation: []
      }
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${configPath}`);
  }

  // tasks.json
  if (existsSync(tasksPath)) {
    console.log(`[init] Skipping ${tasksPath} (already exists)`);
  } else {
    const tasks = {
      tasks: [
        {
          id: "example-create",
          prompt: "Create a new MyClient instance connected to the test environment.",
          expected_actions: [
            { name: "MyClient.constructor" }
          ]
        },
        {
          id: "example-get-data",
          prompt: "Get data for item 'abc123' using the client.",
          expected_actions: [
            { name: "MyClient.constructor" },
            { name: "MyClient.getData", args: { "_positional_0": "abc123" } }
          ]
        },
        {
          id: "example-send-data",
          prompt: "Send data with value 'hello' to recipient 'user1'.",
          expected_actions: [
            { name: "MyClient.constructor" },
            { name: "MyClient.sendData", args: { value: "hello", recipient: "user1" } }
          ]
        }
      ]
    };
    writeFileSync(tasksPath, JSON.stringify(tasks, null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${tasksPath}`);
  }

  // tools.json (MCP surface example)
  if (existsSync(toolsPath)) {
    console.log(`[init] Skipping ${toolsPath} (already exists)`);
  } else {
    const tools = [
      {
        type: "function",
        function: {
          name: "get_data",
          description: "Get data for a given item ID",
          parameters: {
            type: "object",
            properties: {
              item_id: { type: "string", description: "The item identifier" }
            },
            required: ["item_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "send_data",
          description: "Send data to a recipient",
          parameters: {
            type: "object",
            properties: {
              value: { type: "string", description: "The data to send" },
              recipient: { type: "string", description: "The recipient identifier" }
            },
            required: ["value", "recipient"]
          }
        }
      }
    ];
    writeFileSync(toolsPath, JSON.stringify(tools, null, 2) + '\n', 'utf-8');
    console.log(`[init] Created ${toolsPath} (MCP surface example)`);
  }

  console.log('\n[init] Done! Next steps:');
  console.log('  1. Edit skill-optimizer.json with your surface (sdk/cli/mcp) details');
  console.log('     For SDK benchmarks, set sdk.language to typescript, python, or rust.');
  console.log('  2. Edit tasks.json with your test cases');
  console.log('  3. Run: npx skill-optimizer run');
}
