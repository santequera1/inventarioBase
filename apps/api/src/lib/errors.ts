import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";

export type ProblemDetail = { path: string; message: string; code?: string };

export class AppError extends Error {
  status: number;
  type: string;
  errors?: ProblemDetail[];
  extra?: Record<string, unknown>;
  constructor(
    status: number,
    type: string,
    title: string,
    detail?: string,
    errors?: ProblemDetail[],
    extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.status = status;
    this.type = type;
    this.name = title;
    this.errors = errors;
    this.extra = extra;
  }
}

export const E = {
  badRequest: (detail: string, errors?: ProblemDetail[]) =>
    new AppError(400, "bad-request", "Solicitud inválida", detail, errors),
  unauthorized: (detail = "Debes iniciar sesión o enviar una API key válida.") =>
    new AppError(401, "unauthorized", "No autenticado", detail),
  forbidden: (detail = "No tienes permiso para realizar esta acción.") =>
    new AppError(403, "forbidden", "Sin permiso", detail),
  notFound: (what = "El recurso") => new AppError(404, "not-found", "No encontrado", `${what} no existe.`),
  conflict: (detail: string, extra?: Record<string, unknown>) =>
    new AppError(409, "conflict", "Conflicto", detail, undefined, extra),
  validation: (detail: string, errors?: ProblemDetail[]) =>
    new AppError(422, "validation-error", "Datos inválidos", detail, errors),
  insufficientStock: (detail: string, extra?: Record<string, unknown>) =>
    new AppError(409, "insufficient-stock", "Stock insuficiente", detail, undefined, extra),
  idempotencyMismatch: () =>
    new AppError(
      422,
      "idempotency-key-reused",
      "Idempotency-Key reutilizada",
      "Esta Idempotency-Key ya se usó con un cuerpo distinto. Usa una clave nueva para una operación nueva.",
    ),
  rateLimited: () =>
    new AppError(429, "rate-limited", "Demasiadas solicitudes", "Has superado el límite de peticiones. Espera un momento."),
  internal: () => new AppError(500, "internal", "Error interno", "Ocurrió un error inesperado. Inténtalo de nuevo."),
};

function problemType(baseUrl: string, type: string) {
  return `${baseUrl}/api/docs/errors#${type}`;
}

export function problemFromError(err: unknown, request: FastifyRequest, baseUrl: string) {
  const instance = request.url;
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        type: problemType(baseUrl, err.type),
        title: err.name,
        status: err.status,
        detail: err.message,
        instance,
        ...(err.errors ? { errors: err.errors } : {}),
        ...(err.extra ?? {}),
      },
    };
  }
  if (hasZodFastifySchemaValidationErrors(err)) {
    const errors = err.validation.map((v) => ({
      path: [err.validationContext, ...(v.params.issue.path as (string | number)[])].filter(Boolean).join("."),
      message: humanizeZodMessage(v.params.issue),
      code: v.params.issue.code,
    }));
    return {
      status: 422,
      body: {
        type: problemType(baseUrl, "validation-error"),
        title: "Datos inválidos",
        status: 422,
        detail: errors[0] ? `${errors[0].path}: ${errors[0].message}` : "Revisa los campos marcados.",
        instance,
        errors,
      },
    };
  }
  if (isResponseSerializationError(err)) {
    request.log.error({ err }, "response serialization error");
    return {
      status: 500,
      body: {
        type: problemType(baseUrl, "internal"),
        title: "Error de serialización",
        status: 500,
        detail: "La respuesta no cumple el esquema esperado.",
        instance,
      },
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "campo único";
      return {
        status: 409,
        body: {
          type: problemType(baseUrl, "conflict"),
          title: "Conflicto",
          status: 409,
          detail: `Ya existe un registro con el mismo valor en: ${target}.`,
          instance,
          errors: [{ path: target, message: "Este valor ya está en uso." }],
        },
      };
    }
    if (err.code === "P2025") {
      return {
        status: 404,
        body: { type: problemType(baseUrl, "not-found"), title: "No encontrado", status: 404, detail: "El recurso no existe.", instance },
      };
    }
    if (err.code === "P2003") {
      return {
        status: 409,
        body: {
          type: problemType(baseUrl, "conflict"),
          title: "Conflicto",
          status: 409,
          detail: "No se puede completar porque otros registros dependen de este.",
          instance,
        },
      };
    }
  }
  const fe = err as FastifyError;
  if (typeof fe?.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    const code = fe.statusCode;
    return {
      status: code,
      body: {
        type: problemType(baseUrl, code === 429 ? "rate-limited" : code === 401 ? "unauthorized" : "bad-request"),
        title: code === 429 ? "Demasiadas solicitudes" : code === 401 ? "No autenticado" : "Solicitud inválida",
        status: code,
        detail: fe.message,
        instance,
      },
    };
  }
  request.log.error({ err }, "unhandled error");
  return {
    status: 500,
    body: {
      type: problemType(baseUrl, "internal"),
      title: "Error interno",
      status: 500,
      detail: "Ocurrió un error inesperado. Inténtalo de nuevo.",
      instance,
    },
  };
}

function humanizeZodMessage(raw: { code: string; message: string }): string {
  const issue = raw as { code: string; message: string } & Record<string, unknown>;
  if (issue.message && !/^(Required|Invalid|Expected)/.test(issue.message)) return issue.message;
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined") return "Este campo es obligatorio.";
      if (issue.expected === "number") return "Introduce un número.";
      if (issue.expected === "integer") return "Introduce un número entero.";
      return `Se esperaba ${String(issue.expected)}.`;
    case "too_small":
      return issue.type === "string" ? "Este campo es obligatorio." : `Debe ser al menos ${String(issue.minimum)}.`;
    case "too_big":
      return `Debe ser como máximo ${String(issue.maximum)}.`;
    case "invalid_enum_value":
      return `Valor no permitido. Opciones: ${(issue.options as string[]).join(", ")}.`;
    case "invalid_string":
      return issue.validation === "email" ? "Introduce un correo válido." : "Formato inválido.";
    default:
      return issue.message || "Valor inválido.";
  }
}

export function sendProblem(reply: FastifyReply, status: number, body: Record<string, unknown>) {
  return reply.status(status).header("content-type", "application/problem+json; charset=utf-8").send(body);
}
