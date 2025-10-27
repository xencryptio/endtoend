"use client";

import { Building2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewSwitcherProps {
  currentView: 'suborgs' | 'allapps';
  onViewSwitch: (view: 'suborgs' | 'allapps') => void;
}

export function ViewSwitcher({ currentView, onViewSwitch }: ViewSwitcherProps) {
  return (
    <div className="flex gap-2">
      <Button
        variant={currentView === 'suborgs' ? "default" : "outline"}
        onClick={() => onViewSwitch('suborgs')}
        className="gap-2"
      >
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">Sub-Organizations</span>
        <span className="sm:hidden">Sub-Orgs</span>
      </Button>
      <Button
        variant={currentView === 'allapps' ? "default" : "outline"}
        onClick={() => onViewSwitch('allapps')}
        className="gap-2"
      >
        <Shield className="h-4 w-4" />
        <span className="hidden sm:inline">All Applications</span>
        <span className="sm:hidden">All Apps</span>
      </Button>
    </div>
  );
}
