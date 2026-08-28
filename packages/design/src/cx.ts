/** Local class joiner. The design package deliberately has no dependency on
 *  any app's `@/lib/utils`, so it can be imported from all four. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
