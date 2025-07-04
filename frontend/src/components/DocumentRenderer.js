import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import LogicalDivider from './LogicalDivider';

// 独立的段落渲染函数，避免React Hook规则问题
const renderParagraphsWithIds = (content, onContentBlockRef, nodeMapping = null) => {
  if (!content) return null;
  
  // 创建段落ID到节点ID的映射
  const paragraphToNodeMap = {};
  if (nodeMapping) {
    Object.entries(nodeMapping).forEach(([nodeId, nodeData]) => {
      if (nodeData.paragraph_ids && Array.isArray(nodeData.paragraph_ids)) {
        nodeData.paragraph_ids.forEach(paragraphId => {
          paragraphToNodeMap[paragraphId] = nodeId;
        });
      }
    });
  }
  
  console.log('📍 [逻辑分割] 段落到节点的映射:', paragraphToNodeMap);
  
  // 按段落分割内容，保留段落ID标记
  const paragraphs = content.split(/(\[para-\d+\])/g).filter(part => part.trim());
  console.log('📍 [段落解析] 总段落数量:', paragraphs.length, '前5个部分:', paragraphs.slice(0, 5));
  
  const elements = [];
  let currentParagraphId = null;
  let currentContent = '';
  let currentNodeId = null;
  
  paragraphs.forEach((part, partIndex) => {
    const paraIdMatch = part.match(/\[para-(\d+)\]/);
    
    if (paraIdMatch) {
      // 如果有之前的内容，先渲染它
      if (currentContent.trim() && currentParagraphId) {
        console.log(`📍 [段落渲染] 渲染段落: ${currentParagraphId}, 内容长度: ${currentContent.trim().length}`);
        
        // 🔧 固定当前段落ID，避免闭包陷阱
        const paragraphIdToRegister = currentParagraphId;
        const contentPreview = currentContent.substring(0, 50) + '...';
        
        elements.push(
          <div 
            key={`${currentParagraphId}-content`}
            id={currentParagraphId}
            data-para-id={currentParagraphId}
            className="paragraph-block mb-3 p-2 rounded transition-all duration-200"
            ref={(el) => {
              console.log('📍 [段落注册-中间] 注册段落引用:', paragraphIdToRegister, '元素:', !!el, '内容预览:', contentPreview);
              if (el) {
                console.log('📍 [段落注册-中间-DOM] 元素DOM信息:', {
                  id: el.id,
                  dataParaId: el.getAttribute('data-para-id'),
                  className: el.className,
                  offsetTop: el.offsetTop,
                  clientHeight: el.clientHeight
                });
              } else {
                console.log('📍 [段落注册-中间-DOM] 元素为null，段落:', paragraphIdToRegister);
              }
              onContentBlockRef(el, paragraphIdToRegister);
            }}
          >
            <ReactMarkdown
              components={{
                h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
                h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
                ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
                ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
                li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
                blockquote: ({node, ...props}) => (
                  <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
                ),
                code: ({node, inline, ...props}) => 
                  inline 
                    ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                    : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
                pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
              }}
            >
              {currentContent.trim()}
            </ReactMarkdown>
          </div>
        );
      }
      
      // 设置新的段落ID
      const newParagraphId = `para-${paraIdMatch[1]}`;
      const newNodeId = paragraphToNodeMap[newParagraphId];
      
              // 检查节点变化，如果节点发生变化且不是第一个段落，则插入分割线
        if (nodeMapping && newNodeId && currentNodeId && newNodeId !== currentNodeId) {
          const nodeInfo = nodeMapping[newNodeId];
          if (nodeInfo) {
            console.log(`📍 [逻辑分割] 检测到节点变化: ${currentNodeId} -> ${newNodeId}`);
            
            // 根据语义角色设置颜色
            const getColorByRole = (role) => {
              if (!role) return 'gray';
              const roleColors = {
                '引言': 'blue',
                '核心论点': 'purple',
                '支撑证据': 'green',
                '反驳': 'red',
                '结论': 'yellow',
                '历史案例': 'blue',
                '理论拓展': 'purple'
              };
              return roleColors[role] || 'gray';
            };
            
            // 插入逻辑分割线
            elements.push(
              <LogicalDivider 
                key={`divider-${newNodeId}`}
                nodeInfo={{
                  title: nodeInfo.text_snippet || nodeInfo.semantic_role || newNodeId,
                  id: newNodeId,
                  color: getColorByRole(nodeInfo.semantic_role)
                }}
              />
            );
          }
        }
      
      currentParagraphId = newParagraphId;
      currentNodeId = newNodeId;
      currentContent = '';
      
      console.log(`📍 [段落解析] 发现段落标记: ${currentParagraphId}, 节点ID: ${currentNodeId}`);
    } else {
      // 累积内容
      currentContent += part;
      console.log(`📍 [内容累积] 当前段落: ${currentParagraphId}, 累积长度: ${currentContent.length}, 新增: ${part.substring(0, 30)}...`);
    }
  });
  
  // 处理最后一个段落
  if (currentContent.trim() && currentParagraphId) {
    console.log(`📍 [段落渲染-最后] 渲染最后段落: ${currentParagraphId}, 内容长度: ${currentContent.trim().length}`);
    
    // 🔧 固定当前段落ID，避免闭包陷阱
    const finalParagraphIdToRegister = currentParagraphId;
    const finalContentPreview = currentContent.substring(0, 50) + '...';
    
    elements.push(
      <div 
        key={`${currentParagraphId}-content`}
        id={currentParagraphId}
        data-para-id={currentParagraphId}
        className="paragraph-block mb-3 p-2 rounded transition-all duration-200"
        ref={(el) => {
          console.log('📍 [段落注册-最后] 注册段落引用:', finalParagraphIdToRegister, '元素:', !!el, '内容预览:', finalContentPreview);
          if (el) {
            console.log('📍 [段落注册-最后-DOM] 元素DOM信息:', {
              id: el.id,
              dataParaId: el.getAttribute('data-para-id'),
              className: el.className,
              offsetTop: el.offsetTop,
              clientHeight: el.clientHeight
            });
          } else {
            console.log('📍 [段落注册-最后-DOM] 元素为null，段落:', finalParagraphIdToRegister);
          }
          onContentBlockRef(el, finalParagraphIdToRegister);
        }}
      >
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
            ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
            ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
            li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
            blockquote: ({node, ...props}) => (
              <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
            ),
            code: ({node, inline, ...props}) => 
              inline 
                ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
            pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
          }}
        >
          {currentContent.trim()}
        </ReactMarkdown>
      </div>
    );
  } else {
    console.log(`📍 [段落跳过-最后] 跳过最后段落: ${currentParagraphId}, 内容为空或无段落ID`);
  }
  
  console.log(`📍 [渲染总结] 总共创建了 ${elements.length} 个段落元素`);
  return elements;
};

