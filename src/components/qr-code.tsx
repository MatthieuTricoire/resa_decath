import QRCode from "qrcode";
import { useEffect, useState } from "react";

type QRCodeDisplayProps = {
	value: string;
	size?: number;
};

export function QRCodeDisplay({ value, size = 80 }: QRCodeDisplayProps) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);

	useEffect(() => {
		QRCode.toDataURL(value, {
			width: size,
			margin: 1,
			color: { dark: "#000000", light: "#ffffff" },
		}).then(setDataUrl);
	}, [value, size]);

	if (!dataUrl) {
		return (
			<div
				className="animate-pulse rounded bg-muted"
				style={{ width: size, height: size }}
			/>
		);
	}

	return (
		<img
			src={dataUrl}
			alt={`QR code: ${value}`}
			width={size}
			height={size}
			className="rounded border"
		/>
	);
}
