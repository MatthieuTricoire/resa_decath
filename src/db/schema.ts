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
	role: text("role").$type<"user" | "admin">().default("user").notNull(),
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
	imageUrl: varchar("image_url", { length: 500 }),
	brand: varchar("brand", { length: 100 }).default("Decathlon).notNull()"),
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
	pricePerHalfDay: decimal("price_per_half_day", {
		precision: 10,
		scale: 2,
	}).notNull(),
	pricePerDay: decimal("price_per_day", { precision: 10, scale: 2 }).notNull(),
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

// =============================
// 3. Tables des réservations
// =============================

export const reservations = pgTable("reservations", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.references(() => user.id)
		.notNull(),

	// Code généré par le site web, bipé par la douchette en caisse
	barCodeTicket: varchar("barcode_ticket", { length: 50 }).notNull().unique(),
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
	quantity: integer("quantity").notNull().default(1), // Quantité réservée de ce variant
	// On enregistre quel tarif a été appliqué et sa valeur au moment de la réservation pour éviter les problèmes si les prix changent ensuite
	rateApplied: varchar("rate_applied", { length: 20 }).notNull(), // "pricePerHalfDay" ou "pricePerDay"
	priceAppliedAtReservation: decimal("price_applied_at_reservation", {
		precision: 10,
		scale: 2,
	}).notNull(), // Prix en centimes d'euros appliqué au moment de la réservation
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
}));

// Relations pour la table ItemVariants (Une variante appartient à un item et a plusieurs attributs)
export const itemVariantsRelations = relations(
	itemVariants,
	({ one, many }) => ({
		item: one(items, { fields: [itemVariants.itemId], references: [items.id] }),
		attributes: many(variantAttributes),
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
	}),
);
