import { DATA_SOURCE_DEFINITIONS, getDataSourceDefinition, INTERNAL_SOURCE_HANDLERS } from "../data-sources/source-definitions";
import type { DataSourceDef, ExecutedDataSourceResult } from "../data-sources/source-types";
import { resolveInputMapping, type TemplateExecutionContext } from "./resolve-input-mapping";
import { validateSourceValue } from "./validate-source-io";

function applyParams(template: string, params: Record<string, string | undefined>) {
  return Object.entries(params).reduce(
    (value, [key, param]) => value.replaceAll(`:${key}`, encodeURIComponent(param ?? "")),
    template,
  );
}

function extractResultPath(result: unknown, resultPath?: string) {
  if (!resultPath) {
    return result;
  }

  const segments = resultPath.split(".").filter(Boolean);
  let current = result;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

async function executeHttpSource(input: {
  source: DataSourceDef;
  resolvedInput: Record<string, string | undefined>;
}) {
  const urlTemplate = input.source.url;
  if (!urlTemplate) {
    throw new Error(`HTTP source URL이 없습니다: ${input.source.id}`);
  }

  const pathParams = Object.fromEntries(
    Object.entries(input.source.pathParams ?? {}).map(([key, mappedKey]) => [
      key,
      input.resolvedInput[mappedKey],
    ]),
  );
  const queryParams = Object.fromEntries(
    Object.entries(input.source.queryParams ?? {}).map(([key, mappedKey]) => [
      key,
      input.resolvedInput[mappedKey],
    ]),
  );
  const body = input.source.bodyMapping
    ? Object.fromEntries(
        Object.entries(input.source.bodyMapping).map(([key, mappedKey]) => [
          key,
          input.resolvedInput[mappedKey],
        ]),
      )
    : undefined;

  const url = new URL(applyParams(urlTemplate, pathParams), "http://localhost");
  Object.entries(queryParams).forEach(([key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.source.timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      method: input.source.method ?? "GET",
      headers: {
        "content-type": "application/json",
      },
      body:
        body && (input.source.method === "POST" || input.source.method === "PATCH")
          ? JSON.stringify(body)
          : undefined,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`HTTP source 호출 실패 (${response.status}): ${input.source.id}`);
    }
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function executeInternalSource(input: {
  source: DataSourceDef;
  resolvedInput: Record<string, string | undefined>;
}) {
  if (!input.source.handlerKey) {
    throw new Error(`internal_db source handlerKey가 없습니다: ${input.source.id}`);
  }
  const handler = INTERNAL_SOURCE_HANDLERS[input.source.handlerKey];
  if (!handler) {
    throw new Error(`등록되지 않은 internal_db handler 입니다: ${input.source.handlerKey}`);
  }
  return handler(
    Object.fromEntries(
      Object.entries(input.resolvedInput).map(([key, value]) => [key, value ?? ""]),
    ),
  );
}

export async function executeDataSource(input: {
  source: DataSourceDef;
  resolvedInput: Record<string, string | undefined>;
}): Promise<ExecutedDataSourceResult> {
  try {
    validateSourceValue(input.resolvedInput, input.source.inputSchema, `${input.source.id}.input`);

    const rawResult =
      input.source.kind === "internal_db"
        ? executeInternalSource(input)
        : await executeHttpSource(input);
    const data = extractResultPath(rawResult, input.source.resultPath);

    validateSourceValue(data, input.source.outputSchema, `${input.source.id}.output`);

    return {
      sourceId: input.source.id,
      ok: true,
      data: data ?? null,
    };
  } catch (error) {
    return {
      sourceId: input.source.id,
      ok: false,
      data: null,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}

export async function executeBindingSource(input: {
  sourceId: string;
  mapping: Record<string, string>;
  args: Record<string, string>;
  context?: TemplateExecutionContext;
}) {
  const source = getDataSourceDefinition(input.sourceId);
  if (!source) {
    return {
      sourceId: input.sourceId,
      ok: false,
      data: null,
      error: `source를 찾을 수 없습니다: ${input.sourceId}`,
    } satisfies ExecutedDataSourceResult;
  }

  const resolvedInput = resolveInputMapping({
    mapping: input.mapping,
    args: input.args,
    context: input.context,
  });

  return await executeDataSource({
    source,
    resolvedInput,
  });
}

export { DATA_SOURCE_DEFINITIONS };

