# Thai Fund MACD 📈

เว็บแสดงกราฟ MACD กองทุนรวมไทย พร้อมแจ้งเตือน Telegram ทุกวัน

**Live:** https://nattachai290.github.io/fund-thai/

## Features

- ดึง NAV จาก SEC Thailand API ทุกวันจันทร์–ศุกร์ 23:00 ICT
- คำนวณ MACD (12, 26, 9) อัตโนมัติ
- แสดงกราฟ NAV + MACD พร้อม Bullish/Bearish crossover badge
- แจ้งเตือน Telegram เมื่อเกิด crossover
- รันบน GitHub Actions + GitHub Pages ฟรี 100%

## วิธีเพิ่ม/แก้กองทุน

แก้ไฟล์ `src/config/funds.js` (Frontend) และ `scripts/fetch-nav.mjs` (Script) ในส่วน `FUNDS` array:

```js
{ code: 'FUND-CODE', name: 'ชื่อกองทุน' },
```

## Setup

### 1. Enable GitHub Pages
Settings → Pages → Source: **GitHub Actions**

### 2. ขอ SEC API Key
สมัครที่ https://api-portal.sec.or.th/ → เลือก Products → สมัคร **FundFactsheet** และ **FundDailyInfo** → copy Subscription Key

### 3. ตั้ง GitHub Secrets
Settings → Secrets → Actions:

| Secret | ค่า |
|--------|-----|
| `SEC_API_KEY` | API Key จาก SEC Portal |
| `TELEGRAM_BOT_TOKEN` | Token จาก @BotFather |
| `TELEGRAM_CHAT_ID` | Chat ID ของคุณ |

### วิธีหา Telegram Chat ID
1. ส่งข้อความหา bot ของคุณ
2. เปิด `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. หา `chat.id` ใน response

### 4. รัน workflow ครั้งแรก
Actions → **Daily NAV Update & Deploy** → **Run workflow**

## Tech Stack

- **Frontend:** React + Vite + Recharts
- **CI/CD:** GitHub Actions
- **Hosting:** GitHub Pages
- **Data:** SEC Thailand Open API

## MACD คืออะไร

| เส้น | สี | ความหมาย |
|------|-----|---------|
| MACD | ส้ม | EMA12 − EMA26 |
| Signal | แดง | EMA9 ของ MACD |
| Histogram | เขียว/แดง | MACD − Signal |

สัญญาณซื้อ (Bullish): MACD ตัดขึ้นเหนือ Signal
สัญญาณขาย (Bearish): MACD ตัดลงต่ำกว่า Signal
