import * as OTPAuth from 'otpauth';

export function verifyTOTP(secret: string, token: string): boolean {
  try {
    if (!secret || secret === 'your-base32-secret-here') {
      console.error('TOTP_SECRET not configured properly');
      return false;
    }

    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    // Allow for time drift (±1 window)
    const currentToken = totp.generate();
    const previousToken = totp.generate({ timestamp: Date.now() - 30000 });
    const nextToken = totp.generate({ timestamp: Date.now() + 30000 });

    return token === currentToken || token === previousToken || token === nextToken;
  } catch (error) {
    console.error('TOTP verification error:', error);
    return false;
  }
}

export function generateTOTPUri(secret: string, issuer: string = 'Linux Repo'): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    issuer,
    label: 'admin',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  return totp.toString();
}