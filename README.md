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

## API Endpoints

- `GET /` - Web upload interface
- `POST /api/upload` - Upload package (requires TOTP)
- `GET /dists/stable/Release` - Repository release file
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

## Security Notes

- TOTP secret should be kept secure
- Consider adding IP restrictions in production
- Add rate limiting for upload endpoint
- Implement package signing with GPG for production use