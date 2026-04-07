import Cookies from "js-cookie";

import type { Role, User } from "@/types";

export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const USER_ROLE_KEY = "user_role";

export function persistAuth(accessToken: string, refreshToken: string, user: User) {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { secure: false, sameSite: "strict" });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { secure: false, sameSite: "strict" });
  Cookies.set(USER_ROLE_KEY, user.role, { secure: false, sameSite: "strict" });
}

export function clearAuthCookies() {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
  Cookies.remove(USER_ROLE_KEY);
}

export function getRoleRedirect(role: Role) {
  if (role === "admin") return "/admin";
  if (role === "teacher") return "/teacher";
  return "/student";
}
