import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, Eye, EyeOff, FileText, File, Bot, Zap, BarChart3 } from 'lucide-react';
import MermaidDiagram from './MermaidDiagram';
import ThemeToggle from './ThemeToggle';

// 导入自定义hooks
import { useDocumentViewer } from '../hooks/useDocumentViewer';
import { useMindmapGeneration } from '../hooks/useMindmapGeneration';
import { usePanelResize } from '../hooks/usePanelResize';
import { useReadingAssistant } from '../hooks/useReadingAssistant';
import { useScrollDetection } from '../hooks/useScrollDetection';

// 导入UI组件
import TableOfContents from './TableOfContents';
import PDFViewer from './PDFViewer';
import ReadingAssistantUI from './ReadingAssistantUI';
import { StructuredMarkdownRenderer, DemoModeRenderer } from './DocumentRenderer';

const ViewerPageRefactored = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const mermaidDiagramRef = useRef(null);
  
  // 从上传页面传递的模式选择
  const selectedMode = location.state?.selectedMode || 'simple';
  const [currentMindmapMode, setCurrentMindmapMode] = useState(selectedMode);
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
    mindmapStatus,
    mindmapError,
    simpleMindmapStatus,
    simpleMindmapError,
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

  // 使用AI阅读助手 hook
  const {
    readingQuestionsStatus,
    readingQuestions,
    currentQuestions,
    questionHistory,
    showReadingAssistant,
    setShowReadingAssistant,
    generateReadingQuestions,
    checkForNewQuestions
  } = useReadingAssistant(documentId, document);

  // 使用滚动检测 hook
  const {
    activeChunkId,
    contentChunks,
    handleSectionRef,
    handleContentBlockRef,
    scrollToSection,
    scrollToContentBlock,
    highlightContentBlock,
    highlightMermaidNode
  } = useScrollDetection(
    containerRef,
    documentId,
    currentMindmapMode,
    showReadingAssistant,
    checkForNewQuestions,
    mermaidDiagramRef
  );

  // 处理节点点击事件
  const handleNodeClick = useCallback((nodeId) => {
    console.log('🖱️ [父组件] 接收到节点点击事件:', nodeId);
    
    // 调用滚动到对应文本块的函数
    scrollToContentBlock(nodeId);
    
    // 同时高亮对应的节点（如果需要的话）
    highlightMermaidNode(nodeId);
  }, [scrollToContentBlock, highlightMermaidNode]);

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
            {viewMode === 'pdf' && isPdfFile ? (
              <PDFViewer pdfBase64={document.pdf_base64} />
            ) : (
              documentId.startsWith('demo-') && currentMindmapMode === 'demo' ? (
                <DemoModeRenderer 
                  content={document.content}
                  onContentBlockRef={handleContentBlockRef}
                />
              ) : (
                <StructuredMarkdownRenderer 
                  content={document.content}
                  chunks={contentChunks.current}
                  onSectionRef={handleSectionRef}
                />
              )
            )}
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

        {/* 右侧思维导图和AI助手 */}
        <div 
          className="bg-white dark:bg-gray-800 overflow-hidden flex flex-col"
          style={{ width: `${100 - (showToc ? tocPanelWidth : 0) - leftPanelWidth}%` }}
        >
          {/* 思维导图区域 */}
          <div className={`${readingQuestionsStatus === 'disabled' ? 'h-full' : 'h-3/5'} flex flex-col ${readingQuestionsStatus === 'disabled' ? '' : 'border-b border-gray-200 dark:border-gray-700'}`}>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">思维导图</h2>
                <div className="flex items-center space-x-2">
                  <MindmapStatusDisplay />
                  <div className="flex items-center space-x-1">
                    {document.mermaid_code && (
                      <button
                        onClick={() => handleDownloadMermaid('standard')}
                        className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        详细
                      </button>
                    )}
                    {document.mermaid_code_simple && (
                      <button
                        onClick={() => handleDownloadMermaid('simple')}
                        className="inline-flex items-center px-2 py-1 text-xs bg-purple-600 dark:bg-purple-500 text-white rounded hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        快速
                      </button>
                    )}
                    {document.mermaid_code_demo && (
                      <button
                        onClick={() => handleDownloadMermaid('demo')}
                        className="inline-flex items-center px-2 py-1 text-xs bg-orange-600 dark:bg-orange-500 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        完整
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {currentMindmapMode === 'simple' ? '快速模式' : 
                     currentMindmapMode === 'demo' ? '完整模式' : '详细模式'}
                  </span>
                </div>
                {(document.mermaid_code || document.mermaid_code_simple || document.mermaid_code_demo) && (
                  <div className="flex space-x-1">
                    {document.mermaid_code && (
                      <button
                        onClick={() => setCurrentMindmapMode('standard')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          currentMindmapMode === 'standard'
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        详细版本
                      </button>
                    )}
                    {document.mermaid_code_simple && (
                      <button
                        onClick={() => setCurrentMindmapMode('simple')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          currentMindmapMode === 'simple'
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-600'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        快速版本
                      </button>
                    )}
                    {document.mermaid_code_demo && (
                      <button
                        onClick={() => setCurrentMindmapMode('demo')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          currentMindmapMode === 'demo'
                            ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-600'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        标准版本
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {/* 思维导图内容区域 */}
              {((currentMindmapMode === 'standard' && mindmapStatus === 'completed' && document.mermaid_code) ||
                (currentMindmapMode === 'simple' && simpleMindmapStatus === 'completed' && document.mermaid_code_simple) ||
                (currentMindmapMode === 'demo' && demoMindmapStatus === 'completed' && document.mermaid_code_demo)) ? (
                <div className="h-full overflow-hidden">
                  <MermaidDiagram 
                    ref={mermaidDiagramRef}
                    code={
                      currentMindmapMode === 'simple' ? document.mermaid_code_simple :
                      currentMindmapMode === 'demo' ? document.mermaid_code_demo :
                      document.mermaid_code
                    }
                    onNodeClick={handleNodeClick}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md px-4">
                    <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">开始生成思维导图</h3>
                      
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <button
                          onClick={() => startMindmapGeneration('simple')}
                          className="flex items-center justify-center px-3 py-2 bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
                          disabled={simpleMindmapStatus === 'generating'}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          <div className="text-left">
                            <div className="text-xs font-medium">快速</div>
                          </div>
                        </button>
                        
                        <button
                          onClick={() => startMindmapGeneration('standard')}
                          className="flex items-center justify-center px-3 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                          disabled={mindmapStatus === 'generating'}
                        >
                          <BarChart3 className="w-3 h-3 mr-1" />
                          <div className="text-left">
                            <div className="text-xs font-medium">详细</div>
                          </div>
                        </button>

                        <button
                          onClick={() => startMindmapGeneration('demo')}
                          className="flex items-center justify-center px-3 py-2 bg-orange-600 dark:bg-orange-500 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors"
                          disabled={demoMindmapStatus === 'generating'}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          <div className="text-left">
                            <div className="text-xs font-medium">完整</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI阅读助手区域 */}
          {readingQuestionsStatus !== 'disabled' && (
            <div className="h-2/5 flex flex-col bg-gray-50 dark:bg-gray-800">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI阅读助手</h3>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({readingQuestions.length} 个问题)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowReadingAssistant(!showReadingAssistant)}
                      className="inline-flex items-center px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      {showReadingAssistant ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                      {showReadingAssistant ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>
              </div>
              
              {showReadingAssistant && (
                <div className="flex-1 overflow-hidden">
                  <ReadingAssistantUI 
                    questions={readingQuestions}
                    currentQuestions={currentQuestions}
                    questionHistory={questionHistory}
                    status={readingQuestionsStatus}
                    onRetry={generateReadingQuestions}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewerPageRefactored; 