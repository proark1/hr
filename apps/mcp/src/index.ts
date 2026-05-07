#!/usr/bin/env node
/**
 * OurTeamManagement MCP server.
 *
 * Wraps the OurTeamManagement REST API as MCP tools so agents (Claude, etc.) can act on
 * HR data with the same surface backend integrations use.
 *
 * Auth: the MCP server is configured with an API key + a tenant id.
 * One MCP server instance = one tenant scope. The integrating product
 * spawns/configures a server per tenant it wants to give an agent access to.
 *
 * Transport: stdio (the standard MCP transport). HTTP transport can be added
 * later if a hosted endpoint is desired.
 */
import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

const Config = z.object({
  MYHR_API_URL: z.string().url().default("http://localhost:8080"),
  MYHR_API_KEY: z.string().min(1),
  MYHR_TENANT_ID: z.string().uuid(),
  MYHR_ACTOR_ID: z.string().optional(),
  MYHR_ACTOR_EMAIL: z.string().email().optional(),
  MYHR_ACTOR_NAME: z.string().optional(),
});

const cfg = Config.parse(process.env);

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.MYHR_API_KEY}`,
    "X-Tenant-Id": cfg.MYHR_TENANT_ID,
    "Content-Type": "application/json",
  };
  if (cfg.MYHR_ACTOR_ID || cfg.MYHR_ACTOR_EMAIL || cfg.MYHR_ACTOR_NAME) {
    headers["X-Actor"] = JSON.stringify({
      id: cfg.MYHR_ACTOR_ID,
      email: cfg.MYHR_ACTOR_EMAIL,
      name: cfg.MYHR_ACTOR_NAME,
    });
  }
  if (WRITE_METHODS.has(method)) {
    // One key per logical tool call. If the agent retries the same fetch
    // (e.g. transient network error), reuse via Promise-level retry; we don't
    // retry inside this helper, so a fresh key per call is correct.
    headers["Idempotency-Key"] = crypto.randomUUID();
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${cfg.MYHR_API_URL}${path}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OurTeamManagement API ${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const tools = [
  {
    name: "list_employees",
    description: "List employees in the configured tenant. Supports status, country, manager_id, and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["onboarding", "active", "on_leave", "terminated"] },
        country: { type: "string", enum: ["us", "de"] },
        manager_id: { type: "string", format: "uuid" },
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_employee",
    description: "Get a single employee by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_employee",
    description: "Create a new employee in the configured tenant.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        country: { type: "string", enum: ["us", "de"] },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        external_id: { type: "string" },
        job_title: { type: "string" },
        department: { type: "string" },
        manager_id: { type: "string", format: "uuid" },
      },
      required: ["email", "first_name", "last_name", "country", "start_date"],
      additionalProperties: false,
    },
  },
];

const server = new Server(
  { name: "myhr", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    if (name === "list_employees") {
      const params = new URLSearchParams();
      for (const k of ["status", "country", "cursor"] as const) {
        if (typeof a[k] === "string") params.set(k, a[k] as string);
      }
      if (typeof a.manager_id === "string") params.set("managerId", a.manager_id);
      if (typeof a.limit === "number") params.set("limit", String(a.limit));
      const q = params.toString();
      const data = await api("GET", `/v1/employees${q ? `?${q}` : ""}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "get_employee") {
      const data = await api("GET", `/v1/employees/${a.id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "create_employee") {
      const body = {
        email: a.email,
        firstName: a.first_name,
        lastName: a.last_name,
        country: a.country,
        startDate: a.start_date,
        ...(a.external_id ? { externalId: a.external_id } : {}),
        ...(a.job_title ? { jobTitle: a.job_title } : {}),
        ...(a.department ? { department: a.department } : {}),
        ...(a.manager_id ? { managerId: a.manager_id } : {}),
      };
      const data = await api("POST", `/v1/employees`, body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error(err);
  process.exit(1);
});
