// 加载环境变量
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 根据启动方式选择 .env 文件
// 通过 npm_lifecycle_event 判断是 dev 还是 start
const npmScript = process.env.npm_lifecycle_event;
const isDev = npmScript === 'dev' || npmScript === 'development';
const envFiles = isDev 
  ? ['.env.development', '.env.dev', '.env']  // dev 启动：优先 .env.development
  : ['.env.prod', '.env.production', '.env']; // start 启动：优先 .env.prod
const env = isDev ? 'development' : 'production';

let envLoaded = false;
for (const envFile of envFiles) {
  const envPath = path.join(__dirname, envFile);
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn(`[Config] 警告: ${envFile} 文件加载失败:`, result.error.message);
    } else {
      console.log(`[Config] ${envFile} 文件加载成功 (模式: ${isDev ? '开发' : '生产'})`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.warn('[Config] 警告: 未找到 .env 文件，使用默认配置');
  console.warn('[Config] 支持的文件: .env.production, .env.development, .env');
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const MockDatabase = require('./database');
const MockProxy = require('./proxy');
const createRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库（异步）
let db;
let proxy;

// 初始化应用
async function initializeApp() {
  try {
// 初始化数据库
    db = new MockDatabase();
    await db.connect();
console.log('[Database] Initialized successfully');

// 初始化代理
    proxy = new MockProxy(db);

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 管理 API 路由（优先级最高）
app.use(createRoutes(db));

// Mock 代理中间件（拦截所有其他请求）
app.use(proxy.middleware());

// 404 处理（如果请求既没有匹配 Mock，也不是管理 API）
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'No mock configured for this endpoint'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   Mock Platform Server                        ║
║   Server running at: http://localhost:${PORT}   ║
║   Database: MongoDB                           ║
║   Mode: Proxy Mode                            ║
╚═══════════════════════════════════════════════╝

✓ Backend API: http://localhost:${PORT}/api
✓ Mock Proxy: http://localhost:${PORT}/*

Open http://localhost:5173 to access the frontend
  `);
});
  } catch (error) {
    console.error('[Server] Initialization error:', error);
    process.exit(1);
  }
}

// 启动应用
initializeApp();

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  if (db) {
    await db.close();
  }
  process.exit(0);
});
