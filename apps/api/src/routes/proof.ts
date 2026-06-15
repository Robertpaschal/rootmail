import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyProof } from "@rootmail/core";
import { parse } from "../lib/validate";

const verifyBody = z.object({
  bundle: z.record(z.unknown()),
  signature: z.string().min(1),
});

export async function proofRoutes(app: FastifyInstance): Promise<void> {
  // PUBLIC — anyone holding a bundle can verify it against rootmail's signing
  // key (the bundle's own public_key is informational; verification uses ours).
  app.post("/v1/proof/verify", async (req) => {
    const body = parse(verifyBody, req.body);
    return { object: "proof_verification", valid: verifyProof(body.bundle, body.signature) };
  });
}
