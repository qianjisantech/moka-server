const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('./config');

function createRoutes(db) {
  const router = express.Router();

  // ========== 配置管理 ==========

  // 获取 Mock 基础 URL
  router.get('/api/config/base-url', (req, res) => {
    try {
      res.json({ code: 0, data: { baseUrl: config.mockBaseUrl } });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== Projects 管理 ==========

  // 获取所有项目（支持按用户筛选）
  router.get('/api/projects', async (req, res) => {
    try {
      const { username } = req.query;

      // 根据是否提供 username 参数决定返回哪些项目
      let projects;
      if (username) {
        projects = await db.getProjectsByUsername(username);
      } else {
        projects = await db.getAllProjects();
      }

      // 为每个项目添加 API 数量统计
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          const apis = await db.getApisByProjectId(project.id);
          return {
            ...project,
            apiCount: apis.length
          };
        })
      );
      res.json({ code: 0, data: projectsWithCounts });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 项目列表查询（管理后台接口 - 只读，仅用于查看）
  router.post('/api/admin/projects/list', async (req, res) => {
    try {
      const { page = 1, pageSize = 10, name = '', username = '' } = req.body;

      // 将 page 和 pageSize 转换为 offset 和 limit
      const limit = parseInt(pageSize);
      const offset = (parseInt(page) - 1) * limit;

      const result = await db.getProjectsPaginated({
        limit,
        offset,
        username: username || null,
        name: name || null,
        sort_by: 'created_at',
        sort_order: 'desc'
      });

      // 返回符合前端期望的格式
      res.json({
        code: 0,
        data: {
          list: result.data,
          total: result.total,
          page: parseInt(page),
          pageSize: limit
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 分页查询项目
  router.get('/api/projects/paginated', async (req, res) => {
    try {
      const {
        limit = 10,
        offset = 0,
        username,
        name,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = req.query;

      const result = await db.getProjectsPaginated({
        limit: parseInt(limit),
        offset: parseInt(offset),
        username: username || null,
        name: name || null,
        sort_by,
        sort_order
      });

      res.json({
        code: 0,
        data: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 获取单个项目
  router.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await db.getProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ code: -1, message: '项目不存在' });
      }
      res.json({ code: 0, data: project });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 创建项目
  router.post('/api/projects', async (req, res) => {
    try {
      const { name, description, color, icon, username } = req.body;

      if (!name) {
        return res.status(400).json({
          code: -1,
          message: '项目名称是必填项'
        });
      }

      const projectId = await db.createProject({ name, description, color, icon, username });
      res.json({ code: 0, data: { id: projectId }, message: '项目创建成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 更新项目
  router.put('/api/projects/:id', async (req, res) => {
    try {
      const { name, description, color, icon, username } = req.body;

      // 检查项目是否存在
      const existingProject = await db.getProjectById(req.params.id);
      if (!existingProject) {
        return res.status(404).json({ code: -1, message: '项目不存在' });
      }

      // 检查权限：只有项目所有者可以更新（旧项目没有 username 字段则允许所有人更新）
      if (username && existingProject.username && existingProject.username !== username) {
        return res.status(403).json({ code: -1, message: '没有权限更新此项目' });
      }

      const project = await db.updateProject(req.params.id, { name, description, color, icon });
      res.json({ code: 0, data: project, message: '项目更新成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 删除项目
  router.delete('/api/projects/:id', async (req, res) => {
    try {
      const { username } = req.query;

      // 检查项目是否存在
      const existingProject = await db.getProjectById(req.params.id);
      if (!existingProject) {
        return res.status(404).json({ code: -1, message: '项目不存在' });
      }

      // 检查权限：只有项目所有者可以删除（旧项目没有 username 字段则允许所有人删除）
      if (username && existingProject.username && existingProject.username !== username) {
        return res.status(403).json({ code: -1, message: '没有权限删除此项目' });
      }

      await db.deleteProject(req.params.id);
      res.json({ code: 0, message: '项目删除成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 获取项目下的所有 API
  router.get('/api/projects/:id/mocks', async (req, res) => {
    try {
      const project = await db.getProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ code: -1, message: '项目不存在' });
      }

      const apis = await db.getApisByProjectId(req.params.id);
      const formattedApis = apis.map(api => ({
        ...api,
        enabled: api.enabled === true
      }));
      res.json({ code: 0, data: formattedApis });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== Mock APIs 管理 ==========

  // 获取所有 Mock APIs
  router.get('/api/mocks', async (req, res) => {
    try {
      const apis = await db.getAllApis();
      const formattedApis = apis.map(api => ({
        ...api,
        enabled: api.enabled === true
      }));
      res.json({ code: 0, data: formattedApis });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 接口列表查询（管理后台接口 - 只读，仅用于查看）
  router.post('/api/admin/apis/list', async (req, res) => {
    try {
      const { page = 1, pageSize = 10, name = '', projectId = '' } = req.body;

      // 将 page 和 pageSize 转换为 offset 和 limit
      const limit = parseInt(pageSize);
      const offset = (parseInt(page) - 1) * limit;

      const result = await db.getApisPaginated({
        limit,
        offset,
        project_id: projectId || null,
        name: name || null,
        method: null,
        url: null,
        enabled: null,
        sort_by: 'created_at',
        sort_order: 'desc'
      });

      // 返回符合前端期望的格式
      res.json({
        code: 0,
        data: {
          list: result.data,
          total: result.total,
          page: parseInt(page),
          pageSize: limit
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 分页查询接口
  router.get('/api/mocks/paginated', async (req, res) => {
    try {
      const {
        limit = 10,
        offset = 0,
        project_id,
        name,
        method,
        url,
        enabled,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = req.query;

      const result = await db.getApisPaginated({
        limit: parseInt(limit),
        offset: parseInt(offset),
        project_id: project_id || null,
        name: name || null,
        method: method || null,
        url: url || null,
        enabled: enabled !== undefined ? enabled : null,
        sort_by,
        sort_order
      });

      res.json({
        code: 0,
        data: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 获取单个 Mock API
  router.get('/api/mocks/:id', async (req, res) => {
    try {
      const api = await db.getApiById(req.params.id);
      if (!api) {
        return res.status(404).json({ code: -1, message: '未找到' });
      }
      res.json({
        code: 0,
        data: {
          ...api,
          enabled: api.enabled === true
        }
      });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 创建 Mock API
  router.post('/api/mocks', async (req, res) => {
    try {
      const { name, method, url, status, delay, enabled, response, rules, project_id } = req.body;

      if (!name || !method || !url || !response) {
        return res.status(400).json({
          code: -1,
          message: '缺少必填字段'
        });
      }

      const id = await db.createApi({
        name,
        method,
        url,
        status: status || 200,
        delay: delay || 0,
        enabled: enabled !== false,
        response,
        rules: rules || [],
        project_id
      });

      res.json({ code: 0, data: { id }, message: '创建成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 更新 Mock API
  router.put('/api/mocks/:id', async (req, res) => {
    try {
      const api = await db.getApiById(req.params.id);
      if (!api) {
        return res.status(404).json({ code: -1, message: '未找到' });
      }

      await db.updateApi(req.params.id, req.body);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 删除 Mock API
  router.delete('/api/mocks/:id', async (req, res) => {
    try {
      const api = await db.getApiById(req.params.id);
      if (!api) {
        return res.status(404).json({ code: -1, message: '未找到' });
      }

      await db.deleteApi(req.params.id);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 切换 Mock API 状态
  router.post('/api/mocks/:id/toggle', async (req, res) => {
    try {
      const api = await db.toggleApi(req.params.id);
      if (!api) {
        return res.status(404).json({ code: -1, message: '未找到' });
      }
      res.json({
        code: 0,
        data: { enabled: api.enabled === true },
        message: '状态切换成功'
      });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== 日志管理 ==========

  // 获取日志（支持按项目过滤）
  router.get('/api/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const projectId = req.query.project_id || null;
      const logs = await db.getLogs(limit, projectId);
      res.json({ code: 0, data: logs });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 清空日志
  router.delete('/api/logs', async (req, res) => {
    try {
      await db.clearLogs();
      res.json({ code: 0, message: '日志已清空' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== 全局设置 ==========

  // 获取全局状态
  router.get('/api/settings/enabled', async (req, res) => {
    try {
      const enabled = await db.isEnabled();
      res.json({ code: 0, data: { enabled } });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 设置全局状态
  router.post('/api/settings/enabled', async (req, res) => {
    try {
      const { enabled } = req.body;
      await db.setEnabled(enabled);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 导出配置
  router.get('/api/export', async (req, res) => {
    try {
      const apis = await db.getAllApis();
      const formattedApis = apis.map(api => ({
        name: api.name,
        method: api.method,
        url: api.url,
        status: api.status,
        delay: api.delay,
        enabled: api.enabled === true,
        response: api.response
      }));
      const enabled = await db.isEnabled();
      const config = {
        enabled,
        apis: formattedApis
      };
      res.json({ code: 0, data: config });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 导入配置
  router.post('/api/import', async (req, res) => {
    try {
      const { apis, enabled } = req.body;

      if (enabled !== undefined) {
        await db.setEnabled(enabled);
      }

      if (Array.isArray(apis)) {
        for (const api of apis) {
          await db.createApi(api);
        }
      }

      res.json({ code: 0, message: '导入成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== 用户管理 ==========

  // 获取所有用户
  router.get('/api/users', async (req, res) => {
    try {
      const users = await db.getAllUsers();
      res.json({ code: 0, data: users });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 用户列表查询（管理后台接口 - 只读，仅用于查看，不包含密码等敏感信息）
  router.post('/api/admin/users/list', async (req, res) => {
    try {
      const { page = 1, pageSize = 10, username = '' } = req.body;

      // 将 page 和 pageSize 转换为 offset 和 limit
      const limit = parseInt(pageSize);
      const offset = (parseInt(page) - 1) * limit;

      const result = await db.getUsersPaginated({
        limit,
        offset,
        username: username || null,
        email: null,
        role: null,
        status: null,
        sort_by: 'created_at',
        sort_order: 'desc'
      });

      // 返回符合前端期望的格式
      res.json({
        code: 0,
        data: {
          list: result.data,
          total: result.total,
          page: parseInt(page),
          pageSize: limit
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 分页查询用户
  router.get('/api/users/paginated', async (req, res) => {
    try {
      const {
        limit = 10,
        offset = 0,
        username,
        email,
        role,
        status,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = req.query;

      const result = await db.getUsersPaginated({
        limit: parseInt(limit),
        offset: parseInt(offset),
        username: username || null,
        email: email || null,
        role: role || null,
        status: status || null,
        sort_by,
        sort_order
      });

      res.json({
        code: 0,
        data: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 获取单个用户
  router.get('/api/users/:id', async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) {
        return res.status(200).json({ code: -1, message: '用户不存在' });
      }
      res.json({ code: 0, data: user });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 根据用户名获取用户
  router.get('/api/users/username/:username', async (req, res) => {
    try {
      const user = await db.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(200).json({ code: -1, message: '用户不存在' });
      }
      // 不返回密码和 _id
      const { password, _id, ...userWithoutPassword } = user;
      res.json({ code: 0, data: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 创建用户
  router.post('/api/users', async (req, res) => {
    try {
      const { username, password, email, avatar, role, status } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          code: -1,
          message: '用户名和密码是必填项'
        });
      }

      const user = await db.createUser({
        username,
        password,
        email,
        avatar,
        role,
        status
      });

      res.json({ code: 0, data: user, message: '用户创建成功' });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ code: -1, message: error.message });
      }
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 更新用户
  router.put('/api/users/:id', async (req, res) => {
    try {
      const { username, password, email, avatar, role, status } = req.body;

      const existingUser = await db.getUserById(req.params.id);
      if (!existingUser) {
        return res.status(200).json({ code: -1, message: '用户不存在' });
      }

      const updateData = {};
      if (username !== undefined) updateData.username = username;
      if (password !== undefined) updateData.password = password;
      if (email !== undefined) updateData.email = email;
      if (avatar !== undefined) updateData.avatar = avatar;
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;

      const user = await db.updateUser(req.params.id, updateData);
      res.json({ code: 0, data: user, message: '用户更新成功' });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ code: -1, message: error.message });
      }
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 删除用户
  router.delete('/api/users/:id', async (req, res) => {
    try {
      const existingUser = await db.getUserById(req.params.id);
      if (!existingUser) {
        return res.status(200).json({ code: -1, message: '用户不存在' });
      }

      await db.deleteUser(req.params.id);
      res.json({ code: 0, message: '用户删除成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // 用户登录验证
  router.post('/api/users/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          code: -1,
          message: '用户名和密码是必填项'
        });
      }

      const user = await db.verifyUser(username, password);
      if (!user) {
        return res.status(200).json({
          code: -1,
          message: '用户名或密码错误'
        });
      }

      res.json({ code: 0, data: user, message: '登录成功' });
    } catch (error) {
      res.status(500).json({ code: -1, message: error.message });
    }
  });

  // ========== 认证相关接口 ==========
  // 注意：以下接口不需要鉴权（登录、注册、找回密码）
  // 这些接口用于获取认证，因此不需要 token 验证

  // 检查用户名是否可用（无需鉴权）
  router.post('/api/auth/check-username', async (req, res) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(200).json({
          code: -1,
          message: '用户名是必填项'
        });
      }

      // 检查用户名是否已存在
      const existingUser = await db.getUserByUsername(username);
      
      if (existingUser) {
        return res.status(200).json({
          code: -1,
          message: '用户名已存在',
          data: { available: false }
        });
      }

      res.json({
        code: 0,
        message: '用户名可用',
        data: { available: true }
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 用户注册（无需鉴权）
  router.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, email, avatar, securityQuestions } = req.body;

      // 验证必填字段
      if (!username || !password) {
        return res.status(400).json({
          code: -1,
          message: '用户名和密码是必填项'
        });
      }

      // 验证用户名长度
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({
          code: -1,
          message: '用户名长度必须在3到20个字符之间'
        });
      }

      // 验证密码长度
      if (password.length < 6) {
        return res.status(400).json({
          code: -1,
          message: '密码长度至少为6个字符'
        });
      }

      // 验证邮箱格式（如果提供）
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          code: -1,
          message: '邮箱格式不正确'
        });
      }

      // 验证安全问题（如果提供，则必须完整填写三个问题和答案）
      if (securityQuestions) {
        const { question1, answer1, question2, answer2, question3, answer3 } = securityQuestions;
        if (!question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
          return res.status(400).json({
            code: -1,
            message: '如果填写安全问题，必须完整填写三个问题和答案'
          });
        }
      }

      // 创建用户（默认角色为 user，状态为 active）
      // 用户名唯一性由数据库层约束保证
      const user = await db.createUser({
        username,
        password,
        email: email || '',
        avatar: avatar || '',
        role: 'user',
        status: 'active',
        securityQuestions: securityQuestions || null
      });

      res.json({
        code: 0,
        data: user,
        message: '注册成功'
      });
    } catch (error) {
      // 处理数据库层的错误（双重保险）
      if (error.message.includes('已存在')) {
        return res.status(409).json({
          code: -1,
          message: error.message
        });
      }
      res.status(500).json({
        code: -1,
        message: error.message || '注册失败，请稍后重试'
      });
    }
  });

  // 用户登录（无需鉴权）
  router.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          code: -1,
          message: '用户名和密码是必填项'
        });
      }

      const result = await db.verifyUser(username, password);
      
      // 检查是否有错误
      if (result && result.error) {
        let message = '用户名或密码错误';
        if (result.error === 'USER_NOT_FOUND') {
          message = '用户不存在';
        } else if (result.error === 'USER_INACTIVE') {
          message = `账户未激活 (状态: ${result.status})`;
        } else if (result.error === 'INVALID_PASSWORD') {
          message = '密码错误';
        }
        
        return res.status(200).json({
          code: -1,
          message: message
        });
      }

      // 生成 JWT Token
      const token = jwt.sign(
        {
          id: result.id,
          username: result.username,
          role: result.role
        },
        config.jwt.secret,
        {
          expiresIn: config.jwt.expiresIn
        }
      );

      // 登录成功，返回用户信息和 token
      res.json({
        code: 0,
        data: {
          ...result,
          token: token
        },
        message: '登录成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 检查用户名是否存在（用于忘记密码流程，无需鉴权）
  router.get('/api/auth/forgot-password/check/:username', async (req, res) => {
    try {
      const { username } = req.params;

      if (!username) {
        return res.status(400).json({
          code: -1,
          message: '用户名是必填项'
        });
      }

      // 检查用户是否存在
      const user = await db.getUserByUsername(username);
      
      if (user) {
        // 用户存在，返回安全问题（只返回问题，不返回答案）
        const response = {
          code: 0,
          data: {
            exists: true,
            hasSecurityQuestions: false
          },
          message: '用户存在'
        };

        // 如果用户设置了安全问题，返回问题列表
        if (user.securityQuestions) {
          response.data.hasSecurityQuestions = true;
          response.data.securityQuestions = {
            question1: user.securityQuestions.question1 || '',
            question2: user.securityQuestions.question2 || '',
            question3: user.securityQuestions.question3 || ''
          };
        }

        res.json(response);
      } else {
        // 用户不存在，但为了安全，不明确告知用户不存在
        res.json({
          code: 0,
          data: {
            exists: false,
            hasSecurityQuestions: false
          },
          message: '用户不存在'
        });
      }
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 验证安全问题答案（用于忘记密码流程，无需鉴权）
  router.post('/api/auth/forgot-password/verify/:username', async (req, res) => {
    try {
      const { username } = req.params;
      // 支持两种格式：直接 answer1/answer2/answer3 或 answers.answer1/answer2/answer3
      const { answer1, answer2, answer3, answers } = req.body;

      if (!username) {
        return res.status(400).json({
          code: -1,
          message: '用户名是必填项'
        });
      }

      // 获取答案（支持两种格式）
      const finalAnswer1 = answer1 || (answers && answers.answer1);
      const finalAnswer2 = answer2 || (answers && answers.answer2);
      const finalAnswer3 = answer3 || (answers && answers.answer3);

      if (!finalAnswer1 || !finalAnswer2 || !finalAnswer3) {
        return res.status(400).json({
          code: -1,
          message: '必须提供三个问题的答案'
        });
      }

      // 获取用户信息
      const user = await db.getUserByUsername(username);
      
      if (!user) {
        return res.status(200).json({
          code: -1,
          message: '用户不存在'
        });
      }

      // 检查用户是否设置了安全问题
      if (!user.securityQuestions) {
        return res.status(400).json({
          code: -1,
          message: '该用户未设置安全问题'
        });
      }

      // 验证三个答案
      const answer1Correct = db.verifyPassword(finalAnswer1, user.securityQuestions.answer1);
      const answer2Correct = db.verifyPassword(finalAnswer2, user.securityQuestions.answer2);
      const answer3Correct = db.verifyPassword(finalAnswer3, user.securityQuestions.answer3);

      if (!answer1Correct || !answer2Correct || !answer3Correct) {
        return res.status(200).json({
          code: -1,
          message: '安全问题答案错误'
        });
      }

      // 答案全部正确，生成重置令牌
      const result = await db.createPasswordResetToken(username);
      
      if (result) {
        res.json({
          code: 0,
          data: {
            resetToken: result.token, // 仅用于演示，生产环境应通过邮件发送
            message: '验证成功，密码重置令牌已生成'
          },
          message: '验证成功'
        });
      } else {
        res.status(500).json({
          code: -1,
          message: '生成重置令牌失败'
        });
      }
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 忘记密码 - 生成重置令牌（无需鉴权）
  router.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { usernameOrEmail } = req.body;

      if (!usernameOrEmail) {
        return res.status(400).json({
          code: -1,
          message: '用户名或邮箱是必填项'
        });
      }

      const result = await db.createPasswordResetToken(usernameOrEmail);
      
      // 无论用户是否存在，都返回成功消息（安全考虑，防止用户枚举）
      if (result) {
        // 这里应该发送邮件，但为了演示，我们返回令牌
        // 生产环境中应该通过邮件发送令牌，而不是在响应中返回
        res.json({
          code: 0,
          data: {
            resetToken: result.token, // 仅用于演示，生产环境应通过邮件发送
            message: '密码重置令牌已生成，请查看您的邮箱'
          },
          message: '如果账户存在，密码重置令牌已生成'
        });
      } else {
        // 用户不存在，但仍然返回成功（防止用户枚举）
        res.json({
          code: 0,
          message: '如果账户存在，密码重置令牌已生成'
        });
      }
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 重置密码 - 通过用户名和令牌重置（无需鉴权）
  router.post('/api/auth/forgot-password/reset/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const { newPassword, token } = req.body;

      if (!username) {
        return res.status(400).json({
          code: -1,
          message: '用户名是必填项'
        });
      }

      if (!newPassword) {
        return res.status(400).json({
          code: -1,
          message: '新密码是必填项'
        });
      }

      // 验证密码长度
      if (newPassword.length < 6) {
        return res.status(400).json({
          code: -1,
          message: '密码长度至少为6个字符'
        });
      }

      // 获取用户信息
      const user = await db.getUserByUsername(username);
      
      if (!user) {
        return res.status(200).json({
          code: -1,
          message: '用户不存在'
        });
      }

      // 如果提供了 token，使用 token 验证方式（更安全）
      if (token) {
        // 验证 token 是否属于该用户
        if (user.resetToken !== token) {
          return res.status(400).json({
            code: -1,
            message: '重置令牌无效'
          });
        }

        // 检查 token 是否过期
        if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) {
          return res.status(400).json({
            code: -1,
            message: '重置令牌已过期'
          });
        }
      } else {
        // 如果没有提供 token，检查是否有有效的重置令牌（可能是在验证安全问题后生成的）
        if (!user.resetToken) {
          return res.status(400).json({
            code: -1,
            message: '请先验证安全问题或提供重置令牌'
          });
        }

        // 检查 token 是否过期
        if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) {
          return res.status(400).json({
            code: -1,
            message: '重置令牌已过期，请重新验证安全问题'
          });
        }
      }

      // 更新密码并清除重置令牌
      await db.updateUser(user.id, {
        password: newPassword
      });

      // 清除重置令牌
      const dbConnection = await db.ensureConnection();
      await dbConnection.collection('users').updateOne(
        { id: user.id },
        {
          $unset: {
            resetToken: '',
            resetTokenExpires: ''
          }
        }
      );

      res.json({
        code: 0,
        message: '密码重置成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 重置密码 - 使用令牌重置（无需鉴权）
  router.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          code: -1,
          message: '令牌和新密码是必填项'
        });
      }

      // 验证密码长度
      if (newPassword.length < 6) {
        return res.status(400).json({
          code: -1,
          message: '密码长度至少为6个字符'
        });
      }

      const success = await db.resetPassword(token, newPassword);
      
      if (!success) {
        return res.status(400).json({
          code: -1,
          message: '重置令牌无效或已过期'
        });
      }

      res.json({
        code: 0,
        message: '密码重置成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // ========== 埋点记录管理 ==========

  // 上报埋点接口（无需鉴权，用于前端上报）
  router.post('/api/tracking/report', async (req, res) => {
    try {
      const body = req.body;
      let eventsToReport = [];

      // 支持多种格式：
      // 1. 简单格式：{ "event": "user_login", "userId": "...", ... }
      // 2. 标准格式：{ "event": { "event_name": "...", ... } }
      // 3. 批量格式：{ "events": [...] }
      
      if (body.events && Array.isArray(body.events)) {
        // 批量事件格式
        eventsToReport = body.events;
      } else if (body.event) {
        if (typeof body.event === 'string') {
          // 简单格式：event 是字符串，其他字段在 body 中
          eventsToReport = [body];
        } else if (typeof body.event === 'object') {
          // 标准格式：event 是对象
          eventsToReport = [body.event];
        }
      } else if (body.event_name || body.event) {
        // 如果直接传递事件数据（扁平格式）
        eventsToReport = [body];
      }

      if (!eventsToReport || eventsToReport.length === 0) {
        return res.status(400).json({
          code: -1,
          message: '请提供要上报的埋点事件'
        });
      }

      // 从请求中提取 IP、User-Agent、Referer 等信息
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const user_agent = req.headers['user-agent'] || body.userAgent || null;
      const referer = req.headers['referer'] || req.headers['referrer'] || body.url || null;

      const results = [];
      const errors = [];

      // 批量处理事件
      for (const eventData of eventsToReport) {
        try {
          // 规范化事件数据：支持多种格式
          let event_name, event_type, user_id, project_id, properties;

          if (typeof eventData === 'string') {
            // 如果直接是字符串，作为事件名称
            event_name = eventData;
            event_type = 'custom';
            properties = {};
          } else if (eventData.event_name) {
            // 标准格式
            event_name = eventData.event_name;
            event_type = eventData.event_type || 'custom';
            user_id = eventData.user_id || null;
            project_id = eventData.project_id || null;
            properties = eventData.properties || {};
          } else if (eventData.event) {
            // 简单格式：event 字段是事件名称
            event_name = eventData.event;
            event_type = eventData.event_type || 'custom';
            user_id = eventData.userId || eventData.user_id || null;
            project_id = eventData.projectId || eventData.project_id || null;
            
            // 将其他字段作为 properties
            const { event, event_type: et, userId, user_id: uid, projectId, project_id: pid, userAgent, url, timestamp, ...rest } = eventData;
            properties = {
              ...rest,
              ...(url && { url }),
              ...(timestamp && { timestamp }),
              ...(eventData.success !== undefined && { success: eventData.success }),
              ...(eventData.username && { username: eventData.username })
            };
          } else {
            // 扁平格式：直接使用字段
            event_name = eventData.event_name || eventData.event || null;
            event_type = eventData.event_type || 'custom';
            user_id = eventData.userId || eventData.user_id || null;
            project_id = eventData.projectId || eventData.project_id || null;
            
            // 提取 properties
            const { event_name: en, event_type: et, userId, user_id: uid, projectId, project_id: pid, userAgent, url, timestamp, event, ...rest } = eventData;
            properties = {
              ...rest,
              ...(url && { url }),
              ...(timestamp && { timestamp }),
              ...(eventData.success !== undefined && { success: eventData.success }),
              ...(eventData.username && { username: eventData.username })
            };
          }

          if (!event_name) {
            errors.push({ event: eventData, error: '事件名称是必填项' });
            continue;
          }

          const eventId = await db.createEvent({
            event_name,
            event_type: event_type || 'custom',
            user_id: user_id || null,
            project_id: project_id || null,
            properties: properties || {},
            ip,
            user_agent,
            referer
          });

          results.push({ id: eventId, event_name });
        } catch (error) {
          errors.push({ event: eventData, error: error.message });
        }
      }

      // 返回结果
      if (errors.length > 0 && results.length === 0) {
        // 全部失败
        return res.status(400).json({
          code: -1,
          message: '埋点上报失败',
          errors: errors
        });
      } else if (errors.length > 0) {
        // 部分成功
        return res.json({
          code: 0,
          data: {
            success: results,
            failed: errors
          },
          message: `成功上报 ${results.length} 条，失败 ${errors.length} 条`
        });
      } else {
        // 全部成功
        return res.json({
          code: 0,
          data: {
            success: results,
            failed: []
          },
          message: `成功上报 ${results.length} 条埋点记录`
        });
      }
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 埋点记录列表查询（管理后台接口 - 只读，仅用于查看）
  router.post('/api/admin/tracking/list', async (req, res) => {
    try {
      const { page = 1, pageSize = 10, name = '', startDate = '', endDate = '' } = req.body;

      // 将 page 和 pageSize 转换为 offset 和 limit
      const limit = parseInt(pageSize);
      const offset = (parseInt(page) - 1) * limit;

      const dbConnection = await db.ensureConnection();
      
      // 构建查询条件（支持 name 的模糊搜索和日期范围）
      const query = {};
      if (name) {
        query.event_name = { $regex: name, $options: 'i' }; // 模糊搜索，不区分大小写
      }
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) {
          query.created_at.$gte = new Date(startDate + 'T00:00:00.000Z').toISOString();
        }
        if (endDate) {
          query.created_at.$lte = new Date(endDate + 'T23:59:59.999Z').toISOString();
        }
      }

      // 查询总数
      const total = await dbConnection.collection('events').countDocuments(query);

      // 查询数据
      const events = await dbConnection.collection('events')
        .find(query)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      // 使用数据库的格式化方法（移除 _id 并格式化时间字段）
      const processedEvents = db.removeMongoId(events);

      // 获取每个事件的访问次数统计
      const eventNames = [...new Set(processedEvents.map(e => e.event_name))];
      const countPipeline = [
        { $match: query },
        {
          $group: {
            _id: '$event_name',
            count: { $sum: 1 },
            latest_time: { $max: '$created_at' }
          }
        }
      ];
      const countResults = await dbConnection.collection('events').aggregate(countPipeline).toArray();
      const countMap = {};
      countResults.forEach(item => {
        countMap[item._id] = {
          count: item.count,
          latest_time: item.latest_time
        };
      });

      // 转换数据格式以匹配前端期望
      const formattedList = processedEvents.map(event => ({
        id: event.id,
        name: event.event_name,
        code: event.event_name,
        visitCount: countMap[event.event_name]?.count || 1,
        lastVisitTime: event.created_at,
        status: 'active'
      }));

      // 返回符合前端期望的格式
      res.json({
        code: 0,
        data: {
          list: formattedList,
          total: total,
          page: parseInt(page),
          pageSize: limit
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 埋点统计数据接口
  router.post('/api/admin/tracking/statistics', async (req, res) => {
    try {
      const { startDate = '', endDate = '' } = req.body;
      const dbConnection = await db.ensureConnection();

      // 构建查询条件
      const query = {};
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) {
          query.created_at.$gte = new Date(startDate + 'T00:00:00.000Z').toISOString();
        }
        if (endDate) {
          query.created_at.$lte = new Date(endDate + 'T23:59:59.999Z').toISOString();
        }
      }

      // 总访问量（所有事件总数）
      const totalVisits = await dbConnection.collection('events').countDocuments(query);

      // 今日访问量
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayQuery = {
        ...query,
        created_at: {
          ...query.created_at,
          $gte: today.toISOString()
        }
      };
      const todayVisits = await dbConnection.collection('events').countDocuments(todayQuery);

      // 埋点总数（不同事件名称的数量）
      const totalTracking = await dbConnection.collection('events').distinct('event_name', query).then(names => names.length);

      // 活跃埋点（最近7天有访问的埋点）
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const activeQuery = {
        ...query,
        created_at: {
          ...query.created_at,
          $gte: sevenDaysAgo.toISOString()
        }
      };
      const activeTracking = await dbConnection.collection('events').distinct('event_name', activeQuery).then(names => names.length);

      res.json({
        code: 0,
        data: {
          totalVisits,
          todayVisits,
          totalTracking,
          activeTracking
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 访问趋势数据接口
  router.post('/api/admin/tracking/trend', async (req, res) => {
    try {
      const { period = '7d', startDate = '', endDate = '' } = req.body;
      const dbConnection = await db.ensureConnection();

      // 确定日期范围
      let start, end;
      if (startDate && endDate) {
        start = new Date(startDate + 'T00:00:00.000Z');
        end = new Date(endDate + 'T23:59:59.999Z');
      } else {
        end = new Date();
        end.setHours(23, 59, 59, 999);
        start = new Date();
        if (period === '7d') {
          start.setDate(start.getDate() - 6);
        } else if (period === '30d') {
          start.setDate(start.getDate() - 29);
        } else if (period === '90d') {
          start.setDate(start.getDate() - 89);
        } else {
          start.setDate(start.getDate() - 6);
        }
        start.setHours(0, 0, 0, 0);
      }

      // 计算天数
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      
      // 按天聚合数据
      const pipeline = [
        {
          $match: {
            created_at: {
              $gte: start.toISOString(),
              $lte: end.toISOString()
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $dateFromString: { dateString: '$created_at' } }
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];

      const results = await dbConnection.collection('events').aggregate(pipeline).toArray();

      // 填充缺失的日期
      const dates = [];
      const values = [];
      const resultMap = {};
      results.forEach(item => {
        resultMap[item._id] = item.count;
      });

      for (let i = 0; i < days; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        dates.push(dateStr.substring(5)); // MM-DD 格式
        values.push(resultMap[dateStr] || 0);
      }

      res.json({
        code: 0,
        data: {
          dates,
          values
        },
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 埋点分布数据接口
  router.post('/api/admin/tracking/distribution', async (req, res) => {
    try {
      const { startDate = '', endDate = '' } = req.body;
      const dbConnection = await db.ensureConnection();

      // 构建查询条件
      const matchQuery = {};
      if (startDate || endDate) {
        matchQuery.created_at = {};
        if (startDate) {
          matchQuery.created_at.$gte = new Date(startDate + 'T00:00:00.000Z').toISOString();
        }
        if (endDate) {
          matchQuery.created_at.$lte = new Date(endDate + 'T23:59:59.999Z').toISOString();
        }
      }

      // 按事件类型分组统计
      const pipeline = [
        { $match: matchQuery },
        {
          $group: {
            _id: '$event_type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ];

      const results = await dbConnection.collection('events').aggregate(pipeline).toArray();

      // 映射事件类型名称
      const typeNameMap = {
        'page': '页面访问',
        'click': '按钮点击',
        'submit': '表单提交',
        'custom': '用户行为',
        'other': '其他'
      };

      const data = results.map(item => ({
        name: typeNameMap[item._id] || item._id || '其他',
        value: item.count
      }));

      res.json({
        code: 0,
        data,
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 热门埋点排行接口
  router.post('/api/admin/tracking/ranking', async (req, res) => {
    try {
      const { limit = 10, startDate = '', endDate = '' } = req.body;
      const dbConnection = await db.ensureConnection();

      // 构建查询条件
      const matchQuery = {};
      if (startDate || endDate) {
        matchQuery.created_at = {};
        if (startDate) {
          matchQuery.created_at.$gte = new Date(startDate + 'T00:00:00.000Z').toISOString();
        }
        if (endDate) {
          matchQuery.created_at.$lte = new Date(endDate + 'T23:59:59.999Z').toISOString();
        }
      }

      // 按事件名称分组统计，按访问次数排序
      const pipeline = [
        { $match: matchQuery },
        {
          $group: {
            _id: '$event_name',
            count: { $sum: 1 },
            latest_time: { $max: '$created_at' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) }
      ];

      const results = await dbConnection.collection('events').aggregate(pipeline).toArray();

      const data = results.map((item, index) => {
        const formatted = db.formatDateTimeFields({
          latest_time: item.latest_time
        });
        return {
          id: item._id,
          name: item._id,
          code: item._id,
          visitCount: item.count,
          lastVisitTime: formatted.latest_time || item.latest_time,
          rank: index + 1
        };
      });

      res.json({
        code: 0,
        data,
        message: '查询成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 创建埋点记录（无需鉴权，用于前端上报）
  router.post('/api/events', async (req, res) => {
    try {
      const { event_name, event_type, user_id, project_id, properties } = req.body;

      if (!event_name) {
        return res.status(400).json({
          code: -1,
          message: '事件名称是必填项'
        });
      }

      // 从请求中提取 IP、User-Agent、Referer 等信息
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const user_agent = req.headers['user-agent'] || null;
      const referer = req.headers['referer'] || req.headers['referrer'] || null;

      const eventId = await db.createEvent({
        event_name,
        event_type: event_type || 'custom',
        user_id: user_id || null,
        project_id: project_id || null,
        properties: properties || {},
        ip,
        user_agent,
        referer
      });

      res.json({
        code: 0,
        data: { id: eventId },
        message: '埋点记录创建成功'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 获取埋点记录列表（分页）
  router.get('/api/events', async (req, res) => {
    try {
      const {
        limit = 100,
        offset = 0,
        event_name,
        event_type,
        user_id,
        project_id,
        start_date,
        end_date
      } = req.query;

      const result = await db.getEvents({
        limit: parseInt(limit),
        offset: parseInt(offset),
        event_name: event_name || null,
        event_type: event_type || null,
        user_id: user_id || null,
        project_id: project_id || null,
        start_date: start_date || null,
        end_date: end_date || null
      });

      res.json({
        code: 0,
        data: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 获取单个埋点记录
  router.get('/api/events/:id', async (req, res) => {
    try {
      const event = await db.getEventById(req.params.id);
      if (!event) {
        return res.status(404).json({
          code: -1,
          message: '埋点记录不存在'
        });
      }
      res.json({
        code: 0,
        data: event
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 获取埋点统计信息
  router.get('/api/events/stats', async (req, res) => {
    try {
      const {
        event_name,
        event_type,
        user_id,
        project_id,
        start_date,
        end_date,
        group_by = 'event_name'
      } = req.query;

      // 验证 group_by 参数
      const validGroupBy = ['event_name', 'event_type', 'user_id', 'project_id'];
      if (!validGroupBy.includes(group_by)) {
        return res.status(400).json({
          code: -1,
          message: `group_by 参数必须是以下之一: ${validGroupBy.join(', ')}`
        });
      }

      const stats = await db.getEventStats({
        event_name: event_name || null,
        event_type: event_type || null,
        user_id: user_id || null,
        project_id: project_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        group_by
      });

      res.json({
        code: 0,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 删除埋点记录（支持条件删除）
  router.delete('/api/events', async (req, res) => {
    try {
      const {
        event_name,
        event_type,
        user_id,
        project_id,
        start_date,
        end_date
      } = req.query;

      // 如果没有提供任何条件，需要明确确认（防止误删全部）
      if (!event_name && !event_type && !user_id && !project_id && !start_date && !end_date) {
        return res.status(400).json({
          code: -1,
          message: '删除操作需要至少提供一个筛选条件，或使用 /api/events/clear 清空所有记录'
        });
      }

      const deletedCount = await db.deleteEvents({
        event_name: event_name || null,
        event_type: event_type || null,
        user_id: user_id || null,
        project_id: project_id || null,
        start_date: start_date || null,
        end_date: end_date || null
      });

      res.json({
        code: 0,
        data: { deletedCount },
        message: `成功删除 ${deletedCount} 条埋点记录`
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  // 清空所有埋点记录
  router.delete('/api/events/clear', async (req, res) => {
    try {
      await db.clearEvents();
      res.json({
        code: 0,
        message: '所有埋点记录已清空'
      });
    } catch (error) {
      res.status(500).json({
        code: -1,
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createRoutes;
