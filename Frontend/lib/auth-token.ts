"use client";

import { authClient } from "@/lib/auth-client";
import { normalizeRole, type DoxaUser } from "@/lib/auth-types";
import { useAuthStore } from "@/stores/auth-store";

let fastApiTokenRefreshPromise: Promise<string> | null = null;

export async function refreshFastApiToken(): Promise<string> {
  if (fastApiTokenRefreshPromise) {
    return fastApiTokenRefreshPromise;
  }

  fastApiTokenRefreshPromise = refreshFastApiTokenOnce();

  try {
    return await fastApiTokenRefreshPromise;
  } finally {
    fastApiTokenRefreshPromise = null;
  }
}

async function refreshFastApiTokenOnce(): Promise<string> {
  const { data, error } = await authClient.token();

  if (error) {
    throw new Error(error.message || "Could not create API token");
  }

  const token = data?.token;
  if (!token) {
    throw new Error("Auth server did not return an API token");
  }

  useAuthStore.getState().setAccessToken(token);
  return token;
}

export async function refreshCurrentUser(): Promise<DoxaUser | null> {
  const { data } = await authClient.getSession();
  const user = data?.user;

  if (!user) {
    useAuthStore.getState().setUser(null);
    return null;
  }

  const record = user as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email : "";
  const name = typeof record.name === "string" ? record.name : email;
  const fullName = typeof record.full_name === "string" && record.full_name.length > 0 ? record.full_name : name;

  const currentUser: DoxaUser = {
    id: String(record.id ?? ""),
    email,
    full_name: fullName,
    role: normalizeRole(record.role),
  };

  useAuthStore.getState().setUser(currentUser);
  return currentUser;
}
