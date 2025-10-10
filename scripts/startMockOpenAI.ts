// pnpm dlx tsx scripts/startMockOpenAI.ts
import { MockOpenAIServer } from '../features/supports/mockOpenAI';

async function main() {
  // 使用固定端口 15121 用于手动测试和 E2E 测试
  const server = new MockOpenAIServer(15121);

  console.log('启动 Mock OpenAI 服务器...');

  try {
    await server.start();
    console.log(`✅ Mock OpenAI 服务器已启动:`);
    console.log(`   URL: ${server.baseUrl}`);
    console.log(`   端口: ${server.port}`);
    console.log(`   Health Check: ${server.baseUrl}/health`);
    console.log('');
    console.log('测试命令示例:');
    console.log(`# Health Check:`);
    console.log(`curl ${server.baseUrl}/health`);
    console.log('');
    console.log(`# Chat Completions:`);
    console.log(`curl -X POST ${server.baseUrl}/v1/chat/completions \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Authorization: Bearer test-key" \\');
    console.log('  -d \'{"model": "test-model", "messages": [{"role": "user", "content": "搜索 wiki 中的 index 条目并解释"}]}\'');
    console.log('');
    console.log('PowerShell 测试命令:');
    console.log(`Invoke-RestMethod -Uri "${server.baseUrl}/health"`);
    console.log('');
    console.log('按 Ctrl+C 停止服务器');

    // 保持服务器运行
    process.on('SIGINT', async () => {
      console.log('\n正在停止服务器...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n正在停止服务器...');
      await server.stop();
      process.exit(0);
    });

    // 防止进程退出 - 使用 setInterval 而不是空的 Promise
    const keepAlive = setInterval(() => {
      // 每10秒输出一次状态，确认服务器还在运行
    }, 10000);
  } catch (error) {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  }
}

main().catch(console.error);
