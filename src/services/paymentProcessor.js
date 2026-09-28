import { toNumber } from "./amountUtils.js";

export async function processPayment(payment, loan, installment) {
  try {
    if (!payment || !loan || !installment) {
      return {
        success: false,
        message: "❌ Data pembayaran tidak lengkap.",
      };
    }

    const paymentAmount = toNumber(payment.amount);
    const billAmount = toNumber(installment["TAGIHAN"]);

    if (paymentAmount <= 0) {
      return {
        success: false,
        message: "❌ Nominal pembayaran tidak valid.",
      };
    }

    // Validasi nominal
    if (paymentAmount < billAmount) {
      const shortfall = billAmount - paymentAmount;
      return {
        success: false,
        message:
          `❌ Nominal kurang.\n\n` +
          `Tagihan: Rp${billAmount.toLocaleString("id-ID")}\n` +
          `Anda bayar: Rp${paymentAmount.toLocaleString("id-ID")}\n` +
          `Kurang: Rp${shortfall.toLocaleString("id-ID")}`,
      };
    }

    // Pembayaran sukses
    return {
      success: true,
      message: "✅ Pembayaran berhasil diproses.",
      paymentAmount,
      billAmount,
      overpayment: paymentAmount - billAmount,
    };
  } catch (error) {
    console.error("❌ PAYMENT PROCESSOR ERROR:", error);
    return {
      success: false,
      message: "❌ Gagal memproses pembayaran.",
    };
  }
}