/**
 * Start a local Mock OAuth server for testing OAuth flow
 * Usage: tsx scripts/startMockOAuth.ts
 */
import { MockOAuthServer } from '../features/supports/mockOAuthServer';

async function main() {
  const server = new MockOAuthServer(
    {
      clientId: 'test-client-id',
      supportPKCE: true,
      allowAnyRedirectUri: true,
    },
    8888, // Fixed port
  );

  await server.start();

  console.log('\n🚀 Mock OAuth Server is running!');
  console.log(`📍 Base URL: ${server.baseUrl}`);
  console.log('📝 Configuration:');
  console.log('   Client ID: test-client-id');
  console.log('   PKCE: enabled');
  console.log('   Port: 8888');
  console.log('\n✨ Endpoints:');
  console.log(`   Authorization: ${server.baseUrl}/oauth/authorize`);
  console.log(`   Token:         ${server.baseUrl}/oauth/access_token`);
  console.log(`   User Info:     ${server.baseUrl}/api/user`);
  console.log(`   Health:        ${server.baseUrl}/health`);
  console.log('\n💡 Use "local" storage service in TidGi to test');
  console.log('Press Ctrl+C to stop\n');

  // Keep the server running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

void main().catch((error) => {
  console.error('Failed to start Mock OAuth server:', error);
  process.exit(1);
});
