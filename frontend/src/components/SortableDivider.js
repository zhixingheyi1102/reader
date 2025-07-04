import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LogicalDivider from './LogicalDivider';

const SortableDivider = ({ id, nodeInfo, className = '' }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-divider ${isDragging ? 'shadow-lg' : ''} ${className}`}
    >
      <LogicalDivider 
        nodeInfo={nodeInfo}
        // 将拖拽属性传递给 LogicalDivider 的拖拽手柄
        dragHandleProps={{
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  );
};

export default SortableDivider; 