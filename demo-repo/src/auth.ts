export interface LoginResult {
  ok: boolean;
  error?: string;
}

// TODO: validate the email format and enforce a minimum password length.
// TODO: return structured errors ({ field, code }) instead of a single string.
export function validateLogin(email: string, password: string): LoginResult {
  if (!email || !password) return { ok: false, error: 'Missing credentials' };
  return { ok: true };
}
