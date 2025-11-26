
import React from 'react';
import { Note, InsightPlatform, InsightHistoryItem } from '../types';
import { X, Layers, Trash2, FileText } from 'lucide-react';
import NoteCard from './NoteCard';
import { generateInsights } from '../services/geminiService';

interface StackDetailModalProps {
  stack: Note;
  onClose: () => void;
  onRemoveItem: (noteId: string) => void;
  onSaveToHistory: (item: InsightHistoryItem) => void;
}

const StackDetailModal: React.FC<StackDetailModalProps> = ({ stack, onClose, onRemoveItem, onSaveToHistory }) => {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerateSummary = async () => {
    if (!stack.stackItems || stack.stackItems.length === 0) return;
    setIsGenerating(true);
    const textResult = await generateInsights(stack.stackItems, InsightPlatform.NEWSLETTER, stack.stackCategory);
    
    const newHistoryItem: InsightHistoryItem = {
      id: Date.now().toString(),
      content: textResult,
      platform: InsightPlatform.NEWSLETTER,
      createdAt: Date.now(),
      category: stack.stackCategory,
      relatedNotes: stack.stackItems // Save source material
    };
    onSaveToHistory(newHistoryItem);
    setIsGenerating(false);
    onClose();
    alert("已为该卡片组生成总结，请前往“洞察”页面历史记录查看。");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className="bg-purple-100 p-2.5 rounded-xl text-purple-600">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-slate-800">{stack.title || '卡片组详情'}</h3>
              <p className="text-sm text-slate-500 font-medium">{stack.stackItems?.length || 0} 条笔记 · {stack.stackCategory || '通用'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {stack.stackItems?.map(item => (
              <div key={item.id} className="relative group">
                <NoteCard note={item} draggable={false} />
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                  className="absolute top-2 right-2 bg-white text-red-500 p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 border border-red-100"
                  title="移出卡片组"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center">
          <span className="text-xs text-slate-400 font-medium">
            提示: 拖拽卡片可重新排序（开发中）
          </span>
          <button
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-purple-200 transition-all flex items-center gap-2 disabled:opacity-70 disabled:shadow-none"
          >
            {isGenerating ? '生成中...' : <><FileText className="w-4 h-4" /> 生成组总结</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StackDetailModal;
