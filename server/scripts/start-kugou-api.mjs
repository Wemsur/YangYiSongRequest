// 起上游 kugoumusicapi 服务（github:MakcRe/KuGouMusicApi，已经在 server 的依赖里）。
// 单独写个启动脚本而不是塞进 npm script，是因为 Windows 上 npm 走 cmd.exe，
// `PORT=3300 node ...` 这种前置环境变量写法在那边不生效。
import { createRequire } from 'node:module';
import 'dotenv/config';

const require = createRequire(import.meta.url);

process.env.PORT ??= process.env.KUGOU_API_PORT ?? '3300';

// 酷狗对频繁变化的设备指纹会加限制，所以这几项建议固定在 server/.env 里。
// 没配的话每次启动临时生成一套，能用，但换机重启会被当成新设备。
const DEVICE_KEYS = ['KUGOU_API_GUID', 'KUGOU_API_DEV', 'KUGOU_API_MAC', 'KUGOU_API_WEBGL'];
const missing = DEVICE_KEYS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  const { getGuid, randomString, generateWebGLHash } = require('kugoumusicapi/util/util');
  process.env.KUGOU_API_GUID ??= getGuid();
  process.env.KUGOU_API_DEV ??= randomString(10).toUpperCase();
  process.env.KUGOU_API_MAC ??= '02:00:00:00:00:00';
  process.env.KUGOU_API_WEBGL ??= generateWebGLHash();
  console.log(`[kugou-api] 临时生成的设备标识：${missing.join('、')}`);
  console.log('[kugou-api] 建议把它们写进 server/.env 固定下来，见 .env.example');
}

const { startService } = require('kugoumusicapi/server');
await startService();
