// Mock 平台配置
const config = {
  // Mock 服务的基础 URL
  mockBaseUrl: process.env.MOCK_BASE_URL || 'http://localhost:3000',

  // 服务端口
  port: process.env.PORT || 3000,

  // MongoDB 配置
  mongodb: {
    host: process.env.MONGODB_HOST || 'localhost',
    port: process.env.MONGODB_PORT || '27017',
    username: process.env.MONGODB_USERNAME || '',
    password: process.env.MONGODB_PASSWORD || '',
    dbName: process.env.MONGODB_DB_NAME || 'moka',
    authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
    // 构建连接 URL
    get url() {
      if (this.username && this.password) {
        // 有用户名密码：mongodb://username:password@host:port/dbname?authSource=admin
        const encodedUsername = encodeURIComponent(this.username);
        const encodedPassword = encodeURIComponent(this.password);
        const encodedAuthSource = encodeURIComponent(this.authSource);
        return `mongodb://${encodedUsername}:${encodedPassword}@${this.host}:${this.port}/${this.dbName}?authSource=${encodedAuthSource}`;
      } else {
        // 无用户名密码：mongodb://host:port/dbname
        return `mongodb://${this.host}:${this.port}/${this.dbName}`;
      }
    }
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d' // 7天过期
  }
};

module.exports = config;
