import { Hono } from "hono";
import { handleUpload } from "./upload";
import {
  getPackages,
  getRelease,
  getPackagesGz,
  getPackage,
  getInRelease,
  getReleaseGpg,
  getGpgPublicKey,
  clearSignedCaches,
} from "./repository";
import { verifyTOTP } from "./auth";
import { getWebInterface } from "./web";
import { validateGPGConfig, GPGConfig } from "./gpg";

type Bindings = {
  REPO_BUCKET: R2Bucket;
  PACKAGE_INDEX: KVNamespace;
  TOTP_SECRET: string;
  GPG_PRIVATE_KEY?: string;
  GPG_PASSPHRASE?: string;
  GPG_KEY_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper function to get GPG config
function getGPGConfig(env: Bindings): GPGConfig | null {
  if (!env.GPG_PRIVATE_KEY) {
    return null;
  }
  
  const config: GPGConfig = {
    privateKeyArmored: env.GPG_PRIVATE_KEY,
    passphrase: env.GPG_PASSPHRASE,
    keyId: env.GPG_KEY_ID,
  };
  
  try {
    validateGPGConfig(config);
    return config;
  } catch (error) {
    console.error('Invalid GPG configuration:', error);
    return null;
  }
}

// Web interface
app.get("/", (c) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  return c.html(getWebInterface(origin));
});

// Upload endpoint (protected with TOTP)
app.post("/api/upload", async (c) => {
  const formData = await c.req.formData();
  const totp = formData.get("totp") as string;
  const file = formData.get("package") as File;

  if (!totp || !file) {
    return c.json({ error: "Missing TOTP or package file" }, 400);
  }

  // Verify TOTP
  const isValid = verifyTOTP(c.env.TOTP_SECRET, totp);
  if (!isValid) {
    return c.json({ error: "Invalid TOTP code" }, 401);
  }

  try {
    const result = await handleUpload(
      file,
      c.env.REPO_BUCKET,
      c.env.PACKAGE_INDEX
    );
    
    // Clear signed caches when a new package is uploaded
    await clearSignedCaches(c.env.PACKAGE_INDEX);
    
    return c.json(result);
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// APT repository endpoints
app.get("/dists/stable/Release", async (c) => {
  const release = await getRelease(c.env.PACKAGE_INDEX);
  return c.text(release);
});

// Signed Release file (inline signature)
app.get("/dists/stable/InRelease", async (c) => {
  const gpgConfig = getGPGConfig(c.env);
  if (!gpgConfig) {
    return c.json({ error: "GPG not configured" }, 503);
  }
  
  try {
    const inRelease = await getInRelease(c.env.PACKAGE_INDEX, gpgConfig);
    return c.text(inRelease, 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (error) {
    console.error("InRelease generation error:", error);
    return c.json({ error: "Failed to generate signed release" }, 500);
  }
});

// Detached signature for Release file
app.get("/dists/stable/Release.gpg", async (c) => {
  const gpgConfig = getGPGConfig(c.env);
  if (!gpgConfig) {
    return c.json({ error: "GPG not configured" }, 503);
  }
  
  try {
    const releaseGpg = await getReleaseGpg(c.env.PACKAGE_INDEX, gpgConfig);
    return c.text(releaseGpg, 200, {
      "Content-Type": "application/pgp-signature",
    });
  } catch (error) {
    console.error("Release.gpg generation error:", error);
    return c.json({ error: "Failed to generate signature" }, 500);
  }
});

// GPG public key endpoint
app.get("/gpg-key.asc", async (c) => {
  const gpgConfig = getGPGConfig(c.env);
  if (!gpgConfig) {
    return c.json({ error: "GPG not configured" }, 503);
  }
  
  try {
    const publicKey = await getGpgPublicKey(gpgConfig);
    return c.text(publicKey, 200, {
      "Content-Type": "application/pgp-keys",
    });
  } catch (error) {
    console.error("Public key extraction error:", error);
    return c.json({ error: "Failed to get public key" }, 500);
  }
});

app.get("/dists/stable/main/binary-amd64/Packages", async (c) => {
  const packages = await getPackages(c.env.PACKAGE_INDEX);
  return c.text(packages);
});

app.get("/dists/stable/main/binary-amd64/Packages.gz", async (c) => {
  const packagesGz = await getPackagesGz(c.env.PACKAGE_INDEX);
  return c.body(packagesGz, 200, {
    "Content-Type": "application/x-gzip",
  });
});

// Package download
app.get("/pool/main/:letter/:package/:filename", async (c) => {
  const { letter, package: packageName, filename } = c.req.param();
  const path = `pool/main/${letter}/${packageName}/${filename}`;

  const object = await c.env.REPO_BUCKET.get(path);
  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.debian.binary-package");
  object.writeHttpMetadata(headers);

  return c.body(object.body, 200, Object.fromEntries(headers));
});

export default app;
