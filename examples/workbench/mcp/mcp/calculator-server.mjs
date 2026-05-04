import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFromApp = createRequire('/app/package.json');
const { createMcpExpressApp } = requireFromApp('@modelcontextprotocol/sdk/server/express.js');
const { Server } = requireFromApp('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = requireFromApp('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema } = requireFromApp('@modelcontextprotocol/sdk/types.js');

const tools = [
  { name: 'add', description: 'Add two numbers.', inputSchema: binaryNumberSchema('a', 'b') },
  { name: 'subtract', description: 'Subtract b from a.', inputSchema: binaryNumberSchema('a', 'b') },
  { name: 'multiply', description: 'Multiply two numbers.', inputSchema: binaryNumberSchema('a', 'b') },
  { name: 'divide', description: 'Divide a by b.', inputSchema: binaryNumberSchema('a', 'b') },
];

const transports = {};
const app = createMcpExpressApp({ host: '0.0.0.0' });

app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let transport = typeof sessionId === 'string' ? transports[sessionId] : undefined;

    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });
      await createCalculatorServer().connect(transport);
    }

    if (!transport) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request' }, id: null });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = typeof sessionId === 'string' ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transport.handleRequest(req, res);
});

app.listen(3000, (error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.error('calculator MCP server listening on :3000');
});

function createCalculatorServer() {
  const server = new Server(
    { name: 'calculator', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const a = readNumber(args.a, 'a');
    const b = readNumber(args.b, 'b');

    if (name === 'add') return toolResult(a + b);
    if (name === 'subtract') return toolResult(a - b);
    if (name === 'multiply') return toolResult(a * b);
    if (name === 'divide') {
      if (b === 0) throw new Error('Cannot divide by zero');
      return toolResult(a / b);
    }
    throw new Error(`Unknown calculator tool: ${name}`);
  });

  return server;
}

function toolResult(result) {
  return {
    content: [{ type: 'text', text: String(result) }],
    structuredContent: { result },
  };
}

function binaryNumberSchema(left, right) {
  return {
    type: 'object',
    properties: {
      [left]: { type: 'number' },
      [right]: { type: 'number' },
    },
    required: [left, right],
    additionalProperties: false,
  };
}

function readNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Argument ${name} must be a finite number`);
  }
  return value;
}
