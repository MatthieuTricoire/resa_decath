export const queryKeys = {
	categories: {
		all: ["equipements", "categories"] as const,
		detail: (id: string) => ["equipements", "categories", id] as const,
	},
	items: {
		all: ["equipements", "items"] as const,
		detail: (id: string) => ["equipements", "items", id] as const,
	},
	variants: {
		all: ["equipements", "variants"] as const,
		byItem: (itemId: string) => ["equipements", "variants", itemId] as const,
		reservable: (pickupDate: string, returnDate: string) =>
			[
				"equipements",
				"variants",
				"reservable",
				pickupDate,
				returnDate,
			] as const,
	},
};
