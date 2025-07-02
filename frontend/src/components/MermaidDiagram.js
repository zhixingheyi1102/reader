import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, Copy, Check, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import toast from 'react-hot-toast';

// 美化Mermaid节点的CSS样式 - 精确悬停版本
const mermaidStyles = `
  /* 基础节点样式 */
  .mermaid rect,
  .mermaid polygon,
  .mermaid circle,
  .mermaid ellipse {
    fill: #ffffff !important;
    stroke: rgba(0, 0, 0, 0.2) !important;
    stroke-width: 1px !important;
    filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.15)) !important;
    transition: all 0.3s ease !important;
  }

  /* 矩形圆角 */
  .mermaid rect {
    rx: 8 !important;
    ry: 8 !important;
  }

  /* 悬停效果 - 只作用于当前悬停的节点 */
  .mermaid g:hover > rect,
  .mermaid g:hover > polygon,
  .mermaid g:hover > circle,
  .mermaid g:hover > ellipse {
    fill: #ffffff !important;
    stroke: #3b82f6 !important;
    stroke-width: 2px !important;
    filter: drop-shadow(2px 2px 12px rgba(59, 130, 246, 0.3)) !important;
    cursor: pointer !important;
  }

  /* 确保悬停时不影响其他节点 */
  .mermaid g:not(:hover) rect,
  .mermaid g:not(:hover) polygon,
  .mermaid g:not(:hover) circle,
  .mermaid g:not(:hover) ellipse {
    fill: #ffffff !important;
    stroke: rgba(0, 0, 0, 0.2) !important;
    stroke-width: 1px !important;
    filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.15)) !important;
  }

  /* 确保文本可见 */
  .mermaid text {
    font-family: "Microsoft YaHei", Arial, sans-serif !important;
    font-weight: 500 !important;
    fill: #374151 !important;
    pointer-events: none !important;
  }

  /* 连接线样式 */
  .mermaid path {
    stroke: #9ca3af !important;
    stroke-width: 1.5px !important;
    fill: none !important;
  }

  .mermaid marker {
    fill: #9ca3af !important;
  }

  /* 节点点击样式 */
  .mermaid g {
    cursor: pointer !important;
  }

  /* 增强节点点击区域 */
  .mermaid g > rect,
  .mermaid g > polygon,
  .mermaid g > circle,
  .mermaid g > ellipse {
    cursor: pointer !important;
  }
`;

// 注入样式到页面
const injectStyles = () => {
  const styleId = 'mermaid-custom-styles';
  
  // 先移除之前的样式
  const existingStyle = document.getElementById(styleId);
  if (existingStyle) {
    existingStyle.remove();
    console.log('🗑️ 移除了之前的样式');
  }

  const styleSheet = document.createElement('style');
  styleSheet.id = styleId;
  styleSheet.type = 'text/css';
  styleSheet.textContent = mermaidStyles;
  document.head.appendChild(styleSheet);
  
  console.log('✨ Mermaid自定义样式已注入');
  console.log('📋 样式内容长度:', mermaidStyles.length);
  
  // 验证样式是否已添加
  setTimeout(() => {
    const appliedStyle = document.getElementById(styleId);
    if (appliedStyle) {
      console.log('✅ 样式确认已添加到DOM');
      console.log('📄 样式表内容预览:', appliedStyle.textContent.substring(0, 100) + '...');
      
      // 检查是否有Mermaid SVG元素存在
      const mermaidSvgs = document.querySelectorAll('.mermaid svg');
      console.log('🎨 找到', mermaidSvgs.length, '个Mermaid SVG元素');
      
      if (mermaidSvgs.length > 0) {
        const firstSvg = mermaidSvgs[0];
        const rects = firstSvg.querySelectorAll('g rect');
        console.log('📦 第一个SVG中有', rects.length, '个矩形节点');
        
        if (rects.length > 0) {
          const computedStyle = window.getComputedStyle(rects[0]);
          console.log('🎨 第一个矩形的计算样式:');
          console.log('  - fill:', computedStyle.fill);
          console.log('  - stroke:', computedStyle.stroke);
          console.log('  - filter:', computedStyle.filter);
        }
      }
    } else {
      console.error('❌ 样式添加失败');
    }
  }, 100);
};

