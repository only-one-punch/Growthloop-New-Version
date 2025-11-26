
export enum NoteType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  MIXED = 'MIXED',
  STACK = 'STACK'
}

export enum InsightPlatform {
  NEWSLETTER = 'NEWSLETTER',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA'
}

export enum StackCategory {
  TECH = 'TECH',       // 技术复盘
  LIFE = 'LIFE',       // 生活随笔
  WISDOM = 'WISDOM',   // 深度思考 (芒格风格)
  GENERAL = 'GENERAL'  // 通用/未分类
}

export interface TagAnalysis {
  category: string;
  tags: string[];
  sentiment: string;
}

export interface Note {
  id: string;
  content: string;
  imageBase64?: string;
  createdAt: number;
  type: NoteType;
  analysis?: TagAnalysis;
  isProcessing: boolean;
  
  // Stack related properties
  title?: string; // Title for the stack
  stackItems?: Note[]; // Items inside the stack
  stackCategory?: StackCategory; // Persisted category for the stack
}

export interface InsightHistoryItem {
  id: string;
  content: string;
  platform: InsightPlatform;
  createdAt: number;
  generatedImageUrl?: string; // For Social Media images
  category?: StackCategory;
  relatedNotes?: Note[]; // Source material used to generate this insight
  stackId?: string; // ID of the stack this insight belongs to
}

export interface Insight {
  id: string;
  title: string;
  content: string;
  platform: InsightPlatform;
  createdAt: number;
  relatedNoteIds: string[];
}

// Chart data types
export interface CategoryData {
  name: string;
  value: number;
  fill: string;
  [key: string]: any; // Add index signature for Recharts compatibility
}