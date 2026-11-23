import bcrypt from "bcryptjs";

const COST = 12;
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "iloveyou",
  "maydaycollege", "maydaycollege1", "admin123", "welcome123", "letmein123", "abc12345",
]);

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, COST);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/** Returns a list of problems; empty = acceptable. */
export function passwordProblems(pw: string, minLength = 10, email?: string): string[] {
  const problems: string[] = [];
  if (pw.length < minLength) problems.push(`Use at least ${minLength} characters.`);
  if (pw.length > 128) problems.push("Use at most 128 characters.");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) problems.push("Mix upper- and lower-case letters.");
  if (!/\d/.test(pw)) problems.push("Include at least one number.");
  if (COMMON.has(pw.toLowerCase())) problems.push("This password is too common.");
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4)
    problems.push("Do not include your email name in the password.");
  return problems;
}