const MermaidDiagram = forwardRef(({ code, onNodeClick }, ref) => {
  const [diagramId] = useState(() => `mermaid-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mermaidInitialized, setMermaidInitialized] = useState(false);
  const [domReady, setDomReady] = useState(false);
  const containerRef = useRef(null);
  const diagramRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const parentContainerRef = useRef(null);

  // 使用useRef来保存事件处理函数的引用
  const handleMouseMoveRef = useRef(null);
  const handleMouseUpRef = useRef(null);

  // 使用RAF优化的拖拽处理
  const dragAnimationFrame = useRef(null);
  const pendingPosition = useRef(null);
  
  // 防抖相关状态
  const isAnimating = useRef(false);
  const lastMoveTime = useRef(0);
  const lastMovedNode = useRef(null);
  const moveDebounceTimer = useRef(null);

  // 节点关系缓存
  const nodeRelationsRef = useRef(null);

  // 解析Mermaid代码构建节点关系的函数
  const parseMermaidCode = useCallback((mermaidCode) => {
    if (!mermaidCode) return { nodes: new Set(), edges: [], adjacencyList: new Map() };

    console.log('🔍 [代码解析] 开始解析Mermaid代码');
    console.log('🔍 [代码解析] 代码预览:', mermaidCode.substring(0, 200) + '...');

    const nodes = new Set();
    const edges = [];
    const adjacencyList = new Map(); // nodeId -> [childNodeIds]

    try {
      // 将代码按行分割并清理
      const lines = mermaidCode
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('%%') && !line.startsWith('#'));

      // 匹配各种Mermaid语法的正则表达式
      const patterns = [
        // 基本箭头连接: A --> B, A->B
        /^([A-Za-z0-9_]+)\s*(-->|->)\s*([A-Za-z0-9_]+)/,
        // 带标签的箭头: A -->|label| B, A ->|label| B  
        /^([A-Za-z0-9_]+)\s*(-->|->)\s*\|[^|]*\|\s*([A-Za-z0-9_]+)/,
        // 实线连接: A --- B, A-B
        /^([A-Za-z0-9_]+)\s*(---|--|-)\s*([A-Za-z0-9_]+)/,
        // 带标签的实线: A ---|label| B
        /^([A-Za-z0-9_]+)\s*(---|--|-)\s*\|[^|]*\|\s*([A-Za-z0-9_]+)/,
        // 节点定义: A[label], A(label), A{label}
        /^([A-Za-z0-9_]+)[\[\(\{]([^\]\)\}]*)[\]\)\}]/,
        // 复杂箭头: A ==> B, A -.-> B
        /^([A-Za-z0-9_]+)\s*(==>|\.->|\.\.>)\s*([A-Za-z0-9_]+)/,
        // 带标签的复杂箭头: A ==>|label| B
        /^([A-Za-z0-9_]+)\s*(==>|\.->|\.\.>)\s*\|[^|]*\|\s*([A-Za-z0-9_]+)/,
        // 多连接模式: A --> B & C & D
        /^([A-Za-z0-9_]+)\s*(-->|->)\s*([A-Za-z0-9_]+(?:\s*&\s*[A-Za-z0-9_]+)*)/,
        // 从多个节点连接: A & B & C --> D
        /^([A-Za-z0-9_]+(?:\s*&\s*[A-Za-z0-9_]+)*)\s*(-->|->)\s*([A-Za-z0-9_]+)/
      ];

      for (const line of lines) {
        // 跳过图表类型定义行和子图定义
        if (line.includes('flowchart') || line.includes('graph') || line.includes('TD') || 
            line.includes('LR') || line.includes('TB') || line.includes('RL') ||
            line.includes('subgraph') || line === 'end') {
          continue;
        }

        // 尝试匹配各种模式
        let matched = false;
        
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            matched = true;
            
            // 如果是连接关系（有箭头或连线）
            if (match[2] && (match[2].includes('>') || match[2].includes('-'))) {
              const fromPart = match[1];
              const toPart = match[3];
              
              // 处理多连接模式 (A --> B & C & D)
              if (toPart && toPart.includes('&')) {
                const toNodes = toPart.split('&').map(n => n.trim());
                toNodes.forEach(toNode => {
                  if (fromPart && toNode) {
                    nodes.add(fromPart);
                    nodes.add(toNode);
                    edges.push({ from: fromPart, to: toNode, type: match[2] });
                    
                    if (!adjacencyList.has(fromPart)) {
                      adjacencyList.set(fromPart, []);
                    }
                    if (!adjacencyList.get(fromPart).includes(toNode)) {
                      adjacencyList.get(fromPart).push(toNode);
                    }
                    
                    console.log('🔍 [代码解析] 发现边 (多连接):', fromPart, '->', toNode);
                  }
                });
              }
              // 处理从多个节点连接模式 (A & B & C --> D)
              else if (fromPart && fromPart.includes('&')) {
                const fromNodes = fromPart.split('&').map(n => n.trim());
                fromNodes.forEach(fromNode => {
                  if (fromNode && toPart) {
                    nodes.add(fromNode);
                    nodes.add(toPart);
                    edges.push({ from: fromNode, to: toPart, type: match[2] });
                    
                    if (!adjacencyList.has(fromNode)) {
                      adjacencyList.set(fromNode, []);
                    }
                    if (!adjacencyList.get(fromNode).includes(toPart)) {
                      adjacencyList.get(fromNode).push(toPart);
                    }
                    
                    console.log('🔍 [代码解析] 发现边 (多源连接):', fromNode, '->', toPart);
                  }
                });
              }
              // 普通单对单连接
              else if (fromPart && toPart) {
                nodes.add(fromPart);
                nodes.add(toPart);
                edges.push({ from: fromPart, to: toPart, type: match[2] });
                
                // 构建邻接表
                if (!adjacencyList.has(fromPart)) {
                  adjacencyList.set(fromPart, []);
                }
                if (!adjacencyList.get(fromPart).includes(toPart)) {
                  adjacencyList.get(fromPart).push(toPart);
                }
                
                console.log('🔍 [代码解析] 发现边:', fromPart, '->', toPart);
              }
            } else if (match[1]) {
              // 单纯的节点定义
              nodes.add(match[1]);
              console.log('🔍 [代码解析] 发现节点定义:', match[1]);
            }
            break;
          }
        }

        // 如果没有匹配到标准模式，尝试提取可能的节点ID
        if (!matched) {
          // 查找可能的节点ID (字母数字组合)
          const possibleNodes = line.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g);
          if (possibleNodes && possibleNodes.length > 0) {
            // 过滤掉常见的关键词
            const keywords = ['flowchart', 'graph', 'TD', 'LR', 'TB', 'RL', 'subgraph', 'end', 'class', 'style'];
            possibleNodes.forEach(node => {
              if (!keywords.includes(node.toLowerCase()) && node.length <= 10) {
                nodes.add(node);
                console.log('🔍 [代码解析] 可能的节点:', node);
              }
            });
          }
        }
      }

      console.log('🔍 [代码解析] 解析完成');
      console.log('🔍 [代码解析] 发现节点:', Array.from(nodes));
      console.log('🔍 [代码解析] 发现边:', edges);
      console.log('🔍 [代码解析] 邻接表:', Object.fromEntries(adjacencyList));

      return { nodes, edges, adjacencyList };

    } catch (error) {
      console.error('🔍 [代码解析] 解析Mermaid代码时出错:', error);
      return { nodes: new Set(), edges: [], adjacencyList: new Map() };
    }
  }, []);

  // 获取节点关系数据
  const getNodeRelations = useCallback(() => {
    if (!nodeRelationsRef.current && code) {
      console.log('🔍 [节点关系] 构建节点关系缓存');
      nodeRelationsRef.current = parseMermaidCode(code);
    }
    return nodeRelationsRef.current || { nodes: new Set(), edges: [], adjacencyList: new Map() };
  }, [code, parseMermaidCode]);

  // 清理节点关系缓存当代码变化时
  useEffect(() => {
    nodeRelationsRef.current = null;
    console.log('🔍 [节点关系] 清理缓存，代码已变化');
  }, [code]);

  // 基于代码解析查找子节点
  const findChildNodes = useCallback((nodeId) => {
    const relations = getNodeRelations();
    const children = relations.adjacencyList.get(nodeId) || [];
    
    console.log('🔍 [子节点查找] 节点', nodeId, '的直接子节点:', children);
    return children;
  }, [getNodeRelations]);

  // 基于代码解析构建逻辑链条
  const findLogicalChain = useCallback((startNodeId) => {
    const relations = getNodeRelations();
    const visited = new Set();
    const chain = [];
    let currentNode = startNodeId;
    const maxNodes = 6; // 最多6个节点

    console.log('🔗 [逻辑链条] 开始构建链条，起始节点:', startNodeId);

    while (currentNode && !visited.has(currentNode) && chain.length < maxNodes) {
      visited.add(currentNode);
      chain.push(currentNode);
      
      console.log('🔗 [逻辑链条] 添加节点到链条:', currentNode);

      // 获取当前节点的子节点
      const children = relations.adjacencyList.get(currentNode) || [];
      
      if (children.length === 0) {
        // 没有子节点，链条结束
        console.log('🔗 [逻辑链条] 节点无子节点，链条结束');
        break;
      } else if (children.length === 1) {
        // 只有一个子节点，继续链条
        currentNode = children[0];
        console.log('🔗 [逻辑链条] 单子节点，继续链条:', currentNode);
      } else {
        // 多个子节点，根据策略决定是否继续
        console.log('🔗 [逻辑链条] 多子节点情况:', children);
        
        // 简单策略：多子节点时停止，因为这通常表示分支
        console.log('🔗 [逻辑链条] 遇到分支，停止链条构建');
        break;
      }

      // 安全检查：防止意外的无限循环
      if (chain.length >= maxNodes) {
        console.log('🔗 [逻辑链条] 达到最大节点数，停止构建');
        break;
      }
    }

    console.log('🔗 [逻辑链条] 最终链条:', chain);
    return chain;
  }, [getNodeRelations]);

  // 创建节点ID映射，将SVG中的节点ID映射到代码中的节点ID
  const createNodeIdMapping = useCallback(() => {
    if (!containerRef.current) return new Map();

    const mapping = new Map(); // SVG节点ID -> 代码节点ID
    const relations = getNodeRelations();
    const codeNodeIds = Array.from(relations.nodes);

    try {
      const svg = containerRef.current.querySelector('svg');
      if (!svg) return mapping;

      // 查找SVG中的所有节点元素
      const svgNodes = svg.querySelectorAll('g[class*="node"], g[data-id], g[id]');
      
      console.log('🔗 [节点映射] SVG节点数量:', svgNodes.length);
      console.log('🔗 [节点映射] 代码节点ID:', codeNodeIds);

      for (const svgNode of svgNodes) {
        // 获取SVG节点的各种可能ID
        const svgNodeId = svgNode.getAttribute('data-id') || 
                         svgNode.getAttribute('id') || 
                         svgNode.className.baseVal || '';

        // 尝试匹配代码中的节点ID
        let matchedCodeNodeId = null;

        // 1. 直接匹配
        if (codeNodeIds.includes(svgNodeId)) {
          matchedCodeNodeId = svgNodeId;
        } else {
          // 2. 从SVG节点ID中提取可能的代码节点ID
          const extractedIds = [];
          
          // 从类名中提取 (如: "node-A1" -> "A1")
          if (svgNodeId.includes('node')) {
            const match = svgNodeId.match(/node-?([A-Za-z0-9_]+)/);
            if (match) {
              extractedIds.push(match[1]);
            }
          }
          
          // 从ID中提取 (如: "flowchart-A1-123" -> "A1")
          const idMatches = svgNodeId.match(/[A-Za-z][A-Za-z0-9_]*/g);
          if (idMatches) {
            extractedIds.push(...idMatches);
          }

          // 尝试匹配提取的ID
          for (const extractedId of extractedIds) {
            if (codeNodeIds.includes(extractedId)) {
              matchedCodeNodeId = extractedId;
              break;
            }
          }

          // 3. 模糊匹配 (如果直接匹配失败)
          if (!matchedCodeNodeId) {
            for (const codeNodeId of codeNodeIds) {
              if (svgNodeId.includes(codeNodeId) || codeNodeId.includes(svgNodeId)) {
                matchedCodeNodeId = codeNodeId;
                break;
              }
            }
          }
        }

        if (matchedCodeNodeId) {
          mapping.set(svgNodeId, matchedCodeNodeId);
          console.log('🔗 [节点映射] 映射:', svgNodeId, '->', matchedCodeNodeId);
        } else {
          console.log('🔗 [节点映射] 未匹配:', svgNodeId);
        }
      }

      console.log('🔗 [节点映射] 完成，映射数量:', mapping.size);
      return mapping;

    } catch (error) {
      console.error('🔗 [节点映射] 创建节点映射时出错:', error);
      return new Map();
    }
  }, [getNodeRelations]);

  // 将SVG节点ID转换为代码节点ID
  const mapSvgNodeIdToCodeNodeId = useCallback((svgNodeId) => {
    const mapping = createNodeIdMapping();
    const codeNodeId = mapping.get(svgNodeId);
    
    if (codeNodeId) {
      console.log('🔗 [节点映射] SVG节点', svgNodeId, '映射到代码节点', codeNodeId);
      return codeNodeId;
    }

    // 如果没有找到映射，尝试直接返回可能的节点ID
    console.log('🔗 [节点映射] 未找到映射，尝试直接使用:', svgNodeId);
    return svgNodeId;
  }, [createNodeIdMapping]);

  // 调试函数：显示解析的节点关系
  const debugNodeRelations = useCallback(() => {
    const relations = getNodeRelations();
    console.log('🔍 [调试信息] ===== 节点关系调试 =====');
    console.log('🔍 [调试信息] 发现的节点:', Array.from(relations.nodes));
    console.log('🔍 [调试信息] 发现的边:', relations.edges);
    console.log('🔍 [调试信息] 邻接表:');
    
    relations.adjacencyList.forEach((children, parent) => {
      console.log(`🔍 [调试信息]   ${parent} -> [${children.join(', ')}]`);
    });
    
    console.log('🔍 [调试信息] ===========================');
    
    // 测试每个节点的逻辑链条
    relations.nodes.forEach(nodeId => {
      const chain = findLogicalChain(nodeId);
      console.log(`🔍 [调试信息] 节点 ${nodeId} 的逻辑链条:`, chain);
    });
  }, [getNodeRelations, findLogicalChain]);

  // 在代码变化时输出调试信息
  useEffect(() => {
    if (code && hasRendered) {
      // 延迟执行，确保DOM已经渲染完成
      setTimeout(() => {
        debugNodeRelations();
      }, 1000);
    }
  }, [code, hasRendered, debugNodeRelations]);

  // 安全的状态更新函数
  const safeSetState = useCallback((setter, value) => {
    try {
      setter(value);
    } catch (error) {
      console.warn('状态更新失败:', error);
    }
  }, []);

  // 安全的DOM操作函数
  const safeDOMOperation = useCallback((operation) => {
    if (containerRef.current) {
      try {
        return operation();
      } catch (error) {
        console.warn('DOM operation failed:', error);
        return false;
      }
    }
    return false;
  }, []);

  // 缩放控制函数
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.3));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.3, Math.min(3, prev * delta)));
  }, []);

  // 拖拽开始
  const handleMouseDown = useCallback((e) => {
    // 检查是否点击的是节点元素
    const target = e.target;
    const isNodeElement = target.closest('g[class*="node"], g[data-id], g[id]');
    
    // 如果点击的是节点，不启动拖拽
    if (isNodeElement) {
      console.log('🖱️ [拖拽处理] 点击的是节点，不启动拖拽');
      return;
    }

    if (e.button === 0) { // 左键
      e.preventDefault(); // 防止默认拖拽行为
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  }, [position]);

  // 创建事件处理函数
  useEffect(() => {
    handleMouseMoveRef.current = (e) => {
      if (isDragging && e) {
        e.preventDefault && e.preventDefault();
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        // 存储待更新的位置
        pendingPosition.current = { x: newX, y: newY };
        
        // 如果还没有安排更新，则安排一个
        if (!dragAnimationFrame.current) {
          dragAnimationFrame.current = requestAnimationFrame(() => {
            if (pendingPosition.current) {
              setPosition(pendingPosition.current);
              pendingPosition.current = null;
            }
            dragAnimationFrame.current = null;
          });
        }
      }
    };

    handleMouseUpRef.current = (e) => {
      e && e.preventDefault && e.preventDefault();
      setIsDragging(false);
      // 清理待处理的动画帧
      if (dragAnimationFrame.current) {
        cancelAnimationFrame(dragAnimationFrame.current);
        dragAnimationFrame.current = null;
      }
      // 如果有待处理的位置更新，立即应用
      if (pendingPosition.current) {
        setPosition(pendingPosition.current);
        pendingPosition.current = null;
      }
    };
  }, [isDragging, dragStart]);

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
      } catch (error) {
        // 静默处理清理错误，避免影响应用运行
        console.warn('清理事件监听器时出错:', error);
      }
    };
  }, [isDragging]);

  // 检查DOM环境是否完全可用
  const checkDOMEnvironment = useCallback(() => {
    try {
      // 基本DOM检查
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        console.warn('DOM环境不可用');
        return false;
      }

      // 检查关键的DOM API
      const requiredAPIs = [
        'createElementNS',
        'createElement',
        'querySelector',
        'querySelectorAll'
      ];

      for (const api of requiredAPIs) {
        if (!document[api]) {
          console.warn(`DOM API ${api} 不可用`);
          return false;
        }
      }

      // 检查SVG支持
      try {
        const testSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        if (!testSvg) {
          console.warn('SVG创建失败');
          return false;
        }
      } catch (e) {
        console.warn('SVG支持检查失败:', e);
        return false;
      }

      // 检查文档状态
      if (document.readyState === 'loading') {
        console.warn('文档仍在加载中');
        return false;
      }

      console.log('DOM环境检查通过');
      return true;
    } catch (error) {
      console.error('DOM环境检查异常:', error);
      return false;
    }
  }, []);

  // 初始化DOM检查
  useEffect(() => {
    const initDOM = () => {
      if (checkDOMEnvironment()) {
        setDomReady(true);
        // 注入自定义CSS样式
        try {
          injectStyles();
          console.log('Mermaid自定义样式已注入');
        } catch (error) {
          console.warn('注入自定义样式失败:', error);
        }
      } else {
        // 如果DOM还没准备好，稍后重试
        const retryTimeout = setTimeout(() => {
          if (checkDOMEnvironment()) {
            setDomReady(true);
            // 注入自定义CSS样式
            try {
              injectStyles();
              console.log('Mermaid自定义样式已注入');
            } catch (error) {
              console.warn('注入自定义样式失败:', error);
            }
          }
        }, 100);
        
        return () => clearTimeout(retryTimeout);
      }
    };

    // 立即检查
    initDOM();

    // 监听DOM加载完成事件
    const handleDOMContentLoaded = () => {
      setTimeout(() => {
        if (checkDOMEnvironment()) {
          setDomReady(true);
          // 注入自定义CSS样式
          try {
            injectStyles();
            console.log('Mermaid自定义样式已注入');
          } catch (error) {
            console.warn('注入自定义样式失败:', error);
          }
        }
      }, 50);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
      return () => document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
    }
  }, [checkDOMEnvironment]);

  // 节点点击处理函数
  const handleNodeClick = useCallback((nodeId) => {
    console.log('🖱️ [节点点击] 节点被点击:', nodeId);
    
    if (onNodeClick && typeof onNodeClick === 'function') {
      console.log('🖱️ [节点点击] 调用回调函数');
      try {
        // 将SVG节点ID转换为代码节点ID
        const codeNodeId = mapSvgNodeIdToCodeNodeId(nodeId);
        console.log('🖱️ [节点点击] 映射后的代码节点ID:', codeNodeId);
        onNodeClick(codeNodeId);
      } catch (error) {
        console.error('🖱️ [节点点击] 回调函数执行出错:', error);
      }
    } else {
      console.log('🖱️ [节点点击] 未提供回调函数');
    }
  }, [onNodeClick, mapSvgNodeIdToCodeNodeId]);

  // 设置节点点击事件监听器
  const setupNodeClickListeners = useCallback(() => {
    if (!containerRef.current) {
      console.log('🖱️ [节点监听器] 容器不存在，跳过设置');
      return;
    }

    try {
      const svg = containerRef.current.querySelector('svg');
      if (!svg) {
        console.log('🖱️ [节点监听器] SVG元素不存在，跳过设置');
        return;
      }

      // 查找所有节点元素
      const nodeElements = svg.querySelectorAll('g[class*="node"], g[data-id], g[id]');
      console.log('🖱️ [节点监听器] 找到节点元素数量:', nodeElements.length);

      // 为每个节点添加点击监听器
      nodeElements.forEach((nodeElement, index) => {
        // 移除之前的监听器（如果存在）
        nodeElement.removeEventListener('click', nodeElement._nodeClickHandler);
        
        // 获取节点ID
        const nodeId = nodeElement.getAttribute('data-id') || 
                      nodeElement.getAttribute('id') || 
                      nodeElement.className.baseVal || 
                      `node-${index}`;

        // 创建点击处理函数
        const clickHandler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🖱️ [节点监听器] 节点点击事件触发:', nodeId);
          handleNodeClick(nodeId);
        };

        // 保存处理函数引用以便后续移除
        nodeElement._nodeClickHandler = clickHandler;
        
        // 添加点击监听器
        nodeElement.addEventListener('click', clickHandler, { passive: false });
        
        console.log('🖱️ [节点监听器] 为节点添加点击监听器:', nodeId);
      });

      console.log('🖱️ [节点监听器] 节点点击监听器设置完成');
    } catch (error) {
      console.error('🖱️ [节点监听器] 设置节点点击监听器时出错:', error);
    }
  }, [handleNodeClick]);

  // 清理节点点击事件监听器
  const cleanupNodeClickListeners = useCallback(() => {
    if (!containerRef.current) return;

    try {
      const svg = containerRef.current.querySelector('svg');
      if (!svg) return;

      const nodeElements = svg.querySelectorAll('g[class*="node"], g[data-id], g[id]');
      nodeElements.forEach(nodeElement => {
        if (nodeElement._nodeClickHandler) {
          nodeElement.removeEventListener('click', nodeElement._nodeClickHandler);
          delete nodeElement._nodeClickHandler;
        }
      });

      console.log('🖱️ [节点监听器] 节点点击监听器清理完成');
    } catch (error) {
      console.error('🖱️ [节点监听器] 清理节点点击监听器时出错:', error);
    }
  }, []);

  // 渲染图表
  const renderDiagram = useCallback(async () => {
    if (!code || isRendering || !domReady) {
      console.log('跳过渲染:', { hasCode: !!code, isRendering, domReady });
      return;
    }

    // 检查容器是否存在，如果不存在则延迟重试
    if (!containerRef.current) {
      console.log('容器未挂载，延迟重试...');
      setTimeout(() => {
        if (containerRef.current) {
          renderDiagram();
        }
      }, 100);
      return;
    }

    console.log('开始渲染Mermaid图表...');
    console.log('代码预览:', code.substring(0, 100) + (code.length > 100 ? '...' : ''));

    // 清理之前的点击监听器
    cleanupNodeClickListeners();

    safeSetState(setIsRendering, true);
    safeSetState(setError, null);
    safeSetState(setHasRendered, false);

    // 设置超时
    const timeoutId = setTimeout(() => {
      console.error('渲染超时，强制停止');
      safeSetState(setIsRendering, false);
      safeSetState(setError, '渲染超时，请重试');
    }, 15000); // 15秒超时

    try {
      // 再次确认DOM环境
      if (!checkDOMEnvironment()) {
        throw new Error('DOM环境检查失败');
      }

      // 初始化Mermaid配置（只初始化一次）
      if (!mermaidInitialized) {
        console.log('初始化Mermaid配置...');
        
        // 确保mermaid对象可用
        if (!mermaid || !mermaid.initialize) {
          throw new Error('Mermaid库未正确加载');
        }

        // 重置Mermaid状态
        try {
          mermaid.mermaidAPI.reset && mermaid.mermaidAPI.reset();
        } catch (resetError) {
          console.warn('Mermaid重置失败，继续初始化:', resetError);
        }

        // 配置Mermaid
        const config = {
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
          logLevel: 'error',
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: 'basis'
          },
          mindmap: {
            useMaxWidth: false,
            padding: 20
          },
          // 添加更多配置以确保兼容性
          deterministicIds: false,
          suppressErrorRendering: false,
          // 确保正确的DOM访问
          htmlLabels: true,
          wrap: false
        };

        mermaid.initialize(config);
        
        // 验证初始化是否成功
        if (!mermaid.mermaidAPI) {
          throw new Error('Mermaid API初始化失败');
        }

        setMermaidInitialized(true);
        console.log('Mermaid初始化完成');
      }

      // 检查容器是否存在
      if (!containerRef.current) {
        throw new Error('图表容器不存在');
      }

      // 清空容器
      containerRef.current.innerHTML = '';
      console.log('容器已清空');

      // 检查语法（可选，如果失败就跳过）
      try {
        console.log('检查语法...');
        await mermaid.parse(code);
        console.log('语法检查通过');
      } catch (parseError) {
        console.warn('语法检查失败，尝试直接渲染:', parseError.message);
      }

      // 渲染图表
      console.log('开始渲染图表...');
      const renderResult = await mermaid.render(diagramId, code);
      console.log('渲染完成，结果:', renderResult ? '有数据' : '无数据');
      
      // 检查组件是否仍然存在
      if (!containerRef.current) {
        console.log('容器不存在，停止渲染');
        return;
      }

      if (renderResult && renderResult.svg) {
        console.log('处理SVG结果...');
        // 直接插入SVG，避免复杂的DOM操作
        containerRef.current.innerHTML = renderResult.svg;
        
        const svgElement = containerRef.current.querySelector('svg');
        if (svgElement) {
          console.log('SVG元素找到，设置基础样式...');
          // 只设置必要的SVG基础样式
          svgElement.style.maxWidth = 'none';
          svgElement.style.height = 'auto';
          svgElement.style.userSelect = 'none';
          svgElement.style.cursor = isDragging ? 'grabbing' : 'grab';
          svgElement.style.display = 'block';
          
          console.log('SVG基础样式已设置，其余样式由CSS控制');
          
          // 强制重新注入样式，确保样式应用到新渲染的SVG
          setTimeout(() => {
            console.log('🔄 强制重新注入样式');
            injectStyles();
          }, 50);
          
          // 设置节点点击监听器
          setTimeout(() => {
            console.log('🖱️ [渲染完成] 设置节点点击监听器');
            setupNodeClickListeners();
          }, 100);
          
          safeSetState(setHasRendered, true);
        } else {
          console.log('SVG元素未找到');
          throw new Error('SVG元素未找到');
        }
      } else {
        throw new Error('渲染结果为空');
      }

    } catch (error) {
      console.error('主渲染方法失败:', error);
      
      // 如果标准方法失败，尝试fallback方法
      if (containerRef.current && mermaidInitialized) {
        try {
          console.log('尝试fallback渲染方法...');
          
          // 检查mermaidAPI是否可用
          if (!mermaid.mermaidAPI || !mermaid.mermaidAPI.render) {
            throw new Error('MermaidAPI不可用');
          }
          
          // 使用回调方式渲染
          const fallbackPromise = new Promise((resolve, reject) => {
            const fallbackTimeout = setTimeout(() => {
              reject(new Error('Fallback渲染超时'));
            }, 10000);

            try {
              mermaid.mermaidAPI.render(
                diagramId + '_fallback',
                code,
                (svg) => {
                  clearTimeout(fallbackTimeout);
                  if (containerRef.current && svg) {
                    console.log('Fallback渲染成功');
                    containerRef.current.innerHTML = svg;
                    
                    const svgElement = containerRef.current.querySelector('svg');
                    if (svgElement) {
                      svgElement.style.maxWidth = 'none';
                      svgElement.style.height = 'auto';
                      svgElement.style.userSelect = 'none';
                      svgElement.style.cursor = isDragging ? 'grabbing' : 'grab';
                      
                      console.log('Fallback: SVG基础样式已设置');
                      
                      // 强制重新注入样式，确保样式应用到新渲染的SVG
                      setTimeout(() => {
                        console.log('🔄 Fallback: 强制重新注入样式');
                        injectStyles();
                      }, 50);

                      // Fallback渲染后也设置节点点击监听器
                      setTimeout(() => {
                        console.log('🖱️ [Fallback渲染完成] 设置节点点击监听器');
                        setupNodeClickListeners();
                      }, 100);
                    }
                    
                    safeSetState(setHasRendered, true);
                    resolve(svg);
                  } else {
                    reject(new Error('Fallback结果为空'));
                  }
                },
                containerRef.current
              );
            } catch (apiError) {
              clearTimeout(fallbackTimeout);
              reject(apiError);
            }
          });

          await fallbackPromise;
        } catch (fallbackError) {
          console.error('Fallback渲染也失败:', fallbackError);
          safeSetState(setError, fallbackError.message || error.message || '图表渲染失败');
        }
      } else {
        safeSetState(setError, error.message || '图表渲染失败');
      }
    } finally {
      clearTimeout(timeoutId);
      console.log('渲染流程结束');
      safeSetState(setIsRendering, false);
    }
  }, [code, isRendering, domReady, diagramId, safeSetState, isDragging, mermaidInitialized, checkDOMEnvironment, cleanupNodeClickListeners, setupNodeClickListeners]);

  // 监听代码变化重新渲染
  useEffect(() => {
    if (code && !isRendering && domReady) {
      // 延迟执行，确保DOM已准备好
      const timeoutId = setTimeout(() => {
        renderDiagram();
      }, 100); // 减少延迟时间，因为已经有了DOM准备检查
      
      return () => clearTimeout(timeoutId);
    }
  }, [code, domReady, renderDiagram]);

  // 复制代码功能
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      safeSetState(setCopied, true);
      toast.success('Mermaid代码已复制到剪贴板');
      
      // 清理之前的timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      
      // 设置新的timeout
      copyTimeoutRef.current = setTimeout(() => safeSetState(setCopied, false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('复制失败，请手动复制');
    }
  }, [code, safeSetState]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      // 清理防抖定时器
      if (moveDebounceTimer.current) {
        clearTimeout(moveDebounceTimer.current);
      }
      // 清理节点点击监听器
      cleanupNodeClickListeners();
      // 重置动画状态
      isAnimating.current = false;
    };
  }, [cleanupNodeClickListeners]);

  // 计算包含节点及其子节点的最优视图位置
  const calculateOptimalViewForNodes = useCallback((nodeIds) => {
    if (!containerRef.current || !parentContainerRef.current || nodeIds.length === 0) {
      return null;
    }

    try {
      const containerBounds = parentContainerRef.current.getBoundingClientRect();
      const nodes = [];

      // 收集所有节点的位置信息
      for (const nodeId of nodeIds) {
        const selectors = [
          `[data-id="${nodeId}"]`,
          `#${nodeId}`,
          `.node-${nodeId}`,
          `[id*="${nodeId}"]`,
          `[class*="${nodeId}"]`
        ];
        
        let targetNode = null;
        for (const selector of selectors) {
          const foundNodes = containerRef.current.querySelectorAll(selector);
          if (foundNodes.length > 0) {
            targetNode = foundNodes[0];
            break;
          }
        }

        if (targetNode) {
          const nodeBounds = targetNode.getBoundingClientRect();
          nodes.push({
            id: nodeId,
            bounds: nodeBounds,
            relativeLeft: nodeBounds.left - containerBounds.left,
            relativeRight: nodeBounds.right - containerBounds.left,
            relativeTop: nodeBounds.top - containerBounds.top,
            relativeBottom: nodeBounds.bottom - containerBounds.top
          });
        }
      }

      if (nodes.length === 0) {
        return null;
      }

      // 计算所有节点的边界框
      const minLeft = Math.min(...nodes.map(n => n.relativeLeft));
      const maxRight = Math.max(...nodes.map(n => n.relativeRight));
      const minTop = Math.min(...nodes.map(n => n.relativeTop));
      const maxBottom = Math.max(...nodes.map(n => n.relativeBottom));

      const groupWidth = maxRight - minLeft;
      const groupHeight = maxBottom - minTop;

      console.log('🎯 [节点组视图] 节点组边界:', { minLeft, maxRight, minTop, maxBottom });
      console.log('🎯 [节点组视图] 节点组尺寸:', { groupWidth, groupHeight });

      // 设置边距
      const margin = 60;
      const containerWidth = containerBounds.width;
      const containerHeight = containerBounds.height;

      // 检查是否已经完全可见
      const isGroupFullyVisible = (
        minLeft >= margin &&
        maxRight <= containerWidth - margin &&
        minTop >= margin &&
        maxBottom <= containerHeight - margin
      );

      if (isGroupFullyVisible) {
        console.log('🎯 [节点组视图] 节点组已完全可见');
        return null;
      }

      // 计算需要的移动距离
      let deltaX = 0;
      let deltaY = 0;

      // 水平方向调整
      if (minLeft < margin) {
        deltaX = margin - minLeft;
      } else if (maxRight > containerWidth - margin) {
        deltaX = (containerWidth - margin) - maxRight;
      }

      // 垂直方向调整
      if (minTop < margin) {
        deltaY = margin - minTop;
      } else if (maxBottom > containerHeight - margin) {
        deltaY = (containerHeight - margin) - maxBottom;
      }

      console.log('🎯 [节点组视图] 计算的移动距离:', { deltaX, deltaY });

      return { deltaX, deltaY };

    } catch (error) {
      console.error('🎯 [节点组视图] 计算最优视图时出错:', error);
      return null;
    }
  }, []);

  // 实际执行节点移动的函数
  const performNodeMove = useCallback((nodeId) => {
    if (!containerRef.current || !parentContainerRef.current) {
      return;
    }

    try {
      console.log('🎯 [节点可见性] 开始确保节点可见:', nodeId);
      
      // 将SVG节点ID转换为代码节点ID
      const codeNodeId = mapSvgNodeIdToCodeNodeId(nodeId);
      console.log('🎯 [节点可见性] 映射后的代码节点ID:', codeNodeId);
      
      // 基于代码解析查找子节点
      const childNodes = findChildNodes(codeNodeId);
      console.log('🎯 [节点可见性] 发现直接子节点:', childNodes);

      // 查找完整的逻辑链条
      const logicalChain = findLogicalChain(codeNodeId);
      console.log('🎯 [节点可见性] 完整逻辑链条:', logicalChain);

      // 确定需要确保可见的节点列表
      let nodesToShow = [codeNodeId];
      
      // 智能决策：包含逻辑链条中的节点
      if (childNodes.length > 0) {
        // 简化逻辑：只包含有限的链条节点
        if (logicalChain.length <= 4) { // 减少到最多4个节点
          nodesToShow = logicalChain;
          console.log('🎯 [节点可见性] 包含逻辑链条:', logicalChain.length, '个节点');
        } else {
          // 如果链条太长，只包含前3个节点
          nodesToShow = logicalChain.slice(0, 3);
          console.log('🎯 [节点可见性] 链条过长，只包含前3个节点');
        }
      } else {
        console.log('🎯 [节点可见性] 无子节点，只显示主节点');
      }

      // 创建节点映射以便在DOM中查找对应的SVG节点
      const nodeMapping = createNodeIdMapping();
      const reversedMapping = new Map(); // 代码节点ID -> SVG节点ID
      nodeMapping.forEach((codeId, svgId) => {
        reversedMapping.set(codeId, svgId);
      });

      // 将代码节点ID转换回SVG节点ID进行DOM操作
      const svgNodesToShow = nodesToShow.map(codeId => {
        const svgId = reversedMapping.get(codeId);
        if (svgId) {
          console.log('🎯 [节点可见性] 代码节点', codeId, '映射到SVG节点', svgId);
          return svgId;
        }
        // 如果没有找到映射，尝试直接使用代码节点ID
        console.log('🎯 [节点可见性] 未找到映射，直接使用代码节点ID:', codeId);
        return codeId;
      });

      console.log('🎯 [节点可见性] 最终需要显示的SVG节点:', svgNodesToShow);

      // 计算最优视图位置
      const optimalView = calculateOptimalViewForNodes(svgNodesToShow);
      
      if (!optimalView) {
        console.log('🎯 [节点可见性] 节点已在最优位置');
        return;
      }

      const { deltaX, deltaY } = optimalView;

      // 如果移动距离很小，就不移动了
      if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) {
        console.log('🎯 [节点可见性] 移动距离极小，无需调整');
        return;
      }

      // 计算目标位置
      const targetX = position.x + deltaX;
      const targetY = position.y + deltaY;

      console.log('🎯 [节点可见性] 计算结果 - 当前位置:', position);
      console.log('🎯 [节点可见性] 计算结果 - 目标位置:', { targetX, targetY });
      console.log('🎯 [节点可见性] 计算结果 - 移动距离:', { deltaX, deltaY });

      // 标记动画开始
      isAnimating.current = true;
      lastMoveTime.current = Date.now();
      lastMovedNode.current = nodeId;

      // 使用更平滑的动画
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const duration = Math.min(600, Math.max(300, distance * 1.5));
      const startTime = Date.now();
      const startPosition = { ...position };

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用更平滑的缓动函数 (ease-out-quart)
        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
        const easeProgress = easeOutQuart(progress);

        const currentX = startPosition.x + (targetX - startPosition.x) * easeProgress;
        const currentY = startPosition.y + (targetY - startPosition.y) * easeProgress;

        setPosition({ x: currentX, y: currentY });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log('🎯 [节点可见性] 动画完成，最终位置:', { x: currentX, y: currentY });
          isAnimating.current = false; // 标记动画结束
        }
      };

      requestAnimationFrame(animate);

    } catch (error) {
      console.error('🎯 [节点可见性] 确保节点可见时出错:', error);
      isAnimating.current = false; // 出错时也要重置动画状态
    }
  }, [scale, position, findChildNodes, findLogicalChain, calculateOptimalViewForNodes, mapSvgNodeIdToCodeNodeId, createNodeIdMapping]);

  // 确保节点完整显示在可视区域内的函数 - 带防抖
  const ensureNodeVisible = useCallback((nodeId) => {
    if (!containerRef.current || !parentContainerRef.current) {
      console.warn('🎯 [节点可见性] 容器引用不存在');
      return;
    }

    // 防抖检查
    const now = Date.now();
    const timeSinceLastMove = now - lastMoveTime.current;
    const minInterval = 200; // 最小移动间隔
    const isSameNode = lastMovedNode.current === nodeId;

    // 如果正在进行动画，跳过
    if (isAnimating.current) {
      console.log('🎯 [节点可见性] 动画进行中，跳过移动');
      return;
    }

    // 只对同一个节点进行严格的时间检查
    if (isSameNode && timeSinceLastMove < minInterval) {
      console.log('🎯 [节点可见性] 同一节点移动间隔太短，跳过移动');
      return;
    }

    // 清除之前的防抖定时器
    if (moveDebounceTimer.current) {
      clearTimeout(moveDebounceTimer.current);
    }

    // 如果是不同节点，立即执行；如果是同一节点，稍微延迟
    const debounceDelay = isSameNode ? 50 : 10;
    
    moveDebounceTimer.current = setTimeout(() => {
      performNodeMove(nodeId);
    }, debounceDelay);
  }, [performNodeMove]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    ensureNodeVisible,
    handleNodeClick,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    reset: handleReset
  }), [ensureNodeVisible, handleNodeClick, handleZoomIn, handleZoomOut, handleReset]);

  if (!code) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-gray-500">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>暂无思维导图数据</p>
        </div>
      </div>
    );
  }

  // DOM环境未准备好时显示加载状态
  if (!domReady) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">正在初始化渲染环境...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentContainerRef} className="relative h-full bg-gray-50 overflow-hidden">
      {/* 控制工具栏 */}
      <div className="absolute top-2 right-2 z-10 flex space-x-1 bg-white rounded-lg shadow-sm border p-1">
        <button
          onClick={handleZoomIn}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="放大"
        >
          <ZoomIn className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={handleReset}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="重置视图"
        >
          <RotateCcw className="w-4 h-4 text-gray-600" />
        </button>
        <div className="w-px bg-gray-300 mx-1"></div>
        <button
          onClick={handleCopyCode}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="复制代码"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-600" />
          )}
        </button>
      </div>

      {/* 缩放比例显示 */}
      <div className="absolute bottom-2 right-2 z-10 bg-white rounded px-2 py-1 shadow-sm border text-xs text-gray-600">
        {Math.round(scale * 100)}%
      </div>

      {/* 拖拽提示 */}
      {!isDragging && hasRendered && (
        <div className="absolute bottom-2 left-2 z-10 bg-white rounded px-2 py-1 shadow-sm border text-xs text-gray-500 flex items-center">
          <Move className="w-3 h-3 mr-1" />
          拖拽移动 | 滚轮缩放
        </div>
      )}

      {/* 节点点击提示 */}
      {!isDragging && hasRendered && onNodeClick && (
        <div className="absolute bottom-8 left-2 z-10 bg-white rounded px-2 py-1 shadow-sm border text-xs text-gray-500 flex items-center">
          🖱️ 点击节点跳转到对应文本
        </div>
      )}

      {/* 图表容器 */}
      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
      >
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75 z-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">正在渲染图表...</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="text-center text-red-600 p-4">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="font-medium mb-1">渲染失败</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={renderDiagram}
              className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
            >
              重试
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="mermaid"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              cursor: isDragging ? 'grabbing' : 'grab',
              willChange: 'transform', // 提示浏览器优化transform性能
              transition: isDragging ? 'none' : 'transform 0.1s ease-out' // 拖拽时禁用transition，停止时启用
            }}
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
    </div>
  );
});

MermaidDiagram.displayName = 'MermaidDiagram';

export default MermaidDiagram; 