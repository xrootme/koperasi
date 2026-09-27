# Struktur Modular Koperasi Bot

## Overview
Kode sudah dipecah menjadi modul-modul kecil berdasarkan fungsinya agar mudah dicari dan di-unit test.

## Direktori Struktur

```
src/
├── ai/
│   ├── gemini.js           # Analisis gambar dengan Gemini AI
│   └── index.js
│
├── database/
│   ├── client.js           # Google Sheets client setup
│   ├── helpers.js          # Helper functions (clean, columnLetter)
│   ├── reader.js           # Read operations (getRows, getHeaders)
│   ├── member.js           # Member-related queries
│   ├── loan.js             # Loan-related queries
│   ├── installment.js      # Installment-related queries & updates
│   └── index.js            # Export semua database functions
│
├── services/
│   ├── dateUtils.js        # Date parsing & formatting
│   ├── amountUtils.js      # Amount parsing & cleaning
│   ├── paymentProcessor.js # Payment processing logic
│   ├── broadcast.js        # Daily broadcast functionality
│   └── index.js            # Export semua services
│
├── commands/
│   ├── addMember.js        # /add command
│   ├── checkLoan.js        # /check loan functionality (TODO)
│   ├── updateAngsuran.js   # /update-angsuran command (TODO)
│   └── index.js            # Export semua commands (TODO)
│
├── utils/
│   ├── phone.js            # Phone number utilities
│   ├── rupiah.js           # Currency formatting
│   ├── processedMessages.js # Duplicate detection
│   └── index.js            # Export semua utils
│
└── index.js                # Main bot entry point (TODO - refactor to use new modules)
```

## Keuntungan Struktur Baru

1. **Mudah Dicari**: Setiap fungsi berada di file yang jelas dan spesifik
2. **Unit Testable**: Setiap modul bisa di-test secara independent
3. **Maintainable**: Bug di satu area tidak mempengaruh area lain
4. **Scalable**: Mudah menambah fitur baru tanpa mengubah existing code
5. **Organized**: Setiap file punya tanggung jawab spesifik (Single Responsibility Principle)

## Import Pattern

### Dari database
```javascript
import { getMemberByPhone, getActiveLoan } from './src/database/index.js';
import { getImageHash, isImageProcessed } from './src/utils/index.js';
```

### Dari services
```javascript
import { processPayment } from './src/services/index.js';
import { parsePaymentDate, formatDate } from './src/services/dateUtils.js';
```

### Dari commands
```javascript
import { addMember } from './src/commands/addMember.js';
```

## Next Steps

1. Create `src/commands/checkLoan.js` - Refactor dari `commands/checkLoan.js`
2. Create `src/commands/updateAngsuran.js` - Refactor dari `commands/updateAngsuran.js`
3. Create `src/commands/index.js` - Export semua commands
4. Refactor `index.js` - Update imports untuk gunakan modular structure
5. Test setiap modul dengan unit tests

## Testing Example

```javascript
// test/database/member.test.js
import { getMemberByPhone } from '../../src/database/member.js';

describe('getMemberByPhone', () => {
  it('should find member by phone', async () => {
    const member = await getMemberByPhone('6285712345678');
    expect(member).toBeDefined();
  });
});

// test/services/dateUtils.test.js
import { parsePaymentDate, formatDate } from '../../src/services/dateUtils.js';

describe('dateUtils', () => {
  it('should parse date correctly', () => {
    const date = parsePaymentDate('27/09/2026');
    expect(formatDate(date)).toBe('27/09/2026');
  });
});
```

## File Mapping (Lama → Baru)

| File Lama | File Baru | Status |
|-----------|-----------|--------|
| `database/database.js` | `src/database/*` | ✅ Done |
| `commands/addMember.js` | `src/commands/addMember.js` | ✅ Done |
| `ai/gemini.js` | `src/ai/gemini.js` | ✅ Done |
| `utils/phone.js` | `src/utils/phone.js` | ✅ Done |
| `utils/rupiah.js` | `src/utils/rupiah.js` | ✅ Done |
| `utils/processedMessages.js` | `src/utils/processedMessages.js` | ✅ Done |
| `service/paymentProcessor.js` | `src/services/paymentProcessor.js` | ✅ Done |
| `commands/broadcast.js` | `src/services/broadcast.js` | ✅ Done |
| `commands/checkLoan.js` | `src/commands/checkLoan.js` | ⏳ TODO |
| `commands/updateAngsuran.js` | `src/commands/updateAngsuran.js` | ⏳ TODO |
| `index.js` | `src/index.js` (refactored) | ⏳ TODO |
