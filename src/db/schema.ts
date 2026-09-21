import { relations } from "drizzle-orm";
import {
	boolean,
	decimal,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull().default(false),
	role: text("role")
		.$type<"user" | "manager" | "admin">()
		.default("user")
		.notNull(),
	phone: varchar("phone", { length: 20 }),
	loyaltyCard: varchar("loyalty_card", { length: 50 }),
	image: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

export const session = pgTable("session", {
	id: text().primaryKey(),
	expiresAt: timestamp().notNull(),
	token: text().notNull().unique(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
	ipAddress: text(),
	userAgent: text(),
	userId: text()
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text().primaryKey(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text()
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: timestamp(),
	refreshTokenExpiresAt: timestamp(),
	scope: text(),
	password: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

export const verification = pgTable("verification", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp().notNull(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
});

// =============================
// 1. ENUMS
// =============================

export const itemStatusEnum = pgEnum("item_status", [
	"AVAILABLE", // Opérationnel et prêt à être réservé
	"MAINTENANCE", // En réparation / contrôle sécurité si EPI
	"RETIRED", // Sortir définitivement du catalogue (ex: obsolète, irréparable, etc.)
]);

export const seasonEnum = pgEnum("season", ["winter", "summer", "all"]);

export const durationUnitEnum = pgEnum("duration_unit", ["half_day", "day"]);

export const pricingModeEnum = pgEnum("pricing_mode", [
	"per_day", // Prix à la journée : total = prix journalier x nb de jours
	"per_duration", // Options fixes par durée (QR / code-barres par option)
]);

export const reservationStatusEnim = pgEnum("reservation_status", [
	"PENDING_VERIFICATION",
	"CONFIRMED",
	"COLLECTED",
	"RETURNED",
	"CANCELLED",
	"EXPIRED",
]);

// =============================
// 2. TABLES DU CATALOGUE MATERIEL
// =============================

// Catégories principales (Bivouac, Escalade, Via Ferrata, Randonnée ...)
export const categories = pgTable("categories", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 100 }).notNull().unique(),
	slug: varchar("slug", { length: 100 }).notNull().unique(),
});

// Le produit "générique" ou fiche modèle
export const items = pgTable("items", {
	id: uuid("id").defaultRandom().primaryKey(),
	categoryId: uuid("category_id")
		.notNull()
		.references(() => categories.id, { onDelete: "cascade" }),
	name: varchar("name", { length: 255 }).notNull(), // ex: "Sac à dos Simond MH500",
	description: text("description"),
	brand: varchar("brand", { length: 100 }).default("Decathlon").notNull(),
	season: seasonEnum("season").notNull().default("all"),
	decathlonUrl: varchar("decathlon_url", { length: 500 }),
	availableFrom: varchar("available_from", { length: 5 }),
	availableTo: varchar("available_to", { length: 5 }),
	minDuration: integer("min_duration").default(1).notNull(),
	minDurationUnit: durationUnitEnum("min_duration_unit")
		.default("half_day")
		.notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// La variante physique précise (stock, code barre, etc)
export const itemVariants = pgTable("item_variants", {
	id: uuid("id").defaultRandom().primaryKey(),
	itemId: uuid("item_id")
		.references(() => items.id, { onDelete: "cascade" })
		.notNull(),
	decathlonSku: varchar("decathlon_sku", { length: 50 }).unique(), // ex: "8381168"
	status: itemStatusEnum("status").default("AVAILABLE").notNull(),
	totalStock: integer("total_stock").notNull().default(1), // Quantité totale de ce variant
	pricingMode: pricingModeEnum("pricing_mode").default("per_day").notNull(),
	dailyPrice: decimal("daily_price", { precision: 10, scale: 2 })
		.notNull()
		.default("0.00"), // Prix par jour (per_day)
});

// Images du produit (plusieurs par item, ordre réglable)
export const itemImages = pgTable("item_images", {
	id: uuid("id").defaultRandom().primaryKey(),
	itemId: uuid("item_id")
		.references(() => items.id, { onDelete: "cascade" })
		.notNull(),
	url: varchar("url", { length: 500 }).notNull(),
	alt: varchar("alt", { length: 255 }),
	sortOrder: integer("sort_order").notNull().default(0),
});

// Table dynamique pour stocker TOUS les attributs (pointures, volumes, tailles, ...)
export const variantAttributes = pgTable("variant_attributes", {
	id: uuid("id").defaultRandom().primaryKey(),
	variantId: uuid("variant_id")
		.references(() => itemVariants.id, { onDelete: "cascade" })
		.notNull(),
	name: varchar("name", { length: 50 }).notNull(), // ex: "pointure", "volume", "taille"
	value: varchar("value", { length: 100 }).notNull(), // ex: "42", "20L", "M"
});

// Options de prix avec leur propre code-barres / QR code
// Un QR code = un prix unique pour une variante donnée
export const priceOptions = pgTable("price_options", {
	id: uuid("id").defaultRandom().primaryKey(),
	variantId: uuid("variant_id")
		.references(() => itemVariants.id, { onDelete: "cascade" })
		.notNull(),
	label: varchar("label", { length: 100 }).notNull(), // ex: "1 jour", "2 jours", "3 jours"
	duration: integer("duration").notNull(), // ex: 1, 2, 3, 5 (toujours en jours)
	price: decimal("price", { precision: 10, scale: 2 }).notNull(),
	barcode: varchar("barcode", { length: 50 }).unique().notNull(),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Durées de location globales, gérées par l'admin.
// Sert de référence pour définir les options de prix "par durée" des variantes.
export const rentalDurations = pgTable("rental_durations", {
	id: uuid("id").defaultRandom().primaryKey(),
	label: varchar("label", { length: 100 }).notNull(), // ex: "1 jour", "1 semaine"
	days: integer("days").notNull().unique(), // ex: 1, 2, 3, 7
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================
// 3. Tables des réservations
// =============================

export const reservations = pgTable("reservations", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.references(() => user.id)
		.notNull(),

	status: reservationStatusEnim("status")
		.default("PENDING_VERIFICATION")
		.notNull(),

	// Dates client
	pickupDate: timestamp("pickup_date").notNull(), // Date & heure de retrait prévue
	returnDate: timestamp("return_date").notNull(), // Date de retour prévue du matériel
	expirationAtribute: timestamp("expiration_attribute").notNull(), // Deadline No-Show avant annulation

	createdAt: timestamp("created_at").notNull().defaultNow(),
	isNoShow: integer("is_no_show").notNull().default(0),

	totalPrice: decimal("total_price", { precision: 10, scale: 2 })
		.notNull()
		.default("0.00"),
});

export const reservationItems = pgTable("reservation_items", {
	id: uuid("id").defaultRandom().primaryKey(),
	reservationId: uuid("reservation_id")
		.references(() => reservations.id, { onDelete: "cascade" })
		.notNull(),
	variantId: uuid("variant_id")
		.references(() => itemVariants.id)
		.notNull(),
	priceOptionId: uuid("price_option_id").references(() => priceOptions.id),
	label: varchar("label", { length: 100 }), // Snapshot du libellé affiché (option ou "3 jours · 12 €/j")
	quantity: integer("quantity").notNull().default(1), // Quantité réservée de ce variant
	priceAppliedAtReservation: decimal("price_applied_at_reservation", {
		precision: 10,
		scale: 2,
	}).notNull(), // Prix au moment de la réservation (snapshot)
});

// =============================
// 4. Relations
// =============================

// Relations pour la table Items (Un item a une catégorie et plusieurs variantes)
export const itemsRelations = relations(items, ({ one, many }) => ({
	category: one(categories, {
		fields: [items.categoryId],
		references: [categories.id],
	}),
	variants: many(itemVariants),
	images: many(itemImages),
}));

// Relations pour la table ItemVariants (Une variante appartient à un item et a plusieurs attributs)
export const itemVariantsRelations = relations(
	itemVariants,
	({ one, many }) => ({
		item: one(items, { fields: [itemVariants.itemId], references: [items.id] }),
		attributes: many(variantAttributes),
		priceOptions: many(priceOptions),
		reservationLines: many(reservationItems),
	}),
);

// Relations pour la table VariantAttributes (Un attribut appartient à une seule variante)
export const variantAttributesRelations = relations(
	variantAttributes,
	({ one }) => ({
		variant: one(itemVariants, {
			fields: [variantAttributes.variantId],
			references: [itemVariants.id],
		}),
	}),
);

// Relations pour la table PriceOptions (Une option de prix appartient à une variante)
export const priceOptionsRelations = relations(priceOptions, ({ one }) => ({
	variant: one(itemVariants, {
		fields: [priceOptions.variantId],
		references: [itemVariants.id],
	}),
}));

// Relations pour la table ItemImages (Une image appartient à un seul item)
export const itemImagesRelations = relations(itemImages, ({ one }) => ({
	item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
}));

// Relations pour les Réservations (Une résa appartient à un user et a plusieurs articles)
export const reservationsRelations = relations(
	reservations,
	({ one, many }) => ({
		user: one(user, { fields: [reservations.userId], references: [user.id] }),
		lineItems: many(reservationItems),
	}),
);

// Relations pour la table de liaison des articles réservés
export const reservationItemsRelations = relations(
	reservationItems,
	({ one }) => ({
		reservation: one(reservations, {
			fields: [reservationItems.reservationId],
			references: [reservations.id],
		}),
		variant: one(itemVariants, {
			fields: [reservationItems.variantId],
			references: [itemVariants.id],
		}),
		priceOption: one(priceOptions, {
			fields: [reservationItems.priceOptionId],
			references: [priceOptions.id],
		}),
	}),
);

// =============================
// 5. Paramètres de facturation (singleton, 1 ligne)
// =============================

// Forfait mensuel + pourcentage de commission appliqué au CA des locations.
// Une seule ligne, modifiable depuis l'admin (les montants sont en discussion).
export const billingSettings = pgTable("billing_settings", {
	id: integer("id").primaryKey().default(1),
	monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 })
		.notNull()
		.default("30.00"),
	commissionRate: decimal("commission_rate", { precision: 4, scale: 2 })
		.notNull()
		.default("10.00"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
