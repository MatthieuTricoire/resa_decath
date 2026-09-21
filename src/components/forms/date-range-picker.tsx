import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import { Field, FieldLabel } from "#/components/ui/field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";

function toDate(mmdd: string): Date | undefined {
	if (!mmdd) return undefined;
	const parts = mmdd.split("-");
	if (parts.length !== 2) return undefined;
	const month = Number.parseInt(parts[0], 10);
	const day = Number.parseInt(parts[1], 10);
	if (Number.isNaN(month) || Number.isNaN(day)) return undefined;
	return new Date(2000, month - 1, day);
}

function toMmdd(date: Date): string {
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${m}-${d}`;
}

const formatDateFr = (date: Date) => format(date, "d MMMM", { locale: fr });

type DateRangePickerProps = {
	valueFrom: string;
	valueTo: string;
	onChange: (from: string, to: string) => void;
};

export function DateRangePicker({
	valueFrom,
	valueTo,
	onChange,
}: DateRangePickerProps) {
	const [displayRange, setDisplayRange] = useState<DateRange | undefined>(
		() => {
			const from = toDate(valueFrom);
			const to = toDate(valueTo);
			return from && to ? { from, to } : undefined;
		},
	);

	const handleSelect = (range: DateRange | undefined) => {
		setDisplayRange(range);
		if (!range) {
			onChange("", "");
		} else if (range.from && range.to) {
			onChange(toMmdd(range.from), toMmdd(range.to));
		}
	};

	const labelFrom = toDate(valueFrom);
	const labelTo = toDate(valueTo);
	const label = labelFrom
		? labelTo
			? `${formatDateFr(labelFrom)} → ${formatDateFr(labelTo)}`
			: `À partir du ${formatDateFr(labelFrom)}`
		: "Sélectionner une période";

	return (
		<Field>
			<FieldLabel>Période de disponibilité</FieldLabel>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className="justify-start px-2.5 font-normal"
					>
						<CalendarIcon />
						<span>{label}</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="range"
						locale={fr}
						defaultMonth={displayRange?.from}
						selected={displayRange}
						onSelect={handleSelect}
						numberOfMonths={2}
					/>
				</PopoverContent>
			</Popover>
		</Field>
	);
}
