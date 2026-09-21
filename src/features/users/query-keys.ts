export const queryKeys = {
	users: {
		all: ["users"] as const,
		list: (search?: string) => ["users", "list", search] as const,
		detail: (id: string) => ["users", "detail", id] as const,
		reservations: (userId: string) =>
			["users", "reservations", userId] as const,
	},
};
