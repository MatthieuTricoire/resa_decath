export const queryKeys = {
	reservations: {
		all: ["reservations"] as const,
		list: (filters?: Record<string, string>) =>
			["reservations", "list", filters] as const,
		detail: (id: string) => ["reservations", "detail", id] as const,
	},
	dashboard: {
		kpis: ["dashboard", "kpis"] as const,
		todaySchedule: ["dashboard", "todaySchedule"] as const,
	},
	users: {
		all: ["reservations", "users"] as const,
	},
};
