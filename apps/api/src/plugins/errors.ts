import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@rootmail/core";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(error.toJSON());
      return;
    }

    if (error instanceof ZodError) {
      void reply
        .status(422)
        .send({ error: { type: "validation_error", message: "Validation failed", details: error.flatten() } });
      return;
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;

    if (statusCode === 429) {
      void reply.status(429).send({ error: { type: "rate_limited", message: error.message } });
      return;
    }

    if (statusCode < 500) {
      void reply
        .status(statusCode)
        .send({ error: { type: "bad_request", message: error.message } });
      return;
    }

    req.log.error(error);
    void reply
      .status(500)
      .send({ error: { type: "internal_error", message: "Internal server error" } });
  });
}
