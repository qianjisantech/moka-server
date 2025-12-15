#!/bin/bash

# Docker 构建脚本 - 使用生产环境 .env 文件

echo "🚀 Building Moka Backend Docker image..."

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file with production configuration."
    exit 1
fi

# 构建 Docker 镜像
docker build -t moka-backend:latest .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo ""
    echo "To run the container:"
    echo "  docker run -d -p 3000:3000 --env-file .env moka-backend:latest"
    echo ""
    echo "Or use docker-compose:"
    echo "  docker-compose up -d"
else
    echo "❌ Docker build failed!"
    exit 1
fi

