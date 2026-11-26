import { pgTable, serial, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

export const flats = pgTable("flats", {
  id: serial("id").primaryKey(),
  district: text("district"),
  khoroo: text("khoroo"), // "26-р хороо"
  complex: text("complex"), // "Нархан хотхон"
  rooms: integer("rooms"),
  area: numeric("area"),
  address: text("address"), // "26-р хороо, Нархан хотхон, 512-р байр, 7/16 давхар"
  dealType: text("deal_type").default("rent"), // 'rent' — зөвхөн түрээс
  lowestPrice: integer("lowest_price"), // сарын түрээс, төгрөгөөр (₮)
  pricePerM2: numeric("price_per_m2"), // ₮ / м²
  badge: text("badge"), // 'cheap' | 'fair' | 'expensive' | 'missing'
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * One ad. Spec N3: agent names and phone numbers are NOT stored — only the
 * listing itself and a link to its original source.
 */
export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  flatId: integer("flat_id").references(() => flats.id),
  /** Real original listing URL. Null for seed/test data, so we never link to a page that does not exist. */
  sourceUrl: text("source_url").unique(),
  source: text("source").default("unegui"), // 'unegui' | 'seed'
  title: text("title").notNull(),
  rawDescription: text("raw_description"),
  rawPrice: text("raw_price"),
  cleanPrice: integer("clean_price"), // сарын түрээс, төгрөгөөр (₮); null = "тохиролцоно"
  /** Price before the last change (set when the ad's price changes) → "Үнэ буурсан" when higher than clean_price. */
  previousPrice: integer("previous_price"),
  priceChangedAt: timestamp("price_changed_at"),
  dealType: text("deal_type").default("rent"),
  address: text("address"),
  district: text("district"),
  rooms: integer("rooms"),
  area: numeric("area"),
  imageUrl: text("image_url"), // comma separated gallery: the ad's own photos, copied to public/flats
  /** SHA-256 prefixes of the original ad's photo URLs — only for duplicate matching (FR-8), never displayed (N1). */
  photoRefs: text("photo_refs"),
  status: text("status").default("active"), // 'active' | 'needs_review' | 'inactive'
  createdAt: timestamp("created_at").defaultNow(),
});

export const savedSearches = pgTable("saved_searches", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  district: text("district"),
  rooms: integer("rooms"),
  maxPrice: integer("max_price"),
  isPaidAlert: boolean("is_paid_alert").default(false),
  /** 'daily' (09:00 digest, free) | 'instant' (Pro) | 'off' */
  alertMode: text("alert_mode").notNull().default("daily"),
  /** Listings newer than this, and price drops after it, are "new" for this search. */
  lastCheckedAt: timestamp("last_checked_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** One Wire.mn invoice for the Pro plan. `demo` invoices are confirmed by the in-app demo button. */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().unique(),
  userId: text("user_id").notNull(), // Clerk user ID
  plan: text("plan").notNull().default("pro"),
  amount: integer("amount").notNull(), // ₮
  provider: text("provider").notNull().default("demo"), // 'demo' | 'wire'
  status: text("status").notNull().default("pending"), // 'pending' | 'paid'
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

/** Paid plan per user: Pro until `proUntil` (unlimited saved searches). */
export const userPlans = pgTable("user_plans", {
  userId: text("user_id").primaryKey(), // Clerk user ID
  plan: text("plan").notNull().default("pro"),
  proUntil: timestamp("pro_until").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const parseErrors = pgTable("parse_errors", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** One scraper run (spec: failures go to scrape_runs.error and parse_errors). */
export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().default("running"), // 'running' | 'ok' | 'blocked' | 'failed'
  source: text("source").notNull().default("live"), // 'live' | 'fixtures'
  pagesRead: integer("pages_read").notNull().default(0),
  listingsSeen: integer("listings_seen").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  error: text("error"),
});
