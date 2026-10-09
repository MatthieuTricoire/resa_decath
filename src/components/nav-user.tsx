import {
	IconDotsVertical,
	IconExternalLink,
	IconLogout,
	IconUser,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar.tsx";
import { authClient } from "#/lib/auth-client.ts";

function getInitials(name: string): string {
	return (
		name
			.trim()
			.split(/\s+/)
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "U"
	);
}

function formatRole(role?: string): string | null {
	if (!role) return null;
	switch (role) {
		case "admin":
			return "Administrateur";
		case "manager":
			return "Gérant";
		case "user":
			return "Utilisateur";
		default:
			return role;
	}
}

export function NavUser({
	user,
}: {
	user: {
		name: string;
		email: string;
		avatar: string;
		role?: string;
	};
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	const initials = getInitials(user.name);
	const roleLabel = formatRole(user.role);

	const handleSignOut = async () => {
		await authClient.signOut();
		window.location.href = "/admin/login";
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={user.avatar} alt={user.name} />
								<AvatarFallback className="rounded-lg">
									{initials}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.name}</span>
								<span className="truncate text-xs text-muted-foreground">
									{user.email}
								</span>
							</div>
							<IconDotsVertical className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-start gap-2.5 px-2 py-2 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg shrink-0 mt-0.5">
									<AvatarImage src={user.avatar} alt={user.name} />
									<AvatarFallback className="rounded-lg">
										{initials}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight min-w-0">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-xs text-muted-foreground">
										{user.email}
									</span>
									{roleLabel && (
										<div className="mt-1.5">
											<Badge
												variant="secondary"
												className="px-1.5 py-0 text-[10px] font-normal"
											>
												{roleLabel}
											</Badge>
										</div>
									)}
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link
									to="/admin/compte"
									onClick={() => setOpenMobile(false)}
									className="cursor-pointer"
								>
									<IconUser className="size-4" />
									<span>Mon compte</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link
									to="/"
									target="_blank"
									rel="noreferrer"
									className="cursor-pointer"
								>
									<IconExternalLink className="size-4" />
									<span>Voir le site public</span>
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={handleSignOut}
							className="cursor-pointer"
						>
							<IconLogout className="size-4" />
							<span>Se déconnecter</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
