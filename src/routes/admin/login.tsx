import { createFileRoute } from "@tanstack/react-router";
import { LogInForm } from "#/features/auth/forms/login-form";

export const Route = createFileRoute("/admin/login")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<div className="flex flex-col gap-4 p-6 md:p-10">
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
