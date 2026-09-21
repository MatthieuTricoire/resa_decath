import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Columns,
	Eye,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	getCategories,
	getVariants,
	type VariantRow,
} from "#/features/equipements/queries";
import { queryKeys } from "#/features/equipements/query-keys";

const formatPrice = (val: string | null) => {
	if (!val) return "—";
	return `${parseFloat(val).toFixed(2).replace(".", ",")} €`;
};

const statusBadgeClass: Record<string, string> = {
	AVAILABLE:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	MAINTENANCE:
		"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	RETIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const statusLabel: Record<string, string> = {
	AVAILABLE: "Disponible",
	MAINTENANCE: "En maintenance",
	RETIRED: "Retiré",
};

export const Route = createFileRoute("/admin/_layout/equipements/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: queryKeys.variants.all,
				queryFn: () => getVariants(),
			}),
			queryClient.prefetchQuery({
				queryKey: queryKeys.categories.all,
				queryFn: () => getCategories(),
			}),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "itemName", desc: false },
	]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: variants, isPending: variantsPending } = useQuery({
		queryKey: queryKeys.variants.all,
		queryFn: () => getVariants(),
	});

	const { data: categories } = useQuery({
		queryKey: queryKeys.categories.all,
		queryFn: () => getCategories(),
	});

	const filteredData = useMemo(() => {
		let data = variants ?? [];
		if (selectedCategory) {
			data = data.filter((v) => v.categoryId === selectedCategory);
		}
		if (search) {
			const q = search.toLowerCase();
			data = data.filter(
				(v) =>
					v.itemName.toLowerCase().includes(q) ||
					v.brand.toLowerCase().includes(q) ||
					(v.decathlonSku ?? "").toLowerCase().includes(q) ||
					v.priceOptions.some((o) => o.barcode.toLowerCase().includes(q)),
			);
		}
		return data;
	}, [variants, selectedCategory, search]);

	const categoryCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const v of variants ?? []) {
			counts[v.categoryId] = (counts[v.categoryId] ?? 0) + 1;
		}
		return counts;
	}, [variants]);

	const emptyTabValue = "__all__";

	const columns: ColumnDef<VariantRow>[] = [
		{
			accessorKey: "itemName",
			header: "Nom",
			enableHiding: false,
		},
		{
			accessorKey: "brand",
			header: "Marque",
		},
		{
			accessorKey: "decathlonSku",
			header: "SKU",
		},
		{
			accessorKey: "attributes",
			header: "Variante",
			cell: ({ row }) => {
				const attrs = row.original.attributes;
				if (attrs.length === 0) {
					return <span className="text-muted-foreground">—</span>;
				}
				return attrs.map((a) => a.value).join(" / ");
			},
		},
		{
			id: "prices",
			header: "Prix",
			cell: ({ row }) => {
				if (row.original.pricingMode === "per_day") {
					return (
						<span className="text-xs text-muted-foreground">
							{formatPrice(row.original.dailyPrice)} / jour
						</span>
					);
				}
				const opts = row.original.priceOptions;
				if (opts.length === 0)
					return <span className="text-muted-foreground">—</span>;
				return (
					<div className="flex flex-col gap-0.5">
						{opts.map((o) => (
							<span key={o.id} className="text-xs text-muted-foreground">
								{o.label} : {formatPrice(o.price)}
							</span>
						))}
					</div>
				);
			},
		},
		{
			accessorKey: "totalStock",
			header: "Stock",
		},
		{
			accessorKey: "status",
			header: "Statut",
			cell: ({ row }) => {
				const s = row.original.status;
				return (
					<Badge className={statusBadgeClass[s] ?? ""}>
						{statusLabel[s] ?? s}
					</Badge>
				);
			},
		},
		{
			id: "actions",
			header: () => null,
			enableHiding: false,
			cell: ({ row }) => (
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link
						to="/admin/equipements/$itemId"
						params={{ itemId: row.original.itemId }}
					>
						<Eye className="size-4" />
					</Link>
				</Button>
			),
		},
	];

	const table = useReactTable({
		data: filteredData,
		columns,
		state: {
			sorting,
			columnVisibility,
			pagination,
		},
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	if (variantsPending) {
		return <div className="text-sm text-muted-foreground">Chargement...</div>;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Matériel</h2>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<Columns />
								<span className="hidden lg:inline">Colonnes</span>
								<ChevronDown />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							{table
								.getAllColumns()
								.filter((col) => col.getCanHide())
								.map((col) => (
									<DropdownMenuCheckboxItem
										key={col.id}
										checked={col.getIsVisible()}
										onCheckedChange={(value) => col.toggleVisibility(!!value)}
									>
										{typeof col.columnDef.header === "string"
											? col.columnDef.header
											: col.id}
									</DropdownMenuCheckboxItem>
								))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1">
					<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Rechercher par nom, marque ou SKU..."
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPagination((p) => ({ ...p, pageIndex: 0 }));
						}}
						className="pl-8"
					/>
				</div>
			</div>

			<Tabs
				value={selectedCategory ?? emptyTabValue}
				onValueChange={(val) => {
					setSelectedCategory(val === emptyTabValue ? null : val);
					setPagination((p) => ({ ...p, pageIndex: 0 }));
				}}
			>
				<TabsList variant="line">
					<TabsTrigger value={emptyTabValue}>
						Tout <Badge variant="secondary">{variants?.length ?? 0}</Badge>
					</TabsTrigger>
					{categories?.map((cat) => (
						<TabsTrigger key={cat.id} value={cat.id}>
							{cat.name}{" "}
							<Badge variant="secondary">{categoryCounts[cat.id] ?? 0}</Badge>
						</TabsTrigger>
					))}
				</TabsList>

				<TabsContent value={selectedCategory ?? emptyTabValue}>
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader className="bg-muted">
								{table.getHeaderGroups().map((headerGroup) => (
									<TableRow key={headerGroup.id}>
										{headerGroup.headers.map((header) => (
											<TableHead key={header.id}>
												{header.isPlaceholder
													? null
													: flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
											</TableHead>
										))}
									</TableRow>
								))}
							</TableHeader>
							<TableBody>
								{table.getRowModel().rows.length > 0 ? (
									table.getRowModel().rows.map((row) => (
										<TableRow key={row.id}>
											{row.getVisibleCells().map((cell) => (
												<TableCell key={cell.id}>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											))}
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={columns.length}
											className="h-24 text-center text-muted-foreground"
										>
											Aucun résultat.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					<div className="flex items-center justify-between px-4 pt-4">
						<div className="text-sm text-muted-foreground">
							{filteredData.length} résultat
							{filteredData.length > 1 ? "s" : ""}
						</div>
						<div className="flex items-center gap-8">
							<div className="hidden items-center gap-2 lg:flex">
								<Label htmlFor="rows-per-page" className="text-sm font-medium">
									Lignes par page
								</Label>
								<Select
									value={`${table.getState().pagination.pageSize}`}
									onValueChange={(value) => {
										table.setPageSize(Number(value));
									}}
								>
									<SelectTrigger size="sm" className="w-20" id="rows-per-page">
										<SelectValue
											placeholder={table.getState().pagination.pageSize}
										/>
									</SelectTrigger>
									<SelectContent side="top">
										{[10, 20, 30, 50].map((pageSize) => (
											<SelectItem key={pageSize} value={`${pageSize}`}>
												{pageSize}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center justify-center text-sm font-medium">
								Page {table.getState().pagination.pageIndex + 1} sur{" "}
								{table.getPageCount()}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									className="hidden size-8 lg:flex"
									size="icon"
									onClick={() => table.setPageIndex(0)}
									disabled={!table.getCanPreviousPage()}
								>
									<span className="sr-only">Première page</span>
									<ChevronsLeft />
								</Button>
								<Button
									variant="outline"
									className="size-8"
									size="icon"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<span className="sr-only">Page précédente</span>
									<ChevronLeft />
								</Button>
								<Button
									variant="outline"
									className="size-8"
									size="icon"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									<span className="sr-only">Page suivante</span>
									<ChevronRight />
								</Button>
								<Button
									variant="outline"
									className="hidden size-8 lg:flex"
									size="icon"
									onClick={() => table.setPageIndex(table.getPageCount() - 1)}
									disabled={!table.getCanNextPage()}
								>
									<span className="sr-only">Dernière page</span>
									<ChevronsRight />
								</Button>
							</div>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
