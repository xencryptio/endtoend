"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Shield, Sun, Moon, LogOut, UserCircle } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <SidebarProvider>
      {/* 1. Wrap the layout in the Sheet component and control its state */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <div className="min-h-dvh flex w-full bg-background text-foreground">
          {/* 2. Pass the click handler to close the mobile menu on navigation */}
          <AppSidebar onLinkClick={() => setMobileMenuOpen(false)} />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-dvh overflow-hidden">
            {/* Header */}
            <motion.header
              role="banner"
              aria-label="Dashboard Header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ height: "4.55rem" }}
              className="sticky top-0 z-30 items-stretch border-b border-border bg-card/50 backdrop-blur-sm flex px-4 lg:px-6"
            >
              {/* Left Section: Mobile Menu Button + Logo */}
              <div className="flex items-center gap-4 flex-1">
                {/* 3. The trigger now correctly opens the parent Sheet */}
                <div className="lg:hidden">
                  <AppSidebar.MobileTrigger />
                </div>

                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-glow rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Quantum Shield</h1>
                  <p className="text-sm text-muted-foreground">
                    Post-Quantum Crypto
                  </p>
                </div>
              </div>

              {/* Right Section: Theme Toggle + User */}
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Toggle Theme"
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </Button>

                {isAuthenticated && user ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={user.picture}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full ring-2 ring-border"
                    />
                    <div className="hidden md:block text-right">
                      <p className="text-xs font-medium leading-tight">{user.given_name}</p>
                      <p className="text-xs text-muted-foreground leading-tight truncate max-w-[120px]">{user.email}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Sign out"
                      onClick={handleLogout}
                      title="Sign out"
                    >
                      <LogOut size={16} />
                    </Button>
                  </div>
                ) : (
                  <UserCircle className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
            </motion.header>

            {/* Main Content */}
            <main
              className="flex-1 p-6 overflow-auto"
              role="main"
              aria-label="Dashboard Content"
            >
              {children}
            </main>
          </div>
        </div>

        {/* Toast notifications */}
        <Toaster />
      </Sheet>
    </SidebarProvider>
  );
}
