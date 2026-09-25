import { format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

function parseDateKey(value: string): Date | undefined {
	if (!value) return undefined;
	const parts = value.split("-").map(Number);
	if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
		return undefined;
	}
	const [year, month, day] = parts;
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return undefined;
	}
	return date;
}

function toDateKey(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

function toDateRange(
	valueFrom: string,
	valueTo: string,
): DateRange | undefined {
	const from = parseDateKey(valueFrom);
	if (!from) return undefined;
	const to = parseDateKey(valueTo);
	return to ? { from, to } : { from };
}

type ReservationDateRangePickerProps = {
	valueFrom: string;
	valueTo: string;
	onChange: (from: string, to: string) => void;
};

export function ReservationDateRangePicker({
	valueFrom,
	valueTo,
	onChange,
}: ReservationDateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const [displayRange, setDisplayRange] = useState<DateRange | undefined>(() =>
		toDateRange(valueFrom, valueTo),
	);
	const today = useMemo(() => startOfDay(new Date()), []);

	useEffect(() => {
		setDisplayRange(toDateRange(valueFrom, valueTo));
	}, [valueFrom, valueTo]);

	const labelFrom = parseDateKey(valueFrom);
	const labelTo = parseDateKey(valueTo);
	const rangeLabel = labelFrom
		? labelTo
			? toDateKey(labelFrom) === toDateKey(labelTo)
				? `${format(labelFrom, "d MMMM yyyy", { locale: fr })} · 1 jour`
				: `${format(labelFrom, "d MMMM yyyy", { locale: fr })} → ${format(labelTo, "d MMMM yyyy", { locale: fr })}`
			: `À partir du ${format(labelFrom, "d MMMM yyyy", { locale: fr })}`
		: "Sélectionner une période";

	const handleSelect = (range: DateRange | undefined) => {
		setDisplayRange(range);
		if (!range?.from) {
			onChange("", "");
			return;
		}
		onChange(toDateKey(range.from), range.to ? toDateKey(range.to) : "");
		if (range.to) setOpen(false);
	};

	const handleOneDay = () => {
		const from = startOfDay(displayRange?.from ?? today);
		setDisplayRange({ from, to: from });
		onChange(toDateKey(from), toDateKey(from));
		setOpen(false);
	};

	const handleClear = () => {
		setDisplayRange(undefined);
		onChange("", "");
	};

	return (
		<Field>
			<FieldLabel>Période de location</FieldLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="w-full justify-start px-2.5 font-normal"
					>
						<CalendarIcon />
						<span>{rangeLabel}</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<div className="flex items-center justify-between gap-2 border-b p-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleOneDay}
						>
							1 jour
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
						>
							Effacer
						</Button>
					</div>
					<Calendar
						mode="range"
						locale={fr}
						selected={displayRange}
						onSelect={handleSelect}
						defaultMonth={displayRange?.from ?? today}
						disabled={{ before: today }}
						min={1}
						numberOfMonths={1}
					/>
				</PopoverContent>
			</Popover>
		</Field>
	);
}
