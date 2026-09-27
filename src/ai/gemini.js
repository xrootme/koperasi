import dotenv from "dotenv";

dotenv.config();

export async function analyzeTransferImage(buffer, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  const model = "gemini-3.5-flash-lite";

  if (!key) {
    throw new Error("GEMINI_API_KEY belum diisi di .env");
  }

  console.log("🤖 Gemini model:", model);

  const prompt = `
Baca bukti transfer pada gambar.

Hanya ekstrak informasi yang benar-benar terlihat.
Jangan mengarang informasi.

Jika suatu informasi tidak terlihat, gunakan null.

Kembalikan JSON dengan format:

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
- is_transfer_proof true hanya jika gambar terlihat seperti bukti transfer.
- Jangan menentukan apakah pembayaran sah atau tidak.
- Jangan menentukan pinjaman atau angsuran.
- Jangan mengubah data Google Sheets.
- Jangan mengarang nama, rekening, nominal, tanggal, atau referensi.
`;

  const response = await fetch(
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
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("Gemini response:", JSON.stringify(data, null, 2));

    throw new Error("Gemini tidak memberikan hasil.");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Response Gemini:", text);

    throw new Error("Response Gemini bukan JSON yang valid.");
  }
}