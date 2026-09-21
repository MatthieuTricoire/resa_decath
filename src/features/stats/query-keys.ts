import type { StatsRange } from "./queries";

export const queryKeys = {
	stats: {
		all: (range: StatsRange) => ["stats", range] as const,
	},
};
