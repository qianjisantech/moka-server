const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const config = require('./config');
const snowflake = require('./snowflake');

class MockDatabase {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  // 连接数据库
  async connect() {
    if (this.isConnected && this.db) {
      return this.db;
    }

    try {
      const connectionUrl = config.mongodb.url;
      // 打印连接信息（隐藏密码）
      const safeUrl = connectionUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
      console.log('[Database] Connecting to MongoDB...');
      console.log('[Database] Connection URL:', safeUrl);
      console.log('[Database] Database name:', config.mongodb.dbName);
      console.log('[Database] Auth source:', config.mongodb.authSource);
      console.log('[Database] Host:', config.mongodb.host);
      console.log('[Database] Port:', config.mongodb.port);
      console.log('[Database] Username:', config.mongodb.username ? '***' : '(未设置)');
      console.log('[Database] Password:', config.mongodb.password ? '***' : '(未设置)');

      this.client = new MongoClient(connectionUrl, {
        // MongoDB 连接选项
        serverSelectionTimeoutMS: 5000, // 5秒超时
        connectTimeoutMS: 10000, // 10秒连接超时
        // 优先使用 IPv4，避免 IPv6 连接问题
        family: 4
      });

      await this.client.connect();
      this.db = this.client.db(config.mongodb.dbName);
      this.isConnected = true;

      // 初始化集合索引
      await this.initializeIndexes();

      console.log('[Database] Connected to MongoDB successfully');
      return this.db;
    } catch (error) {
      console.error('[Database] Connection error:', error.message);
      console.error('[Database] Error code:', error.code);
      console.error('[Database] Error code name:', error.codeName);
      
      // 提供更友好的错误提示
      if (error.code === 18 || error.codeName === 'AuthenticationFailed') {
        console.error('[Database] 认证失败，请检查:');
        console.error('  - MONGODB_USERNAME 和 MONGODB_PASSWORD 是否正确');
        console.error('  - MONGODB_AUTH_SOURCE 是否设置为正确的数据库（通常是 "admin"）');
        console.error('  - 用户是否有适当的权限');
      } else if (error.message && error.message.includes('ECONNREFUSED')) {
        console.error('[Database] 无法连接到 MongoDB 服务器，请检查:');
        console.error('  1. MongoDB 服务是否已启动');
        console.error('  2. MongoDB 地址和端口是否正确');
        console.error(`     当前配置: ${config.mongodb.host}:${config.mongodb.port}`);
        console.error('  3. 防火墙是否允许连接');
        console.error('  4. 如果使用远程 MongoDB，请检查网络连接');
        console.error('');
        console.error('  启动 MongoDB 的方法:');
        console.error('  - Windows: 检查 MongoDB 服务是否运行');
        console.error('  - Linux/Mac: sudo systemctl start mongod 或 mongod');
        console.error('  - Docker: docker run -d -p 27017:27017 mongo');
      }
      
      throw error;
    }
  }

  // 初始化索引
  async initializeIndexes() {
    try {
      // Projects 集合索引
      await this.db.collection('projects').createIndex({ id: 1 }, { unique: true });
      await this.db.collection('projects').createIndex({ username: 1 });

      // APIs 集合索引
      await this.db.collection('apis').createIndex({ id: 1 }, { unique: true });
      await this.db.collection('apis').createIndex({ project_id: 1 });
      await this.db.collection('apis').createIndex({ method: 1, url: 1 });

      // Logs 集合索引
      await this.db.collection('logs').createIndex({ created_at: -1 });
      await this.db.collection('logs').createIndex({ project_id: 1 });

      // Users 集合索引
      await this.db.collection('users').createIndex({ id: 1 }, { unique: true });
      await this.db.collection('users').createIndex({ username: 1 }, { unique: true });
      await this.db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
      await this.db.collection('users').createIndex({ status: 1 });
      await this.db.collection('users').createIndex({ last_login_time: -1 });

      // Events 集合索引（埋点记录表）
      await this.db.collection('events').createIndex({ id: 1 }, { unique: true });
      await this.db.collection('events').createIndex({ created_at: -1 });
      await this.db.collection('events').createIndex({ event_name: 1 });
      await this.db.collection('events').createIndex({ event_type: 1 });
      await this.db.collection('events').createIndex({ user_id: 1 });
      await this.db.collection('events').createIndex({ project_id: 1 });
      await this.db.collection('events').createIndex({ event_name: 1, created_at: -1 });

      console.log('[Database] Indexes initialized');
    } catch (error) {
      console.error('[Database] Index initialization error:', error);
    }
  }

