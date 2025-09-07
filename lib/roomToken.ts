// lib/roomToken.ts
import jwt from "jsonwebtoken";

const secret = process.env.ROOM_JWT_SECRET;
if (!secret) {
  throw new Error(
    "ROOM_JWT_SECRET is not set. This must match your Supabase project's JWT secret."
  );
}

export function signRoomToken(
  roomId: string,
  side: "your" | "their",
  name: string
): string {
  return jwt.sign({ room_id: roomId, side, name }, secret!, {
    expiresIn: "7d",
  });
}

export function verifyRoomToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, secret!) as jwt.JwtPayload & {
      room_id?: string;
    };
    return payload.room_id ?? null;
  } catch {
    return null;
  }
}