// 结构化Markdown渲染器组件
const StructuredMarkdownRenderer = ({ content, chunks, onSectionRef }) => {
  if (!chunks || chunks.length === 0) {
    // 回退到原始的ReactMarkdown渲染
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
            ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
            ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
            li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
            blockquote: ({node, ...props}) => (
              <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
            ),
            code: ({node, inline, ...props}) => 
              inline 
                ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
            pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // 按结构化方式渲染
  return (
    <div className="prose prose-sm max-w-none">
      {chunks.map((chunk, index) => (
        <div
          key={chunk.chunk_id}
          ref={(el) => onSectionRef(el, chunk.chunk_id)}
          data-chunk-index={index}
          data-chunk-id={chunk.chunk_id}
          className="mb-6 chunk-section transition-all duration-200 ease-in-out border-l-4 border-transparent hover:border-gray-200 dark:hover:border-gray-600"
        >
          {/* 渲染标题 */}
          {chunk.heading && (
            <div className="mb-3">
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
                  h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                  h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                  h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                }}
              >
                {chunk.heading}
              </ReactMarkdown>
            </div>
          )}
          
          {/* 渲染内容 */}
          {chunk.content && (
            <div className="chunk-content">
              <ReactMarkdown
                components={{
                  p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
                  ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
                  ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
                  blockquote: ({node, ...props}) => (
                    <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
                  ),
                  code: ({node, inline, ...props}) => 
                    inline 
                      ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                      : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
                  pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
                  // 防止嵌套标题
                  h1: ({node, ...props}) => <p className="font-bold text-lg text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                  h2: ({node, ...props}) => <p className="font-bold text-base text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                  h3: ({node, ...props}) => <p className="font-semibold text-base text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                  h4: ({node, ...props}) => <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                  h5: ({node, ...props}) => <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                  h6: ({node, ...props}) => <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2" {...props} />,
                }}
              >
                {chunk.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// 演示模式渲染器组件 - 支持演示模式和真实文档
const DemoModeRenderer = ({ content, onContentBlockRef, isRealDocument = false, chunks = [], nodeMapping = null }) => {
  
  console.log('📄 [DemoModeRenderer] 渲染器调用参数:');
  console.log('  - content存在:', !!content);
  console.log('  - content长度:', content?.length || 0);
  console.log('  - isRealDocument:', isRealDocument);
  console.log('  - chunks数量:', chunks?.length || 0);
  console.log('  - chunks详情:', chunks);
  
  // 检查内容是否包含段落ID标记
  const hasParaIds = content && content.includes('[para-');
  console.log('📄 [DemoModeRenderer] 内容分析:', {
    hasParaIds,
    contentPreview: content?.substring(0, 200) + '...',
    contentSample: content?.substring(0, 500) // 更长的内容样本
  });
  
  // 强制调试：显示内容中的段落ID匹配
  if (content) {
    const paraMatches = content.match(/\[para-\d+\]/g);
    console.log('📄 [DemoModeRenderer] 找到的段落ID标记:', paraMatches);
    console.log('📄 [DemoModeRenderer] 段落ID数量:', paraMatches?.length || 0);
  }
  
  // 🔧 缓存段落渲染结果，防止无限重渲染导致的ref注册问题
  const renderedParagraphs = useMemo(() => {
    if (content && content.includes('[para-')) {
      console.log('📄 [useMemo缓存] 重新渲染段落内容，内容长度:', content.length);
      const result = renderParagraphsWithIds(content, onContentBlockRef, nodeMapping);
      console.log('📄 [useMemo缓存] 段落渲染完成，创建的元素数量:', result?.length || 0);
      if (result && result.length > 0) {
        console.log('📄 [useMemo缓存] 第一个元素key:', result[0]?.key);
        console.log('📄 [useMemo缓存] 最后一个元素key:', result[result.length - 1]?.key);
      }
      return result;
    }
    return null;
  }, [content, onContentBlockRef, nodeMapping]);
  
  console.log('📄 [useMemo缓存] 段落渲染结果缓存状态:', !!renderedParagraphs);
  
  // 如果内容包含段落ID标记，直接渲染整个内容而不使用chunks分割
  if (isRealDocument && hasParaIds) {
    console.log('📄 [DemoModeRenderer] 进入段落ID模式，使用缓存的段落内容');
    
    return (
      <div className="prose prose-sm max-w-none">
        {renderedParagraphs}
      </div>
    );
  }
  
  // 真实文档模式：基于chunks的结构化渲染（没有段落ID时）
  if (isRealDocument && chunks && chunks.length > 0) {
    console.log('📄 [DemoModeRenderer] 进入真实文档chunks模式，chunks数量:', chunks.length);
    
    return (
      <div className="prose prose-sm max-w-none">
        {chunks.map((chunk, index) => {
          const blockId = `chunk-${index + 1}`;
          
          console.log(`📄 [DemoModeRenderer] 渲染chunk ${index + 1}:`, {
            blockId,
            chunkId: chunk.chunk_id,
            title: chunk.title,
            contentLength: chunk.content?.length || 0
          });
          
          // 使用常规的 ReactMarkdown 渲染（chunks模式下的内容没有段落ID标记）
          const renderChunkContent = (content) => {
            if (!content) return null;
            
            return (
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
                  h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                  h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                  h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                  p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
                  ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
                  ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
                  blockquote: ({node, ...props}) => (
                    <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
                  ),
                  code: ({node, inline, ...props}) => 
                    inline 
                      ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                      : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
                  pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
                }}
              >
                {content}
              </ReactMarkdown>
            );
          };
          
          return (
            <div 
              key={chunk.chunk_id}
              id={blockId}
              className="content-block mb-6 p-4 border-l-4 border-transparent transition-all duration-200"
              ref={(el) => onContentBlockRef(el, blockId)}
            >
              {/* 渲染标题 */}
              {chunk.heading && (
                <div className="mb-3">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
                      h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                      h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                      h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
                    }}
                  >
                    {chunk.heading}
                  </ReactMarkdown>
                </div>
              )}
              
              {/* 渲染内容 */}
              {chunk.content && renderChunkContent(chunk.content)}
            </div>
          );
        })}
      </div>
    );
  }
  
  // 传入真实内容但没有chunks的情况（向后兼容）
  if (content && !isRealDocument) {
    console.log('📄 [DemoModeRenderer] 进入向后兼容模式（content存在但非真实文档）');
    
    // 如果内容包含段落ID，使用段落ID渲染逻辑
    if (content.includes('[para-')) {
      console.log('📄 [向后兼容] 检测到段落ID，使用缓存的段落内容');
      
      return (
        <div className="prose prose-sm max-w-none">
          {renderedParagraphs}
        </div>
      );
    }
    
    // 普通内容渲染
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
            h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
            p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
            ul: ({node, ...props}) => <ul className="mb-3 ml-4 list-disc" {...props} />,
            ol: ({node, ...props}) => <ol className="mb-3 ml-4 list-decimal" {...props} />,
            li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
            blockquote: ({node, ...props}) => (
              <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
            ),
            code: ({node, inline, ...props}) => 
              inline 
                ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
            pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // 演示文档的内容块数据（只在纯示例模式下使用）
  console.log('📄 [DemoModeRenderer] 进入纯示例模式（使用硬编码内容）');
  const demoContentBlocks = [
    {
      id: "text-A-introduction",
      content: `为什么一位辩证学家应该学着数到四？

三元组/三位一体与其溢出/过剩——新教、雅各宾主义……与其他"消失的中介者"—"你手指的一敲"……— 为什么真理总是政治性的？`
    },
    {
      id: "text-B-fourth-party",
      content: `**·三元组/三位一体与其溢出/过剩**

一位黑格尔派的辩证学家必须学着数到多少呢？大多数黑格尔的解释者，更不用说他的批评者，都试图一致地说服我们，正确的答案是：到三（辩证的三元组[the dialectical triad]，等等）。此外，他们还互相争夺谁能更有说服力地唤起我们对"第四方"的注意。这个第四方就是不可辩证的溢出/过剩，是死亡之处所（… ）。据说它逃离辩证法的掌握，尽管（或者更准确地说，因为）它是辩证法运动的内在可能性条件：在其结果（Result）中不能被扬弃[aufgehoben]、不能重新被收入的（re-collected）纯支出性的否定性。

现在，我们可以看到增补性的要素是如何出现的：一旦我们将直接之物（theimmediate）的否定（negation）添加给直接之物，这一否定（negation）就回溯性地改变了直接性（immediacy）的意义，所以我们虽然实际上仅拥有两个要素却必须数到三。或者，如果我们设想辩证过程的完整循环，这里只有三个"肯定（positive）"的环节（直接性、其中介和最后对被中介的直接性的复归）要去数——我们漏掉的是纯粹差异的那难以理解的剩余物（surplus），它虽使得整个过程得以进行却"什么也不算（counts for nothing）"；我们漏掉的是这一"实体的虚空"，（如黑格尔所言）它同时也是所有一切（all and everything）的"容器（receptacle [Rezeptakulum]）"。`
    },
    {
      id: "text-C-vanishing-mediator-core",
      content: `**·新教、雅各宾主义……**

然而，在那对"辩证方法"进行惹人恼怒的抽象反映（abstract reflections）的最佳传统中，这种思考（ruminations）有着一种纯粹形式的本性；它们所缺乏的是与具体历史内容内在的相互联系（relatedness）。一旦我们到达这种层次，第四的剩余物-环节（surplus-moment）作为第二个环节（分裂、抽象对立）与最终结果[Result]（和解[reconciliation]）之间"消失的中介者"这种想法立刻获得了具体的轮廓——人们只需想想詹明信在其论马克斯·韦伯的文章（这篇文章有关韦伯关于新教在资本主义崛起中的作用的理论）中阐明"消失的中介者"这一概念的方式。`
    },
    {
      id: "text-D-mechanism",
      content: `**·……与其他消失的中介者**

形式和其概念内容间的裂隙，也给我们提供了通向"消失的中介者"的必然性的关键：从封建主义到新教的路径与从新教到具有宗教私人化特征的资产阶级日常生活的路径没有相同的特征。第一个路径关系到"内容"（在保持或者甚至加强宗教形式的伪装下，发生了关键性的变化——经济活动中禁欲式贪得[asceticacquisitive]的态度被明确肯定为展示恩典的势力范围），而第二个路径则是一个纯粹形式的行动，一种形式的变化（一旦新教作为禁欲式贪得[ascetic-acquisitive]的态度得到实现，它就会作为形式而脱落）。`
    },
    {
      id: "text-D1D2D3-mechanism-stages",
      content: `因此，"消失的中介者"之所以出现，是因为在一个辩证的过程中，形式停留在内容后面的方式：首先，关键性的转变发生在旧形式的限度内，甚至呈现出其复兴的主张这一外表（对基督教性的普遍化，回到其"真正的内容"，等等）；然后，一旦"精神的无声编织（silent weaving）"完成其工作，旧形式就会脱落。这一过程的双重节奏（scansion）扩展使我们能够具体地掌握"否定之否定（negation of negation）"这一陈旧的公式：第一个否定在于实质性内容缓慢、秘密且无形的变化，而自相矛盾的是，这种变化发生在其自身形式的名义下的；那么，一旦形式失去了它的实质性权利（substantial right），它就会自己摔得粉碎——否定的形式被否定了，或者用黑格尔的经典对子来说，发生"在其自身中的"（in itself）变化变成了"对于其自身的"（for itself）【或，"自在"发生的变化变成了"自为的"——译注】。`
    },
    {
      id: "text-E1-protestantism",
      content: `这种辩证的必然性位于何处呢？换言之：具体来说，新教是怎样为资本主义的出现创造条件的？并非如人们会期待的那样，通过限制宗教意识形态的影响范围或通过动摇其在中世纪社会无处不在的特征，而是相反通过将其意义（relevance）普遍化：路德反对用一道鸿沟将修道院（cloisters）与礼拜（church）作为一种独立的制度（institution）同社会的其他部分隔绝开来，因为他希望基督教的态度能够渗透并决定我们整个的世俗日常生活。

当然，我们很容易对新教的幻觉保持一种反讽的距离，并指出新教努力废除宗教与日常生活之间差距的最终结果是如何将宗教贬低为一种"治疗性（therapeutic）"的手段；更困难的则是要去构想新教作为中世纪社团主义和资本主义个人主义间"消失的中介者（vanishing mediator）"的必然性。换句话说，不可忽视的一点是，如果，人们不可能直接地，也就是缺少新教作为 "消失的中介者"的调解（intercession）而从中世纪的"封闭"社会进入资产阶级社会：正是新教通过其对基督教性（Christianity）的普遍化，为其撤回到私密领域预备了基础。`
    },
    {
      id: "text-E2-jacobinism",
      content: `在政治领域，雅各宾主义扮演了同样的角色，它甚至可以被定义为"政治的新教"。

在这里，我们也很容易保持一种反讽的距离，并指出雅各宾主义如何必然会通过将社会整体粗暴地缩减为抽象的平等原则而在恐怖主义中结束，因为这种缩减受到了分支的（ramified）具体关系之网的抵制（见黑格尔在《精神现象学》中对雅各宾主义的经典批评）。更难做到的是，要证明为什么不可能从旧制度直接进入自我本位的资产阶级日常生活——为什么，正是因为他们虚幻地将社会整体还原为民主政治方案，雅各宾主义是一个必要的"消失的中介者"（黑格尔批评得实际要点并不在于说雅各宾主义方案有乌托邦－恐怖主义特征这样的老生常谈中，而是在于此）。换句话说，在雅各宾主义中发现现代"极权主义"的根源和第一个形式是很容易的；而要完全承认和采纳没有雅各宾主义的"溢出/过剩"就不会有"常态的"多元民主这样一个事实则要更加困难并令人不安。`
    },
    {
      id: "text-E3-other-examples",
      content: `我们应该进一步复杂化这副图景：仔细观察可以发现，在从封建政治结构到资产阶级政治结构的过程中，存在着两个"消失的中介者"：绝对君主制和雅各宾主义。第一个是有关一个悖论式妥协的标志与体现（embodiment）：这种政治形式使崛起的资产阶级能够通过打破封建主义、其行会和社团（corporations）的经济力量来加强其经济霸权——当然，它的自相矛盾之处在于，封建主义正是通过将自己的最高点（crowning point）绝对化——将绝对权力赋予君主——来"自掘坟墓"的；因此，绝对君主制的结果是政治秩序与经济基础相"分离"。同样的"脱节（disconnection）"也是雅各宾主义的特征：把雅各宾主义规定为一种激进意识形态已经是陈词滥调了，它"从字面上"接受了资产阶级的政治纲领（平等、自由、博爱[brotherhood]），并努力实现它，而不考虑同公民社会的具体衔接。

两者都为他们的幻想付出了沉重的代价：专制君主很晚才注意到，社会称赞他是万能的，只是为了让一个阶级推翻另一个阶级；雅各宾派一旦完成了摧毁旧制度的机器的工作，也就变得多余了。两者都被关于政治领域自主性（autonomy）的幻想所迷惑，都相信自己的政治使命：一个相信皇权的不可质疑性，另一个相信其政治方案的恰当性（pertinence）。在另一个层面上，我们不是也可以这样说法西斯主义和共产主义，即"实际现存的社会主义（actually existing socialism）"吗？法西斯主义难道不是一种资本主义固有的自我否定，不是试图通过一种使经济从属于意识形态-政治（ideological-political）领域的意识形态来"改变一些东西，以便没有真正的改变"吗？列宁主义的"实际存在的社会主义"难道不是一种"社会主义的雅各宾主义"，不是试图使整个社会经济生活从属于社会主义国家的直接政治调节吗？它两者都是"消失的中介者"，但进入了什么呢？通常的犬儒式答案"从资本主义回到资本主义"似乎有点太容易了……`
    },
    {
      id: "text-F-mediator-illusion",
      content: `也就是说，新教和雅各宾主义所陷入的幻觉，比乍看之下要复杂得多：它并不简单地在于他们对基督教或平等主义民主方案（egalitarian-democratic project）的那朴素道德主义式的普遍化，也就是说，并不简单地在于他们忽略了抵制这种直接普遍化的社会关系的具体财富（concrete wealth of social relations）。他们的幻觉要激进得多：它同所有在历史上相关的有关政治乌托邦的幻觉具有相同的本性。马克思在谈到柏拉图的国家（State）时提请我们注意这种幻觉，他说，柏拉图没有看到他事实上所描述的不是一个尚未实现的理想（ideal），而是现存希腊国家的基本结构。换句话说，乌托邦（utopias）之所以是"乌托邦的"，不是因为它们描绘了一个"不可能的理想（Ideal）"，一个不属于这个世界的梦想，而是因为它们没有认出它们的理想国（ideal state）在其基本内容方面（黑格尔会说，"在其概念方面"）如何已然实现了。

当社会现实被构造成一个"新教世界"的时候，新教就变得多余，可以作为一个中介消失了：资本主义公民社会的概念结构（notional structure）是一个由"贪得的禁欲主义"（"你拥有的越多，你就越要放弃消费"）这个悖论所定义的原子化个人的世界——也就是说，缺少新教之积极宗教形式而只有新教之内容的结构。雅各宾主义也是如此：雅各宾派所忽视的事实是，他们努力追求的理想在其概念结构中在"肮脏的"贪得活动（acquisitive activity）中已然实现，而这种活动在他们看来是对其崇高理想的背叛。庸俗的、利己主义的资产阶级日常生活是自由、平等和博爱的现实性（actuality）：自由贸易的自由，法律面前的形式平等，等等。`
    },
    {
      id: "text-G-beautiful-soul-analogy", 
      content: `"消失的中介者"——新教徒、雅各宾主义——所特有的幻觉正是黑格尔式的"美丽灵魂"的幻觉：他们拒绝在他们所哀叹的腐败现实中承认他们自己的行为的最终结果——如拉康所说，他们自己的信息以其真实而颠倒的形式出现。而作为新教和雅各宾主义的"清醒的" 继承者，我们的幻觉也不少：我们把那些"消失的中介者"视为反常（aberrations）或溢出/过剩，没能注意到我们何以只是"没有雅各宾形式的雅各宾派"与"没有新教形式的新教徒"。`
    },
    {
      id: "text-H-mediator-event-subject",
      content: `**·你手指的一敲……**

"消失的中介者"实际上仅显现为一个中介者，一个介于两种"常态"事物状态之间的中间形象（figure）。然而，这种解读是唯一可能的解读吗？由"后马克思主义"政治理论（Claude Lefort, Ernesto Laclau）所阐述的概念装置允许另一种解读，而这种解读从根本上改变了视角。在这个领域中，"消失的中介者"这一环节被阿兰·巴迪欧定义为"事件"（它有关已确立的结构）的环节：其真相在其中出现的环节、有关"开放性（openness）"的环节——一旦"事件"的爆发被制度化为一种新的肯定性（positivity），它就会消失，或者更确切地说，在字面上不可见了。`
    },
    {
      id: "text-H1-subject-definition",
      content: `这一有关开放性（openness）的"不可能的"环节构成了主体性的环节："主体"是一个名称，指的是那个被召唤的、突然间负有责任的深不可测（unfathomable）的 X，它在这样一个有关不确定性（undecidability）的时刻被抛入一个责任的位置，被抛入这关于决定（decision）的紧急事态之中。这就是我们解读黑格尔的这一命题——"真理（True）不仅要被理解为实体，而且同样要被理解为主体"——不得不采取的方式：不仅要被理解为一个受某种隐藏的理性必然性支配的客观过程（即使这种必然性具有黑格尔式"理性的狡计"的），而且要被理解为一个被有关开放性／不确定性（undecidability）的环节所打断并审视（scan）的过程——主体的不可还原的偶然行为建立了一个新的必然性。`
    },
    {
      id: "text-H2-action-retroactive",
      content: `根据一个著名的意见（doxa），辩证法使我们能够穿透诸偶然性的表面戏剧，达至在主体背后"操纵着表演"的根本的（underlying）理性必然性。一个恰当的黑格尔式的辩证运动几乎是这一程序的完全颠倒：它驱散了对"客观历史进程"的迷信并让我们看到它的起源：历史上的必然性出现的方式——它是一种实证化（positivization）、主体在一个开放的、不确定的情势下的根本偶然决定的一个"凝结（coagulation）"。根据定义，"辩证的必然性"总是事后的（après coup）必然性：一个适当的辩证解读质疑对"实际上发生的事情"的自我证明，并将其与没有发生的事情对立起来——也就是说，它认为没有发生的事情（一系列错过的机会、一系列"替代性历史"）是"实际上发生的事情"的构成部分。

这个行动因而是"述行性"的，在超出了（exceeds）"言语行为"的意义上：其述行性是"回溯性的"：它重新定义了其诸预设的网络。行动的回溯述行性这一"溢出/过剩"也可以借助黑格尔关于法律与其逾越（transgression）、犯罪的辩证法得到阐释...`
    },
    {
      id: "text-H3-positing-presuppositions",
      content: `正是面对这样的背景，我们才必须理解黑格尔有关"设定预设（positing ofpresuppositions）"的论题：这种回溯性的设定恰恰是必然性从偶然性中出现的方式。主体"设定其预设"的环节，正是他作为主体被抹去的环节，他作为中介者消失的环节：当主体的决定行为（act of decision）变成它的反面时的那个结束的环节；建立一个新的象征网络，而历史借助这一网络再次获得了线性演进的自我证明。让我们回到十月革命：其"预设"在它的胜利和新政权的巩固之后、形势的开放性再次丧失之时才被"设定"——以"客观观察者"的身份叙述事件的线性发展（确定苏维埃政权如何在其最薄弱的环节打破帝国主义链条并从而开启世界历史的新纪元，等等）在这个时候才又一次得以可能。在此严格的意义上，主体是一个"消失的中介者"：它的行为通过变得不可见而成功——通过在一个新的象征网络中"实证化（positivizing）"自己，它将自己定位在此网络中并在其中将自己解释为历史进程的结果，从而将自己降为其自身行为所产生的整体中的一个单纯的环节。`
    },
    {
      id: "text-I-truth-political-intro",
      content: `**·为什么真理总是政治性（political）的？**

行动的概念直接相关于社会和政治（Social and Political）之间的关系——相关于"政治性（the Political）"和"政治（politics）"之间的区别，正如 Lefort和Laclau所阐述的那样...`
    },
    {
      id: "text-I1-politics-vs-thepolitical", 
      content: `"政治"是一个独立的社会综合体（separate socialcomplex）、一个与其他子系统（经济、文化形式）相互作用的、被肯定规定的（positively determined）社会关系的子系统，而"政治性"[le Politique]则是有关开放性的、不确定的环节（此时，社会的结构性原则、社会契约的基本形式被质疑）——简而言之，就是通过建立"新和谐"的行动来克服全球危机的环节。`
    },
    {
      id: "text-I2-thepolitical-explanation",
      content: `因此，"政治性"的维度得到了双重的刻画：它是社会整体的一个环节，是其子系统中的一个，并且也是整体之命运在其中被决定——新的契约在其中被设计并缔结——的地带。`
    },
    {
      id: "text-I3-origin-of-order-political",
      content: `在社会理论中，人们通常认为政治维度相对于社会（the Social）本身而言是次要的。在实证主义社会学中，政治是社会组织用以组织其自我调节的一个子系统；在经典马克思主义中，政治是社会阶级分化所导致的异化普遍性（alienatedUniversality）的独立领域（其基本含义是，无阶级社会将意味着作为一个独立领域的政治性（the Political）的终结）；甚至在一些"新社会运动"的意识形态中，政治性（the Political）被划定为国家权力的领域，公民社会必须组织其自卫调节机制反对它。针对这些概念，人们可以冒险提出这样的假设：社会的起源总是"政治性的（political）"——一个积极（positively）现存的社会体系只不过是一种形式，在这种形式中，一个彻底偶然之决定的否定性获得了（assumes）积极的（positive）、有规定的（determinate）实存。`
    },
    {
      id: "text-J-conclusion-subject-as-mediator",
      content: `现在我们可以回到臭名昭著的黑格尔三元组：主体是这个"消失的中介者"、这个第四环节，可以说，它颁布了自己的消失；它的消失正是衡量其"成功"的标准也是自我关联的否定性的虚空，一旦我们从其结果"回头"看这个过程，它就变得不可见了。`
    },
    {
      id: "text-K-truth-contingency-trauma",
      content: `对黑格尔三元组中这一溢出的第四环节的考察，使得我们能够在格雷马斯的"符号学矩阵"的背景下解读它：

必然性（necessity）和不可能性（impossibility）的对立本身溶解进入可能性（possibility）的领域（可以说，可能性是对必然性的"否定之否定"）——随之消失的是第四个术语，即绝不可能等同于可能（Possible）的偶然（theContingent）。在偶然性（contingency）中总存在某些"与实在界遭遇"的东西，某些前所未闻的实体的猛然出现，它违抗了人们对"可能"所持的既定场域的限度，而"可能"可以说是一种"温和的"、平和的偶然性，一种被拔掉了刺的偶然性。`
    },
    {
      id: "text-K1-analogy-greimas-lacan",
      content: `例如，在精神分析中，真理属于偶然性的秩序：我们在日常生活中过着无聊的生活，深陷于结构它的普遍的谎言（universal Lie）之中，而突然间，一些完全偶然的遭遇——朋友的一句闲话，我们目睹的一件事故——唤起了关于被压抑的旧创伤的记忆，打破了我们的自我欺骗。精神分析在这里是彻底反柏拉图的：普遍性是最卓越的虚假性（Falsity par excellence）的领域，而真理则是作为一种特殊的偶然遭遇出现的，这种遭遇使其"被压抑"的东西变得可见。在"可能性"中所失去的维度正是这种有关真理之出现的创伤性的、无保证的（unwarranted）特性：当一个真理变得"可能"时，它失去了"事件"的特性，它变成了一个单纯的有关事实的（factual）准确性，从而成为统治性的普遍谎言的组成部分。

现在我们可以看到，拉康的精神分析与罗蒂那种多元实用主义的"自由主义"有多远。拉康的最后一课不是真理（truths）的相对性和多元性，而是坚硬的、创伤性的事实，即在每一个具体的星丛中，真理（truth）必然会以某种偶然的细节出现。换句话说，尽管真理是依赖于语境的——尽管一般意义上的真理并不存在，有的总是某种情况的真理——但在每一个多元场域中都依然有一个阐明其真理并且本身不能被相对化的特殊的点；在这个确切的意义上，真理总是一。如果我们把"本体论"矩阵换成"义务论"矩阵，我们在这里的目标就会更清楚：

我们甚至缺乏一个合适的术语来形容这个X，来形容这"不是命令的（notprescribed）"、"容许的（facultative）"，但又不是简单的"允许的（permitted）"东西的奇怪状态——例如，在精神分析疗法中出现了一些迄今为止被禁止的知识，这些知识对禁令进行了嘲弄，暴露了其隐藏机制，但并没有因此而变成一种中性的"允许（permissiveness）"。两者之间的区别涉及到对普遍秩序的不同关系："允许（permissiveness）"是由它保证的（warranted），而这种保证在"你可以（may）……"的情况下是缺乏的，拉康称这种情况为scilicet：你可以知道（关于你的欲望的真相）——如果你为自己承担风险。这个scilicet 也许是批判性思维的最终追索。`
    }
  ];

  return (
    <div className="prose prose-sm max-w-none">
      {demoContentBlocks.map((block) => (
        <div 
          key={block.id}
          id={block.id}
          className="content-block mb-6 p-4"
          ref={(el) => {
            console.log('📍 [示例文档] 注册示例段落引用:', block.id, !!el);
            onContentBlockRef(el, block.id);
          }}
        >
          <ReactMarkdown
            components={{
              h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200 mt-4" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300 mt-3" {...props} />,
              h4: ({node, ...props}) => <h4 className="text-base font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
              h5: ({node, ...props}) => <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
              h6: ({node, ...props}) => <h6 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 mt-2" {...props} />,
              p: ({node, ...props}) => <p className="mb-3 text-gray-600 dark:text-gray-300 leading-relaxed text-sm" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="mb-1 text-gray-600 dark:text-gray-300 text-sm" {...props} />,
              blockquote: ({node, ...props}) => (
                <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 italic text-sm" {...props} />
              ),
              code: ({node, inline, ...props}) => 
                inline 
                  ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono text-red-600 dark:text-red-400" {...props} />
                  : <code className="block bg-gray-900 dark:bg-gray-800 text-green-400 dark:text-green-300 p-3 rounded-lg overflow-x-auto text-xs font-mono" {...props} />,
              pre: ({node, ...props}) => <pre className="mb-3 overflow-x-auto" {...props} />,
            }}
          >
            {block.content}
          </ReactMarkdown>
        </div>
      ))}
    </div>
  );
};

export { StructuredMarkdownRenderer, DemoModeRenderer }; 