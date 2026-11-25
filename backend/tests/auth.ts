import type { Response } from "supertest";
import { createAccessToken } from "../src/utils/jwt.js";
import type { Role } from "../src/generated/prisma/enums.js";

const REFRESH_COOKIE = "refreshToken";

export async function bearer(userId: number, role: Role = "USER") {
    return { Authorization: `Bearer ${await createAccessToken(userId, role)}` };
}

// undefined: the response didn't touch the cookie. "": the response cleared it.
export function refreshCookieOf(res: Response) {
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    return cookie?.split(";")[0]!.slice(REFRESH_COOKIE.length + 1);
}

export function withRefreshCookie(token: string) {
    return { Cookie: `${REFRESH_COOKIE}=${token}` };
}
