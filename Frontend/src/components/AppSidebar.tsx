import {
  Home,
  Server,
  Shield,
  Settings,
  Link2,
  ArrowRightLeft,
  Menu,
  ScanLine,
  User,
  Computer,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// -------------------
// Menu Config
// -------------------
const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Applications", url: "/applications", icon: Server },
  { title: "Vulnerabilities", url: "/vulnerabilities", icon: Shield },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Scan", url: "/scan", icon: ScanLine },
  { title: "System Scan", url: "/system-scan", icon: Computer },
  { title: "Migration Assist", url: "/migrationAssist", icon: ArrowRightLeft },
  { title: "Integration", url: "/integration", icon: Link2 },
  { title: "Settings", url: "/settings", icon: Settings },
];

// -------------------
// Navigation Component
// -------------------
const NavigationContent = ({
  isCollapsed,
  onLinkClick,
}: {
  isCollapsed?: boolean;
  onLinkClick?: () => void;
}) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  const getNavCls = (active: boolean) =>
    active
      ? "bg-primary text-primary-foreground font-medium"
      : "hover:bg-accent text-foreground";

  return (
    <SidebarMenu>
      {menuItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            tooltip={isCollapsed ? item.title : undefined}
          >
            <NavLink
              to={item.url}
              end={item.url === "/"}
              className={getNavCls(isActive(item.url))}
              onClick={onLinkClick}
            >
              <item.icon className="mr-3 h-4 w-4" />
              <span className={isCollapsed ? "sr-only" : "text-base"}>
                {item.title}
              </span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
};

// -------------------
// Main Sidebar Component
// -------------------
export function AppSidebar({
  onLinkClick,
}: {
  onLinkClick?: () => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar collapsible="icon" className="flex flex-col border-r">
          <SidebarHeader className="border-b border-border px-5 pt-5 pb-[24px]">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="mr-2" />
              {!collapsed && (
                <span className="text-base font-medium text-foreground">
                  Menu
                </span>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="flex-1">
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavigationContent isCollapsed={collapsed} />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </div>

      {/* Mobile Sidebar (Drawer) */}
      {/* This SheetContent is now intended to be placed inside a Sheet in the parent layout */}
      <SheetContent
        side="left"
        className="w-72 p-0 border-0 shadow-none lg:hidden" // Hide on large screens
      >
        <SidebarHeader className="border-b border-border px-5 py-5">
          <span className="text-base font-medium text-foreground">Menu</span>
        </SidebarHeader>
        <div className="p-4">
          <NavigationContent onLinkClick={onLinkClick} />
        </div>
      </SheetContent>
    </>
  );
}

// -------------------
// Mobile Trigger Button (used inside Layout header)
// -------------------
AppSidebar.MobileTrigger = function MobileTrigger() {
  return (
    <SheetTrigger asChild>
      <Button variant="ghost" size="icon" className="lg:hidden">
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open Menu</span>
      </Button>
    </SheetTrigger>
  );
};