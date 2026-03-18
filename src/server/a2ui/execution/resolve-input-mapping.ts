export interface TemplateExecutionContext {
  page?: string;
  selectedEntityId?: string;
  actorId?: string;
  actorRole?: string;
}

function readPath(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolveExpression(
  expression: string,
  input: {
    args: Record<string, string>;
    context: TemplateExecutionContext;
    session: Record<string, string>;
  },
) {
  if (!expression.startsWith("$")) {
    return expression;
  }

  if (expression.startsWith("$args.")) {
    const key = expression.slice("$args.".length);
    return input.args[key];
  }

  if (expression.startsWith("$context.")) {
    const key = expression.slice("$context.".length);
    return readPath(input.context as Record<string, unknown>, key);
  }

  if (expression.startsWith("$session.")) {
    const key = expression.slice("$session.".length);
    return input.session[key];
  }

  throw new Error(`지원하지 않는 inputMapping 표현식입니다: ${expression}`);
}

export function resolveInputMapping(input: {
  mapping: Record<string, string>;
  args: Record<string, string>;
  context?: TemplateExecutionContext;
}) {
  const context = input.context ?? {};
  const session = {
    actorId: context.actorId ?? "system",
    actorRole: context.actorRole ?? "ops_engineer",
  };

  return Object.fromEntries(
    Object.entries(input.mapping).map(([key, expression]) => {
      const resolved = resolveExpression(expression, {
        args: input.args,
        context,
        session,
      });
      return [key, resolved];
    }),
  ) as Record<string, string | undefined>;
}

