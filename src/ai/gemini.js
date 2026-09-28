import dotenv from "dotenv";

dotenv.config();

export async function analyzeTransferImage(buffer, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!key) {
    throw new Error("GEMINI_API_KEY belum diisi di .env");
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Buffer gambar tidak valid untuk analisis transfer.");
  }

  console.log("🤖 Gemini model:", model);

  const prompt = `
Baca bukti transfer pada gambar.

Hanya ekstrak informasi yang benar-benar terlihat.
Jangan mengarang informasi.

Jika suatu informasi tidak terlihat, gunakan null.

Kembalikan HANYA JSON murni tanpa markdown formatting:

{
  "is_transfer_proof": false,
  "amount": null,
  "date": null,
  "time": null,
  "sender_name": null,
  "receiver_name": null,
  "bank": null,
  "sender_account": null,
  "receiver_account": null,
  "reference": null,
  "notes": null
}

Ketentuan:
- amount harus berupa angka tanpa titik atau koma.
- is_transfer_proof bernilai true HANYA jika gambar benar-benar merupakan bukti transfer bank / e-wallet.
- Jangan menentukan apakah pembayaran sah atau tidak.
- Jangan menentukan pinjaman atau angsuran.
- Jangan mengarang nama, rekening, nominal, tanggal, atau referensi.
`;

  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: buffer.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error("Waktu permintaan analisis ke Gemini melebihi batas (timeout 30 detik).");
    }
    throw new Error(`Koneksi ke Gemini API gagal: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("Gemini response kosong:", JSON.stringify(data, null, 2));
    throw new Error("Gemini tidak memberikan hasil ekstraksi teks.");
  }

  // Bersihkan format markdown jika model mengembalikan ```json ... ```
  const cleanJson = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Response Gemini bukan JSON valid:", text);
    throw new Error("Response Gemini bukan JSON yang valid.");
  }
}