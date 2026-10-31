import bcrypt from "bcryptjs";

const COST = 12;

// Hash of a random throwaway string. Compared against when the email is unknown,
// so a login attempt takes the same time whether or not the account exists.
const DUMMY_HASH = "$2b$12$Q9w6AUXagXgZflG1eEpCyeyoR9v6iNSNVW8QQBp8wzklvEOm.ytXu";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}
