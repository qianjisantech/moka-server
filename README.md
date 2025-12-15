# API Mock Platform (Vue + Node.js)

一个基于 Vue 3 + Node.js + JSON 文件存储的现代化 API Mock 平台，支持代理拦截和可视化管理。

## ✨ 技术栈

### 前端
- Vue 3 + Composition API
- Vite
- Ant Design Vue
- Axios

### 后端
- Node.js + Express
- MongoDB 数据库
- HTTP Proxy Middleware
- CORS

## 🚀 功能特性

- ✅ 可视化管理 Mock 配置
- ✅ 代理模式拦截请求
- ✅ 支持多种 HTTP 方法（GET/POST/PUT/DELETE）
- ✅ 自定义响应状态码和延迟
- ✅ 请求日志记录
- ✅ 配置导入导出
- ✅ 全局开关控制
- ✅ 数据持久化（JSON 文件）
- ✅ 实时日志更新
- ✅ URL 通配符匹配

## 📦 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 配置环境变量

在 `backend` 目录下创建 `.env` 文件：

```bash
# 服务端口
PORT=3000

# Mock 服务的基础 URL
MOCK_BASE_URL=http://localhost:3000

# MongoDB 配置
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_DB_NAME=mock_platform
MONGODB_AUTH_SOURCE=admin
```

**注意：** 如果 MongoDB 没有启用认证，可以留空 `MONGODB_USERNAME` 和 `MONGODB_PASSWORD`。

### 3. 启动服务

#### 方式 1: 分别启动（推荐用于开发）

```bash
# 终端 1 - 启动后端
cd backend
npm start
# 服务运行在 http://localhost:3000

# 终端 2 - 启动前端
cd frontend
npm run dev
# 访问 http://localhost:5173
```

#### 方式 2: 使用启动脚本

```bash
# 在项目根目录
./start.sh
```

### 4. 访问管理界面

打开浏览器访问：**http://localhost:5173**

## 💡 使用示例

### 示例 1: 添加登录接口 Mock

1. 打开管理界面 http://localhost:5173
2. 点击"添加 Mock API"
3. 填写配置：

```
API 名称：用户登录
请求方法：POST
URL：http://localhost:3000/auth/login
状态码：200
延迟：500
响应数据：
{
  "code": 0,
  "data": {
    "token": "mock-token-123",
    "userId": 123,
    "username": "testuser"
  },
  "message": "登录成功"
}
```

4. 保存后测试：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "123"}'

# 响应（带 X-Mock-Platform: true 头）：
# {
#   "code": 0,
#   "data": {
#     "token": "mock-token-123",
#     "userId": 123,
#     "username": "testuser"
#   },
#   "message": "登录成功"
# }
```

### 示例 2: 通过 API 添加 Mock

```bash
curl -X POST http://localhost:3000/api/mocks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "获取用户列表",
    "method": "GET",
    "url": "http://localhost:3000/users",
    "status": 200,
    "delay": 0,
    "response": {
      "code": 0,
      "data": [
        {"id": 1, "name": "张三"},
        {"id": 2, "name": "李四"}
      ]
    }
  }'
```

### 示例 3: 在前端应用中使用

```javascript
// 在你的 Vue/React 应用中
import axios from 'axios'

// 配置 axios baseURL 为 Mock 服务器
const api = axios.create({
  baseURL: 'http://localhost:3000'
})

