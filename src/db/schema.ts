import { relations, sql } from "drizzle-orm";
import {
	boolean,
	decimal,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
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
	banned: boolean().default(false),
	banReason: text(),
	banExpires: timestamp(),
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

/**
 * Cycle de vie d'une réservation : quatre états, une seule direction.
 *
 * `CONFIRMED` est l'état d'entrée, web comme comptoir : une réservation est
 * ligne dès qu'elle est créée, sans validation intermédiaire. On ne la supprime
 * que si personne ne l'a retirée. `COLLECTED` est écrit quand le matériel part
 * au comptoir, `RETURNED` quand il revient — et c'est le **seul** endroit où la
 * base enregistre qu'un client est venu.
 *
 * `PENDING_VERIFICATION` et `EXPIRED` ont été retirés : aucun chemin
 * applicatif ne les écrivait. Le premier rendait la liste des retards de retrait
 * du back-office structurellement vide, le second n'existait que dans les données
 * de démonstration. Ce qui distingue une annulation d'une non-présentation tient
 * désormais dans `reservations.isNoShow`, pas dans un statut.
 */
export const reservationStatusEnim = pgEnum("reservation_status", [
	"CONFIRMED",
	"COLLECTED",
	"RETURNED",
	"CANCELLED",
]);

// Canal de création de la réservation : comptoir (staff) ou site public.
export const reservationSourceEnum = pgEnum("reservation_source", [
	"STORE",
	"WEB",
]);

// =============================
// 2. TABLES DU CATALOGUE MATERIEL
// =============================

// Catégories principales (Bivouac, Escalade, Via Ferrata, Randonnée ...)
export const categories = pgTable("categories", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 100 }).notNull().unique(),
	slug: varchar("slug", { length: 100 }).notNull().unique(),
	description: text("description"),
});

