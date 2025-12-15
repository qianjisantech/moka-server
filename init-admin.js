// 初始化 Admin 用户脚本
require('dotenv').config();
const MockDatabase = require('./database');

async function initAdmin() {
  const db = new MockDatabase();
  
  try {
    console.log('Connecting to database...');
    await db.connect();
    
    // 检查 admin 用户是否已存在
    const existingAdmin = await db.getUserByUsername('admin');
    
    if (existingAdmin) {
      console.log('Admin user already exists:');
      console.log(`  ID: ${existingAdmin.id}`);
      console.log(`  Username: ${existingAdmin.username}`);
      console.log(`  Email: ${existingAdmin.email || 'N/A'}`);
      console.log(`  Role: ${existingAdmin.role}`);
      console.log(`  Status: ${existingAdmin.status}`);
      console.log('\nTo reset admin password, use the reset password API or update the user.');
      await db.close();
      return;
    }
    
    // 创建 admin 用户
    console.log('Creating admin user...');
    const adminUser = await db.createUser({
      username: 'admin',
      password: 'admin123', // 默认密码，建议首次登录后修改
      email: 'admin@example.com',
      avatar: '',
      role: 'admin',
      status: 'active'
    });
    
    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Login credentials:');
    console.log(`  Username: ${adminUser.username}`);
    console.log(`  Password: admin123`);
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Role: ${adminUser.role}`);
    console.log(`  Status: ${adminUser.status}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  IMPORTANT: Please change the default password after first login!');
    
    await db.close();
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.message.includes('already exists')) {
      console.log('\nAdmin user already exists. Use update API to modify it.');
    }
    process.exit(1);
  }
}

// 运行脚本
initAdmin();

