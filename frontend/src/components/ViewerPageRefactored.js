import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, EyeOff, FileText, File, Bot } from 'lucide-react';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import FlowDiagram from './FlowDiagram';
import ThemeToggle from './ThemeToggle';

// 导入自定义hooks
import { useDocumentViewer } from '../hooks/useDocumentViewer';
import { useMindmapGeneration } from '../hooks/useMindmapGeneration';
import { usePanelResize } from '../hooks/usePanelResize';

import { useScrollDetection } from '../hooks/useScrollDetection';

// 导入UI组件
import TableOfContents from './TableOfContents';
import PDFViewer from './PDFViewer';

import { StructuredMarkdownRenderer, DemoModeRenderer } from './DocumentRenderer';

// 导入API函数
import { addNode, handleApiError } from '../utils/api';

const ViewerPageRefactored = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const mermaidDiagramRef = useRef(null);
  
  const [showToc, setShowToc] = useState(false);

  // 添加contentChunks ref
  const contentChunks = useRef([]);

  // 使用文档查看器 hook
  const {
    documentId,
    document,
    setDocument,
    loading,
    error: documentError,
    viewMode,
    setViewMode,
    isPdfFile,
    toc,
    expandedTocItems,
    toggleTocItem,
    loadDocument,
    loadDocumentStructure
  } = useDocumentViewer();

  // 使用思维导图生成 hook
  const {
    demoMindmapStatus,
    startMindmapGeneration,
    handleDownloadMarkdown,
    handleDownloadMermaid,
    handleOpenMermaidEditor,
    MindmapStatusDisplay
  } = useMindmapGeneration(documentId, document, setDocument);

  // 使用面板拖拽 hook
  const {
    tocPanelWidth,
    leftPanelWidth,
    isDragging,
    handleMouseDown
  } = usePanelResize();

  // 使用滚动检测 hook
  const {
    activeChunkId,
    activeContentBlockId, // 添加段落级状态
    contentChunks: scrollChunks,
    handleSectionRef,
    handleContentBlockRef,
    scrollToSection,
    scrollToContentBlock,
    highlightParagraph,
    highlightMermaidNode,
    updateDynamicMapping,
    dynamicMapping,
    textToNodeMap, // 添加静态映射关系
    setActiveContentBlockId // 🔑 添加状态设置函数
  } = useScrollDetection(
    containerRef,
    documentId,
    'argument', // 论证结构分析模式
    mermaidDiagramRef
  );

  // 计算当前需要高亮的节点ID
  const highlightedNodeId = useMemo(() => {
    if (!activeContentBlockId) {
      return null;
    }

    // 优先使用动态映射，如果没有则使用静态映射
    const hasDynamicMapping = Object.keys(dynamicMapping.textToNodeMap).length > 0;
    const currentMapping = hasDynamicMapping ? dynamicMapping.textToNodeMap : textToNodeMap;
    
    const mappedNodeId = currentMapping[activeContentBlockId];
    
    console.log('🎯 [高亮计算] 活跃段落:', activeContentBlockId);
    console.log('🎯 [高亮计算] 使用映射类型:', hasDynamicMapping ? '动态' : '静态');
    console.log('🎯 [高亮计算] 映射结果:', mappedNodeId);
    
    return mappedNodeId || null;
  }, [activeContentBlockId, dynamicMapping.textToNodeMap, textToNodeMap]);

  // 处理节点点击事件
  const handleNodeClick = useCallback((nodeId) => {
    console.log('🖱️ [父组件] 接收到节点点击事件:', nodeId);
    
    // 🔑 方案1：点击只负责导航，不负责高亮
    // 高亮由滚动检测系统统一管理，确保状态一致
    console.log('🖱️ [点击导航] 滚动到对应文本块，高亮由滚动检测自动处理');
    
    // 滚动到对应文本块，滚动完成后滚动检测会自动处理高亮
    scrollToContentBlock(nodeId);
  }, [scrollToContentBlock]);

  // 🔑 新增：处理节点标签更新的回调函数
  const handleNodeLabelUpdate = useCallback((nodeId, newLabel) => {
    console.log('📝 [节点标签更新] 同步更新document状态:', nodeId, '->', newLabel);
    
    // 同步更新document.node_mappings_demo中的对应节点标签
    setDocument(prevDoc => {
      if (!prevDoc || !prevDoc.node_mappings_demo) {
        console.warn('📝 [节点标签更新] document或node_mappings_demo不存在，跳过更新');
        return prevDoc;
      }
      
      const newNodeMappings = { ...prevDoc.node_mappings_demo };
      if (newNodeMappings[nodeId]) {
        newNodeMappings[nodeId] = { 
          ...newNodeMappings[nodeId], 
          text_snippet: newLabel 
        };
        console.log('📝 [节点标签更新] ✅ document状态已同步更新');
      } else {
        console.warn('📝 [节点标签更新] 节点ID在node_mappings中不存在:', nodeId);
      }
      
      return { 
        ...prevDoc, 
        node_mappings_demo: newNodeMappings 
      };
    });
  }, [setDocument]);

  // 创建动态映射的辅助函数
  const createDynamicMapping = useCallback((chunks, mermaidCode, nodeMapping) => {
    console.log('🔗 [映射创建] 开始创建动态映射');
    console.log('🔗 [映射创建] chunks数量:', chunks?.length);
    console.log('🔗 [映射创建] mermaidCode长度:', mermaidCode?.length);
    console.log('🔗 [映射创建] nodeMapping类型:', typeof nodeMapping);
    
    if (!mermaidCode || !nodeMapping) {
      console.warn('🔗 [映射创建] 缺少必要参数，跳过映射创建');
      return;
    }
    
    const newTextToNodeMap = {};
    const newNodeToTextMap = {};
    
    if (nodeMapping && typeof nodeMapping === 'object') {
      console.log('🔗 [映射创建] 基于AI语义块创建段落级映射');
      console.log('🔗 [映射创建] nodeMapping键数量:', Object.keys(nodeMapping).length);
      
      // 为每个AI语义块创建映射
      Object.entries(nodeMapping).forEach(([nodeId, nodeInfo]) => {
        console.log(`🔗 [映射创建] 处理节点 ${nodeId}:`, nodeInfo);
        
        if (nodeInfo && nodeInfo.paragraph_ids && Array.isArray(nodeInfo.paragraph_ids)) {
          console.log(`🔗 [映射创建] 节点 ${nodeId} 包含段落:`, nodeInfo.paragraph_ids);
          
          // 为每个段落创建到节点的映射
          nodeInfo.paragraph_ids.forEach(paraId => {
            if (paraId && typeof paraId === 'string') {
              // 统一段落ID格式
              const paragraphId = paraId.startsWith('para-') ? paraId : `para-${paraId}`;
              
              // 段落到节点的映射（多对一：多个段落可能对应同一个节点）
              newTextToNodeMap[paragraphId] = nodeId;
              
              console.log(`📍 [映射创建] ${paragraphId} -> 节点 ${nodeId}`);
            } else {
              console.warn(`📍 [映射创建] 无效的段落ID:`, paraId);
            }
          });
          
          // 节点到段落组的映射（一对多：一个节点对应多个段落）
          newNodeToTextMap[nodeId] = nodeInfo.paragraph_ids.map(paraId => 
            paraId.startsWith('para-') ? paraId : `para-${paraId}`
          );
          
          console.log(`🔗 [映射创建] 节点 ${nodeId} -> 段落组 [${newNodeToTextMap[nodeId].join(', ')}]`);
        } else {
          console.warn(`🔗 [映射创建] 节点 ${nodeId} 缺少有效的段落ID数组:`, nodeInfo);
        }
      });
      
      console.log('🔗 [映射创建] 映射创建完成');
      console.log('🔗 [映射创建] 段落到节点映射数量:', Object.keys(newTextToNodeMap).length);
      console.log('🔗 [映射创建] 节点到段落映射数量:', Object.keys(newNodeToTextMap).length);
      
      // 调用updateDynamicMapping来更新状态
      updateDynamicMapping(newTextToNodeMap, newNodeToTextMap);
    } else {
      console.warn('🔗 [映射创建] nodeMapping无效，跳过映射创建');
    }
  }, [updateDynamicMapping]);

  // 文档查看区域切换按钮
  const ViewModeToggle = () => {
    if (!isPdfFile) return null;

    return (
      <div className="flex bg-gray-100 dark:bg-gray-700 p-0.5 rounded mb-2">
        <button
          onClick={() => setViewMode('markdown')}
          className={`flex-1 flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
            viewMode === 'markdown'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="h-3 w-3 mr-1" />
          转换后的Markdown
        </button>
        <button
          onClick={() => setViewMode('pdf')}
          className={`flex-1 flex items-center justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
            viewMode === 'pdf'
              ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <File className="h-3 w-3 mr-1" />
          原始PDF文件
        </button>
      </div>
    );
  };

  // 跟踪chunks加载状态
  const [chunksLoaded, setChunksLoaded] = useState(false);

  // 当documentId改变时，重置chunks加载状态
  useEffect(() => {
    setChunksLoaded(false);
    contentChunks.current = []; // 也清空之前的chunks
  }, [documentId]);

  // 在文档加载完成后，加载文档结构和chunks
  useEffect(() => {
    // 只对真实上传的文档（非示例模式）加载结构，且只加载一次
    if (document && !documentId.startsWith('demo-') && document.content && !chunksLoaded) {
      const loadChunks = async () => {
        console.log('📄 [文档加载] 开始加载文档结构和chunks');
        const chunks = await loadDocumentStructure();
        if (chunks && chunks.length > 0) {
          contentChunks.current = chunks;
          setChunksLoaded(true); // 设置chunks加载完成标志
          console.log('📄 [文档加载] 成功设置chunks到contentChunks.current，数量:', chunks.length);
        } else {
          console.log('📄 [文档加载] 没有获取到chunks数据');
        }
      };
      
      loadChunks();
    }
  }, [document, documentId, loadDocumentStructure, chunksLoaded]);

  // 🔑 新增：防止动态映射重复执行的标志
  const mappingInitialized = useRef(false);

  // 在文档、chunks和思维导图都加载完成后，创建动态映射
  useEffect(() => {
    // 🔑 只有在所有条件满足，并且映射尚未初始化时，才执行
    if (!documentId.startsWith('demo-') && document && document.content && chunksLoaded && !mappingInitialized.current) {
      const mermaidCode = document.mermaid_code_demo;
      const nodeMapping = document.node_mappings_demo;
      
      console.log('🔗 [主组件动态映射] useEffect触发条件检查:');
      console.log('🔗 [主组件动态映射] documentId是否非demo:', !documentId.startsWith('demo-'));
      console.log('🔗 [主组件动态映射] document存在:', !!document);
      console.log('🔗 [主组件动态映射] document.content存在:', !!document?.content);
      console.log('🔗 [主组件动态映射] chunksLoaded:', chunksLoaded);
      console.log('🔗 [主组件动态映射] mappingInitialized.current:', mappingInitialized.current);
      console.log('🔗 [主组件动态映射] contentChunks.current数量:', contentChunks.current?.length || 0);
      console.log('🔗 [主组件动态映射] mermaidCode存在:', !!mermaidCode);
      console.log('🔗 [主组件动态映射] mermaidCode长度:', mermaidCode?.length || 0);
      console.log('🔗 [主组件动态映射] nodeMapping存在:', !!nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping类型:', typeof nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping内容:', nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping键数量:', nodeMapping ? Object.keys(nodeMapping).length : 0);
      
      if (mermaidCode && contentChunks.current.length > 0) {
        console.log('🔗 [主组件] 🚀 正在进行首次动态映射创建...');
        console.log('🔗 [主组件] 参数检查 - chunks数量:', contentChunks.current.length);
        console.log('🔗 [主组件] 参数检查 - mermaidCode前100字符:', mermaidCode.substring(0, 100));
        console.log('🔗 [主组件] 参数检查 - nodeMapping详情:', JSON.stringify(nodeMapping, null, 2));
        
        // 调用更新动态映射函数
        console.log('🔗 [主组件] 📞 正在调用createDynamicMapping...');
        createDynamicMapping(contentChunks.current, mermaidCode, nodeMapping);
        console.log('🔗 [主组件] ✅ createDynamicMapping调用完成');
        
        // 🔑 关键：标记为已初始化，防止重复执行
        mappingInitialized.current = true;
        console.log('🔗 [主组件] 🔒 映射已标记为初始化完成，防止重复执行');
      } else {
        console.log('🔗 [主组件] ❌ 动态映射创建条件不满足:');
        if (!mermaidCode) {
          console.log('🔗 [主组件] - 缺少mermaidCode，等待思维导图生成完成...');
        }
        if (contentChunks.current.length === 0) {
          console.log('🔗 [主组件] - 缺少contentChunks，chunks数量:', contentChunks.current.length);
        }
      }
    } else {
      console.log('🔗 [主组件动态映射] useEffect触发条件不满足:');
      console.log('🔗 [主组件动态映射] - documentId:', documentId);
      console.log('🔗 [主组件动态映射] - 是否demo模式:', documentId.startsWith('demo-'));
      console.log('🔗 [主组件动态映射] - document存在:', !!document);
      console.log('🔗 [主组件动态映射] - chunksLoaded:', chunksLoaded);
      console.log('🔗 [主组件动态映射] - mappingInitialized.current:', mappingInitialized.current);
    }
  }, [document, chunksLoaded, createDynamicMapping, documentId]);

  // 调试文档状态
  useEffect(() => {
    if (document) {
      console.log('📄 [文档调试] 文档加载完成，基本信息:');
      console.log('📄 [文档调试] - documentId:', documentId);
      console.log('📄 [文档调试] - 是否demo模式:', documentId.startsWith('demo-'));
      console.log('📄 [文档调试] - document.content存在:', !!document.content);
      console.log('📄 [文档调试] - document.content长度:', document.content?.length || 0);
      console.log('📄 [文档调试] - document.mermaid_code_demo存在:', !!document.mermaid_code_demo);
      console.log('📄 [文档调试] - document.mermaid_code_demo长度:', document.mermaid_code_demo?.length || 0);
      console.log('📄 [文档调试] - document.node_mappings_demo存在:', !!document.node_mappings_demo);
      console.log('📄 [文档调试] - document.node_mappings_demo类型:', typeof document.node_mappings_demo);
      if (document.node_mappings_demo) {
        console.log('📄 [文档调试] - node_mappings_demo键数量:', Object.keys(document.node_mappings_demo).length);
        console.log('📄 [文档调试] - node_mappings_demo样本键:', Object.keys(document.node_mappings_demo).slice(0, 3));
      }
      console.log('📄 [文档调试] - 完整document对象:', document);
      
      // 暴露全局调试函数
      if (typeof window !== 'undefined') {
        window.debugDocument = () => {
          console.log('=== 📄 文档调试信息 ===');
          console.log('文档ID:', documentId);
          console.log('文档对象:', document);
          console.log('chunks加载状态:', chunksLoaded);
          console.log('chunks数据:', contentChunks.current);
          console.log('思维导图代码:', document?.mermaid_code_demo?.substring(0, 200) + '...');
          console.log('节点映射:', document?.node_mappings_demo);
          console.log('=== 📄 调试信息结束 ===');
          return {
            documentId,
            document,
            chunksLoaded,
            chunks: contentChunks.current,
            mermaidCode: document?.mermaid_code_demo,
            nodeMapping: document?.node_mappings_demo
          };
        };
        console.log('🔧 [全局调试] debugDocument函数已挂载，可在控制台调用 window.debugDocument()');
      }
    }
  }, [document, documentId, chunksLoaded]);

  // 🔑 新增：添加子节点的回调函数
  const handleAddChildNode = useCallback(async (parentNodeId) => {
    try {
      console.log('🆕 [父组件] 添加子节点:', parentNodeId);
      
      // 生成新节点ID和边ID（使用时间戳确保唯一性）
      const newNodeId = `node_${Date.now()}`;
      const newEdgeId = `edge_${parentNodeId}_${newNodeId}`;
      const newNodeLabel = '新节点';
      
      // 更新document状态
      setDocument(prevDoc => {
        if (!prevDoc) {
          console.warn('🆕 [父组件] document不存在，无法添加子节点');
          return prevDoc;
        }
        
        // 创建新的node_mappings
        const newNodeMappings = {
          ...prevDoc.node_mappings_demo,
          [newNodeId]: {
            text_snippet: newNodeLabel,
            paragraph_ids: []
          }
        };
        
        // 创建新的edges（如果存在edges数组）
        const newEdges = prevDoc.edges ? [
          ...prevDoc.edges,
          {
            id: newEdgeId,
            source: parentNodeId,
            target: newNodeId,
            type: 'smoothstep'
          }
        ] : [];
        
        // 更新mermaid代码（添加新的节点和连接）
        let updatedMermaidCode = prevDoc.mermaid_code_demo || '';
        if (updatedMermaidCode) {
          updatedMermaidCode += `\n    ${parentNodeId} --> ${newNodeId}[${newNodeLabel}]`;
        }
        
        console.log('🆕 [父组件] 子节点添加完成，新节点ID:', newNodeId);
        
        return {
          ...prevDoc,
          node_mappings_demo: newNodeMappings,
          edges: newEdges,
          mermaid_code_demo: updatedMermaidCode
        };
      });
      
      // 如果不是示例模式，调用后端API
      if (!documentId.startsWith('demo-')) {
        try {
          // 这里可以添加后端API调用
          console.log('🆕 [父组件] 后端API调用暂未实现');
        } catch (apiError) {
          console.error('❌ [父组件] 添加子节点API调用失败:', apiError);
        }
      }
    } catch (error) {
      console.error('❌ [父组件] 添加子节点失败:', error);
    }
  }, [documentId, setDocument]);
  
  // 🔑 新增：添加同级节点的回调函数
  const handleAddSiblingNode = useCallback(async (siblingNodeId) => {
    try {
      console.log('🆕 [父组件] 添加同级节点:', siblingNodeId);
      
      // 从当前document的edges中找到同级节点的父节点
      const parentEdge = document?.edges?.find(edge => edge.target === siblingNodeId);
      if (!parentEdge && document?.mermaid_code_demo) {
        // 如果没有edges数组，尝试从mermaid代码中解析
        const mermaidLines = document.mermaid_code_demo.split('\n');
        const parentLine = mermaidLines.find(line => line.includes(`--> ${siblingNodeId}`));
        if (parentLine) {
          const match = parentLine.match(/(\w+)\s*-->\s*\w+/);
          if (match) {
            const parentNodeId = match[1];
            await addSiblingWithParent(siblingNodeId, parentNodeId);
            return;
          }
        }
        console.warn('❌ [父组件] 无法找到同级节点的父节点');
        return;
      }
      
      const parentNodeId = parentEdge?.source;
      if (!parentNodeId) {
        console.warn('❌ [父组件] 无法确定父节点ID');
        return;
      }
      
      await addSiblingWithParent(siblingNodeId, parentNodeId);
      
    } catch (error) {
      console.error('❌ [父组件] 添加同级节点失败:', error);
    }
  }, [document]);
  
  // 添加同级节点的辅助函数
  const addSiblingWithParent = useCallback(async (siblingNodeId, parentNodeId) => {
    const newNodeId = `node_${Date.now()}`;
    const newEdgeId = `edge_${parentNodeId}_${newNodeId}`;
    const newNodeLabel = '新节点';
    
    // 更新document状态
    setDocument(prevDoc => {
      if (!prevDoc) {
        console.warn('🆕 [父组件] document不存在，无法添加同级节点');
        return prevDoc;
      }
      
      // 创建新的node_mappings
      const newNodeMappings = {
        ...prevDoc.node_mappings_demo,
        [newNodeId]: {
          text_snippet: newNodeLabel,
          paragraph_ids: []
        }
      };
      
      // 创建新的edges（如果存在edges数组）
      const newEdges = prevDoc.edges ? [
        ...prevDoc.edges,
        {
          id: newEdgeId,
          source: parentNodeId,
          target: newNodeId,
          type: 'smoothstep'
        }
      ] : [];
      
      // 更新mermaid代码（添加新的节点和连接）
      let updatedMermaidCode = prevDoc.mermaid_code_demo || '';
      if (updatedMermaidCode) {
        updatedMermaidCode += `\n    ${parentNodeId} --> ${newNodeId}[${newNodeLabel}]`;
      }
      
      console.log('🆕 [父组件] 同级节点添加完成，新节点ID:', newNodeId);
      
      return {
        ...prevDoc,
        node_mappings_demo: newNodeMappings,
        edges: newEdges,
        mermaid_code_demo: updatedMermaidCode
      };
    });
  }, [setDocument]);
  
  // 🔑 新增：删除节点的回调函数
  const handleDeleteNode = useCallback(async (nodeIdToDelete) => {
    try {
      console.log('🗑️ [父组件] 删除节点:', nodeIdToDelete);
      
      // 更新document状态
      setDocument(prevDoc => {
        if (!prevDoc) {
          console.warn('🗑️ [父组件] document不存在，无法删除节点');
          return prevDoc;
        }
        
        // 移除节点映射
        const newNodeMappings = { ...prevDoc.node_mappings_demo };
        delete newNodeMappings[nodeIdToDelete];
        
        // 移除相关的edges（如果存在edges数组）
        const newEdges = prevDoc.edges ? 
          prevDoc.edges.filter(edge => 
            edge.source !== nodeIdToDelete && edge.target !== nodeIdToDelete
          ) : [];
        
        // 更新mermaid代码（移除相关的节点和连接）
        let updatedMermaidCode = prevDoc.mermaid_code_demo || '';
        if (updatedMermaidCode) {
          const lines = updatedMermaidCode.split('\n');
          const filteredLines = lines.filter(line => 
            !line.includes(nodeIdToDelete) && 
            !line.includes(`--> ${nodeIdToDelete}`) &&
            !line.includes(`${nodeIdToDelete} -->`)
          );
          updatedMermaidCode = filteredLines.join('\n');
        }
        
        console.log('🗑️ [父组件] 节点删除完成');
        
        return {
          ...prevDoc,
          node_mappings_demo: newNodeMappings,
          edges: newEdges,
          mermaid_code_demo: updatedMermaidCode
        };
      });
      
      // 如果不是示例模式，调用后端API
      if (!documentId.startsWith('demo-')) {
        try {
          // 这里可以添加后端API调用
          console.log('🗑️ [父组件] 后端API调用暂未实现');
        } catch (apiError) {
          console.error('❌ [父组件] 删除节点API调用失败:', apiError);
        }
      }
    } catch (error) {
      console.error('❌ [父组件] 删除节点失败:', error);
    }
  }, [documentId, setDocument]);

  // 🔑 新增：通用添加节点的回调函数
  const handleAddNode = useCallback(async (sourceNodeId, direction) => {
    try {
      console.log('🆕 [添加节点] 开始添加节点:', { sourceNodeId, direction });
      
      // 计算父节点ID
      let parentId = null;
      if (direction === 'child') {
        // 子节点：sourceNodeId 就是父节点
        parentId = sourceNodeId;
      } else if (direction === 'left-sibling' || direction === 'right-sibling') {
        // 同级节点：需要找到sourceNodeId的父节点
        if (document?.edges) {
          const parentEdge = document.edges.find(edge => edge.target === sourceNodeId);
          parentId = parentEdge?.source || null;
        } else if (document?.mermaid_code_demo) {
          // 从mermaid代码中解析父节点
          const mermaidLines = document.mermaid_code_demo.split('\n');
          const parentLine = mermaidLines.find(line => line.includes(`--> ${sourceNodeId}`));
          if (parentLine) {
            const match = parentLine.match(/(\w+)\s*-->\s*\w+/);
            if (match) {
              parentId = match[1];
            }
          }
        }
      }
      
      console.log('🆕 [添加节点] 计算出的父节点ID:', parentId);
      
      // 构建API请求数据
      const nodeData = {
        sourceNodeId,
        direction,
        parentId,
        label: '新节点'
      };
      
      // 如果是示例模式，直接更新前端状态
      if (documentId.startsWith('demo-')) {
        console.log('🆕 [添加节点] 示例模式，直接更新前端状态');
        
        // 生成新节点ID
        const newNodeId = `node_${Date.now()}`;
        const newNodeLabel = '新节点';
        
        // 更新document状态
        setDocument(prevDoc => {
          if (!prevDoc) {
            console.warn('🆕 [添加节点] document不存在，无法添加节点');
            return prevDoc;
          }
          
          // 创建新的node_mappings
          const newNodeMappings = {
            ...prevDoc.node_mappings_demo,
            [newNodeId]: {
              text_snippet: newNodeLabel,
              paragraph_ids: []
            }
          };
          
          // 创建新的edges（如果存在edges数组）
          const targetParentId = direction === 'child' ? sourceNodeId : parentId;
          const newEdges = prevDoc.edges && targetParentId ? [
            ...prevDoc.edges,
            {
              id: `edge_${targetParentId}_${newNodeId}`,
              source: targetParentId,
              target: newNodeId,
              type: 'smoothstep'
            }
          ] : prevDoc.edges || [];
          
          // 更新mermaid代码
          let updatedMermaidCode = prevDoc.mermaid_code_demo || '';
          if (updatedMermaidCode && targetParentId) {
            updatedMermaidCode += `\n    ${targetParentId} --> ${newNodeId}[${newNodeLabel}]`;
          }
          
          console.log('🆕 [添加节点] 示例模式节点添加完成，新节点ID:', newNodeId);
          
          return {
            ...prevDoc,
            node_mappings_demo: newNodeMappings,
            edges: newEdges,
            mermaid_code_demo: updatedMermaidCode
          };
        });
        
        toast.success('节点已添加（示例模式）');
      } else {
        // 真实文档模式，调用后端API
        console.log('🆕 [添加节点] 真实文档模式，调用后端API');
        
        const response = await addNode(documentId, nodeData);
        
        if (response.success && response.document) {
          console.log('🆕 [添加节点] ✅ 后端API调用成功');
          console.log('🆕 [添加节点] 📊 API返回的数据统计:');
          console.log('   success:', response.success);
          console.log('   new_node_id:', response.new_node_id);
          console.log('   document 存在:', !!response.document);
          console.log('   document.content_with_ids 长度:', response.document.content_with_ids?.length || 0);
          console.log('   document.node_mappings_demo 数量:', Object.keys(response.document.node_mappings_demo || {}).length);
          console.log('   document.mermaid_code_demo 长度:', response.document.mermaid_code_demo?.length || 0);
          
          // 打印content_with_ids的前200字符来验证更新
          if (response.document.content_with_ids) {
            console.log('🆕 [添加节点] 📋 API返回的content_with_ids前200字符:');
            console.log('   ', response.document.content_with_ids.substring(0, 200));
          }
          
          // 使用后端返回的完整文档状态更新前端
          console.log('🆕 [添加节点] 🔄 开始更新前端document状态');
          setDocument(response.document);
          
          // 验证状态是否会更新 - 添加一个延迟检查
          setTimeout(() => {
            console.log('🆕 [添加节点] 🔍 延迟验证: document状态是否已更新');
            console.log('   当前document.content_with_ids存在:', !!document?.content_with_ids);
            console.log('   当前document.content_with_ids长度:', document?.content_with_ids?.length || 0);
          }, 100);
          
          toast.success('节点已添加');
        } else {
          throw new Error(response.message || '添加节点失败');
        }
      }
      
    } catch (error) {
      console.error('❌ [添加节点] 添加节点失败:', error);
      const errorMessage = handleApiError(error);
      toast.error(errorMessage);
    }
  }, [documentId, document, setDocument]);

  // 处理 node_mappings 更新的函数
  const handleNodeMappingUpdate = useCallback(async (newNodeMappings) => {
    try {
      console.log('📍 [节点映射更新] 开始更新 node_mappings:', newNodeMappings);
      
      // 更新前端状态
      setDocument(prev => ({
        ...prev,
        node_mappings_demo: newNodeMappings
      }));
      
      console.log('📍 [节点映射更新] 前端状态已更新');
      
      // 如果不是示例模式，调用后端API进行持久化
      if (!documentId.startsWith('demo-')) {
        console.log('📍 [节点映射更新] 开始调用后端API保存映射');
        
        const response = await axios.post(`http://localhost:8000/api/document/${documentId}/remap`, {
          node_mappings: newNodeMappings
        });
        
        if (response.data.success) {
          console.log('📍 [节点映射更新] ✅ 后端保存成功');
          toast.success('拖拽排序已保存');
        } else {
          console.error('📍 [节点映射更新] ❌ 后端保存失败:', response.data.message);
          toast.error('保存失败: ' + response.data.message);
        }
      } else {
        console.log('📍 [节点映射更新] 示例模式，跳过后端保存');
      }
      
      // 更新动态映射以反映新的节点关系
      if (contentChunks.current.length > 0 && document && document.mermaid_code_demo) {
        console.log('📍 [节点映射更新] 重新生成动态映射');
        createDynamicMapping(contentChunks.current, document.mermaid_code_demo, newNodeMappings);
      }
      
    } catch (error) {
      console.error('📍 [节点映射更新] 错误:', error);
      const errorMessage = error.response?.data?.detail || '保存节点映射失败';
      toast.error(errorMessage);
    }
  }, [documentId, setDocument, createDynamicMapping, document]);

  // 处理拖拽排序后的回调函数
  const handleOrderChange = useCallback(async (newItems) => {
    try {
      console.log('📍 [排序更新] 开始处理拖拽排序结果');
      console.log('📍 [排序更新] 新项目顺序数组长度:', newItems?.length || 0);
      console.log('📍 [排序更新] 新项目顺序:', newItems);
      
      // 健壮性检查
      if (!newItems || newItems.length === 0) {
        console.warn('📍 [排序更新] ⚠️ 新项目数组为空，跳过处理');
        return;
      }
      
      // 健壮性检查：确保 document 对象存在
      const docObj = document;
      if (!docObj) {
        console.warn('📍 [排序更新] ⚠️ document 对象不存在，跳过处理');
        return;
      }
      
      // 重新计算 node_mappings - 使用 SortableContentRenderer 中的重构版本逻辑
      const recalculateNodeMappings = (sortedItems) => {
        console.log('📍 [排序更新-重新计算] 开始重新计算 node_mappings');
        console.log('📍 [排序更新-重新计算] 输入参数:', { 
          sortedItemsLength: sortedItems?.length || 0, 
          nodeMapping: !!docObj.node_mappings_demo
        });
        
        // 健壮性检查：如果输入的 items 数组为空，返回空的 node_mappings 对象
        if (!sortedItems || sortedItems.length === 0) {
          console.log('📍 [排序更新-重新计算] ⚠️ 输入项目为空，返回空映射');
          return {};
        }
        
        if (!docObj.node_mappings_demo) {
          console.log('📍 [排序更新-重新计算] ⚠️ 缺少节点映射，跳过重新计算');
          return {};
        }
        
        const newNodeMappings = {};
        let currentNodeId = null;
        
        // 获取第一个节点ID作为默认值，处理段落出现在所有分割线之前的边界情况
        const firstNodeId = Object.keys(docObj.node_mappings_demo)[0];
        console.log('📍 [排序更新-重新计算] 默认第一个节点ID:', firstNodeId);
        
        // 遍历排序后的项目列表
        sortedItems.forEach((item, index) => {
          if (item.type === 'divider') {
            // 遇到分割线，设置当前节点ID
            currentNodeId = item.nodeId;
            console.log(`📍 [排序更新-重新计算] 位置 ${index}: 进入节点 ${currentNodeId}`);
          } else if (item.type === 'paragraph') {
            // 遇到段落，将其分配给当前节点
            // 如果还没有遇到分割线，使用第一个节点作为默认值
            const targetNodeId = currentNodeId || firstNodeId;
            
            if (targetNodeId) {
              // 确保 newNodeMappings[targetNodeId] 已经存在并且是一个包含 paragraph_ids 数组的对象
              if (!newNodeMappings[targetNodeId]) {
                // 从原始 nodeMapping 中复制节点信息
                newNodeMappings[targetNodeId] = {
                  ...docObj.node_mappings_demo[targetNodeId],
                  paragraph_ids: []
                };
                console.log(`📍 [排序更新-重新计算] 初始化节点 ${targetNodeId} 的映射`);
              }
              
              // 将段落ID添加到当前节点
              newNodeMappings[targetNodeId].paragraph_ids.push(item.paragraphId);
              console.log(`📍 [排序更新-重新计算] 位置 ${index}: 段落 ${item.paragraphId} 分配给节点 ${targetNodeId}`);
            } else {
              console.warn(`📍 [排序更新-重新计算] 警告: 段落 ${item.paragraphId} 在位置 ${index} 没有对应的节点`);
            }
          }
        });
        
        console.log('📍 [排序更新-重新计算] 新的 node_mappings:', newNodeMappings);
        return newNodeMappings;
      };
      
      // 重新计算节点映射
      const newNodeMappings = recalculateNodeMappings(newItems);
      
      if (Object.keys(newNodeMappings).length === 0) {
        console.warn('📍 [排序更新] ⚠️ 重新计算结果为空，跳过后续处理');
        return;
      }
      
      console.log('📍 [排序更新] 开始更新前端状态');
      
      // 更新前端状态
      setDocument(prev => {
        if (!prev) {
          console.warn('📍 [排序更新] ⚠️ 前一个文档状态不存在，无法更新');
          return prev;
        }
        
        const updatedDocument = {
          ...prev,
          node_mappings_demo: newNodeMappings
        };
        console.log('📍 [排序更新] 前端状态已更新');
        
        // 立即重新生成动态映射
        if (contentChunks.current.length > 0 && prev.mermaid_code_demo) {
          console.log('📍 [排序更新] 重新生成动态映射');
          createDynamicMapping(contentChunks.current, prev.mermaid_code_demo, newNodeMappings);
        }
        
        return updatedDocument;
      });
      
      console.log('📍 [排序更新] 开始调用后端API保存映射');
      
      // 如果不是示例模式，调用后端API进行持久化
      if (!documentId.startsWith('demo-')) {
        console.log('📍 [排序更新] 调用后端API保存节点映射');
        
        const response = await axios.post(`http://localhost:8000/api/document/${documentId}/remap`, {
          node_mappings: newNodeMappings
        });
        
        if (response.data.success) {
          console.log('📍 [排序更新] ✅ 后端保存成功');
          toast.success('拖拽排序已保存');
        } else {
          console.error('📍 [排序更新] ❌ 后端保存失败:', response.data.message);
          toast.error('保存失败: ' + response.data.message);
        }
      } else {
        console.log('📍 [排序更新] 示例模式，跳过后端保存');
        toast.success('拖拽排序已更新（示例模式）');
      }
      
    } catch (error) {
      console.error('📍 [排序更新] 错误:', error);
      const errorMessage = error.response?.data?.detail || '处理拖拽排序失败';
      toast.error(errorMessage);
    }
  }, [documentId, document, setDocument, createDynamicMapping]);

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-700 dark:text-gray-300">正在加载文档...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (documentError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">加载失败</h2>
            <p className="text-red-600 dark:text-red-400 mb-4">{documentError}</p>
            <div className="space-x-3">
              <button
                onClick={loadDocument}
                className="inline-flex items-center px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 transition-colors"
              >
                重试
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-4 py-2 bg-gray-600 dark:bg-gray-500 text-white rounded-md hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 文档不存在
  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-lg text-gray-700 dark:text-gray-300">文档不存在</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden flex flex-col">
      {/* 三列分割容器 */}
      <div ref={containerRef} className="flex flex-1 h-full">
        
        {/* 左侧目录栏 */}
        {showToc && (
          <div 
            className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
            style={{ width: `${tocPanelWidth}%` }}
          >
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
                  <FileText className="w-3 h-3 mr-1" />
                  文档目录
                </h2>
                <button
                  onClick={() => setShowToc(false)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TableOfContents 
                toc={toc}
                expandedItems={expandedTocItems}
                activeItem={activeChunkId}
                onToggle={toggleTocItem}
                onItemClick={scrollToSection}
              />
            </div>
          </div>
        )}
        
        {/* 目录分隔线 */}
        {showToc && (
          <div
            className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={(e) => handleMouseDown(e, 'toc-divider')}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-white dark:bg-gray-700 opacity-50 rounded"></div>
            </div>
          </div>
        )}

        {/* 中间文档阅读器 */}
        <div 
          className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col"
          style={{ width: `${showToc ? leftPanelWidth : leftPanelWidth + tocPanelWidth}%` }}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  返回
                </button>
                {!showToc && (
                  <button
                    onClick={() => setShowToc(true)}
                    className="inline-flex items-center px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    目录
                  </button>
                )}
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  文档内容
                  {isPdfFile && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({viewMode === 'pdf' ? '原始PDF' : '转换后的Markdown'})
                    </span>
                  )}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <ThemeToggle className="scale-75" />
                {/* 调试按钮 - 只在非示例模式下显示 */}
                {!documentId.startsWith('demo-') && (
                  <button
                    onClick={() => {
                      console.log('=== 调试信息 ===');
                      console.log('文档ID:', documentId);
                      console.log('当前活跃章节ID:', activeChunkId);
                      console.log('当前活跃段落ID:', activeContentBlockId);
                      console.log('chunks数量:', contentChunks.current?.length || 0);
                      console.log('chunks列表:', contentChunks.current?.map(c => c.chunk_id) || []);
                      console.log('动态映射:', dynamicMapping);
                      console.log('思维导图代码长度:', document?.mermaid_code_demo?.length || 0);
                      console.log('节点映射:', document?.node_mappings_demo);
                      console.log('原始内容长度:', document?.content?.length || 0);
                      console.log('带段落ID内容长度:', document?.content_with_ids?.length || 0);
                      console.log('带段落ID内容前100字符:', document?.content_with_ids?.substring(0, 100) || '无');
                      
                      // 检查页面中的段落元素
                      const allParagraphs = document.querySelectorAll('[id^="para-"], [data-para-id]');
                      console.log('页面中的段落数量:', allParagraphs.length);
                      console.log('段落ID列表:', Array.from(allParagraphs).map(el => el.id || el.getAttribute('data-para-id')));
                      
                      // 显示localStorage中的调试数据
                      const debugData = {
                        textToNodeMap: JSON.parse(localStorage.getItem('debug_semanticTextToNodeMap') || '{}'),
                        nodeToTextMap: JSON.parse(localStorage.getItem('debug_semanticNodeToTextMap') || '{}'),
                        aiNodeMapping: JSON.parse(localStorage.getItem('debug_aiNodeMapping') || '{}')
                      };
                      console.log('localStorage调试数据:', debugData);
                      
                      alert(`调试信息已输出到控制台\n当前活跃章节: ${activeChunkId || '无'}\n当前活跃段落: ${activeContentBlockId || '无'}\n段落数量: ${allParagraphs.length}`);
                    }}
                    className="inline-flex items-center px-2 py-1 text-xs bg-purple-600 dark:bg-purple-500 text-white rounded hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                  >
                    🐛 调试
                  </button>
                )}
                <button
                  onClick={handleDownloadMarkdown}
                  className="inline-flex items-center px-2 py-1 text-xs bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
                >
                  <Download className="w-3 h-3 mr-1" />
                  下载MD
                </button>
              </div>
            </div>
            <ViewModeToggle />
          </div>
          <div className={`flex-1 ${viewMode === 'pdf' && isPdfFile ? 'overflow-hidden' : 'overflow-y-auto p-4'}`}>
            {(() => {
              // PDF文件模式
              if (viewMode === 'pdf' && isPdfFile) {
                return <PDFViewer pdfBase64={document.pdf_base64} />;
              }
              
              // 纯示例模式（demo-开头且没有真实内容）
              if (documentId.startsWith('demo-') && !document.content) {
                console.log('📄 [渲染判断] 纯示例模式');
                return (
                  <DemoModeRenderer 
                    content={null}
                    onContentBlockRef={handleContentBlockRef}
                    nodeMapping={document.node_mappings_demo}
                    onNodeMappingUpdate={handleNodeMappingUpdate}
                    onOrderChange={handleOrderChange}
                  />
                );
              }
              
              // 上传文件模式 - 等待chunks加载
              if (!documentId.startsWith('demo-') && !chunksLoaded) {
                console.log('📄 [渲染判断] 上传文件模式 - 等待chunks加载');
                return (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">正在加载文档结构...</p>
                    </div>
                  </div>
                );
              }
              
              // 上传文件模式 - chunks已加载 或 带内容的示例模式
              console.log('📄 [渲染判断] 渲染真实文档内容', {
                documentId, 
                chunksLoaded, 
                chunksCount: contentChunks.current.length,
                hasContent: !!document.content,
                hasContentWithIds: !!document.content_with_ids
              });
              
              // 优先使用带段落ID的内容，如果不存在则使用原始内容
              const contentToRender = document.content_with_ids || document.content;
              console.log('📄 [内容选择] 使用内容类型:', document.content_with_ids ? '带段落ID的内容' : '原始内容');
              
              return (
                <DemoModeRenderer 
                  content={contentToRender}
                  onContentBlockRef={handleContentBlockRef}
                  isRealDocument={!documentId.startsWith('demo-')}
                  chunks={contentChunks.current}
                  nodeMapping={document.node_mappings_demo}
                  onNodeMappingUpdate={handleNodeMappingUpdate}
                  onOrderChange={handleOrderChange}
                />
              );
            })()}
          </div>
        </div>

        {/* 主分隔线 */}
        <div
          className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={(e) => handleMouseDown(e, 'main-divider')}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-0.5 h-8 bg-white dark:bg-gray-700 opacity-50 rounded"></div>
          </div>
        </div>

        {/* 右侧论证结构流程图 */}
        <div 
          className="bg-white dark:bg-gray-800 overflow-hidden flex flex-col"
          style={{ width: `${100 - (showToc ? tocPanelWidth : 0) - leftPanelWidth}%` }}
        >
          {/* 论证结构流程图区域 */}
          <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">论证结构流程图</h2>
                <div className="flex items-center space-x-2">
                  <MindmapStatusDisplay />
                  {document.mermaid_code_demo && (
                    <button
                      onClick={() => handleDownloadMermaid('demo')}
                      className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      下载流程图
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>分析文档的核心论证结构和逻辑流向</span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {/* 流程图内容区域 */}
              {(demoMindmapStatus === 'completed' && document.mermaid_code_demo) ? (
                <div className="h-full overflow-hidden">
                  <FlowDiagram 
                    ref={mermaidDiagramRef}
                    apiData={{
                      mermaid_string: document.mermaid_code_demo,
                      node_mappings: document.node_mappings_demo || {},
                      document_id: documentId
                    }}
                    highlightedNodeId={highlightedNodeId}
                    onNodeClick={handleNodeClick}
                    onNodeLabelUpdate={handleNodeLabelUpdate}
                    onAddNode={handleAddNode}
                    onAddChildNode={handleAddChildNode}
                    onAddSiblingNode={handleAddSiblingNode}
                    onDeleteNode={handleDeleteNode}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md px-4">
                    <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">生成论证结构流程图</h3>
                      
                      <button
                        onClick={() => startMindmapGeneration('demo')}
                        className="flex items-center justify-center px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors w-full"
                        disabled={demoMindmapStatus === 'generating'}
                      >
                        {demoMindmapStatus === 'generating' ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            <span>分析中...</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            <span>开始分析</span>
                          </>
                        )}
                      </button>
                      
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        将分析文档的核心论点和论证逻辑
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

export default ViewerPageRefactored; 