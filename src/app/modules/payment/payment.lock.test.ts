import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBkashPaymentUnresolved } from "./payment.lock.js";

describe("isBkashPaymentUnresolved", () => {
	it("blocks another payment while an attempt is initiated", () => {
		assert.equal(isBkashPaymentUnresolved({ status: "INITIATED" }), true);
	});

	it("blocks another payment after a successful payment", () => {
		assert.equal(isBkashPaymentUnresolved({ status: "SUCCESS" }), true);
	});

	it("blocks retry after an unverified bKash failure callback", () => {
		assert.equal(
			isBkashPaymentUnresolved({
				status: "FAILED",
				failureReason: "bKash callback: failure",
			}),
			true,
		);
	});

	it("allows retry after bKash confirms the transaction did not complete", () => {
		assert.equal(
			isBkashPaymentUnresolved({
				status: "FAILED",
				failureReason: "bKash payment verified not completed",
			}),
			false,
		);
	});

	it("blocks retry when a failed attempt has an unknown outcome", () => {
		assert.equal(
			isBkashPaymentUnresolved({
				status: "FAILED",
				failureReason: "bKash verification requires reconciliation",
			}),
			true,
		);
	});

	it("allows retry after a confirmed cancellation", () => {
		assert.equal(isBkashPaymentUnresolved({ status: "CANCELLED" }), false);
	});
});
