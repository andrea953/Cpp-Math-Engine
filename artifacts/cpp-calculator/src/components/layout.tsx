import { Link } from "wouter";
import { useActiveAnchor } from "@/lib/client-session";
import { AllClientsExitButton } from "./client-guard";
import { useClerk, useUser } from "@clerk/react";
import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import logoUrl from "@assets/WhatsApp_Image_2021-03-10_at_11.22.35_AM_1777058431212.jpeg";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const anchor = useActiveAnchor();
  // Inside a client workspace, home/brand links stay pinned to that client.
  const homeHref = anchor ? `/clients/${anchor}` : "/scenarios";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-br from-[hsl(215_85%_97%)] via-[hsl(248_70%_98%)] to-[hsl(28_90%_97%)] print:min-h-0 print:bg-none print:bg-white">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 print:hidden">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href={homeHref} data-testid="link-brand-home" className="flex items-center gap-2.5 font-semibold text-foreground">
              <img src={logoUrl} alt="Modern Cents CPP Calculator" className="h-8 w-8 rounded-md object-cover" />
              <span className="tracking-tight">
                Modern Cents <span className="hidden sm:inline">CPP Calculator</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-muted-foreground">
              <Link href={homeHref} data-testid="link-nav-home" className="hover:text-foreground transition-colors">
                {anchor ? "Client workspace" : "Scenarios"}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {anchor && <AllClientsExitButton />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.imageUrl} alt={user?.fullName || ""} />
                    <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
