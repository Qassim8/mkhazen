import { randomInt } from "node:crypto";

// من غير الحروف اللي بتتلخبط (0/O، 1/l/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** كلمة سر مؤقتة عشوائية تشفيريًا (افتراضي 12 حرف ≈ 70 bit) */
export function generateTemporaryPassword(length = 12): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[randomInt(ALPHABET.length)];
  }
  return result;
}
