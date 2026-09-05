import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import LookupPage from './pages/LookupPage.vue'
import PlaylistPage from './pages/PlaylistPage.vue'
import AdminLogin from './pages/admin/AdminLogin.vue'
import AdminPassword from './pages/admin/AdminPassword.vue'
import AdminReview from './pages/admin/AdminReview.vue'
import AdminSchedule from './pages/admin/AdminSchedule.vue'
import { useAdmin } from './stores/admin'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/playlist', name: 'playlist', component: PlaylistPage },
    { path: '/lookup', name: 'lookup', component: LookupPage },
    { path: '/admin', name: 'admin-login', component: AdminLogin },
    { path: '/admin/review', component: AdminReview, meta: { admin: true } },
    { path: '/admin/schedule', component: AdminSchedule, meta: { admin: true } },
    { path: '/admin/password', component: AdminPassword, meta: { admin: true } },
    // 使用声明与后台配置页在后续阶段加入
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// 管理端路由要先确认登录态；未登录一律回登录页
router.beforeEach(async (to) => {
  const admin = useAdmin()
  if (!admin.checked) await admin.refresh()
  if (to.meta.admin && !admin.me) return { path: '/admin' }
  if (to.path === '/admin' && admin.me) return { path: '/admin/review' }
  return true
})
