import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('./views/Home.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('./views/Login.vue'),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('./views/Dashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/checkout',
    name: 'Checkout',
    component: () => import('./views/Checkout.vue'),
  },
  {
    path: '/order/:id',
    name: 'OrderConfirmation',
    component: () => import('./views/OrderConfirmation.vue'),
  },
  {
    path: '/error',
    name: 'ErrorPage',
    component: () => import('./views/ErrorPage.vue'),
  },
];
