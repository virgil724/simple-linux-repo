const OTPAuth = require('otpauth');

const secret = '***REDACTED_TOTP_SECRET***';

const totp = new OTPAuth.TOTP({
  secret: OTPAuth.Secret.fromBase32(secret),
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
});

console.log('TOTP Secret:', secret);
console.log('Current TOTP Code:', totp.generate());
console.log('URI for QR Code:', totp.toString());