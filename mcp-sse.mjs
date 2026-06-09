import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import fs from "fs";

const app = express();
const PORT = parseInt(process.argv[2] || process.env.PORT || "3000", 10);

app.use(express.json());

const server = new Server(
  { name: "mcp-filesystem-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description: "读取指定路径的文件内容",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
      {
        name: "list_directory",
        description: "列出指定目录下的文件和子目录",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "read_file") {
    const content = fs.readFileSync(args.path, "utf-8");
    return { content: [{ type: "text", text: content }] };
  }
  if (name === "list_directory") {
    const entries = fs.readdirSync(args.path, { withFileTypes: true });
    const text = entries
      .map((e) => e.isDirectory() ? `[目录] ${e.name}` : `[文件] ${e.name}`)
      .join("\n");
    return { content: [{ type: "text", text }] };
  }
  throw new Error("工具不存在");
});

const transports = new Map();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  res.on("close", () => {
    transports.delete(sessionId);
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("会话不存在");
  }
});

app.listen(PORT, () => {
  console.log(`MCP 服务已在端口 ${PORT} 启动`);
});