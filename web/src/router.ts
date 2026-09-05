import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import LookupPage from './pages/LookupPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/lookup', name: 'lookup', component: LookupPage },
    // 过往歌单、使用声明、/admin 在后续阶段加入
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
