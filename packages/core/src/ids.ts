import { customAlphabet } from "nanoid";

// Lowercase Crockford-ish base32 (no ambiguous chars) keeps ids URL- and copy-safe.
const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);

export const ID_PREFIXES = {
  user: "usr",
  session: "ses",
  membership: "mbr",
  organization: "org",
  workspace: "ws",
  apiKey: "key",
  subTenant: "tnt",
  contact: "cnt",
  template: "tpl",
  message: "msg",
  audit: "aud",
  suppression: "sup",
  event: "evt",
  thread: "thr",
  threadMessage: "tms",
  usage: "usg",
  billingEvent: "bil",
  asset: "ast",
  webhookEndpoint: "whe",
  webhookDelivery: "whd",
  invitation: "inv",
  orgAddon: "oad",
  sequence: "seq",
  sequenceEnrollment: "enr",
  list: "lst",
  listContact: "lct",
  campaign: "cmp",
  role: "rol",
  authToken: "atk",
  staffUser: "stf",
  staffSession: "sts",
  staffAudit: "sta",
  impersonationGrant: "img",
  lead: "led",
  leadNote: "lnt",
  customPlan: "cpl",
  assistantChat: "chat",
  assistantMessage: "chatmsg",
  blogPost: "post",
  changelogEntry: "log",
  supportTicket: "tkt",
  supportMessage: "tkm",
  announcement: "ann",
  ssoConnection: "sso",
  senderIdentity: "sid",
} as const;

export type IdEntity = keyof typeof ID_PREFIXES;

/** Generate a prefixed, sortable-enough public id, e.g. `msg_8x2k...`. */
export function newId(entity: IdEntity): string {
  return `${ID_PREFIXES[entity]}_${nanoid()}`;
}
