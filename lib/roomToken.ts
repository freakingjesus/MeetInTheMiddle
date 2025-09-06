import jwt from 'jsonwebtoken';

const secret = process.env.ROOM_JWT_SECRET!;

export function signRoomToken(roomId: string) {
  return jwt.sign({ room_id: roomId }, secret, { expiresIn: '7d' });
}

export function verifyRoomToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as { room_id: string };
    return payload.room_id;
  } catch {
    return null;
  }
}
