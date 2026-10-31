/**
 * Brief: "more than eight characters, with an uppercase letter, a lowercase letter
 * and a special character".
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length <= 8) problems.push("be more than 8 characters long");
  if (!/[A-Z]/.test(password)) problems.push("contain an uppercase letter");
  if (!/[a-z]/.test(password)) problems.push("contain a lowercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("contain a special character");
  return problems;
}

export function passwordError(password: string): string | null {
  const p = passwordProblems(password);
  return p.length ? `Password must ${p.join(", ")}.` : null;
}
