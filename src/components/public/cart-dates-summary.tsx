import { Calendar, Pencil } from "lucide-react";
import { Button } from "#/components/ui/button";
import { rentalDurationLabel } from "#/lib/dates";

export function CartDatesSummary({
	pickupDate,
	returnDate,
	durationDays,
	onEdit,
}: {
	pickupDate: string | null;
	returnDate: string | null;
	durationDays: number;
	onEdit: () => void;
}) {
	// Si aucune date n'est définie, on incite fortement à le faire
	if (!pickupDate || !returnDate || durationDays === 0) {
		return (
			<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center">
				<Calendar className="size-6 text-muted-foreground" aria-hidden="true" />
				<p className="text-sm font-medium text-foreground">
					Quand souhaitez-vous louer ce matériel ?
				</p>
				<Button variant="outline" size="sm" onClick={onEdit}>
					Choisir mes dates
				</Button>
			</div>
		);
	}

	// Formatage propre : "mer. 7 oct."
	const formatShort = (dateStr: string) =>
		new Date(dateStr).toLocaleDateString("fr-FR", {
			weekday: "short",
			day: "numeric",
			month: "short",
		});

	return (
		<div className="space-y-3 animate-in fade-in duration-300">
			<div className="flex items-center justify-between">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Dates de location
				</h2>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
					onClick={onEdit}
				>
					<Pencil className="mr-1.5 size-3" aria-hidden="true" />
					Modifier
				</Button>
			</div>
			<div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<Calendar className="size-5 text-primary" aria-hidden="true" />
				</div>
				<div className="flex flex-col">
					<span className="font-medium capitalize text-foreground">
						{formatShort(pickupDate)} → {formatShort(returnDate)}
					</span>
					<span className="text-sm text-muted-foreground">
						{rentalDurationLabel(durationDays)}
					</span>
				</div>
			</div>
		</div>
	);
}