// Le produit "générique" ou fiche modèle
export const items = pgTable("items", {
	id: uuid("id").defaultRandom().primaryKey(),
	categoryId: uuid("category_id")
		.notNull()
		.references(() => categories.id, { onDelete: "cascade" }),
	name: varchar("name", { length: 255 }).notNull(), // ex: "Sac à dos Simond MH500",
	slug: varchar("slug", { length: 160 }).notNull(), // SEO : /activite/<catégorie>/<slug-produit>
	description: text("description"),
	brand: varchar("brand", { length: 100 }).default("Decathlon").notNull(),
	season: seasonEnum("season").notNull().default("all"),
	decathlonUrl: varchar("decathlon_url", { length: 500 }),
	availableFrom: varchar("available_from", { length: 5 }),
	availableTo: varchar("available_to", { length: 5 }),
	/** Durée minimale de location, en journées entières. */
	minDuration: integer("min_duration").default(1).notNull(),
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
	// Le prix vit uniquement dans `price_options` : une durée vendue porte son
	// prix et son code-barres, donc toute ligne de commande en référence un.
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

// Noms d'attributs configurables par l'admin (globaux, comme les durées).
// `variant_attributes` stocke une copie texte ; ces définitions n'existent que
// pour garantir une saisie cohérente dans le formulaire produit.
export const attributeDefinitions = pgTable("attribute_definitions", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 50 }).notNull().unique(), // ex: "Taille", "Volume", "Places"
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Valeurs autorisées pour chaque définition.
export const attributeValues = pgTable(
	"attribute_values",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		definitionId: uuid("definition_id")
			.references(() => attributeDefinitions.id, { onDelete: "cascade" })
			.notNull(),
		value: varchar("value", { length: 100 }).notNull(), // ex: "M", "40L", "2"
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(table) => [
		uniqueIndex("attribute_values_definition_value_uq").on(
			table.definitionId,
			table.value,
		),
	],
);

// Options de prix avec leur propre code-barres / QR code
// Un QR code = un prix unique pour une variante donnée.
// Le code-barres saisi ici est celui déjà enregistré dans la caisse du magasin :
// le scanner en caisse remonte automatiquement le prix.
export const priceOptions = pgTable(
	"price_options",
	{
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
	},
	(table) => [
		// Un seul prix actif par produit et par durée de location.
		uniqueIndex("price_options_variant_duration_active_uq")
			.on(table.variantId, table.duration)
			.where(sql`${table.isActive} = true`),
	],
);

// Horaires d'ouverture du magasin : une ligne par jour, 0 = dimanche.
//
// `day` est la clé primaire et non un simple numéro d'ordre : il doit rester
// stable, parce que les calendriers de réservation et le JSON-LD le reprennent
// tel quel et qu'une réindexation ferait basculer les jours les uns sur les
// autres.
//
// `is_open` est la seule information qui décide d'une réservation. Les colonnes
// de créneaux décrivent *quand*, jamais *si* : un jour fermé garde ses horaires
// (8h45–13h le dimanche) pour être rouvert en forte saison sans ressaisie. La
// validation côté serveur refuse en revanche d'enregistrer un jour ouvert sans
// au moins un créneau, faute de quoi le site afficherait un magasin ouvert dont
// personne ne sait quand il ouvre.
//
// Les créneaux sont deux colonnes plutôt qu'un tableau : l'application raisonne
// en journées entières. L'après-midi vide signifie « fermé le midi », un créneau
// unique signifie journée continue.
export const storeHours = pgTable("store_hours", {
	day: integer("day").primaryKey(), // 0 = dimanche … 6 = samedi
	label: varchar("label", { length: 20 }).notNull(), // ex: "Lundi"
	isOpen: boolean("is_open").notNull().default(true),
	morningFrom: varchar("morning_from", { length: 5 }), // "09:00", null si fermé
	morningTo: varchar("morning_to", { length: 5 }), // "12:30", null si fermé
	afternoonFrom: varchar("afternoon_from", { length: 5 }), // "14:30", null = fermé le midi
	afternoonTo: varchar("afternoon_to", { length: 5 }), // "19:00", null = fermé le midi
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

export const rentalSettings = pgTable("rental_settings", {
	id: integer("id").primaryKey().default(1),
	seasonalFilteringEnabled: boolean("seasonal_filtering_enabled")
		.notNull()
		.default(true),
	isRentalOpen: boolean("is_rental_open").notNull().default(true),
	// Heure limite pour un retrait le jour même, heure de Paris. Volontairement
	// hors de `store_hours` : celle-là décrit l'ouverture du magasin, celle-ci le
	// délai de préparation d'une commande. Passé cette heure, le public réserve
	// à partir de demain ; la caisse backoffice n'est pas concernée.
	lastSameDayPickupHour: integer("last_same_day_pickup_hour")
		.notNull()
		.default(15),
	// Les jours d'ouverture ne sont pas ici mais dans `store_hours` : c'est la
	// seule table qui décrit quand le magasin est ouvert, pour que le calendrier
	// de réservation, le pied de page et le JSON-LD lisent la même chose.
	seasonOverride: text("season_override")
		.$type<"auto" | "summer" | "winter">()
		.notNull()
		.default("auto"),
	summerFrom: varchar("summer_from", { length: 5 }),
	summerTo: varchar("summer_to", { length: 5 }),
	winterFrom: varchar("winter_from", { length: 5 }),
	winterTo: varchar("winter_to", { length: 5 }),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =============================
// 3. Tables des réservations
// =============================

export const reservations = pgTable("reservations", {
	id: uuid("id").defaultRandom().primaryKey(),
	// Référence lisible par un humain, communiquée au client et à la caisse.
	reference: varchar("reference", { length: 20 }).notNull().unique(),
	userId: text("user_id")
		.references(() => user.id)
		.notNull(),

	status: reservationStatusEnim("status").default("CONFIRMED").notNull(),

	source: reservationSourceEnum("source").default("STORE").notNull(),

	// Jeton d'accès à la page de confirmation publique, sans session.
	// Null sur les réservations créées avant la mise en ligne du site.
	accessToken: varchar("access_token", { length: 64 }).unique(),

	// Dates client
	pickupDate: timestamp("pickup_date").notNull(), // Date & heure de retrait prévue
	returnDate: timestamp("return_date").notNull(), // Date de retour prévue du matériel
	expirationAtribute: timestamp("expiration_attribute").notNull(), // Deadline No-Show avant annulation

	createdAt: timestamp("created_at").notNull().defaultNow(),

	/**
	 * Le client est-il venu ? 1 = non, le matériel n'est jamais sorti.
	 *
	 * `CANCELLED` ne dit pas pourquoi : une annulation de la veille et une
	 * non-présentation ont le même statut. Ce drapeau est le seul endroit où la
	 * différence subsiste — d'où son utilité pour repérer un client qui enchaîne
	 * les non-presentations. `int` et non `boolean` par accident historique, on
	 * n'y touche pas.
	 */
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

// Une définition d'attribut a plusieurs valeurs autorisées.
export const attributeDefinitionsRelations = relations(
	attributeDefinitions,
	({ many }) => ({
		values: many(attributeValues),
	}),
);

// Une valeur d'attribut appartient à une seule définition.
export const attributeValuesRelations = relations(
	attributeValues,
	({ one }) => ({
		definition: one(attributeDefinitions, {
			fields: [attributeValues.definitionId],
			references: [attributeDefinitions.id],
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

// Forfait mensuel + pourcentages de commission appliqués au CA des locations (Web vs Magasin).
// Une seule ligne, modifiable depuis l'admin.
export const billingSettings = pgTable("billing_settings", {
	id: integer("id").primaryKey().default(1),
	monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 })
		.notNull()
		.default("30.00"),
	commissionRateWeb: decimal("commission_rate_web", { precision: 4, scale: 2 })
		.notNull()
		.default("10.00"),
	commissionRateStore: decimal("commission_rate_store", {
		precision: 4,
		scale: 2,
	})
		.notNull()
		.default("5.00"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
