import type {
  AuditEvent,
  CheckpointMeta,
  CmsDocument,
  CmsPatch,
  CmsStage,
  ModelProviderConfig,
  PublishedVersionMeta,
  RollbackRequest,
  ThemeTokenPatch,
} from "@webmaster-droid/contracts";

export interface StorageAdapter {
  ensureInitialized(seed: CmsDocument): Promise<void>;
  getContent(stage: CmsStage): Promise<CmsDocument>;
  saveDraft(content: CmsDocument): Promise<void>;
  saveLive(content: CmsDocument): Promise<void>;
  putPublicAsset(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<void>;
  createCheckpoint(
    content: CmsDocument,
    input: { createdBy?: string; reason: string }
  ): Promise<CheckpointMeta>;
  deleteCheckpoint(id: string): Promise<boolean>;
  listCheckpoints(): Promise<CheckpointMeta[]>;
  publishDraft(input: {
    content: CmsDocument;
    createdBy?: string;
  }): Promise<PublishedVersionMeta>;
  listPublishedVersions(): Promise<PublishedVersionMeta[]>;
  getSnapshot(input: RollbackRequest): Promise<CmsDocument | null>;
  appendEvent(event: AuditEvent): Promise<void>;
}

export interface ModelAdapterInput {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  context: {
    document: CmsDocument;
    editableScopeSummary: string[];
  };
}

export interface ModelAdapterOutput {
  text: string;
  proposedPatch: CmsPatch;
  thinking?: string[];
}

export interface ModelAdapter {
  providerName(): string;
  generate(input: ModelAdapterInput): Promise<ModelAdapterOutput>;
}

export interface ToolRegistry {
  listToolNames(): string[];
}

export interface CmsServiceConfig {
  modelConfig: ModelProviderConfig;
  maxOperationsPerPatch?: number;
  allowedInternalPaths?: string[];
  publicAssetBaseUrl?: string;
  publicAssetPrefix?: string;
}

export interface MutationResult {
  document: CmsDocument;
  checkpoint: CheckpointMeta;
  warnings: string[];
}

export interface ThemeMutationResult {
  document: CmsDocument;
  checkpoint: CheckpointMeta;
  warnings: string[];
}

export interface PatchValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface PatchApplicationOptions {
  maxOperationsPerPatch: number;
  allowedInternalPaths: string[];
}

export interface PatchApplyResult {
  document: CmsDocument;
  warnings: string[];
}

export interface ThemeApplyResult {
  document: CmsDocument;
  warnings: string[];
}

export interface CmsMutationInput {
  patch: CmsPatch;
  actor?: string;
  reason: string;
}

export interface ThemeMutationInput {
  patch: ThemeTokenPatch;
  actor?: string;
  reason: string;
}

export interface AgentBatchMutationInput {
  patch?: CmsPatch;
  themePatch?: ThemeTokenPatch;
  actor?: string;
  reason: string;
}
