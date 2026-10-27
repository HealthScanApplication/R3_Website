/**
 * Which protocol fields an editor save or import sends.
 *
 * `is_suggested` is admin-only in the database (guard_protocol_suggested_flag): a PATCH that carries a changed value from
 * someone who is not an admin is refused as a whole, and every other edit in it is lost with it. So a non-admin never
 * sends that field.
 */
export const ADMIN_ONLY_PROTOCOL_FIELDS = ['is_suggested'] as const;

const allowed = (field: string, isAdmin: boolean) => isAdmin || !(ADMIN_ONLY_PROTOCOL_FIELDS as readonly string[]).includes(field);

/** The fields of `form` that differ from the stored `selected` row, minus the ones this person may not change. */
export function changedProtocolFields<T extends object>(form: T, selected: T, fields: readonly (keyof T)[], isAdmin: boolean): Partial<T> {
  const patch: Partial<T> = {};
  for (const field of fields) {
    if (!allowed(String(field), isAdmin)) continue;
    if (form[field] !== selected[field]) patch[field] = form[field];
  }
  return patch;
}

/** The fields an import file carries, restricted to the editable list and to what this person may change. */
export function importedProtocolFields(file: Record<string, unknown>, fields: readonly string[], isAdmin: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) if (file[field] !== undefined && allowed(field, isAdmin)) patch[field] = file[field];
  return patch;
}