  // 确保连接
  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
    return this.db;
  }

  // 格式化时间为 YYYY-MM-DD HH:mm:ss 格式
  formatDateTime(dateString) {
    if (!dateString) return dateString;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // 无效日期返回原值
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      return dateString; // 出错时返回原值
    }
  }

  // 格式化对象中的时间字段
  formatDateTimeFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const timeFields = ['created_at', 'updated_at', 'resetTokenExpires', 'latest_time', 'last_login_time'];
    const formatted = { ...obj };
    
    timeFields.forEach(field => {
      if (formatted[field]) {
        formatted[field] = this.formatDateTime(formatted[field]);
      }
    });
    
    return formatted;
  }

  // 移除 MongoDB 的 _id 字段并格式化时间字段
  removeMongoId(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => {
        const { _id, ...rest } = item;
        return this.formatDateTimeFields(rest);
      });
    } else if (obj && typeof obj === 'object') {
      const { _id, ...rest } = obj;
      return this.formatDateTimeFields(rest);
    }
    return obj;
  }

  // ========== Projects ==========

  async getAllProjects() {
    const db = await this.ensureConnection();
    const projects = await db.collection('projects').find({}).toArray();
    return this.removeMongoId(projects);
  }

  async getProjectsByUsername(username) {
    const db = await this.ensureConnection();
    // 返回属于该用户的项目，或者没有 username 字段的项目（向后兼容）
    const projects = await db.collection('projects').find({
      $or: [
        { username: username },
        { username: { $exists: false } },
        { username: '' }
      ]
    }).toArray();
    return this.removeMongoId(projects);
  }

  async getProjectsPaginated(options = {}) {
    const db = await this.ensureConnection();
    const {
      limit = 10,
      offset = 0,
      username = null,
      name = null,
      sort_by = 'created_at',
      sort_order = 'desc' // 'asc' or 'desc'
    } = options;

    // 构建查询条件
    const query = {};
    if (username) {
      query.$or = [
        { username: username },
        { username: { $exists: false } },
        { username: '' }
      ];
    }
    if (name) query.name = { $regex: name, $options: 'i' };

    // 构建排序
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    // 查询总数
    const total = await db.collection('projects').countDocuments(query);

    // 查询数据
    const projects = await db.collection('projects')
      .find(query)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();

    const processedProjects = this.removeMongoId(projects);

    // 为每个项目添加 API 数量统计
    const projectsWithCounts = await Promise.all(
      processedProjects.map(async (project) => {
        const apis = await db.collection('apis').find({ project_id: project.id }).toArray();
        return {
          ...project,
          apiCount: apis.length
        };
      })
    );

    return {
      data: projectsWithCounts,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  async getProjectById(id) {
    const db = await this.ensureConnection();
    const project = await db.collection('projects').findOne({ id: id });
    return this.removeMongoId(project);
  }

  async createProject(projectData) {
    const db = await this.ensureConnection();
    const project = {
      id: snowflake.generate(),
      name: projectData.name,
      description: projectData.description || '',
      color: projectData.color || '#11998e',
      icon: projectData.icon || '📦',
      username: projectData.username || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db.collection('projects').insertOne(project);
    return project.id;
  }

  async updateProject(id, updates) {
    const db = await this.ensureConnection();
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const result = await db.collection('projects').findOneAndUpdate(
      { id: id },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    return this.removeMongoId(result.value);
  }

  async deleteProject(id) {
    const db = await this.ensureConnection();
    
    // 删除项目
    const projectResult = await db.collection('projects').deleteOne({ id: id });
    
    if (projectResult.deletedCount === 0) {
      return false;
    }

    // 删除项目下的所有 API
    await db.collection('apis').deleteMany({ project_id: id });
    
    return true;
  }

  // ========== Mock APIs ==========

  async getAllApis() {
    const db = await this.ensureConnection();
    const apis = await db.collection('apis').find({}).toArray();
    return this.removeMongoId(apis);
  }

  async getApisByProjectId(projectId) {
    const db = await this.ensureConnection();
    const apis = await db.collection('apis').find({ project_id: projectId }).toArray();
    return this.removeMongoId(apis);
  }

  async getApisPaginated(options = {}) {
    const db = await this.ensureConnection();
    const {
      limit = 10,
      offset = 0,
      project_id = null,
      name = null,
      method = null,
      url = null,
      enabled = null,
      sort_by = 'created_at',
      sort_order = 'desc' // 'asc' or 'desc'
    } = options;

    // 构建查询条件
    const query = {};
    if (project_id) query.project_id = project_id;
    if (name) query.name = { $regex: name, $options: 'i' };
    if (method) query.method = method.toUpperCase();
    if (url) query.url = { $regex: url, $options: 'i' };
    if (enabled !== null) query.enabled = enabled === true || enabled === 'true';

    // 构建排序
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    // 查询总数
    const total = await db.collection('apis').countDocuments(query);

    // 查询数据
    const apis = await db.collection('apis')
      .find(query)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();

    const processedApis = this.removeMongoId(apis.map(api => ({
      ...api,
      enabled: api.enabled === true
    })));

    return {
      data: processedApis,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  async getApiById(id) {
    const db = await this.ensureConnection();
    const api = await db.collection('apis').findOne({ id: parseInt(id) });
    return this.removeMongoId(api);
  }

  async createApi(apiData) {
    const db = await this.ensureConnection();
    
    // 获取下一个 ID
    const lastApi = await db.collection('apis')
      .findOne({}, { sort: { id: -1 } });
    const nextId = lastApi ? lastApi.id + 1 : 1;

    const api = {
      id: nextId,
      project_id: apiData.project_id || null,
      name: apiData.name,
      method: apiData.method,
      url: apiData.url,
      status: apiData.status || 200,
      delay: apiData.delay || 0,
      enabled: apiData.enabled !== false,
      response: apiData.response,
      rules: apiData.rules || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db.collection('apis').insertOne(api);
    return api.id;
  }

  async updateApi(id, updates) {
    const db = await this.ensureConnection();
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const result = await db.collection('apis').findOneAndUpdate(
      { id: parseInt(id) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    return this.removeMongoId(result.value);
  }

  async deleteApi(id) {
    const db = await this.ensureConnection();
    const result = await db.collection('apis').deleteOne({ id: parseInt(id) });
    return result.deletedCount > 0;
  }

  async toggleApi(id) {
    const db = await this.ensureConnection();
    const api = await this.getApiById(id);
    if (!api) return null;

    const newEnabled = !api.enabled;
    const result = await db.collection('apis').findOneAndUpdate(
      { id: parseInt(id) },
      { $set: { enabled: newEnabled } },
      { returnDocument: 'after' }
    );

    return result.value;
  }

  // ========== Logs ==========

  async createLog(logData) {
    const db = await this.ensureConnection();
    const log = {
      id: Date.now() + Math.random(),
      url: logData.url,
      method: logData.method,
      mock_name: logData.mockName || null,
      status: logData.status,
      matched: logData.matched ? 1 : 0,
      project_id: logData.projectId || null,
      created_at: new Date().toISOString()
    };

    await db.collection('logs').insertOne(log);

    // 只保留最近 1000 条（可选，也可以使用 MongoDB TTL 索引）
    const logCount = await db.collection('logs').countDocuments();
    if (logCount > 1000) {
      const logsToDelete = await db.collection('logs')
        .find({})
        .sort({ created_at: 1 })
        .limit(logCount - 1000)
        .toArray();
      
      if (logsToDelete.length > 0) {
        await db.collection('logs').deleteMany({
          _id: { $in: logsToDelete.map(log => log._id) }
        });
      }
    }

    return log.id;
  }

  async getLogs(limit = 100, projectId = null) {
    const db = await this.ensureConnection();
    const query = projectId ? { project_id: projectId } : {};
    
    const logs = await db.collection('logs')
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    
    return this.removeMongoId(logs);
  }

  async clearLogs() {
    const db = await this.ensureConnection();
    await db.collection('logs').deleteMany({});
    return true;
  }

  // ========== Settings ==========

  async getSetting(key) {
    const db = await this.ensureConnection();
    const settings = await db.collection('settings').findOne({ _id: 'global' });
    return settings ? settings[key] : undefined;
  }

  async setSetting(key, value) {
    const db = await this.ensureConnection();
    await db.collection('settings').updateOne(
      { _id: 'global' },
      { $set: { [key]: value } },
      { upsert: true }
    );
  }

  async isEnabled() {
    const enabled = await this.getSetting('enabled');
    return enabled === true;
  }

  async setEnabled(enabled) {
    await this.setSetting('enabled', enabled);
  }

  // ========== Users ==========

  // 密码加密
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // 验证密码
  verifyPassword(password, hashedPassword) {
    return this.hashPassword(password) === hashedPassword;
  }

  async getAllUsers() {
    const db = await this.ensureConnection();
    const users = await db.collection('users').find({}).toArray();
    // 不返回密码、安全问题答案和 _id
    return this.removeMongoId(users.map(user => {
      const { password, _id, securityQuestions: secQuestions, ...userWithoutPassword } = user;
      // 如果存在安全问题，只返回问题，不返回答案
      if (secQuestions) {
        userWithoutPassword.securityQuestions = {
          question1: secQuestions.question1,
          question2: secQuestions.question2,
          question3: secQuestions.question3
        };
      }
      return userWithoutPassword;
    }));
  }

  async getUsersPaginated(options = {}) {
    const db = await this.ensureConnection();
    const {
      limit = 10,
      offset = 0,
      username = null,
      email = null,
      role = null,
      status = null,
      sort_by = 'created_at',
      sort_order = 'desc' // 'asc' or 'desc'
    } = options;

    // 构建查询条件
    const query = {};
    if (username) query.username = { $regex: username, $options: 'i' };
    if (email) query.email = { $regex: email, $options: 'i' };
    if (role) query.role = role;
    if (status) query.status = status;

    // 构建排序
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    // 查询总数
    const total = await db.collection('users').countDocuments(query);

    // 查询数据
    const users = await db.collection('users')
      .find(query)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();

    // 处理用户数据，移除敏感信息
    const processedUsers = this.removeMongoId(users.map(user => {
      const { password, _id, securityQuestions: secQuestions, ...userWithoutPassword } = user;
      if (secQuestions) {
        userWithoutPassword.securityQuestions = {
          question1: secQuestions.question1,
          question2: secQuestions.question2,
          question3: secQuestions.question3
        };
      }
      return userWithoutPassword;
    }));

    return {
      data: processedUsers,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  async getUserById(id) {
    const db = await this.ensureConnection();
    const user = await db.collection('users').findOne({ id: id });
    if (!user) return null;
    // 不返回密码、安全问题答案和 _id
    const { password, _id, securityQuestions: secQuestions, ...userWithoutPassword } = user;
    // 如果存在安全问题，只返回问题，不返回答案
    if (secQuestions) {
      userWithoutPassword.securityQuestions = {
        question1: secQuestions.question1,
        question2: secQuestions.question2,
        question3: secQuestions.question3
      };
    }
    return userWithoutPassword;
  }

  async getUserByUsername(username) {
    const db = await this.ensureConnection();
    const user = await db.collection('users').findOne({ username: username });
    if (!user) return null;
    return user; // 返回完整用户信息（包括密码，用于验证）
  }

  async getUserByEmail(email) {
    const db = await this.ensureConnection();
    const user = await db.collection('users').findOne({ email: email });
    if (!user) return null;
    // 不返回密码和 _id
    const { password, _id, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async createUser(userData) {
    const db = await this.ensureConnection();
    
    // 检查用户名是否已存在
    const existingUser = await this.getUserByUsername(userData.username);
    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在（如果提供了邮箱）
    if (userData.email) {
      const existingEmail = await db.collection('users').findOne({ email: userData.email });
      if (existingEmail) {
        throw new Error('邮箱已存在');
      }
    }

    // 处理安全问题，加密答案
    let securityQuestions = null;
    if (userData.securityQuestions) {
      securityQuestions = {
        question1: userData.securityQuestions.question1 || '',
        answer1: this.hashPassword(userData.securityQuestions.answer1 || ''),
        question2: userData.securityQuestions.question2 || '',
        answer2: this.hashPassword(userData.securityQuestions.answer2 || ''),
        question3: userData.securityQuestions.question3 || '',
        answer3: this.hashPassword(userData.securityQuestions.answer3 || '')
      };
    }

    const user = {
      id: snowflake.generate(),
      username: userData.username,
      password: this.hashPassword(userData.password),
      // 注意：不再使用空字符串作为默认邮箱，避免触发唯一索引冲突
      avatar: userData.avatar || '',
      role: userData.role || 'user', // admin, user
      status: userData.status || 'active', // active, inactive
      securityQuestions: securityQuestions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 只有在提供邮箱时才写入 email 字段（配合 unique + sparse 索引）
    if (userData.email) {
      user.email = userData.email;
    }

    await db.collection('users').insertOne(user);
    
    // 返回用户信息（不包含密码、安全问题答案和 _id）
    const { password, _id, securityQuestions: secQuestions, ...userWithoutPassword } = user;
    // 如果存在安全问题，只返回问题，不返回答案
    if (secQuestions) {
      userWithoutPassword.securityQuestions = {
        question1: secQuestions.question1,
        question2: secQuestions.question2,
        question3: secQuestions.question3
        // 不返回答案
      };
    }
    return userWithoutPassword;
  }

  async updateUser(id, updates) {
    const db = await this.ensureConnection();
    
    // 如果更新密码，需要加密
    if (updates.password) {
      updates.password = this.hashPassword(updates.password);
    }

    // 如果更新安全问题，需要加密答案
    if (updates.securityQuestions) {
      updates.securityQuestions = {
        question1: updates.securityQuestions.question1 || '',
        answer1: this.hashPassword(updates.securityQuestions.answer1 || ''),
        question2: updates.securityQuestions.question2 || '',
        answer2: this.hashPassword(updates.securityQuestions.answer2 || ''),
        question3: updates.securityQuestions.question3 || '',
        answer3: this.hashPassword(updates.securityQuestions.answer3 || '')
      };
    }

    // 如果更新用户名或邮箱，检查是否重复
    if (updates.username) {
      const existingUser = await db.collection('users').findOne({ 
        username: updates.username,
        id: { $ne: id }
      });
      if (existingUser) {
        throw new Error('用户名已存在');
      }
    }

    // 处理邮箱更新逻辑
    let unsetData = null;
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      const newEmail = updates.email;
      if (newEmail) {
        // 有效邮箱，检查是否重复
        const existingEmail = await db.collection('users').findOne({ 
          email: newEmail,
          id: { $ne: id }
        });
        if (existingEmail) {
          throw new Error('邮箱已存在');
        }
      } else {
        // 空字符串 / null / undefined 视为删除邮箱字段，避免出现多个 email = '' 触发唯一索引
        unsetData = { email: '' };
        delete updates.email;
      }
    }

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const updateOps = { $set: updateData };
    if (unsetData) {
      updateOps.$unset = unsetData;
    }

    const result = await db.collection('users').findOneAndUpdate(
      { id: id },
      updateOps,
      { returnDocument: 'after' }
    );

    if (!result.value) return null;

    // 返回用户信息（不包含密码、安全问题答案和 _id）
    const { password, _id, securityQuestions: secQuestions, ...userWithoutPassword } = result.value;
    // 如果存在安全问题，只返回问题，不返回答案
    if (secQuestions) {
      userWithoutPassword.securityQuestions = {
        question1: secQuestions.question1,
        question2: secQuestions.question2,
        question3: secQuestions.question3
      };
    }
    return userWithoutPassword;
  }

  async deleteUser(id) {
    const db = await this.ensureConnection();
    const result = await db.collection('users').deleteOne({ id: id });
    return result.deletedCount > 0;
  }

  async verifyUser(username, password) {
    const db = await this.ensureConnection();
    const user = await this.getUserByUsername(username);
    if (!user) {
      return { error: 'USER_NOT_FOUND' };
    }

    if (user.status !== 'active') {
      return { error: 'USER_INACTIVE', status: user.status };
    }

    if (!this.verifyPassword(password, user.password)) {
      return { error: 'INVALID_PASSWORD' };
    }

    // 更新登录时间
    const loginTime = new Date().toISOString();
    await db.collection('users').updateOne(
      { id: user.id },
      { 
        $set: { 
          last_login_time: loginTime,
          updated_at: loginTime
        } 
      }
    );

    // 返回用户信息（不包含密码和 _id）
    const { password: _, _id, ...userWithoutPassword } = user;
    userWithoutPassword.last_login_time = loginTime;
    return userWithoutPassword;
  }

  // 生成密码重置令牌
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // 创建密码重置令牌
  async createPasswordResetToken(usernameOrEmail) {
    const db = await this.ensureConnection();
    
    // 根据用户名或邮箱查找用户
    let user = await db.collection('users').findOne({ username: usernameOrEmail });
    if (!user) {
      user = await db.collection('users').findOne({ email: usernameOrEmail });
    }
    
    if (!user) {
      return null; // 用户不存在
    }

    // 生成重置令牌
    const resetToken = this.generateResetToken();
    const expiresAt = new Date(Date.now() + 3600000); // 1小时后过期

    // 保存重置令牌到用户记录
    await db.collection('users').updateOne(
      { id: user.id },
      {
        $set: {
          resetToken: resetToken,
          resetTokenExpires: expiresAt.toISOString()
        }
      }
    );

    return {
      token: resetToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    };
  }

  // 验证重置令牌
  async verifyResetToken(token) {
    const db = await this.ensureConnection();
    const user = await db.collection('users').findOne({ resetToken: token });
    
    if (!user) {
      return null; // 令牌不存在
    }

    // 检查令牌是否过期
    if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) {
      // 清除过期令牌
      await db.collection('users').updateOne(
        { id: user.id },
        {
          $unset: {
            resetToken: '',
            resetTokenExpires: ''
          }
        }
      );
      return null; // 令牌已过期
    }

    return user;
  }

  // 重置密码
  async resetPassword(token, newPassword) {
    const db = await this.ensureConnection();
    const user = await this.verifyResetToken(token);
    
    if (!user) {
      return false; // 令牌无效或已过期
    }

    // 更新密码并清除重置令牌
    await db.collection('users').updateOne(
      { id: user.id },
      {
        $set: {
          password: this.hashPassword(newPassword),
          updated_at: new Date().toISOString()
        },
        $unset: {
          resetToken: '',
          resetTokenExpires: ''
        }
      }
    );

    return true;
  }

  // ========== Events (埋点记录) ==========

  async createEvent(eventData) {
    const db = await this.ensureConnection();
    const event = {
      id: snowflake.generate(),
      event_name: eventData.event_name,
      event_type: eventData.event_type || 'custom',
      user_id: eventData.user_id || null,
      project_id: eventData.project_id || null,
      properties: eventData.properties || {},
      ip: eventData.ip || null,
      user_agent: eventData.user_agent || null,
      referer: eventData.referer || null,
      created_at: new Date().toISOString()
    };

    await db.collection('events').insertOne(event);
    return event.id;
  }

  async getEvents(options = {}) {
    const db = await this.ensureConnection();
    const {
      limit = 100,
      offset = 0,
      event_name = null,
      event_type = null,
      user_id = null,
      project_id = null,
      start_date = null,
      end_date = null
    } = options;

    // 构建查询条件
    const query = {};
    if (event_name) query.event_name = event_name;
    if (event_type) query.event_type = event_type;
    if (user_id) query.user_id = user_id;
    if (project_id) query.project_id = project_id;
    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = new Date(start_date).toISOString();
      if (end_date) query.created_at.$lte = new Date(end_date).toISOString();
    }

    // 查询总数
    const total = await db.collection('events').countDocuments(query);

    // 查询数据
    const events = await db.collection('events')
      .find(query)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return {
      data: this.removeMongoId(events),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  async getEventById(id) {
    const db = await this.ensureConnection();
    const event = await db.collection('events').findOne({ id: id });
    return this.removeMongoId(event);
  }

  async getEventStats(options = {}) {
    const db = await this.ensureConnection();
    const {
      event_name = null,
      event_type = null,
      user_id = null,
      project_id = null,
      start_date = null,
      end_date = null,
      group_by = 'event_name' // event_name, event_type, user_id, project_id
    } = options;

    // 构建查询条件
    const matchQuery = {};
    if (event_name) matchQuery.event_name = event_name;
    if (event_type) matchQuery.event_type = event_type;
    if (user_id) matchQuery.user_id = user_id;
    if (project_id) matchQuery.project_id = project_id;
    if (start_date || end_date) {
      matchQuery.created_at = {};
      if (start_date) matchQuery.created_at.$gte = new Date(start_date).toISOString();
      if (end_date) matchQuery.created_at.$lte = new Date(end_date).toISOString();
    }

    // 聚合统计
    const pipeline = [
      { $match: matchQuery },
      { $group: {
        _id: `$${group_by}`,
        count: { $sum: 1 },
        latest_time: { $max: '$created_at' }
      }},
      { $sort: { count: -1 } }
    ];

    const stats = await db.collection('events').aggregate(pipeline).toArray();
    return stats.map(stat => {
      const result = {
        [group_by]: stat._id,
        count: stat.count,
        latest_time: stat.latest_time
      };
      return this.formatDateTimeFields(result);
    });
  }

  async deleteEvents(options = {}) {
    const db = await this.ensureConnection();
    const {
      event_name = null,
      event_type = null,
      user_id = null,
      project_id = null,
      start_date = null,
      end_date = null
    } = options;

    // 构建查询条件
    const query = {};
    if (event_name) query.event_name = event_name;
    if (event_type) query.event_type = event_type;
    if (user_id) query.user_id = user_id;
    if (project_id) query.project_id = project_id;
    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = new Date(start_date).toISOString();
      if (end_date) query.created_at.$lte = new Date(end_date).toISOString();
    }

    const result = await db.collection('events').deleteMany(query);
    return result.deletedCount;
  }

  async clearEvents() {
    const db = await this.ensureConnection();
    await db.collection('events').deleteMany({});
    return true;
  }

  // 关闭连接
  async close() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.db = null;
      this.client = null;
      console.log('[Database] Connection closed');
    }
  }
}

module.exports = MockDatabase;
