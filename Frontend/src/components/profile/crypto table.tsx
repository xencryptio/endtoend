import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Plus, Check, Pencil, RotateCcw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

// Types for table data
export interface CryptoAlgorithm {
  id: string;
  algorithm_name: string;
  variant: string;
  purpose: string;
  usage_context: string[];
  status_today: string;
  pqc_status: string;
  priority: string;
  classical_recommended: string;
  quantum_recommended: string;
  nist_reference: string[];
  notes: string;
  section: string;
  visible?: boolean;
}

// Column definition interface
export interface ColumnDef {
  key: string;
  header: string;
}

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getBadgeClass = (status: string): string => {
    switch (status?.toLowerCase()) {
      // General Status
      case "strong":
      case "safe":
      case "standardized":
      case "yes":
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
      case "medium":
      case "candidate":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300";
      case "weak":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300";
      case "insecure":
      case "no":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
      
      // Priority
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";

      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Badge className={`text-xs border-transparent ${getBadgeClass(status)}`}>
      {status}
    </Badge>
  );
};

// Cell component to handle rendering
const DataCell = ({ value, columnKey }: { value: any; columnKey: string }) => {
  const columnsWithBadges = [
    'status_today', 
    'pqc_status', 
    'priority', 
    'classical_recommended', 
    'quantum_recommended'
  ];

  if (columnsWithBadges.includes(columnKey) && typeof value === 'string') {
    return <StatusBadge status={value} />;
  }

  return Array.isArray(value) ? value.join(', ') : value;
};

const dropdownOptions: Record<string, string[]> = {
  status_today: ['Strong', 'Weak', 'Medium', 'Insecure'],
  pqc_status: ['Safe', 'Weak', 'Medium', 'Standardized'],
  priority: ['Low', 'Medium', 'High'],
  classical_recommended: ['yes', 'no'],
  quantum_recommended: ['yes', 'no'],
};

