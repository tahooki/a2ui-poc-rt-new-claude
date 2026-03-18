export interface DataSourceDef {
  id: string;
  kind: "internal_db" | "internal_api" | "external_http";
  method?: "GET" | "POST" | "PATCH";
  url?: string;
  handlerKey?: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyMapping?: Record<string, string>;
  resultPath?: string;
  timeoutMs: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ExecutedDataSourceResult {
  sourceId: string;
  ok: boolean;
  data: unknown | null;
  error?: string;
}

