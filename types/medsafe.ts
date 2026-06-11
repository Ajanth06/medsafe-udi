export type DeviceStatus = "released" | "blocked" | "in_production" | "recall";

export type Device = {
  id: string;
  name: string;
  productFamily?: string;
  udiDi: string;
  basicUdiDi?: string;
  serial: string;
  udiHash: string;
  createdAt: string;
  createdBy?: string;
  manufacturerName?: string;
  manufacturerSrn?: string;
  deviceVersionVariants?: string;
  deviceDescription?: string;
  principleOfOperation?: string;
  keyComponents?: string;
  accessories?: string;
  riskFileId?: string;
  fmeaId?: string;
  hazardAnalysisRef?: string;
  ceStatus?: string;
  notifiedBody?: string;
  conformityRoute?: string;
  clinicalEvaluationRef?: string;
  gsprChecklistLink?: string;
  warningsPrecautions?: string;
  batch?: string;
  productionDate?: string;
  udiPi?: string;
  status: DeviceStatus;
  riskClass?: string;
  mdrClass?: string;
  mdrRule?: string;
  intendedPurpose?: string;
  internalRiskLevel?: string;
  blockComment?: string;
  responsible?: string;
  isArchived?: boolean;
  dmrId?: string;
  dhrId?: string;
  validationStatus?: string;
  archivedAt?: string;
  archiveReason?: string;
  nonconformityCategory?: string;
  nonconformitySeverity?: string;
  nonconformityAction?: string;
  nonconformityResponsible?: string;
  nonconformityId?: string;
  lastServiceDate?: string;
  nextServiceDate?: string;
  serviceNotes?: string;
  pmsNotes?: string;
  genericDeviceGroup?: string;
  deletedAt?: string;
};

export type DocStatus = "Draft" | "Controlled" | "Final";
export type DocAssignmentScope = "device" | "batch" | "product_group";
export type DocType =
  | "declaration_of_conformity"
  | "ifu"
  | "risk_management_file"
  | "test_report"
  | "labeling"
  | "dmr_master_document"
  | "other";

export type Doc = {
  id: string;
  deviceId: string;
  name: string;
  cid: string;
  url: string;
  createdAt: string;
  category?: string;
  docType?: DocType;
  version?: string;
  revision?: string;
  docStatus?: DocStatus;
  approvedBy?: string;
  assignmentScope?: DocAssignmentScope;
  assignedBatch?: string;
  assignedProductGroup?: string;
  isMandatory?: boolean;
  purpose?: string;
  deletedAt?: string;
};

export type AuditEntry = {
  id: string;
  deviceId: string | null;
  action: string;
  message: string;
  timestamp: string;
};

/** MDR-Stammdaten (DMR) — einmal pro Produkt, auf Geräte vererbt */
export type ProductDmrFields = {
  deviceDescription?: string;
  intendedPurpose?: string;
  principleOfOperation?: string;
  keyComponents?: string;
  accessories?: string;
  deviceVersionVariants?: string;
  riskFileId?: string;
  fmeaId?: string;
  hazardAnalysisRef?: string;
  ceStatus?: string;
  notifiedBody?: string;
  conformityRoute?: string;
  clinicalEvaluationRef?: string;
  gsprChecklistLink?: string;
  warningsPrecautions?: string;
  internalRiskLevel?: string;
};

export type ProductUdiRegistryEntry = {
  id: string;
  productName: string;
  customerPrefix: string;
  udiDi: string;
  manufacturerName?: string;
  manufacturerSrn?: string;
  createdAt: string;
  updatedAt?: string;
} & ProductDmrFields;

export type BatchGroup = {
  key: string;
  productName: string;
  batch: string;
  quantity: number;
  udiDi: string;
  status: DeviceStatus | "mixed";
  productionDate?: string;
  createdAt: string;
  deviceIds: string[];
  archivedCount: number;
  blockedCount: number;
};
