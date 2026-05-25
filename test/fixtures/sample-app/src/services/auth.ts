import { ref } from 'vue';

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

const currentUser = ref<User | null>(null);

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid credentials');
    }
    if (response.status === 429) {
      throw new Error('Too many attempts');
    }
    throw new Error('Login failed');
  }

  const user: User = await response.json();
  currentUser.value = user;
  return user;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser.value = null;
}

export function isAuthenticated(): boolean {
  return currentUser.value !== null;
}

export function isAdmin(): boolean {
  return currentUser.value?.role === 'admin';
}
