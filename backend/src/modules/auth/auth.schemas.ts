import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().max(254).transform((v) => v.toLowerCase()),
  username: z.string().regex(/^[A-Za-z0-9_]{3,32}$/, 'username 3–32 karakter: huruf, angka, underscore'),
  display_name: z.string().trim().min(1).max(100),
  password: z
    .string()
    .min(10, 'Password minimal 10 karakter')
    .max(128)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password harus mengandung huruf dan angka'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
