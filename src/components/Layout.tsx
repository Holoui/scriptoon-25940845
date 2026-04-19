import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Film, Moon, Sun, Menu, X, LayoutDashboard, Sparkles, Crown, Mail, Info, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportChat } from "@/components/SupportChat";
import { NotificationBell } from "@/components/NotificationBell";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const navItems = [
    { to: "/", label: "Home", icon: Sparkles },
    { to: "/pricing", label: "Pricing", icon: Crown },
    { to: "/about", label: "About", icon: Info },
    { to: "/contact", label: "Contact", icon: Mail },
  ];

  const userItems = user
    ? [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        ...(role === "admin" ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
      ]
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display text-2xl font-black">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-hero text-white shadow-playful">
              <Film className="h-5 w-5" />
            </span>
            <span className="bg-gradient-hero bg-clip-text text-transparent">ScriptToon</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {[...navItems, ...userItems].map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user && <NotificationBell />}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate("/"); }} className="hidden md:inline-flex">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate("/auth")} className="hidden md:inline-flex bg-gradient-hero text-white border-0 hover:opacity-90">
                Get started
              </Button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-border/60 animate-fade-in">
            <div className="container py-4 flex flex-col gap-1">
              {[...navItems, ...userItems].map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium",
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )
                  }
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </NavLink>
              ))}
              <div className="pt-2">
                {user ? (
                  <Button variant="outline" className="w-full" onClick={async () => { await signOut(); setOpen(false); navigate("/"); }}>
                    Sign out
                  </Button>
                ) : (
                  <Button className="w-full bg-gradient-hero text-white border-0" onClick={() => { setOpen(false); navigate("/auth"); }}>
                    Get started
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {user && role !== "admin" && <SupportChat />}

      <footer className="border-t border-border/60 mt-12">
        <div className="container py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ScriptToon. Made for storytellers.</p>
          <div className="flex gap-4">
            <Link to="/about" className="hover:text-foreground">About</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
