
import React, { useState } from 'react';
import { Note, NoteType, StackCategory } from '../types';
import { Loader2, Layers, X } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onClick?: (note: Note) => void;
  onDrop?: (sourceId: string, targetId: string) => void;
  onCategoryChange?: (noteId: string, newCategory: StackCategory) => void;
  onUpdate?: (noteId: string, newContent: string) => void;
  onDelete?: (noteId: string) => void;
  draggable?: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onClick, onDrop, onCategoryChange, onUpdate, onDelete, draggable = true }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.content);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', note.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-purple-400', 'ring-offset-2');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-purple-400', 'ring-offset-2');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-purple-400', 'ring-offset-2');
    const sourceId = e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== note.id && onDrop) {
      onDrop(sourceId, note.id);
    }
  };

  const handleToggleCategory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isStack || !onCategoryChange) return;
    const categories = [StackCategory.TECH, StackCategory.LIFE, StackCategory.WISDOM, StackCategory.GENERAL];
    const currentIndex = categories.indexOf(note.stackCategory || StackCategory.GENERAL);
    const nextCategory = categories[(currentIndex + 1) % categories.length];
    onCategoryChange(note.id, nextCategory);
  };

  const isStack = note.type === NoteType.STACK;

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(note.id, editText || '');
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(note.content);
    setIsEditing(false);
  };

  const startEditing = (e: React.MouseEvent) => {
    if (isStack) return;
    e.stopPropagation(); // Prevent card's main onClick from firing
    setIsEditing(true);
  };

  // Category Colors
  const getCategoryColor = (cat?: string) => {
    switch (cat) {
      case StackCategory.TECH: return 'bg-blue-100 text-blue-700 border-blue-200';
      case StackCategory.LIFE: return 'bg-pink-100 text-pink-700 border-pink-200';
      case StackCategory.WISDOM: return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (isStack && onClick) {
          onClick(note);
        }
        // For non-stacks, this click is a no-op, allowing child clicks to be handled
      }}
      className={`
        bg-white border border-slate-200 rounded-2xl p-0 mb-6 break-inside-avoid
        transition-all duration-300 relative group
        ${isStack ? 'shadow-[4px_4px_0px_rgba(0,0,0,0.05)] hover:shadow-[6px_6px_0px_rgba(0,0,0,0.08)] hover:-translate-y-1 cursor-pointer' : 'shadow-sm hover:shadow-md hover:-translate-y-1'}
        ${isEditing ? 'ring-2 ring-purple-400 shadow-lg' : ''}
      `}
    >
      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="absolute top-3 right-3 p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          aria-label="Delete note"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Stack Visual Effect */}
      {isStack && (
        <>
          <div className="absolute top-1 left-1 w-full h-full bg-white border border-slate-200 rounded-2xl -z-10 rotate-1"></div>
          <div className="absolute top-2 left-2 w-full h-full bg-white border border-slate-100 rounded-2xl -z-20 rotate-2 opacity-50"></div>
        </>
      )}

      {/* Header */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
           {isStack && (
             <button
               onClick={handleToggleCategory}
               className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${getCategoryColor(note.stackCategory)}`}
             >
               {note.stackCategory || 'GENERAL'}
             </button>
           )}
           <span className="text-xs text-slate-400 font-medium">
             {new Date(note.createdAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
           </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {isStack ? (
          <div className="space-y-3">
             <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 mt-1">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                   <h3 className="font-bold text-lg text-slate-800 leading-tight group-hover:text-purple-600 transition-colors">
                     {note.title || '正在生成标题...'}
                   </h3>
                   <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                     {note.stackItems?.[0]?.content.substring(0, 50)}...
                   </p>
                </div>
             </div>
             <div className="flex items-center gap-2 pt-2">
               <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                 {note.stackItems?.length || 0} 条笔记
               </span>
             </div>
          </div>
        ) : isEditing ? (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-32 p-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
              autoFocus
              onClick={(e) => e.stopPropagation()} // Prevent card click while editing
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={(e) => { e.stopPropagation(); handleCancel(); }} className="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md">取消</button>
              <button onClick={(e) => { e.stopPropagation(); handleSave(); }} className="px-3 py-1 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-md">保存</button>
            </div>
          </div>
        ) : (
          <>
            {note.imageBase64 && (
              <div className="mb-4 rounded-lg overflow-hidden border border-slate-100 relative group-hover:shadow-sm transition-shadow">
                <img
                  src={note.imageBase64}
                  alt="Attachment"
                  className="w-full h-auto object-cover"
                />
              </div>
            )}
            <div onClick={startEditing} className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap cursor-text">
              {note.content || <span className="text-slate-400 italic">图片内容</span>}
            </div>
          </>
        )}
      </div>

      {/* Footer / Tags */}
      {!isStack && (
        <div className="px-5 pb-5 pt-0 flex flex-wrap gap-2">
           {note.isProcessing ? (
             <span className="flex items-center gap-1.5 text-xs text-purple-600 font-medium bg-purple-50 px-2 py-1 rounded-md">
               <Loader2 className="w-3 h-3 animate-spin" /> 分析中...
             </span>
           ) : (
             <>
               {note.analysis?.category && (
                  <span className="text-[10px] font-bold text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full bg-slate-50">
                    {note.analysis.category}
                  </span>
               )}
               {note.analysis?.tags.slice(0, 2).map((tag, idx) => (
                 <span key={idx} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                   #{tag}
                 </span>
               ))}
             </>
           )}
        </div>
      )}
    </div>
  );
};

export default NoteCard;
