import { pgTable, serial, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

export const flats = pgTable("flats", {
  id: serial("id").primaryKey(),
  district: text("district"),
  rooms: integer("rooms"),
  area: numeric("area"),
  lowestPrice: integer("lowest_price"), // сая төгрөгөөр
  pricePerM2: numeric("price_per_m2"),
  badge: text("badge"), // 'cheap' | 'fair' | 'expensive' | 'missing'
  createdAt: timestamp("created_at").defaultNow(),
});

export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  flatId: integer("flat_id").references(() => flats.id),
  sourceUrl: text("source_url").unique().notNull(),
  title: text("title").notNull(),
  rawDescription: text("raw_description"),
  rawPrice: text("raw_price"),
  cleanPrice: integer("clean_price"),
  district: text("district"),
  rooms: integer("rooms"),
  area: numeric("area"),
  imageUrl: text("image_url"),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const parseErrors = pgTable("parse_errors", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});