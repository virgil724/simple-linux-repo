import { signReleaseFile, getPublicKey, GPGConfig } from './gpg';

interface PackageMetadata {
  Package: string;
  Version: string;
  Architecture: string;
  Maintainer: string;
  Description: string;
  Filename: string;
  Size: number;
  MD5sum: string;
  SHA256: string;
  SHA1: string;
  InstalledSize?: string;
  Depends?: string;
  Section?: string;
  Priority?: string;
  Homepage?: string;
}

export async function getPackages(kvIndex: KVNamespace): Promise<string> {
  // Check cache first
  const cached = await kvIndex.get('cache:packages');
  if (cached) {
    return cached;
  }

  // Generate Packages file from KV
  const packages = await generatePackagesFile(kvIndex);
  
  // Cache for 5 minutes
  await kvIndex.put('cache:packages', packages, { expirationTtl: 300 });
  
  return packages;
}

export async function getPackagesGz(kvIndex: KVNamespace): Promise<ArrayBuffer> {
  // Check cache first
  const cached = await kvIndex.get('cache:packages.gz', 'arrayBuffer');
  if (cached) {
    return cached;
  }

  // Get packages content
  const packages = await getPackages(kvIndex);
  
  // Compress with gzip
  const encoder = new TextEncoder();
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(encoder.encode(packages));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  // Cache for 5 minutes
  await kvIndex.put('cache:packages.gz', compressed.buffer, { expirationTtl: 300 });
  
  return compressed.buffer;
}

export async function getRelease(kvIndex: KVNamespace): Promise<string> {
  // Check cache first
  const cached = await kvIndex.get('cache:release');
  if (cached) {
    return cached;
  }

  // Generate Release file
  const release = await generateReleaseFile(kvIndex);
  
  // Cache for 5 minutes
  await kvIndex.put('cache:release', release, { expirationTtl: 300 });
  
  return release;
}

export async function getInRelease(kvIndex: KVNamespace, gpgConfig?: GPGConfig): Promise<string> {
  // Check cache first
  const cached = await kvIndex.get('cache:inrelease');
  if (cached) {
    return cached;
  }

  if (!gpgConfig) {
    throw new Error('GPG configuration required for signed release');
  }

  // Generate Release file
  const release = await generateReleaseFile(kvIndex);
  
  // Sign the release file
  const { inRelease } = await signReleaseFile(release, gpgConfig);
  
  // Cache for 5 minutes
  await kvIndex.put('cache:inrelease', inRelease, { expirationTtl: 300 });
  
  return inRelease;
}

export async function getReleaseGpg(kvIndex: KVNamespace, gpgConfig?: GPGConfig): Promise<string> {
  // Check cache first
  const cached = await kvIndex.get('cache:release.gpg');
  if (cached) {
    return cached;
  }

  if (!gpgConfig) {
    throw new Error('GPG configuration required for signed release');
  }

  // Generate Release file
  const release = await generateReleaseFile(kvIndex);
  
  // Sign the release file
  const { detachedSignature } = await signReleaseFile(release, gpgConfig);
  
  // Cache for 5 minutes
  await kvIndex.put('cache:release.gpg', detachedSignature, { expirationTtl: 300 });
  
  return detachedSignature;
}

export async function getGpgPublicKey(gpgConfig: GPGConfig): Promise<string> {
  return await getPublicKey(gpgConfig);
}

export async function clearSignedCaches(kvIndex: KVNamespace): Promise<void> {
  // Clear all cached signed files when packages are updated
  await Promise.all([
    kvIndex.delete('cache:release'),
    kvIndex.delete('cache:inrelease'),
    kvIndex.delete('cache:release.gpg'),
    kvIndex.delete('cache:packages'),
    kvIndex.delete('cache:packages.gz')
  ]);
}

