function matchesType(value: unknown, type?: string) {
  if (!type) {
    return true;
  }

  if (type === "array") {
    return Array.isArray(value);
  }

  if (type === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  return typeof value === type;
}

export function validateSourceValue(
  value: unknown,
  schema: Record<string, unknown> | undefined,
  label: string,
) {
  const nullable = schema?.["nullable"] === true;
  if (value === null || value === undefined) {
    if (nullable) {
      return;
    }
    throw new Error(`${label} 값이 비어 있습니다.`);
  }

  const type = typeof schema?.["type"] === "string" ? String(schema?.["type"]) : undefined;
  if (!matchesType(value, type)) {
    throw new Error(`${label} 타입이 예상과 다릅니다.`);
  }

  if (
    type === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const required = Array.isArray(schema?.["required"])
      ? (schema?.["required"] as string[])
      : [];
    for (const key of required) {
      const fieldValue = (value as Record<string, unknown>)[key];
      if (fieldValue === null || fieldValue === undefined || fieldValue === "") {
        throw new Error(`${label}.${key} 값이 필요합니다.`);
      }
    }
  }
}

