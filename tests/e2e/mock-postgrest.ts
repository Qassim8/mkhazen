/**
 * خادم PostgREST وهمي (Supabase) للاختبار فقط — كل البيانات في الذاكرة.
 * بيكفي لاختبار المصادقة والصلاحيات والكاشير ومنع التكرار من غير أي
 * اتصال بقاعدة العميل.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

export interface MockState {
  tables: Record<string, Row[]>;
  /** كل الطلبات اللي وصلت (للتأكد إن مفيش حاجة راحت لمكان تاني) */
  requests: { method: string; path: string }[];
  rpcCalls: Record<string, unknown[]>;
  rpcHandlers: Record<string, (args: Row, state: MockState) => { status: number; body: unknown }>;
}

function parseFilters(search: URLSearchParams) {
  const filters: { column: string; op: string; value: string }[] = [];
  for (const [key, raw] of search.entries()) {
    if (["select", "order", "limit", "offset", "or", "on_conflict", "columns"].includes(key)) continue;
    const match = raw.match(/^(eq|neq|lte|lt|gte|gt|in|is|ilike)\.(.*)$/);
    if (match) filters.push({ column: key.replace(/"/g, ""), op: match[1], value: match[2] });
  }
  return filters;
}

function matches(row: Row, filters: { column: string; op: string; value: string }[]) {
  return filters.every(({ column, op, value }) => {
    if (column.includes(".")) return true; // فلاتر على جداول مدمجة — متجاهلة في الموك
    const cell = row[column];
    const text = cell === null || cell === undefined ? null : String(cell);
    switch (op) {
      case "eq":
        return text === value;
      case "neq":
        return text !== value;
      case "lte":
        return text !== null && text <= value;
      case "lt":
        return text !== null && text < value;
      case "gte":
        return text !== null && text >= value;
      case "gt":
        return text !== null && text > value;
      case "is":
        return value === "null" ? text === null : text === value;
      case "in":
        return value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/"/g, "")).includes(text ?? "");
      case "ilike":
        return text !== null && new RegExp(`^${value.replace(/%/g, ".*")}$`, "i").test(text);
      default:
        return true;
    }
  });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export async function startMockPostgrest(state: MockState): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://mock");
      state.requests.push({ method: req.method ?? "GET", path: url.pathname });

      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([\w]+)$/);
      if (rpc) {
        const args = ((await readBody(req)) ?? {}) as Row;
        (state.rpcCalls[rpc[1]] ??= []).push(args);
        const handler = state.rpcHandlers[rpc[1]];
        if (!handler) {
          return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${rpc[1]}` });
        }
        const { status, body } = handler(args, state);
        return send(res, status, body);
      }

      const table = url.pathname.match(/^\/rest\/v1\/([\w]+)$/)?.[1];
      if (!table) return send(res, 404, { message: "not found" });

      const rows = (state.tables[table] ??= []);
      const filters = parseFilters(url.searchParams);
      const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object+json");
      const prefer = String(req.headers.prefer ?? "");
      const returnRepresentation = prefer.includes("return=representation");

      if (req.method === "GET" || req.method === "HEAD") {
        let result = rows.filter((row) => matches(row, filters));
        const limit = Number(url.searchParams.get("limit"));
        if (Number.isFinite(limit) && limit > 0) result = result.slice(0, limit);
        const headers = { "Content-Range": `0-${Math.max(result.length - 1, 0)}/${result.length}` };
        if (wantsObject) {
          if (result.length !== 1) {
            return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
          }
          return send(res, 200, result[0], headers);
        }
        return send(res, 200, req.method === "HEAD" ? undefined : result, headers);
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        const inserted: Row[] = [];
        for (const item of (Array.isArray(body) ? body : [body]) as Row[]) {
          const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...item };
          const pk = table === "api_idempotency_keys" ? "key" : "id";
          if (rows.some((existing) => existing[pk] === row[pk])) {
            return send(res, 409, { code: "23505", message: `duplicate key value violates unique constraint "${table}_pkey"` });
          }
          rows.push(row);
          inserted.push(row);
        }
        if (!returnRepresentation) return send(res, 201, undefined);
        return send(res, 201, wantsObject ? inserted[0] : inserted);
      }

      if (req.method === "PATCH") {
        const patch = (await readBody(req)) as Row;
        const updated = rows.filter((row) => matches(row, filters));
        for (const row of updated) Object.assign(row, patch);
        if (!returnRepresentation) return send(res, 204, undefined);
        return send(res, 200, wantsObject ? (updated[0] ?? null) : updated);
      }

      if (req.method === "DELETE") {
        const remaining = rows.filter((row) => !matches(row, filters));
        const deleted = rows.filter((row) => matches(row, filters));
        state.tables[table] = remaining;
        if (!returnRepresentation) return send(res, 204, undefined);
        return send(res, 200, wantsObject ? (deleted[0] ?? null) : deleted);
      }

      return send(res, 405, { message: "method not allowed" });
    } catch (error) {
      return send(res, 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}` };
}
