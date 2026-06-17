import type { RootMail } from "../client";
import type { Enrollment, ListResponse, Sequence } from "../types";

export interface SequenceParams {
  name: string;
  status?: "active" | "paused";
  trigger?: Record<string, unknown>;
  steps?: Record<string, unknown>[];
}

export class Sequences {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<Sequence>> {
    return this.client.request({ method: "GET", path: "/v1/sequences" });
  }

  get(id: string): Promise<Sequence> {
    return this.client.request({ method: "GET", path: `/v1/sequences/${id}` });
  }

  create(params: SequenceParams): Promise<Sequence> {
    return this.client.request({ method: "POST", path: "/v1/sequences", body: params });
  }

  update(id: string, params: Partial<SequenceParams>): Promise<Sequence> {
    return this.client.request({ method: "PATCH", path: `/v1/sequences/${id}`, body: params });
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/sequences/${id}` });
  }

  enroll(id: string, email: string): Promise<Enrollment> {
    return this.client.request({ method: "POST", path: `/v1/sequences/${id}/enroll`, body: { email } });
  }

  enrollments(id: string): Promise<ListResponse<Enrollment>> {
    return this.client.request({ method: "GET", path: `/v1/sequences/${id}/enrollments` });
  }

  /** Remove a contact from a sequence (stops further steps). */
  cancelEnrollment(id: string, enrollmentId: string): Promise<Enrollment> {
    return this.client.request({
      method: "POST",
      path: `/v1/sequences/${id}/enrollments/${enrollmentId}/cancel`,
    });
  }
}
