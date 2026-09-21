import Barcode from "react-barcode";

type BarcodeDisplayProps = {
	value: string;
	height?: number;
	barWidth?: number;
};

export function BarcodeDisplay({
	value,
	height = 28,
	barWidth = 1,
}: BarcodeDisplayProps) {
	if (!value) return null;

	return (
		<Barcode
			value={value}
			format="CODE128"
			height={height}
			width={barWidth}
			displayValue={false}
			margin={0}
			background="transparent"
			lineColor="#000000"
		/>
	);
}
