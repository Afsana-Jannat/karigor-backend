
import { redis } from "./redis";


export const getBkashIdToken = async () => {
	try {
		const IdTokenKey = "bkash:idToken";
		const RefreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await redis.get(IdTokenKey);
		const bkashIdTokenTTL = await redis.ttl(IdTokenKey);

		const bkashRefreshToken = await redis.get(RefreshTokenKey);
		const bkashRefreshTokenTTL = await redis.ttl(RefreshTokenKey);
		if (
			(bkashIdTokenTTL <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTTL > 600
		) {
			const refreshTokenResponse = await fetch(
				`${process.env.bkash_base_url}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: process.env.bkash_username as string,
						password: process.env.bkash_password as string,
					},
					body: JSON.stringify({
						app_key: process.env.bkash_app_key,
						app_secret: process.env.bkash_app_secret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);
			if (!refreshTokenResponse.ok) {
				throw new Error("Bkash Access Token Grant Failed");
			}

			const bkashRefreshTokenResult = await refreshTokenResponse.json();

			bkashIdToken = bkashRefreshTokenResult.id_token as string;

			await redis.set(IdTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60,
				},
			});

			return bkashIdToken;
		}

		if (bkashIdTokenTTL > 600) {
			return bkashIdToken;
		}

		const response = await fetch(
			`${process.env.bkash_base_url}/tokenized/checkout/token/grant`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					username: process.env.bkash_username as string,
					password: process.env.bkash_password as string,
				},
				body: JSON.stringify({
					app_key: process.env.bkash_app_key,
					app_secret: process.env.bkash_app_secret,
				}),
			},
		);

		if (!response.ok) {
			throw new Error("Bkash Access Token Grant Failed");
		}

		const result = await response.json();

		//bkash id token set
		await redis.set(IdTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 60 * 60, // 1hour
			},
		});

		//bkash refresh token set
		await redis.set(RefreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28, // 28 days
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error: any) {
		throw new Error(error.message);
	}
};


interface BkashCreatePaymentResponse {
  statusCode?: string;
  statusMessage?: string;
  paymentID?: string;
  bkashURL?: string;
}

interface CreateBkashPaymentInput {
  paymentId: string;
  amount: number;
  payerReference: string;
  callbackURL: string;
}

export const createBkashPayment = async ({
  paymentId,
  amount,
  payerReference,
  callbackURL,
}: CreateBkashPaymentInput) => {
  const idToken = await getBkashIdToken();

  const appKey = process.env.bkash_app_key;
  const baseUrl = process.env.bkash_base_url;

  if (!appKey || !baseUrl || !idToken) {
    throw new Error('bKash configuration is incomplete');
  }

  const response = await fetch(
    `${baseUrl}/tokenized/checkout/create`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        authorization: idToken,
        'x-app-key': appKey,
      },
      body: JSON.stringify({
        mode: '0011',
        payerReference,
        callbackURL,
        amount: amount.toFixed(2),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: paymentId,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  const result =
    (await response.json()) as BkashCreatePaymentResponse;

  if (
    !response.ok ||
    result.statusCode !== '0000' ||
    !result.paymentID ||
    !result.bkashURL
  ) {
    throw new Error('bKash could not create the payment');
  }

  return {
    paymentID: result.paymentID,
    bkashURL: result.bkashURL,
  };
};


type BkashVerifiedPayment = {
  paymentID?: string;
  paymentId?: string;
  trxID?: string;
  trxId?: string;
  transactionStatus?: string;
  amount?: string | number;
  merchantInvoiceNumber?: string;
  currency?: string;
};

async function bkashPost<T>(
  endpoint: string,
  body: Record<string, string>,
): Promise<T> {
  const token = await getBkashIdToken();
  const baseUrl = process.env.bkash_base_url;
  const appKey = process.env.bkash_app_key;

  if (!baseUrl || !appKey) {
    throw new Error("bKash configuration is missing");
  }

    if (!token) {
    throw new Error("bKash ID token generation failed or missing");
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: token,
        "X-APP-Key": appKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`bKash API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function executeBkashPayment(
  paymentID: string,
): Promise<BkashVerifiedPayment> {
  return bkashPost<BkashVerifiedPayment>(
    "/tokenized/checkout/execute",
    { paymentID },
  );
}

export async function queryBkashPayment(
  paymentID: string,
): Promise<BkashVerifiedPayment> {
  return bkashPost<BkashVerifiedPayment>(
    "/tokenized/checkout/payment/status",
    { paymentID },
  );
}
