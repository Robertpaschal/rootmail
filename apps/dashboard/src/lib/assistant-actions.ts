/**
 * Turning a tool name into something a person would say.
 *
 * Shared because the assistant has two front doors — the full page and the
 * launcher drawer — and a tool that reads "Checked your replies" in one and
 * "Reviewed threads" in the other is worse than either alone. Every new tool
 * needs a line here or it falls back to verb-plus-noun, which is passable for
 * `create_list` ("Created list") and clumsy for anything two words long.
 */

const ACTION_VERB: Record<string, string> = {
  get: "Looked up",
  list: "Reviewed",
  create: "Created",
  send: "Sent",
  check: "Checked",
  update: "Updated",
  draft: "Drafted",
  record: "Recorded",
  delete: "Removed",
  search: "Searched",
};

const ACTION_OVERRIDE: Record<string, string> = {
  get_message: "Looked up the message",
  get_message_audit: "Checked the delivery history",
  get_billing: "Checked plan & usage",
  get_analytics: "Pulled up analytics",
  get_deliverability: "Checked deliverability",
  check_suppression: "Checked the suppression list",
  check_domain_auth: "Checked domain setup",
  list_sub_tenants: "Reviewed your clients",
  send_test_message: "Sent a test email",
  list_contacts: "Looked through your audience",
  get_contact: "Looked up the contact",
  list_contact_tags: "Checked your tags",
  list_senders: "Checked your sending addresses",
  list_threads: "Checked your replies",
  get_thread: "Read the conversation",
  reply_to_thread: "Sent a reply",
  get_campaign_analytics: "Pulled that campaign's results",
  get_campaign_recipients: "Checked who it reached",
};

export function friendlyAction(tool: string): string {
  if (ACTION_OVERRIDE[tool]) return ACTION_OVERRIDE[tool];
  const [verb, ...rest] = tool.split("_");
  const v = ACTION_VERB[verb];
  return v ? `${v} ${rest.join(" ")}` : tool.replace(/_/g, " ");
}
