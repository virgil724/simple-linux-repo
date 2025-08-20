# Linux Repository with Cloudflare Workers + R2

A serverless APT repository implementation using Cloudflare Workers and R2 storage with TOTP authentication.

## Setup

### 1. Create R2 Bucket and KV Namespace

```bash
npx wrangler r2 bucket create linux-repo
npx wrangler kv:namespace create PACKAGE_INDEX
```

### 2. Generate TOTP Secret

```bash
# Generate a base32 secret (install otpauth-cli or use any base32 generator)
# Example: ***REDACTED_TOTP_SECRET***
```

### 3. Update wrangler.toml

Replace the KV namespace ID and add your TOTP secret:

```toml
[[kv_namespaces]]
binding = "PACKAGE_INDEX"
id = "YOUR_KV_NAMESPACE_ID_HERE"

[vars]
TOTP_SECRET = "YOUR_BASE32_SECRET_HERE"
```

### 4. Deploy

```bash
npm run deploy
# or
npx wrangler deploy
```

## Usage

### Upload Packages

1. Open your worker URL in a browser
2. Enter your TOTP code from your authenticator app
3. Select a .deb package file
4. Click Upload

### Configure APT Client

Add the repository to your system:

```bash
# Add repository
echo "deb https://your-worker.workers.dev/ stable main" | sudo tee /etc/apt/sources.list.d/custom.list

# Update package list
sudo apt update

# Install packages
sudo apt install your-package-name
```

## TOTP Setup

Use any TOTP authenticator app (Google Authenticator, Authy, etc.):

1. Add new account manually
2. Enter your base32 secret
3. Name: Linux Repo
4. Time-based, 30 seconds, 6 digits

## Features

- ✅ TOTP authentication for uploads
- ✅ R2 storage for packages
- ✅ APT-compatible repository structure
- ✅ Automatic package indexing
- ✅ Web upload interface
- ✅ Gzip compression for package lists
- ✅ MD5/SHA1/SHA256 checksums
- ✅ GPG package signing for production security

## API Endpoints

- `GET /` - Web upload interface
- `POST /api/upload` - Upload package (requires TOTP)
- `GET /dists/stable/Release` - Repository release file
- `GET /dists/stable/InRelease` - Signed repository release file (inline)
- `GET /dists/stable/Release.gpg` - Detached signature for Release file
- `GET /gpg-key.asc` - Public GPG key for repository verification
- `GET /dists/stable/main/binary-amd64/Packages` - Package index
- `GET /dists/stable/main/binary-amd64/Packages.gz` - Compressed package index
- `GET /pool/main/:letter/:package/:filename` - Download packages

## Development

```bash
# Install dependencies
npm install

# Run locally
npx wrangler dev

# Deploy
npm run deploy
```

## GPG Package Signing Setup

For production use, enable GPG signing to ensure package integrity and authenticity.

### 1. Generate GPG Keys

Use the provided setup script to generate GPG keys:

```bash
# Generate keys for your repository
node scripts/setup-gpg.js "Linux Repository" "repo@yourdomain.com"
```

This will:
- Generate a 4096-bit RSA key pair
- Export the keys in the correct format
- Provide setup instructions

### 2. Configure Cloudflare Workers

Set the GPG private key as a secret:

```bash
# Set the private key (paste when prompted)
wrangler secret put GPG_PRIVATE_KEY

# Optionally set the key ID for reference
wrangler secret put GPG_KEY_ID

# If your key has a passphrase (recommended for production)
wrangler secret put GPG_PASSPHRASE
```

### 3. Configure APT Client (Secure)

Add the repository with signature verification:

```bash
# Download and add the public key
curl -fsSL https://your-worker.workers.dev/gpg-key.asc | sudo gpg --dearmor -o /etc/apt/keyrings/custom-repo.gpg

# Add repository with signature verification
echo "deb [signed-by=/etc/apt/keyrings/custom-repo.gpg] https://your-worker.workers.dev/ stable main" | sudo tee /etc/apt/sources.list.d/custom.list

# Update package list
sudo apt update

# Install packages (now with signature verification)
sudo apt install your-package-name
```

### 4. Verify Signatures

Check that signatures are working:

```bash
# Download and verify Release file signature
curl -s https://your-worker.workers.dev/dists/stable/Release > Release
curl -s https://your-worker.workers.dev/dists/stable/Release.gpg > Release.gpg
gpg --verify Release.gpg Release
```

## Security Notes

- TOTP secret should be kept secure
- GPG private key must be kept secure and never committed to version control
- Consider adding IP restrictions in production
- Add rate limiting for upload endpoint
- Use encrypted GPG keys with strong passphrases for production