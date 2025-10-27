import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Shield, Lock, Hash, Key, Zap, ArrowLeft, Edit, Save, RotateCcw, Plus, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const getSectionIcon = (section: string) => {
  const icons: Record<string, React.ReactNode> = {
    "Symmetric Algorithms": <Lock className="w-5 h-5" />,
    "Asymmetric Algorithms": <Key className="w-5 h-5" />,
    "Hash Functions": <Hash className="w-5 h-5" />,
    "MACs & KDFs": <Shield className="w-5 h-5" />,
    "Post-Quantum Cryptography": <Zap className="w-5 h-5" />
  };
  return icons[section] || <Shield className="w-5 h-5" />;
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    "Strong": "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    "Medium": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    "Weak": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    "Safe": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    "Standardized": "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300"
  };
  return colors[status] || "bg-muted text-muted-foreground";
};

// Editable table row component
const EditableTableRow = ({ 
  algorithm, 
  isEditing, 
  onEdit, 
  onSave, 
  onCancel, 
  onChange 
}: {
  algorithm: any;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: string, value: string) => void;
}) => {
  if (isEditing) {
    return (
      <tr className="bg-yellow-50 dark:bg-yellow-900/20">
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm mt-1"
            value={algorithm.usage_context}
            onChange={(e) => onChange('usage_context', e.target.value)}
            aria-label="Usage context"
          />
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.variant}
            onChange={(e) => onChange('variant', e.target.value)}
            aria-label="Algorithm variant"
          />
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.purpose}
            onChange={(e) => onChange('purpose', e.target.value)}
            aria-label="Algorithm purpose"
          />
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.status_today}
            onChange={(e) => onChange('status_today', e.target.value)}
            aria-label="Status today"
          >
            <option value="Strong">Strong</option>
            <option value="Medium">Medium</option>
            <option value="Weak">Weak</option>
            <option value="Safe">Safe</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.pqc_status}
            onChange={(e) => onChange('pqc_status', e.target.value)}
            aria-label="PQC status"
          >
            <option value="Safe">Safe</option>
            <option value="Medium">Medium</option>
            <option value="Weak">Weak</option>
            <option value="Standardized">Standardized</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <select
            className="w-full p-1 border rounded text-sm"
            value={algorithm.priority}
            onChange={(e) => onChange('priority', e.target.value)}
            aria-label="Priority level"
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </td>
        <td className="px-4 py-4">
          <input
            className="w-full p-1 border rounded text-sm"
            value={algorithm.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            aria-label="Algorithm notes"
          />
        </td>
        <td className="px-4 py-4">
          <div className="flex space-x-1">
            <Button size="sm" variant="ghost" onClick={onSave}>
              <Check className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-muted/50">
      <td className="px-4 py-4 align-top">
        <div className="font-medium text-foreground max-h-18 overflow-y-auto">{algorithm.name || algorithm.algorithm_name}</div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.variant}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.purpose}
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.usage_context}
        </div>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(algorithm.status_today)}`}>
          {algorithm.status_today}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(algorithm.pqc_status)}`}>
          {algorithm.pqc_status}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          algorithm.priority === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' :
          algorithm.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' :
          'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
        }`}>
          {algorithm.priority}
        </span>
      </td>
      <td className="px-4 py-4 align-top">
        <div className="text-sm text-foreground max-h-18 overflow-y-auto">
          {algorithm.notes}
        </div>
      </td>
      <td className="px-4 py-4">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Edit className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
};

// Enhanced table component with editing capabilities
const EditableTable = ({ 
  algorithms, 
  sectionName, 
  availableAlgorithms, 
  onAlgorithmsChange, 
  originalAlgorithms 
}: {
  algorithms: any[];
  sectionName: string;
  availableAlgorithms: any[];
  onAlgorithmsChange: (algorithms: any[]) => void;
  originalAlgorithms: any[];
}) => {
  const [isTableEditMode, setIsTableEditMode] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRow, setNewRow] = useState<Partial<any>>({});
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [tempEditData, setTempEditData] = useState<any>({});

  const isEdited = JSON.stringify(algorithms) !== JSON.stringify(originalAlgorithms);

  const handleTableEdit = () => {
    setIsEditModalOpen(true);
  };
  const handleAlgorithmSelectionChange = (newAlgorithms: any[]) => {
    onAlgorithmsChange(newAlgorithms);
  };

  const handleAddRow = () => {
    const newAlgorithm = {
      // Use a unique ID for new rows
      id: `custom-${Date.now()}`,
      // Default values for a new custom algorithm
      name: 'New Algorithm',
      variant: '',
      purpose: '',
      usage_context: '',
      status_today: 'Medium',
      pqc_status: 'Safe',
      priority: 'Medium',
      classical_recommended: 'yes',
      quantum_recommended: 'yes',
      nist_reference: '',
      notes: 'Custom added algorithm',
      isCustom: true
    };
    onAlgorithmsChange([...algorithms, newAlgorithm]);
  };

  const handleAddRowModal = () => {
    setNewRow({
      id: `custom-${Date.now()}`,
      name: 'New Custom Algorithm',
      variant: '',
      purpose: '',
      usage_context: '',
      status_today: 'Medium',
      pqc_status: 'Safe',
      priority: 'Medium',
      notes: 'Custom added algorithm',
      isCustom: true,
    });
    setIsAddModalOpen(true);
  };

  const handleRowEdit = (index: number) => {
    setEditingRowIndex(index);
    setTempEditData({ ...algorithms[index] });
  };

  const handleRowSave = () => {
    if (editingRowIndex !== null) {
      const updatedAlgorithms = [...algorithms];
      updatedAlgorithms[editingRowIndex] = tempEditData;
      onAlgorithmsChange(updatedAlgorithms);
      setEditingRowIndex(null);
      setTempEditData({});
    }
  };

  const handleRowCancel = () => {
    setEditingRowIndex(null);
    setTempEditData({});
  };

  const handleFieldChange = (field: string, value: string) => {
    setTempEditData({ ...tempEditData, [field]: value });
  };

  const handleTableReset = () => {
    onAlgorithmsChange([...originalAlgorithms]);
    setEditingRowIndex(null);
  };

  const dropdownOptions: Record<string, string[]> = {
    status_today: ['Strong', 'Medium', 'Weak', 'Safe'],
    pqc_status: ['Safe', 'Medium', 'Weak', 'Standardized'],
    priority: ['High', 'Medium', 'Low'],
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Badge variant={isEdited ? "destructive" : "secondary"}>
            {isEdited ? "Edited" : "Default"}
          </Badge>
        </div>
        <div className="space-x-2">
          <Button size="sm" variant="outline" onClick={handleTableEdit}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={handleTableReset} disabled={!isEdited}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </div>
      </div>
      {(!algorithms || algorithms.length === 0) ? (
        <div className="text-center py-4 text-muted-foreground">
          <p>No algorithms in this category</p>
          <div className="mt-4 space-x-2">
            <Button size="sm" variant="outline" onClick={handleTableEdit} >
              <Edit className="w-4 h-4 mr-1" /> Add Algorithms
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddRowModal}>
              <Plus className="w-4 h-4 mr-1" /> Add Custom Row
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Algorithm</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Variant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Purpose</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Usage Context</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status Today</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">PQC Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {algorithms.map((algo, index) => (
                  <EditableTableRow
                    key={index}
                    algorithm={editingRowIndex === index ? tempEditData : algo}
                    isEditing={editingRowIndex === index}
                    onEdit={() => handleRowEdit(index)}
                    onSave={handleRowSave}
                    onCancel={handleRowCancel}
                    onChange={handleFieldChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" className="mt-2 w-full" onClick={handleAddRowModal}>
            <Plus className="w-4 h-4 mr-2" /> Add Row
          </Button>
        </div>
      )}

      {/* Edit Algorithms Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Algorithms for {sectionName}</DialogTitle>
          </DialogHeader>
          <AlgorithmSelectionContent
            availableAlgorithms={availableAlgorithms}
            selectedAlgorithms={algorithms}
            onSelectionChange={handleAlgorithmSelectionChange}
            onClose={() => setIsEditModalOpen(false)}
            sectionName={sectionName}
          />
        </DialogContent>
      </Dialog>

      {/* Add New Row Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Custom Row to {sectionName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {Object.keys(newRow).filter(k => !['id', 'isCustom'].includes(k)).map(key => (
              <div key={key}>
                <Label htmlFor={key} className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</Label>
                {dropdownOptions[key] ? (
                  <Select
                    value={(newRow as any)[key] || ''}
                    onValueChange={(value) => setNewRow({ ...newRow, [key]: value })}
                  >
                    <SelectTrigger id={key}>
                      <SelectValue placeholder={`Select ${key.replace(/_/g, ' ')}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {dropdownOptions[key].map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={key}
                    value={(newRow as any)[key] || ''}
                    onChange={(e) => setNewRow({ ...newRow, [key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => {
              onAlgorithmsChange([...algorithms, newRow]);
              setIsAddModalOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const AlgorithmSelectionContent = ({ availableAlgorithms = [], selectedAlgorithms = [], onSelectionChange, onClose, sectionName }: any) => {
  const [tempSelected, setTempSelected] = useState<any[]>(selectedAlgorithms);

  useEffect(() => {
    setTempSelected([...selectedAlgorithms]);
  }, [selectedAlgorithms]);

  const allAvailableAlgorithms = useMemo(() => {
    if (!availableAlgorithms || !selectedAlgorithms) return [];

    const customAlgos = selectedAlgorithms
      .filter((a: any) => a.isCustom)
      .map((a: any) => ({
        ...a,
        Algorithm_Name: a.name || a.algorithm_name
      }));

    const apiAlgorithms = availableAlgorithms.map((algo: any) => ({
      // Keep original API fields
      ...algo,
      // Ensure Algorithm_Name is set for display
      Algorithm_Name: algo.Algorithm_Name || algo.name || algo.algorithm_name,
      // Map common field variations to ensure consistency
      Variant: algo.Variant || algo.variant || '',
      Purpose: algo.Purpose || algo.purpose || '',
      Usage_Context: algo.Usage_Context || algo.usage_context || '',
      Status_Today: algo.Status_Today || algo.status_today || 'Medium',
      PQC_Status: algo.PQC_Status || algo.pqc_status || 'Safe',
      Priority: algo.Priority || algo.priority || 'Medium',
      Notes: algo.Notes || algo.notes || ''
    }));

    // Simple deduplication based on Algorithm_Name
    const combined = [...apiAlgorithms, ...customAlgos];
    const uniqueAlgos = Array.from(new Map(combined.map(item => [item.Algorithm_Name, item])).values());

    return uniqueAlgos;
  }, [availableAlgorithms, selectedAlgorithms]);

  const handleToggleAlgorithm = (algorithm: any) => {
    const algorithmKey = algorithm.Algorithm_Name;
    const isSelected = tempSelected.some(a => (a.name || a.algorithm_name) === algorithmKey);

    if (isSelected) {
      setTempSelected(tempSelected.filter(a => a.name !== algorithmKey && a.algorithm_name !== algorithmKey));
    } else {
      // Map all the fields from the available algorithm to the expected format
      const newAlgo = {
        id: algorithm.id || `algo-${Date.now()}-${Math.random()}`,
        name: algorithm.Algorithm_Name,
        algorithm_name: algorithm.Algorithm_Name,
        variant: algorithm.Variant || algorithm.variant || '',
        purpose: algorithm.Purpose || algorithm.purpose || '',
        usage_context: algorithm.Usage_Context || algorithm.usage_context || '',
        status_today: algorithm.Status_Today || algorithm.status_today || 'Medium',
        pqc_status: algorithm.PQC_Status || algorithm.pqc_status || 'Safe',
        priority: algorithm.Priority || algorithm.priority || 'Medium',
        classical_recommended: algorithm.Classical_Recommended || algorithm.classical_recommended || 'yes',
        quantum_recommended: algorithm.Quantum_Recommended || algorithm.quantum_recommended || 'yes',
        nist_reference: algorithm.NIST_Reference || algorithm.nist_reference || '',
        notes: algorithm.Notes || algorithm.notes || '',
        isCustom: algorithm.isCustom || false
      };
      setTempSelected([...tempSelected, newAlgo]);
    }
  };

  const handleSave = () => {
    onSelectionChange(tempSelected);
    onClose();
  };

  if (!allAvailableAlgorithms || allAvailableAlgorithms.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No algorithms available for this section.
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {allAvailableAlgorithms.map((algorithm: any, index: number) => {
          const algorithmKey = algorithm.Algorithm_Name || `key-${index}`;
          const isSelected = tempSelected.some(a => a.name === algorithmKey || a.algorithm_name === algorithmKey);
          return (
            <div key={`${algorithmKey}-${index}`} className="flex items-center gap-4 p-2 border-b">
              <Checkbox id={`algo-${index}`} checked={isSelected} onCheckedChange={() => handleToggleAlgorithm(algorithm)} />
              <Label htmlFor={`algo-${index}`} className="flex-grow text-sm cursor-pointer">{algorithm.Algorithm_Name}</Label>
            </div>
          );
        })}
      </div>
      <DialogFooter className="mt-4">
        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
        <Button onClick={handleSave}>Save Selection</Button>
      </DialogFooter>
    </>
  );
};

const ApplicationDetail = ({ 
  app, 
  onBack, 
  allAlgorithms 
}: { 
  app: any; 
  onBack: () => void; 
  allAlgorithms: any[];
}) => {
  const [editedApp, setEditedApp] = useState(app);
  const [originalApp, setOriginalApp] = useState(app);

  const handleSectionChange = (sectionName: string, newAlgorithms: any[]) => {
    setEditedApp({
      ...editedApp,
      cryptographic_profile: {
        ...editedApp.cryptographic_profile,
        [sectionName]: newAlgorithms
      }
    });
  };

  const handleSaveAll = () => {
    console.log('Saving all changes:', editedApp);
    setOriginalApp(editedApp);
    // Here you would typically make API calls to save the changes
  };

  const handleResetAll = () => {
    setEditedApp(originalApp);
  };

  const getAvailableAlgorithmsForSection = (sectionName: string) => {
    return allAlgorithms.filter(algo => algo.Section === sectionName);
  };

  const cardVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  };

  return (
    <motion.div
      key="detail"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="mb-6 flex justify-between items-center">
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Applications
        </Button>
      </div>
      
      <div className="bg-card rounded-lg shadow-md overflow-hidden border border-border">
        <div className="p-6 border-b border-border">
          <h3 className="text-xl font-bold text-card-foreground mb-2">{editedApp.application}</h3>
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center space-x-4">
              <span>Total Algorithms: {editedApp.summary.total_algorithms}</span>
              <span>Categories: {editedApp.summary.sections_with_algorithms}</span>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-8">
          {Object.entries(editedApp.cryptographic_profile).map(([section, algorithms]) => (
            <div key={section} className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-4">
                {getSectionIcon(section)}
                <h4 className="text-md font-semibold text-foreground">{section}</h4>
                <span className="text-sm text-muted-foreground">({(algorithms as any[])?.length || 0})</span>
              </div>
              
              <EditableTable
                algorithms={algorithms as any[]}
                sectionName={section}
                availableAlgorithms={getAvailableAlgorithmsForSection(section)}
                onAlgorithmsChange={(newAlgorithms) => handleSectionChange(section, newAlgorithms)}
                originalAlgorithms={originalApp.cryptographic_profile[section] || []}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-2">
        <Button onClick={handleSaveAll} size="lg">
          <Save className="h-4 w-4 mr-2" />
          Save All Changes
        </Button>
        <Button onClick={handleResetAll} variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset All
        </Button>
      </div>
    </motion.div>
  );
};

const ApplicationsList = ({ 
  applications, 
  onAppClick, 
  searchTerm, 
  onSearchChange, 
  onBack 
}: {
  applications: any[];
  onAppClick: (app: any) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onBack: () => void;
}) => {
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div
      key="list"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-foreground">Cryptographic Applications</h1>
      </div>
      
      <div className="flex items-center justify-between mb-8">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-card text-card-foreground placeholder-muted-foreground focus:outline-none focus:placeholder-muted-foreground/80 focus:ring-1 focus:ring-ring focus:border-ring"
            placeholder="Search applications or algorithms..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {applications.map((app, index) => (
          <div 
            key={index} 
            className="bg-card rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg border border-border cursor-pointer"
            onClick={() => onAppClick(app)}
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-card-foreground mb-2">{app.application}</h3>
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center space-x-4">
                      <span>Total Algorithms: {app.summary.total_algorithms}</span>
                      <span>Categories: {app.summary.sections_with_algorithms}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {applications.length === 0 && searchTerm && (
        <div className="text-center py-12">
          <div className="text-muted-foreground text-lg">No applications found matching "{searchTerm}"</div>
          <button 
            onClick={() => onSearchChange('')}
            className="mt-4 text-primary hover:text-primary/80 font-medium"
          >
            Clear search
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default function Applications({
  data,
  isLoading,
  error,
  onRefresh,
  isRefreshing,
  onBack,
  allAlgorithms, // Add this line
}: {
  data: any;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onBack: () => void;
  allAlgorithms: any[]; // Add this line
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<any | null>(null);

  const filteredApplications = React.useMemo(() => {
    if (!data?.applications) return [];
    if (!searchTerm) return data.applications;
    return data.applications.filter((app: any) => {
      if (app.application.toLowerCase().includes(searchTerm.toLowerCase())) return true;
      const profile = app.cryptographic_profile;
      const allAlgorithmsProfile = [
        ...(profile["Symmetric Algorithms"] || []),
        ...(profile["Asymmetric Algorithms"] || []),
        ...(profile["Hash Functions"] || []),
        ...(profile["MACs & KDFs"] || []),
        ...(profile["Post-Quantum Cryptography"] || [])
      ];
      return allAlgorithmsProfile.some((algo: any) =>
        algo.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [searchTerm, data]);

  if (isLoading || isRefreshing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-muted-foreground">Loading applications...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-destructive">
          <div className="text-lg font-semibold mb-2">Error</div>
          <div>{error}</div>
          <button
            onClick={onRefresh}
            className="mt-4 text-primary hover:text-primary/80 font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {selectedApp ? (
            <ApplicationDetail
              key="detailView"
              app={selectedApp}
              onBack={() => setSelectedApp(null)}
              allAlgorithms={allAlgorithms} // Use the prop directly
            />
          ) : (
            <ApplicationsList
              key="listView"
              applications={filteredApplications}
              onAppClick={setSelectedApp}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onBack={onBack}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};