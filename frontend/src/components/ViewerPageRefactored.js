import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Eye, EyeOff, FileText, File, Bot } from 'lucide-react';
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

const ViewerPageRefactored = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const mermaidDiagramRef = useRef(null);
  
  const [showToc, setShowToc] = useState(false);

  // 使用文档查看器 hook
  const {
    documentId,
    document,
    setDocument,
    loading,
    error,
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
    contentChunks,
    handleSectionRef,
    handleContentBlockRef,
    scrollToSection,
    scrollToContentBlock,
    highlightParagraph,
    highlightMermaidNode,
    updateDynamicMapping,
    dynamicMapping,
    textToNodeMap // 添加静态映射关系
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
    
    // 只滚动到对应文本块，不手动高亮
    // 高亮将由自动滚动检测来处理
    scrollToContentBlock(nodeId);
  }, [scrollToContentBlock]);

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

  // 在文档、chunks和思维导图都加载完成后，创建动态映射
  useEffect(() => {
    if (!documentId.startsWith('demo-') && document && document.content && chunksLoaded) {
      const mermaidCode = document.mermaid_code_demo;
      const nodeMapping = document.node_mappings_demo;
      
      console.log('🔗 [主组件动态映射] useEffect触发条件检查:');
      console.log('🔗 [主组件动态映射] documentId是否非demo:', !documentId.startsWith('demo-'));
      console.log('🔗 [主组件动态映射] document存在:', !!document);
      console.log('🔗 [主组件动态映射] document.content存在:', !!document?.content);
      console.log('🔗 [主组件动态映射] chunksLoaded:', chunksLoaded);
      console.log('🔗 [主组件动态映射] contentChunks.current数量:', contentChunks.current?.length || 0);
      console.log('🔗 [主组件动态映射] mermaidCode存在:', !!mermaidCode);
      console.log('🔗 [主组件动态映射] mermaidCode长度:', mermaidCode?.length || 0);
      console.log('🔗 [主组件动态映射] nodeMapping存在:', !!nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping类型:', typeof nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping内容:', nodeMapping);
      console.log('🔗 [主组件动态映射] nodeMapping键数量:', nodeMapping ? Object.keys(nodeMapping).length : 0);
      
      if (mermaidCode && contentChunks.current.length > 0) {
        console.log('🔗 [主组件] ✅ 准备创建动态映射');
        console.log('🔗 [主组件] 参数检查 - chunks数量:', contentChunks.current.length);
        console.log('🔗 [主组件] 参数检查 - mermaidCode前100字符:', mermaidCode.substring(0, 100));
        console.log('🔗 [主组件] 参数检查 - nodeMapping详情:', JSON.stringify(nodeMapping, null, 2));
        
        // 调用更新动态映射函数
        console.log('🔗 [主组件] 📞 正在调用updateDynamicMapping...');
        updateDynamicMapping(contentChunks.current, mermaidCode, nodeMapping);
        console.log('🔗 [主组件] ✅ updateDynamicMapping调用完成');
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
    }
  }, [document, chunksLoaded, updateDynamicMapping, documentId]);

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
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">加载失败</h2>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
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
                      node_mappings: document.node_mappings_demo || {}
                    }}
                    highlightedNodeId={highlightedNodeId}
                    onNodeClick={handleNodeClick}
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
    </div>
  );
};

export default ViewerPageRefactored; 