// 发送请求（会被 Mock 拦截）
api.post('/auth/login', {
  username: 'test',
  password: '123'
}).then(res => {
  console.log(res.data) // Mock 数据
})
```

## 📁 项目结构

```
mock-platform-vue/
├── backend/                  # 后端
│   ├── server.js            # 服务器入口
│   ├── database.js          # 数据库（MongoDB）
│   ├── proxy.js             # 代理拦截逻辑
│   ├── routes.js            # API 路由
│   ├── config.js            # 配置文件
│   ├── package.json
│   └── .env                 # 环境变量配置（需要创建）
│
├── frontend/                 # 前端
│   ├── src/
│   │   ├── api/             # API 请求
│   │   ├── views/           # 页面组件
│   │   ├── router/          # 路由配置
│   │   ├── App.vue          # 根组件
│   │   └── main.js          # 入口文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── start.sh                  # 启动脚本
├── .gitignore
└── README.md
```

## 🔌 API 文档

### Mock 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/mocks | 获取所有 Mock |
| GET | /api/mocks/:id | 获取单个 Mock |
| POST | /api/mocks | 创建 Mock |
| PUT | /api/mocks/:id | 更新 Mock |
| DELETE | /api/mocks/:id | 删除 Mock |
| POST | /api/mocks/:id/toggle | 切换 Mock 状态 |

### 日志管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/logs | 获取日志 |
| DELETE | /api/logs | 清空日志 |

### 设置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/settings/enabled | 获取全局状态 |
| POST | /api/settings/enabled | 设置全局状态 |

### 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/export | 导出配置 |
| POST | /api/import | 导入配置 |

## 🛠 工作原理

### 代理模式流程

```
客户端发送请求
    ↓
http://localhost:3000/auth/login
    ↓
Node.js Express 服务器
    ↓
检查是否有匹配的 Mock 配置
    ↓
    ├─ 有匹配 → 返回 Mock 数据（带 X-Mock-Platform: true）
    │              记录日志
    └─ 无匹配 → 返回 404
```

### 数据流

```
Vue 前端 (http://localhost:5173)
    ↓
    ↓ (Vite 代理 /api/* → localhost:3000)
    ↓
Express API (/api/*)
    ↓
JSON 文件存储 (data.json)
```

## 📝 配置示例

### URL 通配符匹配

```json
{
  "name": "匹配所有用户接口",
  "method": "GET",
  "url": "http://localhost:3000/users/*",
  "status": 200,
  "response": {
    "users": []
  }
}
```

### 错误响应 Mock

```json
{
  "name": "未授权",
  "method": "GET",
  "url": "http://localhost:3000/admin/*",
  "status": 401,
  "response": {
    "error": "Unauthorized",
    "message": "请先登录"
  }
}
```

### 慢速响应 Mock

```json
{
  "name": "慢速接口",
  "method": "POST",
  "url": "http://localhost:3000/slow-api",
  "status": 200,
  "delay": 3000,
  "response": {
    "message": "处理完成"
  }
}
```

## 💼 使用场景

### 1. 前端独立开发

后端接口未完成时，使用 Mock 数据进行前端开发，不被后端进度阻塞。

### 2. 接口测试

快速测试不同的响应状态码、错误场景、慢速网络等情况。

### 3. 演示和 Demo

快速搭建演示环境，无需真实后端服务。

### 4. 多团队协作

前后端团队可以根据接口文档，并行开发。

## ❓ 常见问题

### Q: 为什么我的请求没有被 Mock？

A: 请检查：
1. Mock 全局开关是否开启（管理界面顶部）
2. 具体的 Mock API 是否启用
3. URL 是否完全匹配（包括协议、域名、端口）
4. 请求方法（GET/POST 等）是否匹配
5. 查看"请求日志"标签页，确认是否有匹配记录

### Q: 如何在我的应用中使用 Mock？

A: 将你的 API 请求地址改为 `http://localhost:3000`，然后在 Mock 平台配置相应的接口即可。

### Q: Mock 数据存储在哪里？

A: 所有数据存储在 MongoDB 数据库中。数据库连接配置在 `.env` 文件中。首次运行时会自动创建集合和索引。

### Q: 支持 HTTPS 吗？

A: 目前仅支持 HTTP。如需 HTTPS，可以使用 Nginx 等反向代理。

### Q: 可以同时运行多个 Mock 服务器吗？

A: 可以，修改 `backend/server.js` 中的 `PORT` 环境变量即可：
```bash
PORT=3001 node server.js
```

## 🎯 后续计划

- [ ] 支持动态响应规则（根据请求参数返回不同数据）
- [ ] 支持 Mock 分组和标签
- [ ] 支持 RESTful 资源自动生成
- [ ] 支持 GraphQL Mock
- [ ] 支持 WebSocket Mock
- [ ] 用户认证和权限管理
- [ ] 团队协作功能

## 📄 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
