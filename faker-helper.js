let faker = null;
const snowflake = require('./snowflake');

// 动态加载 faker
async function loadFaker() {
  if (!faker) {
    const module = await import('@faker-js/faker');
    // 使用中文语言环境
    faker = module.fakerZH_CN;
  }
  return faker;
}

class FakerHelper {
  static async init() {
    await loadFaker();
  }
  /**
   * 处理包含 faker 表达式的对象
   * 支持的语法：@faker:category.method 或 @faker:category.method(args)
   * 例如：
   *   "@faker:person.firstName" -> 生成随机名字
   *   "@faker:internet.email" -> 生成随机邮箱
   *   "@faker:number.int(1,100)" -> 生成 1-100 的随机整数
   *   "@faker:datatype.array(5)" -> 生成长度为5的数组
   */
  static async processResponse(response) {
    await loadFaker();

    if (typeof response === 'string') {
      return this.processFakerString(response);
    }

    if (Array.isArray(response)) {
      // 检查是否是动态数组语法：["@repeat(n)" 或 "@repeat(min,max)", template]
      if (response.length >= 2 && typeof response[0] === 'string') {
        const repeatMatch = response[0].match(/^@repeat\((\d+)(?:,(\d+))?\)$/);
        if (repeatMatch) {
          const min = parseInt(repeatMatch[1]);
          const max = repeatMatch[2] ? parseInt(repeatMatch[2]) : min;
          const count = min === max ? min : faker.number.int({ min, max });

          // 使用第二个元素作为模板，生成 count 个元素
          const template = response[1];
          const result = [];
          for (let i = 0; i < count; i++) {
            result.push(await this.processResponse(template));
          }
          return result;
        }
      }

      // 普通数组处理
      return Promise.all(response.map(item => this.processResponse(item)));
    }

    if (response && typeof response === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(response)) {
        result[key] = await this.processResponse(value);
      }
      return result;
    }

    return response;
  }

  /**
   * 处理字符串中的 faker 表达式
   */
  static processFakerString(str) {
    if (typeof str !== 'string') {
      return str;
    }

    // 先处理雪花 ID
    str = str.replace(/@snowflake/g, () => {
      return snowflake.generate();
    });

    // 匹配 @faker:xxx.xxx 或 @faker:xxx.xxx(args) 格式
    const fakerPattern = /@faker:([a-zA-Z]+)\.([a-zA-Z]+)(\([^)]*\))?/g;

    return str.replace(fakerPattern, (match, category, method, args) => {
      try {
        // 检查 faker 是否有这个分类
        if (!faker[category]) {
          console.warn(`[Faker] Unknown category: ${category}`);
          return match;
        }

        // 检查分类下是否有这个方法
        if (typeof faker[category][method] !== 'function') {
          console.warn(`[Faker] Unknown method: ${category}.${method}`);
          return match;
        }

        // 解析参数
        let parsedArgs = [];
        if (args) {
          // 去掉括号
          const argsStr = args.slice(1, -1).trim();
          if (argsStr) {
            // 简单的参数解析（支持数字、字符串）
            parsedArgs = argsStr.split(',').map(arg => {
              arg = arg.trim();
              // 数字
              if (/^-?\d+(\.\d+)?$/.test(arg)) {
                return parseFloat(arg);
              }
              // 字符串（去掉引号）
              if ((arg.startsWith('"') && arg.endsWith('"')) ||
                  (arg.startsWith("'") && arg.endsWith("'"))) {
                return arg.slice(1, -1);
              }
              // 布尔值
              if (arg === 'true') return true;
              if (arg === 'false') return false;
              return arg;
            });
          }
        }

        // 调用 faker 方法
        let result = faker[category][method](...parsedArgs);

        // 特殊处理：去掉商品名称中的空格
        if (category === 'commerce' && method === 'productName' && typeof result === 'string') {
          result = result.replace(/\s+/g, '');
        }

        return result;
      } catch (error) {
        console.error(`[Faker] Error processing ${match}:`, error.message);
        return match;
      }
    });
  }

  /**
   * 检查对象中是否包含 faker 表达式
   */
  static hasFakerExpression(obj) {
    const str = JSON.stringify(obj);
    return /@faker:/i.test(str) || /@snowflake/i.test(str);
  }

  /**
   * 获取常用的 faker 示例
   */
  static getExamples() {
    return {
      '基础数据': {
        '随机名字': '@faker:person.firstName',
        '随机姓氏': '@faker:person.lastName',
        '完整姓名': '@faker:person.fullName',
        '性别': '@faker:person.sex',
      },
      '联系方式': {
        '邮箱': '@faker:internet.email',
        '手机号': '@faker:phone.number',
        '网址': '@faker:internet.url',
        '用户名': '@faker:internet.username',
      },
      '数字相关': {
        '随机整数(0-100)': '@faker:number.int(0,100)',
        '随机小数': '@faker:number.float(0,100,2)',
        '随机布尔值': '@faker:datatype.boolean',
        'UUID': '@faker:string.uuid',
      },
      '日期时间': {
        '过去日期': '@faker:date.past',
        '未来日期': '@faker:date.future',
        '最近日期': '@faker:date.recent',
        '时间戳': '@faker:date.anytime',
      },
      '地址信息': {
        '省份': '@faker:location.state',
        '城市': '@faker:location.city',
        '街道地址': '@faker:location.streetAddress',
        '邮编': '@faker:location.zipCode',
      },
      '商业数据': {
        '公司名称': '@faker:company.name',
        '公司口号': '@faker:company.catchPhrase',
        '产品名': '@faker:commerce.productName',
        '价格': '@faker:commerce.price',
      },
      '文本内容': {
        '句子': '@faker:lorem.sentence',
        '段落': '@faker:lorem.paragraph',
        '文章': '@faker:lorem.paragraphs(3)',
        '单词': '@faker:lorem.word',
      },
      '图片': {
        '头像': '@faker:image.avatar',
        '随机图片': '@faker:image.url',
      }
    };
  }
}

module.exports = FakerHelper;
