#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔐 GPG Key Setup for Linux Repository');
console.log('=====================================\n');

// Check if GPG is installed
try {
  execSync('gpg --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ GPG is not installed or not in PATH');
  console.log('Please install GPG first:');
  console.log('  macOS: brew install gnupg');
  console.log('  Ubuntu/Debian: sudo apt install gnupg');
  console.log('  Windows: https://www.gnupg.org/download/');
  process.exit(1);
}

const keyName = process.argv[2] || 'Linux Repository';
const keyEmail = process.argv[3] || 'repo@example.com';

console.log(`📝 Generating GPG key for: ${keyName} <${keyEmail}>`);

// Create a temporary GPG config for key generation
const tempDir = path.join(__dirname, '.tmp-gpg');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const keygenScript = `
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${keyName}
Name-Email: ${keyEmail}
Expire-Date: 2y
%no-protection
%commit
`;

const scriptPath = path.join(tempDir, 'keygen.txt');
fs.writeFileSync(scriptPath, keygenScript);

try {
  console.log('🔄 Generating GPG key (this may take a moment)...');
  
  // Generate the key
  execSync(`gpg --batch --generate-key "${scriptPath}"`, { stdio: 'inherit' });
  
  // Get the key ID
  const keyListOutput = execSync(`gpg --list-secret-keys --keyid-format LONG "${keyEmail}"`, { encoding: 'utf8' });
  const keyIdMatch = keyListOutput.match(/sec\s+rsa4096\/([A-F0-9]{16})/);
  
  if (!keyIdMatch) {
    throw new Error('Could not extract key ID from GPG output');
  }
  
  const keyId = keyIdMatch[1];
  console.log(`✅ Generated GPG key with ID: ${keyId}`);
  
  // Export private key
  console.log('📤 Exporting private key...');
  const privateKey = execSync(`gpg --armor --export-secret-keys ${keyId}`, { encoding: 'utf8' });
  
  // Export public key
  console.log('📤 Exporting public key...');
  const publicKey = execSync(`gpg --armor --export ${keyId}`, { encoding: 'utf8' });
  
  // Encode private key for Cloudflare Workers (base64)
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  
  console.log('\n🚀 Setup Complete!');
  console.log('==================\n');
  
  console.log('1. Set the GPG private key secret in Cloudflare Workers:');
  console.log(`   wrangler secret put GPG_PRIVATE_KEY`);
  console.log('   (Paste the following when prompted):');
  console.log('   ----------------------------------------');
  console.log(privateKey);
  console.log('   ----------------------------------------\n');
  
  console.log('2. Optionally set the key ID for reference:');
  console.log(`   wrangler secret put GPG_KEY_ID`);
  console.log(`   Value: ${keyId}\n`);
  
  console.log('3. Your public key (save this for client setup):');
  console.log('   ----------------------------------------');
  console.log(publicKey);
  console.log('   ----------------------------------------\n');
  
  console.log('4. To add the repository with signature verification:');
  console.log(`   curl -fsSL https://your-worker.workers.dev/gpg-key.asc | sudo gpg --dearmor -o /etc/apt/keyrings/custom-repo.gpg`);
  console.log(`   echo "deb [signed-by=/etc/apt/keyrings/custom-repo.gpg] https://your-worker.workers.dev/ stable main" | sudo tee /etc/apt/sources.list.d/custom.list`);
  console.log(`   sudo apt update\n`);
  
  // Save keys to files for reference
  const keysDir = path.join(__dirname, '..', 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir);
  }
  
  fs.writeFileSync(path.join(keysDir, 'private.key'), privateKey);
  fs.writeFileSync(path.join(keysDir, 'public.key'), publicKey);
  fs.writeFileSync(path.join(keysDir, 'key-info.txt'), `Key ID: ${keyId}\nEmail: ${keyEmail}\nName: ${keyName}\n`);
  
  console.log(`💾 Keys saved to ./keys/ directory for reference`);
  console.log('⚠️  Keep the private key secure and do not commit it to version control!');
  
} catch (error) {
  console.error('❌ Error generating GPG key:', error.message);
  process.exit(1);
} finally {
  // Clean up temporary files
  if (fs.existsSync(scriptPath)) {
    fs.unlinkSync(scriptPath);
  }
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir);
  }
}