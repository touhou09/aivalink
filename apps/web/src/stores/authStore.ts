import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => {
      store.set(name, value);
    },
    removeItem: (name: string) => {
      store.delete(name);
    },
  };
})();

const safeStorage = createJSONStorage(() => {
  const ls = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  if (
    ls &&
    typeof ls.getItem === "function" &&
    typeof ls.setItem === "function" &&
    typeof ls.removeItem === "function"
  ) {
    return ls;
  }
  return memoryStorage;
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    {
      name: "auth-storage",
      storage: safeStorage,
    }
  )
);
