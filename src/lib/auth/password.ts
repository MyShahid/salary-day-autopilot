import bcrypt from "bcryptjs";

// 10 keeps login fast on serverless. The cost is stored inside each hash, so
// hashes made at the old cost of 12 still verify.
const COST = 10;

// Hash of a random throwaway string, at the same cost. Compared against when the
// email is unknown, so a login attempt takes the same time whether or not the account exists.
const DUMMY_HASH = "$2b$10$Dik4s0TS.1oQrka.VTCa9OGrluSVtLqYZTN8w9q5nK0rPB28ZhGLe";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

/** True for hashes made at a different cost; re-hash them after a successful login. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== COST;
  } catch {
    return false;
  }
}
