import { Hono } from "hono";
import { handleUpload } from "./upload";
import {
  getPackages,
  getRelease,
  getPackagesGz,
  getPackage,
} from "./repository";
import { verifyTOTP } from "./auth";
import { getWebInterface } from "./web";

type Bindings = {
  REPO_BUCKET: R2Bucket;
  PACKAGE_INDEX: KVNamespace;
  TOTP_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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
