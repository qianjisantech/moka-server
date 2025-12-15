const { createProxyMiddleware } = require('http-proxy-middleware');
const FakerHelper = require('./faker-helper');

class MockProxy {
  constructor(db) {
    this.db = db;
  }

  // URL 匹配函数
  matchUrl(pattern, url) {
    // 支持通配符匹配
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  }

  // 查找匹配的 Mock API
  async findMatchingMock(method, path, projectId) {
    const enabled = await this.db.isEnabled();
    if (!enabled) {
      return null;
    }

    const apis = await this.db.getAllApis();
    return apis.find(api => {
      // 如果 API 有 project_id，则必须匹配项目 ID
      if (api.project_id && api.project_id !== projectId) {
        return false;
      }

      return api.enabled === true &&
             api.method === method &&
             this.matchUrl(api.url, path);
    });
  }

  // 匹配规则条件
  matchRuleConditions(rule, req, query, body) {
    if (!rule.conditions || rule.conditions.length === 0) {
      return false;
    }

    // 所有条件都必须匹配
    return rule.conditions.every(condition => {
      const { type, key, operator, value } = condition;

      let actualValue;

      // 获取实际值
      if (type === 'query') {
        actualValue = query[key];
      } else if (type === 'body') {
        actualValue = body[key];
      } else if (type === 'header') {
        actualValue = req.headers[key.toLowerCase()];
      } else {
        return false;
      }

      // 根据操作符比较
      switch (operator) {
        case 'equals':
          return String(actualValue) === String(value);
        case 'contains':
          return String(actualValue).includes(String(value));
        case 'startsWith':
          return String(actualValue).startsWith(String(value));
        case 'endsWith':
          return String(actualValue).endsWith(String(value));
        case 'exists':
          return actualValue !== undefined && actualValue !== null;
        case 'notExists':
          return actualValue === undefined || actualValue === null;
        default:
          return false;
      }
    });
  }

  // 中间件：拦截并返回 Mock 数据
  middleware() {
    return async (req, res, next) => {
      const method = req.method;
      const originalUrl = req.originalUrl;

      console.log(`[Proxy] ${method} ${originalUrl}`);

      // 解析 URL：格式为 /:projectId/path 或 /path
      // 例如：/257490565556473856/auth/login 或 /api/user/info
      let projectId = null;
      let path = originalUrl;

      const urlParts = originalUrl.split('/').filter(Boolean);
      if (urlParts.length > 0) {
        // 检查第一部分是否是数字（项目 ID）
        const firstPart = urlParts[0];
        if (/^\d+$/.test(firstPart)) {
          projectId = firstPart;
          // 剩余部分是真正的路径
          path = '/' + urlParts.slice(1).join('/');
        }
      }

      console.log(`[Proxy] Project ID: ${projectId || 'none'}, Path: ${path}`);

      // 查找匹配的 Mock
      const mockApi = await this.findMatchingMock(method, path, projectId);

      if (mockApi) {
        console.log(`[Proxy] ✓ Matched: ${mockApi.name}`);

        // 解析请求参数
        const query = req.query || {};
        const body = req.body || {};

        // 尝试匹配响应规则
        let matchedRule = null;
        if (mockApi.rules && mockApi.rules.length > 0) {
          matchedRule = mockApi.rules.find(rule =>
            rule.enabled && this.matchRuleConditions(rule, req, query, body)
          );
        }

        // 确定使用的响应、状态码和延迟
        let response = mockApi.response;
        let status = mockApi.status;
        let delay = mockApi.delay;

        if (matchedRule) {
          console.log(`[Proxy] ✓ Matched rule: ${matchedRule.name}`);
          response = matchedRule.response;
          status = matchedRule.status || mockApi.status;
          delay = matchedRule.delay !== undefined ? matchedRule.delay : mockApi.delay;
        }

        // 记录日志
        await this.db.createLog({
          url: originalUrl,
          method: method,
          mockName: mockApi.name,
          status: status,
          matched: true,
          projectId: mockApi.project_id
        });

        // 模拟延迟
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 处理 Mock 数据中的 faker 表达式
        if (FakerHelper.hasFakerExpression(response)) {
          response = await FakerHelper.processResponse(response);
          console.log(`[Proxy] Processed faker expressions`);
        }

        res.set('X-Mock-Platform', 'true');
        res.set('Access-Control-Allow-Origin', '*');
        return res.status(status).json(response);
      }

      // 没有匹配的 Mock，继续下一个中间件
      next();
    };
  }

  // 创建代理中间件（用于转发未匹配的请求）
  createProxy(target) {
    return createProxyMiddleware({
      target: target,
      changeOrigin: true,
      logLevel: 'silent',
      onError: (err, req, res) => {
        console.error('[Proxy] Error:', err.message);
        res.status(500).json({
          error: 'Proxy error',
          message: err.message
        });
      }
    });
  }
}

module.exports = MockProxy;
