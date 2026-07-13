/**
 * Minimal isolation test for stock_correlation to capture the real error stack.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;

const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER_PATH],
  env: process.env,
  stderr: 'pipe',
});

const client = new Client({ name: 'iso', version: '1.0.0', requestTimeout: 300_000 });

transport.stderr?.on('data', (d) => {
  process.stdout.write('[SERVER-STDERR] ' + d.toString());
});

try {
  await client.connect(transport);
  console.log('connected');
  try {
    const res = await client.callTool({
      name: 'stock_correlation',
      arguments: { symbols: ['BAS', 'BAYN'], period_days: 30, method: 'pearson' },
      timeout: 120_000,
    });
    console.log('RESULT:', res.content?.[0]?.text);
  } catch (err) {
    console.log('CALL ERROR MESSAGE:', err.message);
    console.log('CALL ERROR STACK:\n', err.stack);
  }
} catch (err) {
  console.error('FATAL:', err.message);
} finally {
  try { await client.close(); } catch {}
}
