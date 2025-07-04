import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import './EditableNode.css'; // 引入CSS文件

const EditableNode = ({ data, id }) => {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef(null);

  // 处理双击事件，进入编辑模式
  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  // 处理失焦事件，保存并退出编辑模式
  const handleBlur = (event) => {
    const newLabel = event.target.value.trim();
    if (newLabel !== data.label && data.onLabelChange) {
      data.onLabelChange(id, newLabel);
    }
    setIsEditing(false);
  };

  // 处理键盘事件
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const newLabel = event.target.value.trim();
      if (newLabel !== data.label && data.onLabelChange) {
        data.onLabelChange(id, newLabel);
      }
      setIsEditing(false);
    }
    // 按 Escape 键取消编辑
    if (event.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // 处理输入事件，自动调整高度
  const handleInput = (event) => {
    adjustTextareaHeight(event.target);
  };

  // 调整文本区域高度的辅助函数
  const adjustTextareaHeight = (textarea) => {
    if (!textarea) return;
    
    // 先重置高度，再根据内容设置新高度
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  // 当进入编辑模式时，设置初始高度
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // 确保文本区域获得焦点
      textareaRef.current.focus();
      
      // 设置初始高度
      setTimeout(() => {
        adjustTextareaHeight(textareaRef.current);
      }, 0);
    }
  }, [isEditing]);

  return (
    <div className="editable-node">
      {/* 添加一个用于接收连线的Handle在顶部 */}
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ background: '#555', width: 8, height: 8 }} 
      />
      
      {!isEditing ? (
        <div 
          onDoubleClick={handleDoubleClick}
          className="editable-node-content"
          title="双击编辑"
        >
          {data.label || '未命名节点'}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          defaultValue={data.label || ''}
          autoFocus
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className="editable-node-textarea"
          placeholder="输入节点内容..."
        />
      )}
      
      {/* 添加一个用于发出连线的Handle在底部 */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: '#555', width: 8, height: 8 }} 
      />
    </div>
  );
};

export default EditableNode; 