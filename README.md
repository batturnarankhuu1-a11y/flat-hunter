This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

## Scraping Rules & `robots.txt` Notes

This project follows `https://www.unegui.mn/robots.txt` and our team's scraping guidelines:

- **Disallowed paths (`User-agent: *`):** `/api`, `/meta`, `/admin`, `/moderator`, `/profile`, `*/edit`, `*/hide`, `*/author`, `*/change_version/*`, `/ru/`, `/en/`, `*----*`, `/map/`, `/static/`, `/get_banner/`.
- **Rate limiting:** Send only 1 request every few seconds (e.g., 2–3s delay in n8n), never many requests at once, to avoid rate limits or IP blocks.
- **Public pages only:** Only read publicly accessible listing pages; never sign in or bypass blocks.
- **Attribution:** Always link back to the original listing URL on `unegui.mn` (we do not copy/store others' photos or phone numbers/agent names).
- **Purpose & compliance:** Built for class/educational use only; do not sell the data, and stop/use test data if the site says no or blocks access.
- **Sitemap / Host reference:** `Host: https://www.unegui.mn/`, `Sitemap: https://www.unegui.mn/sitemap.xml`.

## Түрээсийн дата (CSV → цэвэрлэгээ → seed)

```bash
npm run db:migrate # баазын багануудыг db/schema.ts-тэй нийцүүлнэ (давтан ажиллуулж болно)
npm run data:clean # data/raw/unegui-rentals-export.csv → data/cleaned-rentals.json
npm run data:photos # зар бүрийн өөрийн зургийг public/flats/-д татна (нэг удаа)
npm run db:seed    # бүх зарыг устгаж, data/cleaned-rentals.json-оос 88 байр / 101 зар оруулна
npx tsc --noEmit && npm run lint && npm run build
```

- `scripts/clean-unegui-csv.ts`: хөтчийн өргөтгөлөөр татсан CSV-ийн нүд бүрийг агуулгаар нь ангилна (баганууд мөр бүрт шилжсэн байдаг). Хажуу өрөө, агуулах, хаус, өрөөний тоогүй мөрийг хасна; ижил линк эсвэл ижил гарчиг + үнэ + байршилтай зарыг нэг удаа үлдээнэ; ижил байрны зарыг (дүүрэг + өрөө + талбай + хотхоны нэр + ойролцоо үнэ) нэг байранд нэгтгэнэ. Агентын нэр, профайл линк, агентын лого зургийг хадгалахгүй.
- `MAX_LISTINGS = 100`: хамгийн бүрэн мэдээлэлтэй ~100 зарыг сонгоно (өсгөж болно).
- `data/raw/` gitignore-д орсон (түүхий CSV-д агентын нэр байдаг, N3).
- Зургууд: зар бүрийн өөрийн бодит зургийг `npm run data:photos` нэг удаа татаж `public/flats/<photoRef>.webp`-д хадгална (unegui-ийн CDN гадны сайтад зургийн оронд лого харуулдаг). Агентын лого хасагдана; нэг зураг хоёр өөр байранд давхцахгүй, зураггүй бол placeholder.
- **N3:** агентын нэр, утасны дугаар хадгалахгүй (`lib/privacy.ts`, `N3_CLEANUP_SQL`).
- **Үнэ (§14):** `parsePrice(text, priceType)` — түрээс 1–20 саяас гадуур бол `needs_review`, “тохиролцоно” → null.
- **Fair Price (FR-10):** зар бүрт; ижил дүүрэг + өрөө + түрээс + сүүлийн 60 хоног, ≥5 зар; дүүргийн медианы 30%-иас доош → outlier.
- **AI хайлт (§11):** `POST /api/ask` → `{ status: OK|NOT_FOUND|UNCLEAR, filters, answer, citedListingIds, flats }`.
- Шинэ багана нэмэхдээ `db/schema.ts`-ээс гадна `lib/schema-sync.ts`-д нэмнэ.

## Unegui.mn scraper (түрээсийн орон сууц)

```bash
npm run dev                                          # ingest API ажиллаж байх ёстой
npm run scrape                                       # 1 жагсаалтын хуудас, ≤10 шинэ зар
npm run scrape -- --pages=2 --max-new=20 --save-fixtures
npm run scrape -- --dry-run                          # татаж, задлаад, /api/ingest/check хийнэ — юу ч бичихгүй
npm run scrape -- --offline                          # сүлжээгүй: data/unegui-fixtures/ (JSON/HTML)-ийг оруулна
```

- Ангилал: `/l-hdlh/l-hdlh-treesllne/oron-suuts/` («Орон сууц түрээслүүлнэ»). Жагсаалт → `POST /api/ingest/check` → зөвхөн шинэ зарын дэлгэрэнгүй → `POST /api/ingest`.
- Эелдэг байдал: төслийн нэртэй User-Agent (браузер дуурайхгүй), `robots.txt` дагана, хүсэлт бүрийн өмнө 3–6 сек санамсаргүй хүлээлт, нэг удаад нэг хүсэлт.
- 403 / 429 / 503 / Cloudflare challenge → run зогсоно, `scrape_runs` (status `blocked`, `error`)-д бүртгэнэ, **тойрч гарах оролдлого хийхгүй**. Одоо байгаа дата **өөрчлөгдөхгүй** үйлчилсээр байна; локал fixture-ийг зөвхөн `--fallback-fixtures` эсвэл `--offline`-ээр оруулна.
- Талбар олдохгүй бол `parse_errors`-д бичээд үргэлжилнэ (FR-5).
- Зар тавигчийн нэр/профайл, утсыг уншихгүй, хадгалахгүй (N3).
- Зураг: татсан зарын (усан тэмдэгтэй) зургийг UI-д **харуулахгүй**, хадгалахгүй (N1). Зөвхөн зургийн URL-ын SHA-256 хэш (`listings.photo_refs`) хадгалагдана — шинэ зар өөр зартай ≥2 ижил зураг хуваалцвал нэг байр (flat) болно (FR-8, энгийн хувилбар).
- `GET /api/ingest/runs` → сүүлийн run-ууд, `minutesSinceLastRun`, `stale` (45 минутаас хэтэрсэн бол true) — админ dashboard-д.
- Ingest API бүхэлдээ `x-ingest-secret: $INGEST_SECRET` толгой шаардана (`.env.local`; n8n-д ижил утга).
- Туршилт: `--origin=http://localhost:4999` нь scraper-ийг локал mock сервер рүү чиглүүлнэ (блок/403 туршихад).

## AI хайлт (semantic) ба Pro төлбөр (Wire.mn)

**/api/ask:** шүүлтүүр (дүүрэг, өрөө, үнэ, талбай)-ээс гадуурх үгсийг ("тавилгатай", "River garden", "Хүннү 2222", "furnished downtown") semantic хайлтаар тааруулна. Хариултын `search.engine` аль хөдөлгүүр ашигласныг заана.

- `PINECONE_API_KEY` **ба** `HUGGINGFACE_API_KEY` хоёулаа байвал Pinecone ашиглана. Эхний хүсэлтээр индекс (`PINECONE_INDEX`, анхдагч `flat-hunter`) автоматаар үүсч, байрнууд вектор болж орно. Embedding: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`.
- Түлхүүр дутуу эсвэл Pinecone алдаа гарвал local vector хайлт (`lib/semantic-search.ts`) ажиллана: кирилл/латин бичгийг нэгтгэж, англи үгийг монгол үг рүү хөрвүүлээд TF-IDF + trigram cosine-оор эрэмбэлнэ.

**Pro (9,900₮ / 30 хоног):** үнэгүй эрхээр 1 хайлт хадгална, Pro эрхтэй бол хязгааргүй.

- `POST /api/wire/invoice` нь нэхэмжлэх болон QR үүсгэнэ.
- `POST /api/wire/webhook` нь төлбөрийг баталгаажуулж `user_plans.pro_until`-ийг +30 хоногоор сунгана.
- Демо горим (анхдагч): модалын "Төлбөр баталгаажуулах (Demo Webhook)" товч webhook-ийг дуудна. Зөвхөн нэвтэрсэн эзэмшигчийн демо нэхэмжлэхэд зөвшөөрөгдөнө. Бодит орчинд `WIRE_DEMO_PAYMENTS=off` гэж тохируулна.
- Бодит Wire.mn webhook `x-wire-signature` толгой агуулсан байх ёстой: түүхий body-ийн HMAC-SHA256 (hex), түлхүүр нь `WIRE_WEBHOOK_SECRET`.
