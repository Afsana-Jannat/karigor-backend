import { createHash, randomInt } from 'node:crypto';
import { redis } from '../../../lib/redis.js';
import { env } from '../../../config/env.js';
import { AppError } from '../../errors/AppError.js';


type IssueContractOtpInput = {
  contractId: string;
  phone: string;
};

export async function issueContractOtp({
  contractId,
  phone,
}: IssueContractOtpInput) {
  const otpKey = `otp:CONTRACT:${contractId}:${phone}`;
  const cooldownKey = `otp:cool:CONTRACT:${contractId}:${phone}`;

  const cooldown = await redis.set(cooldownKey, '1', {
    EX: 60,
    NX: true,
  });

  if (cooldown === null) {
    throw new AppError(
      'RATE_LIMITED',
      'Please wait 60 seconds before requesting another OTP',
    );
  }

  const code = randomInt(100000, 1000000).toString();

  const codeHash = createHash('sha256')
    .update(code)
    .digest('hex');

  await redis.set(
    otpKey,
    JSON.stringify({
      codeHash,
      attempts: 0,
    }),
    { EX: 300 },
  );

  // Connect your real SMS provider here when available.
  // Never log OTP codes in production.

  return {
    otpSent: true,
    ...(env.DEMO_MODE ? { devCode: code } : {}),
  };
}



export async function verifyContractOtp(
  contractId: string,
  phone: string,
  code: string,
): Promise<void> {
  const otpKey = `otp:CONTRACT:${contractId}:${phone}`;

  const storedOtp = await redis.get(otpKey);

  if (!storedOtp) {
    throw new AppError(
      'VALIDATION_ERROR',
      'OTP has expired or was not requested',
    );
  }

  const otpData: { codeHash: string; attempts: number } =
    JSON.parse(storedOtp);

  if (otpData.attempts >= 5) {
    await redis.del(otpKey);

    throw new AppError(
      'VALIDATION_ERROR',
      'Too many incorrect attempts. Request a new OTP',
    );
  }

  const submittedHash = createHash('sha256')
    .update(code)
    .digest('hex');

  if (submittedHash !== otpData.codeHash) {
    otpData.attempts += 1;

    const remainingSeconds = await redis.ttl(otpKey);

    if (otpData.attempts >= 5) {
      await redis.del(otpKey);
    } else if (remainingSeconds > 0) {
      await redis.set(otpKey, JSON.stringify(otpData), {
        EX: remainingSeconds,
      });
    }

    throw new AppError(
      'VALIDATION_ERROR',
      'Incorrect OTP',
    );
  }
}
