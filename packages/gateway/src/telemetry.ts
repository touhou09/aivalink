import { trace, SpanStatusCode } from "@opentelemetry/api";

export const gatewayTracer = trace.getTracer("aiva.gateway", "0.1.0");

export function markSpanSuccess(): { code: SpanStatusCode; message?: string } {
  return { code: SpanStatusCode.OK };
}

export function markSpanError(message: string): { code: SpanStatusCode; message: string } {
  return { code: SpanStatusCode.ERROR, message };
}