async function generatePackagesFile(kvIndex: KVNamespace): Promise<string> {
  // List all package entries
  const list = await kvIndex.list({ prefix: 'pkg:' });
  
  const packages: string[] = [];
  
  for (const key of list.keys) {
    const data = await kvIndex.get(key.name);
    if (!data) continue;
    
    const metadata: PackageMetadata = JSON.parse(data);
    
    // Format as Debian package entry
    const entry = [
      `Package: ${metadata.Package}`,
      `Version: ${metadata.Version}`,
      `Architecture: ${metadata.Architecture}`,
      `Maintainer: ${metadata.Maintainer}`,
      `Filename: ${metadata.Filename}`,
      `Size: ${metadata.Size}`,
      `MD5sum: ${metadata.MD5sum}`,
      `SHA1: ${metadata.SHA1}`,
      `SHA256: ${metadata.SHA256}`,
    ];

    if (metadata.InstalledSize) {
      entry.push(`Installed-Size: ${metadata.InstalledSize}`);
    }
    if (metadata.Depends) {
      entry.push(`Depends: ${metadata.Depends}`);
    }
    if (metadata.Section) {
      entry.push(`Section: ${metadata.Section}`);
    }
    if (metadata.Priority) {
      entry.push(`Priority: ${metadata.Priority}`);
    }
    if (metadata.Homepage) {
      entry.push(`Homepage: ${metadata.Homepage}`);
    }
    if (metadata.Description) {
      // Format multi-line description properly for Debian packages
      const lines = metadata.Description.split('\n');
      const firstLine = lines[0];
      const additionalLines = lines.slice(1);
      
      let description = `Description: ${firstLine}`;
      if (additionalLines.length > 0) {
        description += '\n' + additionalLines.map(line => ` ${line}`).join('\n');
      }
      entry.push(description);
    }

    packages.push(entry.join('\n'));
  }

  return packages.join('\n\n') + '\n';
}

async function generateReleaseFile(kvIndex: KVNamespace): Promise<string> {
  const now = new Date().toUTCString();
  
  // Get Packages file for checksums
  const packages = await getPackages(kvIndex);
  const packagesGz = await getPackagesGz(kvIndex);
  
  const encoder = new TextEncoder();
  const packagesBytes = encoder.encode(packages);
  const packagesGzBytes = new Uint8Array(packagesGz);
  
  // Calculate checksums
  const packagesMd5 = await calculateHash(packagesBytes.buffer, 'MD5');
  const packagesSha1 = await calculateHash(packagesBytes.buffer, 'SHA-1');
  const packagesSha256 = await calculateHash(packagesBytes.buffer, 'SHA-256');
  
  const packagesGzMd5 = await calculateHash(packagesGz, 'MD5');
  const packagesGzSha1 = await calculateHash(packagesGz, 'SHA-1');
  const packagesGzSha256 = await calculateHash(packagesGz, 'SHA-256');
  
  const release = `Origin: Linux Repository
Label: Linux Repository
Suite: stable
Codename: stable
Date: ${now}
Architectures: amd64
Components: main
Description: Custom Linux Package Repository
MD5Sum:
 ${packagesMd5} ${packagesBytes.length} main/binary-amd64/Packages
 ${packagesGzMd5} ${packagesGzBytes.length} main/binary-amd64/Packages.gz
SHA1:
 ${packagesSha1} ${packagesBytes.length} main/binary-amd64/Packages
 ${packagesGzSha1} ${packagesGzBytes.length} main/binary-amd64/Packages.gz
SHA256:
 ${packagesSha256} ${packagesBytes.length} main/binary-amd64/Packages
 ${packagesGzSha256} ${packagesGzBytes.length} main/binary-amd64/Packages.gz`;

  return release;
}

async function calculateHash(data: ArrayBuffer, algorithm: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getPackage(
  bucket: R2Bucket,
  letter: string,
  packageName: string,
  filename: string
): Promise<R2ObjectBody | null> {
  const path = `pool/main/${letter}/${packageName}/${filename}`;
  return await bucket.get(path);
}