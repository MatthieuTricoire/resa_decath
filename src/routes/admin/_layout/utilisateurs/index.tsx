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
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Columns,
	Eye,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { getUsers, type UserRow } from "#/features/users/queries";
import { queryKeys } from "#/features/users/query-keys";

export const Route = createFileRoute("/admin/_layout/utilisateurs/")({
	loader: async ({ context: { queryClient } }) => {
		await queryClient.prefetchQuery({
			queryKey: queryKeys.users.all,
			queryFn: () => getUsers({ data: {} }),
		});
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "name", desc: false },
	]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: users, isPending } = useQuery({
		queryKey: queryKeys.users.list(search),
		queryFn: () => getUsers({ data: { search: search || undefined } }),
	});

	const filteredData = useMemo(() => {
		if (!users) return [];
		if (!search) return users;
		const q = search.toLowerCase();
		return users.filter(
			(u) =>
				u.name.toLowerCase().includes(q) ||
				u.email.toLowerCase().includes(q) ||
				(u.phone ?? "").toLowerCase().includes(q),
		);
	}, [users, search]);

	const columns: ColumnDef<UserRow>[] = [
		{
			accessorKey: "name",
			header: "Nom",
			enableHiding: false,
		},
		{
			accessorKey: "email",
			header: "Email",
		},
		{
			accessorKey: "phone",
			header: "Téléphone",
			cell: ({ row }) => row.original.phone ?? "—",
		},
		{
			accessorKey: "loyaltyCard",
			header: "Carte Decathlon",
			cell: ({ row }) => row.original.loyaltyCard ?? "—",
		},
		{
			id: "actions",
			header: () => null,
			enableHiding: false,
			cell: ({ row }) => (
				<Button variant="ghost" size="icon" className="size-8" asChild>
					<Link
						to="/admin/utilisateurs/$userId"
						params={{ userId: row.original.id }}
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
		state: { sorting, columnVisibility, pagination },
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un utilisateur..."
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPagination((p) => ({ ...p, pageIndex: 0 }));
						}}
						className="pl-8"
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="ml-auto">
							<Columns className="size-4" />
							Colonnes
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{table
							.getAllLeafColumns()
							.filter((col) => col.getCanHide())
							.map((col) => (
								<DropdownMenuCheckboxItem
									key={col.id}
									checked={col.getIsVisible()}
									onCheckedChange={(v) => col.toggleVisibility(v)}
								>
									{col.columnDef.header as string}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader className="bg-muted">
						{table.getHeaderGroups().map((hg) => (
							<TableRow key={hg.id}>
								{hg.headers.map((header) => (
									<TableHead key={header.id} colSpan={header.colSpan}>
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
						{isPending ? (
							<TableRow>
								<TableCell colSpan={columns.length} className="text-center">
									Chargement...
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={columns.length} className="text-center">
									Aucun utilisateur trouvé
								</TableCell>
							</TableRow>
						) : (
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
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Label className="text-sm text-muted-foreground sm:whitespace-nowrap">
					{table.getRowModel().rows.length} résultat
					{table.getRowModel().rows.length > 1 ? "s" : ""} sur{" "}
					{filteredData.length}
				</Label>
				<div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-end">
					<Button
						variant="outline"
						size="sm"
						className="hidden sm:inline-flex"
						onClick={() => table.setPageIndex(0)}
						disabled={!table.getCanPreviousPage()}
						aria-label="Première page"
					>
						<ChevronsLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label="Page précédente"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="min-w-16 text-center text-sm whitespace-nowrap text-muted-foreground">
						{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
					</span>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						aria-label="Page suivante"
					>
						<ChevronRight className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="hidden sm:inline-flex"
						onClick={() => table.setPageIndex(table.getPageCount() - 1)}
						disabled={!table.getCanNextPage()}
						aria-label="Dernière page"
					>
						<ChevronsRight className="size-4" />
					</Button>
					<Select
						value={String(pagination.pageSize)}
						onValueChange={(v) => {
							table.setPageSize(Number(v));
						}}
					>
						<SelectTrigger className="h-8 w-16" aria-label="Lignes par page">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[10, 20, 30, 50].map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
