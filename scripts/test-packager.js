const packager = require('@electron/packager');

async function main() {
  console.log('=== Direct packager test (minimal options) ===');
  try {
    const result = await packager({
      dir: process.cwd(),
      out: './test-out',
      platform: process.platform,
      arch: 'x64',
      overwrite: true,
      quiet: false,
    });
    console.log('Direct packager result:', result);
  } catch (err) {
    console.error('Direct packager error:', err);
    process.exitCode = 1;
  }
}

main();
