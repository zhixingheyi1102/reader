import { useState, useEffect, useCallback, useRef } from 'react';

export const usePanelResize = () => {
  // 分割面板相关状态 - 调整为三列布局
  const [tocPanelWidth, setTocPanelWidth] = useState(20); // 目录栏宽度
  const [leftPanelWidth, setLeftPanelWidth] = useState(45); // 文档查看器宽度  
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState(null); // 'toc-divider' 或 'main-divider'
  const [showToc, setShowToc] = useState(false);
  const containerRef = useRef(null);

  // 使用useRef来保存事件处理函数的引用
  const handleMouseMoveRef = useRef(null);
  const handleMouseUpRef = useRef(null);

  // 拖拽处理函数
  const handleMouseDown = useCallback((e, target) => {
    setIsDragging(true);
    setDragTarget(target);
    e.preventDefault();
  }, []);

  // 创建事件处理函数
  useEffect(() => {
    handleMouseMoveRef.current = (e) => {
      if (!isDragging || !containerRef.current || !dragTarget) return;
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      
      if (dragTarget === 'toc-divider') {
        // 调整目录栏宽度
        const newTocWidth = (mouseX / containerWidth) * 100;
        const minTocWidth = 15;
        const maxTocWidth = 30;
        
        if (newTocWidth >= minTocWidth && newTocWidth <= maxTocWidth) {
          setTocPanelWidth(newTocWidth);
        }
      } else if (dragTarget === 'main-divider') {
        // 调整主内容区域宽度
        const currentTocWidth = showToc ? tocPanelWidth : 0;
        const availableWidth = 100 - currentTocWidth;
        const newLeftWidth = ((mouseX - (currentTocWidth * containerWidth / 100)) / containerWidth) * 100;
        const minLeftWidth = 25;
        const maxLeftWidth = availableWidth - 25; // 为右侧留出至少25%
        
        if (newLeftWidth >= minLeftWidth && newLeftWidth <= maxLeftWidth) {
          setLeftPanelWidth(newLeftWidth);
        }
      }
    };

    handleMouseUpRef.current = () => {
      setIsDragging(false);
      setDragTarget(null);
    };
  }, [isDragging, dragTarget, tocPanelWidth, showToc]);

  // 管理事件监听器
  useEffect(() => {
    // 使用局部变量存储事件处理函数的引用，避免闭包问题
    let localHandleMouseMove = null;
    let localHandleMouseUp = null;
    
    const handleMouseMove = (e) => {
      if (handleMouseMoveRef.current) {
        handleMouseMoveRef.current(e);
      }
    };

    const handleMouseUp = () => {
      if (handleMouseUpRef.current) {
        handleMouseUpRef.current();
      }
    };

    if (isDragging) {
      // 使用window.document确保获取全局document对象，并检查addEventListener方法是否存在
      const globalDocument = window.document;
      if (globalDocument && typeof globalDocument.addEventListener === 'function') {
        localHandleMouseMove = handleMouseMove;
        localHandleMouseUp = handleMouseUp;
        
        globalDocument.addEventListener('mousemove', localHandleMouseMove, { passive: false });
        globalDocument.addEventListener('mouseup', localHandleMouseUp, { passive: false });
        
        if (globalDocument.body) {
          globalDocument.body.style.cursor = 'col-resize';
          globalDocument.body.style.userSelect = 'none';
        }
      }
    }

    // 清理函数 - 添加多重安全检查
    return () => {
      try {
        // 使用window.document确保获取全局document对象
        const globalDocument = window.document;
        if (globalDocument && typeof globalDocument.removeEventListener === 'function') {
          if (localHandleMouseMove) {
            globalDocument.removeEventListener('mousemove', localHandleMouseMove);
          }
          if (localHandleMouseUp) {
            globalDocument.removeEventListener('mouseup', localHandleMouseUp);
          }
        }
        
        // 重置样式
        if (globalDocument && globalDocument.body) {
          globalDocument.body.style.cursor = '';
          globalDocument.body.style.userSelect = '';
        }
      } catch (error) {
        // 静默处理清理错误，避免影响应用运行
        console.warn('清理事件监听器时出错:', error);
      }
    };
  }, [isDragging]);

  return {
    tocPanelWidth,
    leftPanelWidth,
    isDragging,
    dragTarget,
    showToc,
    setShowToc,
    containerRef,
    handleMouseDown
  };
}; 