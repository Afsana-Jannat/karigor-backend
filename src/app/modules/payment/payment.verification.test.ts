import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasValidBkashMerchantInvoice } from "./payment.verification.js";

describe("hasValidBkashMerchantInvoice", () => {
  it("allows the optional invoice number to be absent", () => {
    assert.equal(hasValidBkashMerchantInvoice(undefined, "payment-1"), true);
  });

  it("accepts a matching invoice number", () => {
    assert.equal(
      hasValidBkashMerchantInvoice("payment-1", "payment-1"),
      true,
    );
  });

  it("rejects a mismatched invoice number", () => {
    assert.equal(
      hasValidBkashMerchantInvoice("payment-2", "payment-1"),
      false,
    );
  });
});
