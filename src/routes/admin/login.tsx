import { createFileRoute, Link } from "@tanstack/react-router";
import { Mountain } from "lucide-react";
import { store, storeCanonicalPath } from "#/config/store";
import { LogInForm } from "#/features/auth/forms/login-form";

export const Route = createFileRoute("/admin/login")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<Link
					to={storeCanonicalPath}
					className="flex w-fit items-center gap-2 no-underline"
				>
					<Mountain
						className="size-5 text-primary dark:text-[#9aa7f5]"
						aria-hidden="true"
					/>
					<span className="display-title text-base font-semibold text-primary dark:text-[#9aa7f5]">
						{store.name}
					</span>
				</Link>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<LogInForm />
					</div>
				</div>
			</div>
			<div className="relative hidden bg-muted lg:block">
				<img
					src="https://media.decathlon-outdoor.com/1cxTAoSmK978K8PKJ3yS17/randonnee-au-lac-du-montagnon-par-le-col-d-iseye.jpg?w=2400"
					alt="Lac du montagnon"
					className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
				/>
			</div>
		</div>
	);
}
