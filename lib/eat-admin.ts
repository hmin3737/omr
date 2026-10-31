// Eat 관리자 인증. Eat 자체는 비밀번호 없이 공개이고, 추천 지정·추천 가게 수정·삭제만 관리자 전용이다.
// 관리자 비밀번호는 EAT_ADMIN_PASSWORD 환경변수로만 설정한다 (미설정 시 관리자 로그인 불가).

import { cookies } from "next/headers";
import { signToken, verifyToken } from "./auth";

export const EAT_ADMIN_COOKIE = "eat_admin";
const ADMIN_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

export function adminPassword(): string {
  return (process.env.EAT_ADMIN_PASSWORD ?? "").trim();
}

// 비밀번호를 바꾸면 기존 관리자 쿠키가 모두 무효화되도록 비밀번호를 비밀키에 섞는다.
function adminSecret(): string {
  return `eat-admin::${process.env.SESSION_SECRET ?? ""}::${adminPassword()}`;
}

export function createAdminToken() {
  return signToken(adminSecret(), ADMIN_MAX_AGE_SEC);
}

/** 현재 요청이 Eat 관리자 쿠키를 가지고 있는지 */
export async function isEatAdmin(): Promise<boolean> {
  if (!adminPassword()) return false;
  return verifyToken(cookies().get(EAT_ADMIN_COOKIE)?.value, adminSecret());
}
