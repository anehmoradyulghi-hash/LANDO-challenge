import { customAlphabet } from "nanoid";

// URL-safe, unambiguous alphabet (no 0/O/1/l confusion), 14 chars ~ 83 bits of entropy.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 14);

/** Generates an opaque public token to use in deep links instead of the internal cuid. */
export function generatePublicToken(): string {
  return nanoid();
}
