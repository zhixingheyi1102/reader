import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import './EditableNode.css'; // 引入CSS文件

const EditableNode = ({ data, id }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState(''); // 保存编辑中的内容
  const textareaRef = useRef(null);
  const wasEditingRef = useRef(false); // 跟踪之前是否在编辑状态

  // 保护编辑状态：当组件重新渲染时，检查是否需要恢复编辑状态
  useEffect(() => {
    // 如果之前在编辑但现在不在编辑，可能是被意外重置了
    if (wasEditingRef.current && !isEditing && editingContent) {
      console.log('🛡️ [编辑保护] 检测到编辑状态可能被重置，尝试恢复:', id);
      setIsEditing(true);
      // 延迟恢复焦点，确保DOM已更新
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.value = editingContent;
          adjustTextareaHeight(textareaRef.current);
          console.log('🛡️ [编辑保护] 编辑状态已恢复:', id);
        }
      }, 0);
    }
    
    // 更新编辑状态跟踪
    wasEditingRef.current = isEditing;
  }, [isEditing, editingContent, id]);

  // 处理双击事件，进入编辑模式
  const handleDoubleClick = () => {
    console.log('📝 [编辑开始] 节点进入编辑模式:', id);
    setEditingContent(data.label || '');
    setIsEditing(true);
  };

  // 处理失焦事件，保存并退出编辑模式
  const handleBlur = (event) => {
    const newLabel = event.target.value.trim();
    console.log('📝 [编辑结束] 节点编辑完成:', id, '新内容:', newLabel);
    
    if (newLabel !== data.label && data.onLabelChange) {
      data.onLabelChange(id, newLabel);
    }
    
    // 清理编辑状态
    setEditingContent('');
    setIsEditing(false);
    wasEditingRef.current = false;
  };

  // 处理键盘事件
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const newLabel = event.target.value.trim();
      console.log('📝 [编辑完成-回车] 节点编辑完成:', id, '新内容:', newLabel);
      
      if (newLabel !== data.label && data.onLabelChange) {
        data.onLabelChange(id, newLabel);
      }
      
      // 清理编辑状态
      setEditingContent('');
      setIsEditing(false);
      wasEditingRef.current = false;
    }
    // 按 Escape 键取消编辑
    if (event.key === 'Escape') {
      console.log('📝 [编辑取消] 用户取消编辑:', id);
      // 清理编辑状态
      setEditingContent('');
      setIsEditing(false);
      wasEditingRef.current = false;
    }
  };

  // 处理输入事件，保存编辑内容并自动调整高度
  const handleInput = (event) => {
    const currentContent = event.target.value;
    setEditingContent(currentContent); // 实时保存编辑内容
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
    <div className="editable-node" data-node-id={id}>
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
          defaultValue={editingContent || data.label || ''}
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