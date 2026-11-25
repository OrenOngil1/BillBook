import type { Response } from "express";
import { env } from "../env.js";
import { daysFrom } from "./time.js";

export function setRefreshToken(res: Response, token: string) {
    res.cookie("refreshToken", token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        expires: daysFrom(7),
        path: "/api/auth"
    });
}

export function clearRefreshToken(res: Response) {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth"
    });
}
