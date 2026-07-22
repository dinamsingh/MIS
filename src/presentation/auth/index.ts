/**
 * Public entry point for presentation-layer authentication (task 17.1).
 *
 * Exposes the auth context/provider and the teacher route guard. No signup
 * surface is exported: the teacher account is pre-provisioned (Req 1.1, 1.7)
 * and students never create accounts (Req 2.9).
 */

export { AuthProvider, useAuth, type AuthContextValue } from './AuthContext';
export { default as RequireTeacher } from './RequireTeacher';
export { default as RequireAdmin } from './RequireAdmin';
export { useUserRole, type RoleTag, type UserRoleStatus } from './useUserRole';
