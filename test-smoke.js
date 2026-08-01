const { DBConnection } = require('./dist/main/main/db/connection.js');
const path = require('path');
const os = require('os');

const db = new DBConnection(path.join(os.tmpdir(), 'onworking_spike_test.db'));

setTimeout(async () => {
  try {
    await db.exec('CREATE TABLE test (id INTEGER, val TEXT)');
    await db.run('INSERT INTO test VALUES (?, ?)', [1, 'hello']);
    const rows = await db.execute('SELECT * FROM test');
    console.log('Query result:', JSON.stringify(rows));
    await db.close();
    console.log('DB worker test PASSED');
    process.exit(0);
  } catch(e) {
    console.error('Test FAILED:', e.message);
    process.exit(1);
  }
}, 500);
