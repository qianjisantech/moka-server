/**
 * 简单的雪花 ID 生成器
 * 生成 64 位唯一 ID
 */
class SnowflakeId {
  constructor() {
    // 起始时间戳 (2024-01-01)
    this.epoch = 1704067200000;

    // 工作机器 ID (0-31)
    this.workerId = 1;

    // 数据中心 ID (0-31)
    this.datacenterId = 1;

    // 序列号 (0-4095)
    this.sequence = 0;

    // 上次生成 ID 的时间戳
    this.lastTimestamp = -1;
  }

  /**
   * 生成下一个 ID
   */
  generate() {
    let timestamp = Date.now();

    // 如果当前时间小于上次生成 ID 的时间戳，说明时钟回退了
    if (timestamp < this.lastTimestamp) {
      throw new Error('Clock moved backwards. Refusing to generate id');
    }

    // 如果是同一毫秒内生成的，则进行序列号递增
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & 4095; // 12 位序列号，最大 4095

      // 序列号溢出
      if (this.sequence === 0) {
        // 阻塞到下一毫秒
        timestamp = this.tilNextMillis(this.lastTimestamp);
      }
    } else {
      // 不同毫秒，序列号重置
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    // 使用 BigInt 避免位运算溢出导致负数
    const timestampPart = BigInt(timestamp - this.epoch) << 22n;
    const datacenterPart = BigInt(this.datacenterId) << 17n;
    const workerPart = BigInt(this.workerId) << 12n;
    const sequencePart = BigInt(this.sequence);

    const id = timestampPart | datacenterPart | workerPart | sequencePart;

    return id.toString();
  }

  /**
   * 阻塞到下一毫秒
   */
  tilNextMillis(lastTimestamp) {
    let timestamp = Date.now();
    while (timestamp <= lastTimestamp) {
      timestamp = Date.now();
    }
    return timestamp;
  }

  /**
   * 生成字符串格式的 ID (带前缀)
   */
  generateString(prefix = 'proj') {
    return `${prefix}_${this.generate()}`;
  }
}

// 导出单例
const snowflake = new SnowflakeId();
module.exports = snowflake;
