import * as openpgp from 'openpgp';

export interface GPGConfig {
  privateKeyArmored: string;
  passphrase?: string;
  keyId?: string;
}

export async function signReleaseFile(
  releaseContent: string,
  config: GPGConfig
): Promise<{ inRelease: string; detachedSignature: string }> {
  try {
    // Parse the private key
    const privateKey = await openpgp.readPrivateKey({ armoredKey: config.privateKeyArmored });
    
    // Decrypt the private key if it's encrypted
    const decryptedPrivateKey = config.passphrase 
      ? await openpgp.decryptKey({
          privateKey,
          passphrase: config.passphrase
        })
      : privateKey;

    // Create a message from the release content
    const message = await openpgp.createMessage({ text: releaseContent });

    // Create inline signature (for InRelease file)
    const inReleaseSigned = await openpgp.sign({
      message,
      signingKeys: decryptedPrivateKey,
      format: 'armored'
    });

    // Create detached signature (for Release.gpg)
    const detachedSignature = await openpgp.sign({
      message,
      signingKeys: decryptedPrivateKey,
      detached: true,
      format: 'armored'
    });

    return {
      inRelease: inReleaseSigned as string,
      detachedSignature: detachedSignature as string
    };
  } catch (error) {
    console.error('GPG signing error:', error);
    throw new Error(`Failed to sign release file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getPublicKey(config: GPGConfig): Promise<string> {
  try {
    const privateKey = await openpgp.readPrivateKey({ armoredKey: config.privateKeyArmored });
    const publicKey = privateKey.toPublic();
    return publicKey.armor();
  } catch (error) {
    console.error('Error extracting public key:', error);
    throw new Error(`Failed to extract public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function verifySignature(
  content: string,
  signature: string,
  publicKeyArmored: string
): Promise<boolean> {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const message = await openpgp.createMessage({ text: content });
    const sig = await openpgp.readSignature({ armoredSignature: signature });

    const verificationResult = await openpgp.verify({
      message,
      signature: sig,
      verificationKeys: publicKey
    });

    const { verified } = verificationResult.signatures[0];
    await verified; // This will throw if verification fails
    return true;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

export function validateGPGConfig(config: Partial<GPGConfig>): config is GPGConfig {
  if (!config.privateKeyArmored) {
    throw new Error('GPG_PRIVATE_KEY is required for signing');
  }

  // Basic validation of armored key format
  if (!config.privateKeyArmored.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')) {
    throw new Error('Invalid GPG private key format');
  }

  return true;
}