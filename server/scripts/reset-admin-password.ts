// 一次性：把本地开发用的超管密码重置成已知值。生产不要跑。
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { prisma } from '../src/lib/db.js'

const password = process.argv[2] ?? 'yy-dev-2026'
const user = await prisma.adminUser.update({
  where: { username: process.env.SEED_ADMIN_USER?.trim() || 'yadmin' },
  data: { passwordHash: await hash(password), mustChangePassword: false, disabled: false },
})
console.log(`已重置 ${user.username}（${user.role}）的密码为：${password}`)
await prisma.$disconnect()
