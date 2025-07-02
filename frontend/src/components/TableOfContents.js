import React from 'react';
import { FileText } from 'lucide-react';

const TableOfContents = ({ toc, expandedItems, activeItem, onToggle, onItemClick }) => {
  const renderTocItem = (item, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isActive = activeItem === item.id;
    
    return (
      <div key={item.id} className={`${depth > 0 ? 'ml-3' : ''}`}>
        <div 
          className={`flex items-center py-1 px-2 text-xs rounded transition-colors cursor-pointer ${
            isActive 
              ? 'bg-blue-100 text-blue-800 border-l-2 border-blue-500' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => onItemClick(item)}
        >
          <div className="flex items-center flex-1 min-w-0">
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item.id);
                }}
                className="mr-1 p-0.5 hover:bg-gray-200 rounded"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            <span 
              className={`truncate ${item.level === 1 ? 'font-semibold' : 'font-normal'}`}
              title={item.title}
            >
              {item.title}
            </span>
          </div>
          <span className="text-xs text-gray-400 ml-1">
            H{item.level}
          </span>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.children.map(child => renderTocItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!toc || toc.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-xs">
        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p>文档没有标题结构</p>
        <p>或正在分析中...</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {toc.map(item => renderTocItem(item))}
    </div>
  );
};

export default TableOfContents; 