// Table Component
export const CryptoTable = ({
  title,
  data,
  columns,
  isEdited,
  onUpdate,
  onReset,
}: {
  title: string;
  data: CryptoAlgorithm[];
  columns: ColumnDef[];
  onUpdate: (newData: CryptoAlgorithm[]) => void;
  isEdited: boolean;
  onReset: () => void;
}) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isIndividualEditModalOpen, setIsIndividualEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tempData, setTempData] = useState<CryptoAlgorithm[]>([]);
  const [tempEditingData, setTempEditingData] = useState<Record<string, string | string[]>>({});
  const [tempIndividualRowData, setTempIndividualRowData] = useState<Record<string, string | string[]>>({});
  const [editingRow, setEditingRow] = useState<CryptoAlgorithm | null>(null);
  const [editingIndividualRow, setEditingIndividualRow] = useState<CryptoAlgorithm | null>(null);
  const [newRow, setNewRow] = useState<Partial<CryptoAlgorithm>>({});

  useEffect(() => {
    // When the data prop changes (e.g., on reset), update the temp data for the modal
    setTempData(JSON.parse(JSON.stringify(data)));
  }, [data]);

  const handleEditClick = () => {
    setTempData(JSON.parse(JSON.stringify(data)));
    setIsEditModalOpen(true);
  };

  const handleDone = () => {
    onUpdate(tempData);
    setIsEditModalOpen(false);
  };

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setTempData(tempData.map(row => row.id === id ? { ...row, visible: checked } : row));
  };

  const handleRowEdit = (row: CryptoAlgorithm) => {
    setEditingRow({ ...row });
    const initialEditingData: Record<string, string | string[]> = {};
    columns.forEach(col => {
      const value = row[col.key as keyof CryptoAlgorithm];
      initialEditingData[col.key] = Array.isArray(value) ? value.join(', ') : (value as string);
    });
    setTempEditingData(initialEditingData);
  };

  const handleRowSave = () => {
    if (!editingRow) return;
    const updatedRow = { ...editingRow, ...tempEditingData };
    setTempData(tempData.map(row => row.id === editingRow.id ? updatedRow : row));
    setEditingRow(null);
    setTempEditingData({});
  };

  const handleIndividualRowEdit = (row: CryptoAlgorithm) => {
    // Always initialize with fresh data from the row prop
    setEditingIndividualRow(row);
    const initialEditingData: Record<string, string | string[]> = {};
    columns.forEach(col => {
      const value = row[col.key as keyof CryptoAlgorithm];
      initialEditingData[col.key] = Array.isArray(value) ? value.join(', ') : (value as string);
    });
    setTempIndividualRowData(initialEditingData);
    setIsIndividualEditModalOpen(true);
  };

  const handleSaveIndividualRow = () => {
    if (!editingIndividualRow) return;

    const updatedRow = { ...editingIndividualRow };
    for (const key in tempIndividualRowData) {
      const originalValue = editingIndividualRow[key as keyof CryptoAlgorithm];
      if (Array.isArray(originalValue)) {
        (updatedRow as any)[key] = (tempIndividualRowData[key] as string).split(',').map(s => s.trim());
      } else {
        (updatedRow as any)[key] = tempIndividualRowData[key];
      }
    }

    const updatedData = data.map(row => (row.id === editingIndividualRow.id ? updatedRow : row));
    onUpdate(updatedData);
    
    setIsIndividualEditModalOpen(false);
    setEditingIndividualRow(null);
    setTempIndividualRowData({});
  };

  const handleAddRow = () => {
    // Reset newRow state before opening the modal
    setNewRow({ id: `new-${Date.now()}`, section: title, visible: true });
    setIsAddModalOpen(true);
  };

  const handleSaveNewRow = () => {
    const newFullRow: CryptoAlgorithm = {
      id: newRow.id!,
      algorithm_name: newRow.algorithm_name || '',
      variant: newRow.variant || '',
      purpose: newRow.purpose || '',
      usage_context: Array.isArray(newRow.usage_context) ? newRow.usage_context : ((newRow.usage_context as string) || '').split(',').map(s => s.trim()),
      status_today: newRow.status_today || '',
      pqc_status: newRow.pqc_status || '',
      priority: newRow.priority || '',
      classical_recommended: newRow.classical_recommended || '',
      quantum_recommended: newRow.quantum_recommended || '',
      nist_reference: Array.isArray(newRow.nist_reference) ? newRow.nist_reference : ((newRow.nist_reference as string) || '').split(',').map(s => s.trim()),
      notes: newRow.notes || '',
      section: title,
      visible: true,
    };
    onUpdate([...data, newFullRow]);
    setIsAddModalOpen(false);
  };

  const visibleRows = data.filter(row => row.visible);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>{title}</CardTitle>
          <Badge variant={isEdited ? "destructive" : "secondary"}>
            {isEdited ? "Edited" : "Default"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleEditClick}><Edit className="h-4 w-4 mr-2" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={onReset} disabled={!isEdited}><RotateCcw className="h-4 w-4 mr-2" /> Reset</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                {columns.map(col => <th key={col.key} className="p-2 text-left font-medium">{col.header}</th>)}
                <th className="p-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.id} className="border-b">
                  {columns.map(col => (
                    <td key={col.key} className="p-2 text-sm align-top"><DataCell value={row[col.key as keyof CryptoAlgorithm]} columnKey={col.key} /></td>
                  ))}
                  <td className="p-2"><Button size="icon" variant="ghost" onClick={() => handleIndividualRowEdit(row)}><Pencil className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="ghost" className="mt-2 w-full" onClick={handleAddRow}><Plus className="h-4 w-4 mr-2" /> Add Row</Button>
      </CardContent>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Edit {title}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {tempData.map(row => (
              <div key={row.id} className="flex items-center gap-4 p-2 border-b">
                <Checkbox checked={row.visible} onCheckedChange={(checked) => handleCheckboxChange(row.id, !!checked)} />
                {editingRow?.id === row.id ? (
                  <div className="flex-grow grid grid-cols-3 gap-2">
                    {columns.map(col => (
                      <Input
                        key={col.key}
                        placeholder={col.header}
                        value={tempEditingData[col.key] as string || ''}
                        onChange={(e) => setTempEditingData({ ...tempEditingData, [col.key]: e.target.value })}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="flex-grow text-sm">{row.algorithm_name}</span>
                )}
                {editingRow?.id === row.id ? (
                  <Button size="sm" onClick={handleRowSave}><Check className="h-4 w-4" /></Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => handleRowEdit(row)}><Pencil className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleDone}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add new row to {title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {columns.map(col => (
              <div key={col.key}>
                <label className="text-sm font-medium">{col.header}</label>
                {dropdownOptions[col.key] ? (
                  <Select
                    value={(newRow[col.key as keyof CryptoAlgorithm] as string) || ''}
                    onValueChange={(value) => setNewRow({ ...newRow, [col.key]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${col.header}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {dropdownOptions[col.key].map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={(newRow[col.key as keyof CryptoAlgorithm] as string) || ''}
                    onChange={(e) => setNewRow({ ...newRow, [col.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveNewRow}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isIndividualEditModalOpen} onOpenChange={setIsIndividualEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Row in {title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {columns.map(col => (
              <div key={col.key}>
                <label className="text-sm font-medium">{col.header}</label>
                {dropdownOptions[col.key] ? (
                  <Select
                    value={tempIndividualRowData[col.key] as string || ''}
                    onValueChange={(value) => setTempIndividualRowData({ ...tempIndividualRowData, [col.key]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${col.header}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {dropdownOptions[col.key].map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={tempIndividualRowData[col.key] as string || ''}
                    onChange={(e) => setTempIndividualRowData({ ...tempIndividualRowData, [col.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveIndividualRow}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
