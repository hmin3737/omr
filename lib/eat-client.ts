// Eat API 클라이언트 (브라우저에서 사용)

import type { Restaurant, RestaurantInput } from "./eat";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* ignore */
  }
  return `요청 실패 (${res.status})`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(await readError(res));
  return (res.status === 204 ? null : await res.json()) as T;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export const listRestaurants = () => request<Restaurant[]>("/api/eat/restaurants");

export const createRestaurant = (input: RestaurantInput) =>
  request<Restaurant>("/api/eat/restaurants", json("POST", input));

export const updateRestaurant = (id: string, input: RestaurantInput) =>
  request<Restaurant>(`/api/eat/restaurants/${id}`, json("PATCH", input));

export const deleteRestaurant = (id: string) =>
  request<null>(`/api/eat/restaurants/${id}`, { method: "DELETE" });

export const likeRestaurant = (id: string) =>
  request<{ likes: number }>(`/api/eat/restaurants/${id}/like`, { method: "POST" });

export const markOrdered = (id: string) =>
  request<{ lastOrderedAt: string }>(`/api/eat/restaurants/${id}/ordered`, { method: "POST" });

export const getAdminStatus = () => request<{ admin: boolean }>("/api/eat/admin");

export const adminLogin = (password: string) =>
  request<{ admin: boolean }>("/api/eat/admin", json("POST", { password }));

export const adminLogout = () => request<{ admin: boolean }>("/api/eat/admin", { method: "DELETE" });
