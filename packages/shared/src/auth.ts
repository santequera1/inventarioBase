import { z } from "zod";
import { Permission } from "./enums";

export const loginBody = z.object({
  email: z.string().email("Introduce un correo válido"),
  password: z.string().min(1, "Introduce tu contraseña"),
});

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(Permission),
  isSystem: z.boolean(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  active: z.boolean(),
  roleId: z.string(),
  role: roleSchema,
  defaultLocationId: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const meResponse = z.object({ user: userSchema, permissions: z.array(Permission) });

export const createUserBody = z.object({
  email: z.string().email("Introduce un correo válido"),
  name: z.string().min(2, "Introduce el nombre completo"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  roleId: z.string().min(1, "Selecciona un rol"),
  defaultLocationId: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
export const updateUserBody = createUserBody.partial().extend({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});

export const createRoleBody = z.object({
  name: z.string().min(2),
  permissions: z.array(Permission).min(1, "Selecciona al menos un permiso"),
});
export const updateRoleBody = createRoleBody.partial();
