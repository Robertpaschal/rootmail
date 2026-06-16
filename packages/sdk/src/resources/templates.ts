import type { RootMail } from "../client";
import type { CreateTemplateParams, ListResponse, Template, UpdateTemplateParams } from "../types";

export class Templates {
  constructor(private readonly client: RootMail) {}

  list(): Promise<ListResponse<Template>> {
    return this.client.request({ method: "GET", path: "/v1/templates" });
  }

  get(id: string): Promise<Template> {
    return this.client.request({ method: "GET", path: `/v1/templates/${id}` });
  }

  create(params: CreateTemplateParams): Promise<Template> {
    return this.client.request({ method: "POST", path: "/v1/templates", body: params });
  }

  update(id: string, params: UpdateTemplateParams): Promise<Template> {
    return this.client.request({ method: "PATCH", path: `/v1/templates/${id}`, body: params });
  }

  delete(id: string): Promise<{ object: "template"; id: string; deleted: boolean }> {
    return this.client.request({ method: "DELETE", path: `/v1/templates/${id}` });
  }
}
