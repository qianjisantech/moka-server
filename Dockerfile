# 使用 Node.js 18 Alpine 版本作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装生产依赖和健康检查工具
RUN npm install --production && \
    apk add --no-cache curl

# 复制源代码
COPY . .

# 复制 .env 文件（如果存在）
# 注意：生产环境建议通过环境变量或 secrets 管理敏感信息
COPY .env* ./

# 暴露端口
EXPOSE 80

# 设置环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["node", "server.js"]
