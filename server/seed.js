import { pool } from './db.js';

async function seed() {
  console.log('[Seed] Starting MariaDB setup and data population...');
  
  // 1. Tạo bảng tối ưu InnoDB ROW_FORMAT=DYNAMIC
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(150) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      action VARCHAR(50) NOT NULL,
      status_code INT NOT NULL,
      response_time_ms DECIMAL(6, 2) NOT NULL,
      user_agent VARCHAR(255),
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;
  `);
  console.log('[Seed] Table access_logs created/verified.');

  // Kiểm tra số lượng dòng hiện có
  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM access_logs');
  if (count >= 10000) {
    console.log(`[Seed] Table access_logs already has ${count} records. Skipping data insertion.`);
  } else {
    console.log('[Seed] Inserting 10,000 realistic records in batches...');
    const actions = ['LOGIN', 'LOGOUT', 'PURGE_CACHE', 'VIEW_DASHBOARD', 'API_CALL', 'CHECKOUT', 'UPDATE_PROFILE'];
    const domains = ['gmail.com', 'outlook.com', 'sixforce.io.vn', 'yahoo.com', 'company.vn'];
    const totalToInsert = 10000;
    const batchSize = 1000;

    for (let batch = 0; batch < totalToInsert / batchSize; batch++) {
      const rows = [];
      for (let i = 0; i < batchSize; i++) {
        const id = batch * batchSize + i + 1;
        const email = `user_${(id % 2000) + 1}@${domains[id % domains.length]}`;
        const action = actions[id % actions.length];
        const ip = `192.168.${(id % 254) + 1}.${(id % 250) + 2}`;
        const statusCode = id % 15 === 0 ? 500 : (id % 10 === 0 ? 404 : 200);
        const respTime = (Math.random() * 150 + 5).toFixed(2);
        const date = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 30))
          .toISOString().slice(0, 19).replace('T', ' ');
        rows.push([id, email, ip, action, statusCode, respTime, 'Mozilla/5.0 (NodeClient)', date]);
      }

      await pool.query(
        'INSERT INTO access_logs (user_id, email, ip_address, action, status_code, response_time_ms, user_agent, created_at) VALUES ?',
        [rows]
      );
      process.stdout.write(`[Seed] Inserted ${(batch + 1) * batchSize}/${totalToInsert} records...\r`);
    }
    console.log('\n[Seed] Successfully inserted 10,000 records!');
  }

  // 2. Tạo Indexes cơ bản
  console.log('[Seed] Ensuring Indexes on frequent query columns...');
  try {
    await pool.query('CREATE INDEX idx_email ON access_logs (email);');
    console.log('[Seed] Index idx_email created.');
  } catch (err) {
    if (err.message.includes('Duplicate key name')) {
      console.log('[Seed] Index idx_email already exists.');
    } else {
      console.warn('[Seed] Index warning:', err.message);
    }
  }

  try {
    await pool.query('CREATE INDEX idx_action_created ON access_logs (action, created_at);');
    console.log('[Seed] Index idx_action_created created.');
  } catch (err) {
    if (err.message.includes('Duplicate key name')) {
      console.log('[Seed] Index idx_action_created already exists.');
    } else {
      console.warn('[Seed] Index warning:', err.message);
    }
  }

  console.log('[Seed] Database initialization and index setup completed successfully!');
  await pool.end();
}

seed().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
