import z from "zod";

export const registerSchema = z.object({
    email: z.email("Invalid email address"),
    username: z.string().min(1, "Username required"),
    password: z.string().min(8, "Passwod must be at least 8 characters long")
});

export const loginSchema = z.object({
    email: z.email("Must include email"),
    password: z.string().min(1, "Must include password")
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;