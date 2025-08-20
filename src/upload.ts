import { parseDebPackage } from "./deb";

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

export async function handleUpload(
  file: File,
  bucket: R2Bucket,
  kvIndex: KVNamespace
): Promise<{ success: boolean; message: string; package?: string }> {
  try {
    // Validate file extension
    if (!file.name.endsWith(".deb")) {
      throw new Error("Only .deb packages are supported");
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Parse .deb package metadata
    const metadata = await parseDebPackage(uint8Array, file.name);

    // Calculate hashes
    const md5 = await calculateHash(arrayBuffer, "MD5");
    const sha1 = await calculateHash(arrayBuffer, "SHA-1");
    const sha256 = await calculateHash(arrayBuffer, "SHA-256");

    // Determine storage path
    const firstLetter = metadata.Package[0].toLowerCase();
    const filename = file.name;
    const storagePath = `pool/main/${firstLetter}/${metadata.Package}/${filename}`;

    // Upload to R2
    await bucket.put(storagePath, arrayBuffer, {
      httpMetadata: {
        contentType: "application/vnd.debian.binary-package",
      },
      customMetadata: {
        package: metadata.Package,
        version: metadata.Version,
        architecture: metadata.Architecture,
      },
    });

    // Prepare package metadata for index
    const packageData: PackageMetadata = {
      Package: metadata.Package,
      Version: metadata.Version,
      Architecture: metadata.Architecture,
      Maintainer: metadata.Maintainer || "Unknown",
      Description: metadata.Description || "",
      Filename: storagePath,
      Size: file.size,
      MD5sum: md5,
      SHA1: sha1,
      SHA256: sha256,
      InstalledSize: metadata.InstalledSize,
      Depends: metadata.Depends,
      Section: metadata.Section,
      Priority: metadata.Priority || "optional",
      Homepage: metadata.Homepage,
    };

    // Store metadata in KV
    const kvKey = `pkg:${metadata.Package}:${metadata.Version}:${metadata.Architecture}`;
    await kvIndex.put(kvKey, JSON.stringify(packageData));

    // Update package list cache (invalidate)
    await kvIndex.delete("cache:packages");
    await kvIndex.delete("cache:packages.gz");
    await kvIndex.delete("cache:release");

    return {
      success: true,
      message: `Package ${metadata.Package} version ${metadata.Version} uploaded successfully`,
      package: `${metadata.Package}_${metadata.Version}_${metadata.Architecture}`,
    };
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

async function calculateHash(
  data: ArrayBuffer,
  algorithm: string
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
