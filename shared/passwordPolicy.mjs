// Shared password strength rules used by both backend registration validation and frontend inline hints.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULES = [
  {
    id: 'length',
    label: '8+ characters',
    hint: 'at least 8 characters',
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'lowercase',
    label: 'Lowercase (a–z)',
    hint: 'a lowercase letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'uppercase',
    label: 'Uppercase (A–Z)',
    hint: 'an uppercase letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'number',
    label: 'Number (0–9)',
    hint: 'a number',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'special',
    label: 'Special (!@#$)',
    hint: 'a special character',
    test: (pw) => /[^A-Za-z0-9\s]/.test(pw),
  },
];

/**
 * Evaluates a candidate password against all strength & length rules.
 */
export function evaluatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const tooLong = value.length > PASSWORD_MAX_LENGTH;
  const checks = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    hint: rule.hint,
    passed: rule.test(value),
  }));

  const passedCount = checks.filter((c) => c.passed).length;
  const missing = checks.filter((c) => !c.passed);
  const valid = typeof password === 'string' && !tooLong && missing.length === 0;

  let errorMessage = null;
  if (typeof password !== 'string') {
    errorMessage = 'Password is required';
  } else if (tooLong) {
    errorMessage = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  } else if (missing.length > 0) {
    errorMessage = `Password must include ${missing.map((c) => c.hint).join(', ')}`;
  }

  return {
    valid,
    tooLong,
    passedCount,
    totalRules: PASSWORD_RULES.length,
    checks,
    errorMessage,
  };
}
