// Errors that the AI agent can fix by changing its input. Their messages are shown as they are
// (isError tool results, HTTP 4xx), so each one says exactly what was wrong and what to do.

export type UserErrorCode = "invalid_input" | "not_found" | "conflict" | "forbidden" | "too_large";

export class UserError extends Error {
  constructor(
    message: string,
    public readonly code: UserErrorCode = "invalid_input",
  ) {
    super(message);
    this.name = "UserError";
  }
}

/** A path was refused (outside the vault, not allowed, wrong extension...). */
export class PathError extends UserError {
  constructor(message: string) {
    super(message, "forbidden");
    this.name = "PathError";
  }
}

export class TemplateNotFoundError extends UserError {
  constructor(templateId: string, available: string[]) {
    const list = available.length > 0 ? ` Available templates: ${available.join(", ")}.` : " There are no templates yet.";
    super(`Template "${templateId}" was not found.${list}`, "not_found");
    this.name = "TemplateNotFoundError";
  }
}

export const HTTP_STATUS_BY_CODE: Record<UserErrorCode, number> = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
