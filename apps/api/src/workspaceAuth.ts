/** Inspect only after Supabase getUser(token) has verified the token. */
export function hasWorkspaceAuthentication(token: string): boolean {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Array.isArray(claims.amr) && claims.amr.some((entry: { method?: string }) => entry.method === 'password');
  } catch { return false; }
}
