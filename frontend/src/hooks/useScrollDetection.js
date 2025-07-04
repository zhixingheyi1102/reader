import { useState, useEffect, useCallback, useRef } from 'react';

// 简易节流函数实现
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};

// 文本块到节点的映射关系 - 演示模式使用
const textToNodeMap = {
  "text-A-introduction": "A",
  "text-B-fourth-party": "B", 
  "text-C-vanishing-mediator-core": "C",
  "text-D-mechanism": "D",
  "text-D1D2D3-mechanism-stages": "D", // 包含了D1, D2, D3的逻辑
  "text-E-examples-intro": "E", // E的引言部分
  "text-E1-protestantism": "E1",
  "text-E2-jacobinism": "E2", 
  "text-E3-other-examples": "E3",
  "text-F-mediator-illusion": "F",
  "text-G-beautiful-soul-analogy": "G",
  "text-H-mediator-event-subject": "H",
  "text-H1-subject-definition": "H1",
  "text-H2-action-retroactive": "H2",
  "text-H3-positing-presuppositions": "H3",
  "text-I-truth-political-intro": "I",
  "text-I1-politics-vs-thepolitical": "I1",
  "text-I2-thepolitical-explanation": "I2",
  "text-I3-origin-of-order-political": "I3",
  "text-J-conclusion-subject-as-mediator": "J", // J的核心论点
  "text-J1-subject-fourth-element": "J1", // J1与J内容紧密，可共用或细分
  "text-K-truth-contingency-trauma": "K", // K的引言和核心思想
  "text-K1-analogy-greimas-lacan": "K1", // 包含两个矩阵类比和精神分析的阐述
  "text-K2-truth-revelation": "K2" // K2的核心思想在K1中关于精神分析的部分已阐明
};

// 节点到文本块的映射关系 - 用于节点点击跳转
const nodeToTextMap = {
  "A": "text-A-introduction",
  "B": "text-B-fourth-party", 
  "C": "text-C-vanishing-mediator-core",
  "D": "text-D-mechanism",
  "D1": "text-D1D2D3-mechanism-stages", // D1, D2, D3都映射到同一个文本块
  "D2": "text-D1D2D3-mechanism-stages",
  "D3": "text-D1D2D3-mechanism-stages",
  "E": "text-E-examples-intro",
  "E1": "text-E1-protestantism",
  "E2": "text-E2-jacobinism", 
  "E3": "text-E3-other-examples",
  "F": "text-F-mediator-illusion",
  "G": "text-G-beautiful-soul-analogy",
  "H": "text-H-mediator-event-subject",
  "H1": "text-H1-subject-definition",
  "H2": "text-H2-action-retroactive",
  "H3": "text-H3-positing-presuppositions",
  "I": "text-I-truth-political-intro",
  "I1": "text-I1-politics-vs-thepolitical",
  "I2": "text-I2-thepolitical-explanation",
  "I3": "text-I3-origin-of-order-political",
  "J": "text-J-conclusion-subject-as-mediator",
  "J1": "text-J1-subject-fourth-element",
  "K": "text-K-truth-contingency-trauma",
  "K1": "text-K1-analogy-greimas-lacan",
  "K2": "text-K2-truth-revelation"
};

export const useScrollDetection = (containerRef, documentId, currentMindmapMode, mermaidDiagramRef) => {
  const [activeChunkId, setActiveChunkId] = useState(null);
  const [activeContentBlockId, setActiveContentBlockId] = useState(null);
  const [previousActiveNode, setPreviousActiveNode] = useState(null);
  
  const sectionRefs = useRef(new Map()); // Map<chunk_id, HTMLElement> - 仅用于目录导航
  const contentBlockRefs = useRef(new Map()); // Map<block_id, HTMLElement> - 用于段落级检测和高亮
  const contentChunks = useRef([]); // 存储内容分块信息
  
  // 动态映射关系 - 用于真实上传的文档
  const [dynamicTextToNodeMap, setDynamicTextToNodeMap] = useState({});
  const [dynamicNodeToTextMap, setDynamicNodeToTextMap] = useState({});

  // onSectionRef 回调实现 - 仅用于目录导航，不影响段落高亮
  const handleSectionRef = useCallback((element, chunkId) => {
    if (element) {
      sectionRefs.current.set(chunkId, element);
      console.log('📍 [章节引用] 设置章节引用 (仅用于目录):', chunkId, '总数:', sectionRefs.current.size);
    } else {
      sectionRefs.current.delete(chunkId);
      console.log('📍 [章节引用] 移除章节引用:', chunkId, '剩余:', sectionRefs.current.size);
    }
  }, []);

  // 内容块引用回调 - 用于段落级检测和高亮
  const handleContentBlockRef = useCallback((element, blockId) => {
    if (element) {
      contentBlockRefs.current.set(blockId, element);
      console.log('📍 [段落引用] 设置段落引用:', blockId, '总数:', contentBlockRefs.current.size);
      
      // 设置初始检测，确保页面加载后立即检测当前阅读的段落
      setTimeout(() => {
        if (contentBlockRefs.current.size > 0) {
          console.log('📍 [段落引用] 触发段落检测，因为有新段落被注册');
          // 手动触发一次滚动检测事件
          const event = new Event('scroll');
          const scrollContainer = containerRef.current?.querySelector('.overflow-y-auto');
          if (scrollContainer) {
            scrollContainer.dispatchEvent(event);
          } else {
            window.dispatchEvent(event);
          }
        }
      }, 200);
    } else {
      contentBlockRefs.current.delete(blockId);
      console.log('📍 [段落引用] 移除段落引用:', blockId, '剩余:', contentBlockRefs.current.size);
    }
  }, []);

  // 高亮Mermaid节点
  const highlightMermaidNode = useCallback((nodeId) => {
    // 确保在浏览器环境中且document可用
    if (typeof window === 'undefined' || !window.document || typeof window.document.querySelectorAll !== 'function') {
      console.warn('🎯 [节点高亮] DOM环境不可用，跳过节点高亮');
      return;
    }

    try {
      console.log('🎯 [节点高亮] 开始高亮节点:', nodeId);
      
      // 定义高亮应用函数
      const applyHighlighting = () => {
        // 移除之前的高亮
        if (previousActiveNode) {
          console.log('🎯 [节点高亮] 移除之前的高亮:', previousActiveNode);
          const prevSelectors = [
            `[data-id="${previousActiveNode}"]`,
            `#${previousActiveNode}`,
            `.node-${previousActiveNode}`,
            `[id*="${previousActiveNode}"]`
          ];
          
          let foundPrev = false;
          prevSelectors.forEach(selector => {
            const prevNodes = window.document.querySelectorAll(selector);
            if (prevNodes.length > 0) {
              foundPrev = true;
              console.log('🎯 [节点高亮] 找到之前的节点:', selector, prevNodes.length);
            }
            prevNodes.forEach(node => {
              if (node && node.classList) {
                node.classList.remove('mermaid-highlighted-node');
              }
            });
          });
          
          if (!foundPrev) {
            console.warn('🎯 [节点高亮] 未找到之前的节点:', previousActiveNode);
          }
        }

        // 添加新的高亮
        if (nodeId) {
          console.log('🎯 [节点高亮] 查找当前节点:', nodeId);
          
          // 增强选择器 - 处理更多可能的节点格式
          const selectors = [
            // 直接匹配data-id属性
            `[data-id="${nodeId}"]`,
            // 直接匹配id属性
            `#${nodeId}`,
            // 匹配class中包含节点ID的
            `.node-${nodeId}`,
            // 匹配id属性中包含节点ID的（部分匹配）
            `[id*="${nodeId}"]`,
            // 匹配class属性中包含节点ID的（部分匹配）
            `[class*="${nodeId}"]`,
            // 特殊处理：flowchart前缀格式
            `[id*="flowchart-${nodeId}-"]`,
            `[data-id*="flowchart-${nodeId}"]`,
            // 特殊处理：直接匹配包含nodeId的元素
            `*[id="${nodeId}"]`,
            `*[data-id="${nodeId}"]`,
            // 匹配SVG g元素（Mermaid常用格式）
            `g[data-id="${nodeId}"]`,
            `g[id*="${nodeId}"]`,
            // 处理可能的转义问题（特别是数字后缀）
            `[data-id="${nodeId.replace(/[^a-zA-Z0-9]/g, '\\$&')}"]`,
            // CSS选择器转义数字和特殊字符
            `[data-id="${CSS.escape ? CSS.escape(nodeId) : nodeId}"]`,
            // 更宽泛的匹配 - 匹配结尾包含nodeId的
            `[data-id$="${nodeId}"]`,
            `[id$="${nodeId}"]`
          ];
          
          console.log('🎯 [节点搜索] 尝试的选择器列表:', selectors);
          
          let foundCurrent = false;
          let foundElements = [];
          
          selectors.forEach((selector, index) => {
            try {
              const currentNodes = window.document.querySelectorAll(selector);
              if (currentNodes.length > 0) {
                foundCurrent = true;
                foundElements.push(...currentNodes);
                console.log(`🎯 [节点高亮] 选择器 ${index + 1} 成功匹配: ${selector} (找到 ${currentNodes.length} 个元素)`);
                currentNodes.forEach((node, nodeIndex) => {
                  if (node && node.classList) {
                    node.classList.add('mermaid-highlighted-node');
                    console.log(`🎯 [节点高亮] 成功高亮节点 ${nodeIndex + 1}:`, {
                      tagName: node.tagName,
                      id: node.id,
                      dataId: node.getAttribute('data-id'),
                      className: node.className,
                      selector: selector
                    });
                  }
                });
              } else {
                console.log(`🎯 [节点搜索] 选择器 ${index + 1} 无匹配: ${selector}`);
              }
            } catch (error) {
              console.warn(`🎯 [节点搜索] 选择器 ${index + 1} 执行出错: ${selector}`, error);
            }
          });
          
          if (!foundCurrent) {
            console.warn('🎯 [节点高亮] 所有选择器都未找到节点:', nodeId);
            
            // 输出详细的调试信息
            console.log('🔍 [调试分析] 开始分析页面中的所有可能节点...');
            
            // 查找所有Mermaid相关元素
            const allMermaidElements = window.document.querySelectorAll('[class*="node"], [data-id], [id], g, .mermaid *');
            console.log('🔍 [调试分析] 页面中所有可能的Mermaid元素数量:', allMermaidElements.length);
            
            // 筛选出可能与目标节点相关的元素
            const relevantElements = Array.from(allMermaidElements).filter(el => {
              const id = el.id || '';
              const dataId = el.getAttribute('data-id') || '';
              const className = el.className || '';
              
              return id.includes(nodeId) || 
                     dataId.includes(nodeId) || 
                     className.includes(nodeId) ||
                     // 检查是否包含节点ID的任何部分
                     (nodeId.length > 1 && (id.includes(nodeId.substring(0, nodeId.length-1)) || 
                                           dataId.includes(nodeId.substring(0, nodeId.length-1))));
            });
            
            console.log(`🔍 [调试分析] 与节点 "${nodeId}" 相关的元素 (${relevantElements.length} 个):`, 
              relevantElements.map(el => ({
                tagName: el.tagName,
                id: el.id,
                dataId: el.getAttribute('data-id'),
                className: el.className.substring(0, 100),
                textContent: el.textContent?.substring(0, 50)
              }))
            );
            
            // 特别检查是否有类似的节点ID
            const allDataIds = Array.from(allMermaidElements)
              .map(el => el.getAttribute('data-id'))
              .filter(Boolean);
            const allIds = Array.from(allMermaidElements)
              .map(el => el.id)
              .filter(Boolean);
            
            console.log('🔍 [调试分析] 所有data-id值:', [...new Set(allDataIds)]);
            console.log('🔍 [调试分析] 所有id值:', [...new Set(allIds)]);
            
            // 查找最相似的ID
            const similarIds = [...new Set([...allDataIds, ...allIds])].filter(id => 
              id.toLowerCase().includes(nodeId.toLowerCase()) ||
              nodeId.toLowerCase().includes(id.toLowerCase())
            );
            console.log(`🔍 [调试分析] 与 "${nodeId}" 相似的ID:`, similarIds);
            
          } else {
            console.log(`🎯 [节点高亮] 成功找到并高亮 ${foundElements.length} 个元素`);
          }
          
          console.log('🎯 [节点高亮] 高亮节点完成:', nodeId);
          
          // 自动确保高亮的节点可见
          if (foundCurrent && mermaidDiagramRef && mermaidDiagramRef.current) {
            console.log('🎯 [节点可见性] 尝试确保节点可见:', nodeId);
            // 延迟一点时间确保高亮样式已应用
            setTimeout(() => {
              try {
                mermaidDiagramRef.current.ensureNodeVisible(nodeId);
                console.log('🎯 [节点可见性] 成功调用ensureNodeVisible方法');
              } catch (error) {
                console.error('🎯 [节点可见性] 调用ensureNodeVisible失败:', error);
              }
            }, 100); // 减少延迟时间，让响应更快
          } else {
            console.warn('🎯 [节点可见性] 无法确保节点可见，原因:', {
              foundCurrent,
              hasMermaidRef: !!mermaidDiagramRef,
              hasCurrentRef: !!(mermaidDiagramRef && mermaidDiagramRef.current)
            });
          }
        }
      };

      // 立即尝试应用高亮
      applyHighlighting();

      // 多次重试，处理异步渲染
      const retryTimeouts = [100, 300, 500, 1000, 2000];
      retryTimeouts.forEach(delay => {
        setTimeout(() => {
          console.log(`🎯 [节点高亮] 延迟${delay}ms重试高亮:`, nodeId);
          applyHighlighting();
        }, delay);
      });

      // 设置MutationObserver监听Mermaid图表变化
      if (nodeId) {
        const mermaidContainer = window.document.querySelector('.mermaid, [data-processed-by-mermaid]');
        if (mermaidContainer) {
          console.log('🎯 [节点高亮] 设置MutationObserver监听图表变化');
          
          // 清除之前的观察者
          if (window.mermaidMutationObserver) {
            window.mermaidMutationObserver.disconnect();
          }
          
          window.mermaidMutationObserver = new MutationObserver((mutations) => {
            let shouldReapply = false;
            mutations.forEach(mutation => {
              if (mutation.type === 'childList' || mutation.type === 'attributes') {
                shouldReapply = true;
              }
            });
            
            if (shouldReapply) {
              console.log('🎯 [节点高亮] 检测到Mermaid图表变化，重新应用高亮');
              setTimeout(() => {
                applyHighlighting();
              }, 100);
            }
          });
          
          window.mermaidMutationObserver.observe(mermaidContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
          });
        }
      }
      
      setPreviousActiveNode(nodeId);
    } catch (error) {
      console.error('🎯 [节点高亮] 高亮节点时出错:', error);
    }
  }, [previousActiveNode, mermaidDiagramRef]);

  // 高亮段落内容块
  const highlightParagraph = useCallback((blockId) => {
    // 确保在浏览器环境中且document可用
    if (typeof window === 'undefined' || !window.document || typeof window.document.querySelectorAll !== 'function') {
      console.warn('🎯 [段落高亮] DOM环境不可用，跳过段落高亮');
      return;
    }

    try {
      console.log('🎯 [段落高亮] 开始高亮段落:', blockId);
      
      // 移除所有之前的段落高亮样式（支持示例文档的.content-block和上传文档的.paragraph-block）
      const allElements = window.document.querySelectorAll('.paragraph-block, .content-block, [id^="para-"], [data-para-id], [id^="text-"], [id^="chunk-"]');
      allElements.forEach(element => {
        if (element && element.classList) {
          element.classList.remove('semantic-paragraph-highlighted');
          console.log('🎯 [段落高亮] 移除之前的高亮:', element.id || element.getAttribute('data-para-id'));
        }
      });

      // 添加新的段落高亮
      if (blockId) {
        const currentBlock = contentBlockRefs.current.get(blockId);
        if (currentBlock && currentBlock.classList) {
          // 添加段落级高亮样式
          currentBlock.classList.add('semantic-paragraph-highlighted');
          console.log('🎯 [段落高亮] 成功高亮段落:', blockId, currentBlock);
          
          // 确保段落可见（滚动到视图中）
          const rect = currentBlock.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
          
          if (!isVisible) {
            console.log('🎯 [段落高亮] 段落不完全可见，滚动到视图中');
            currentBlock.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        } else {
          console.warn('🎯 [段落高亮] 未找到段落元素:', blockId, 'contentBlockRefs中的所有键:', Array.from(contentBlockRefs.current.keys()));
        }
      }
    } catch (error) {
      console.error('🎯 [段落高亮] 高亮段落时出错:', error);
    }
  }, []);

  // 段落检测函数 - 专门用于检测当前阅读的段落
  const determineActiveParagraph = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const anchorY = viewportHeight * 0.4; // 视口顶部向下40%作为阅读锚点

    console.log('📖 [段落检测] 开始检测当前阅读段落，锚点Y:', anchorY, '段落数量:', contentBlockRefs.current.size);
    console.log('📖 [段落检测] 当前状态 - 动态映射数量:', Object.keys(dynamicTextToNodeMap).length);
    console.log('📖 [段落检测] 当前状态 - 静态映射数量:', Object.keys(textToNodeMap).length);

    let currentActiveParagraphId = null;
    let bestDistance = Infinity;

    // 遍历所有段落块，找到最接近阅读锚点的段落
    contentBlockRefs.current.forEach((element, blockId) => {
      const rect = element.getBoundingClientRect();
      
      // 计算段落中心点到阅读锚点的距离
      const paragraphCenter = rect.top + rect.height / 2;
      const distance = Math.abs(paragraphCenter - anchorY);
      
      console.log(`📖 [段落检测] 段落 ${blockId}: top=${rect.top.toFixed(1)}, center=${paragraphCenter.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}, distance=${distance.toFixed(1)}`);
      
      // 确保段落在视口中且距离阅读锚点最近
      if (rect.top < viewportHeight && rect.bottom > 0 && distance < bestDistance) {
        currentActiveParagraphId = blockId;
        bestDistance = distance;
        console.log(`📖 [段落检测] 段落 ${blockId} 成为最佳候选，距离=${distance.toFixed(1)}`);
      }
    });

    console.log(`📖 [段落检测] 最终确定活动段落: ${currentActiveParagraphId}`);

    // 更新活动段落状态
    setActiveContentBlockId(prevId => {
      if (prevId !== currentActiveParagraphId) {
        console.log("📖 [段落检测] 活动段落变更:", prevId, "→", currentActiveParagraphId);
        
        // 高亮新的活动段落
        if (currentActiveParagraphId) {
          highlightParagraph(currentActiveParagraphId);
          
          // 优先使用动态映射，只有在动态映射为空时才使用静态映射
          const hasDynamicMapping = Object.keys(dynamicTextToNodeMap).length > 0;
          const currentTextToNodeMap = hasDynamicMapping ? dynamicTextToNodeMap : textToNodeMap;
          const nodeId = currentTextToNodeMap[currentActiveParagraphId];
          
          console.log('🔍 [节点映射检查] 段落ID:', currentActiveParagraphId);
          console.log('🔍 [节点映射检查] 动态映射数量:', Object.keys(dynamicTextToNodeMap).length);
          console.log('🔍 [节点映射检查] 静态映射数量:', Object.keys(textToNodeMap).length);
          console.log('🔍 [节点映射检查] 使用映射类型:', hasDynamicMapping ? '动态映射' : '静态映射');
          console.log('🔍 [节点映射检查] 映射表前5个键:', Object.keys(currentTextToNodeMap).slice(0, 5));
          console.log('🔍 [节点映射检查] 找到节点ID:', nodeId);
          
          if (nodeId) {
            console.log('📖 [段落检测] ✅ 找到对应节点，开始高亮:', nodeId);
            highlightMermaidNode(nodeId);
          } else {
            console.warn('📖 [段落检测] ❌ 未找到段落对应的节点映射:', currentActiveParagraphId);
            
            // 详细调试信息
            if (hasDynamicMapping) {
              console.log('🔍 [调试] 动态映射详情:', dynamicTextToNodeMap);
              // 检查是否存在类似的键
              const similarKeys = Object.keys(dynamicTextToNodeMap).filter(key => 
                key.includes(currentActiveParagraphId.replace('para-', '')) || 
                currentActiveParagraphId.includes(key.replace('para-', ''))
              );
              console.log('🔍 [调试] 相似的键:', similarKeys);
            } else {
              console.log('🔍 [调试] 静态映射详情:', Object.keys(textToNodeMap));
            }
            
            // 如果是上传模式且没有找到映射，这是一个问题
            if (currentActiveParagraphId.startsWith('para-') && !hasDynamicMapping) {
              console.error('❌ [严重错误] 上传文档使用了静态映射！动态映射应该已经创建');
            }
          }
        }
        
        return currentActiveParagraphId;
      }
      return prevId;
    });
  }, [highlightParagraph, highlightMermaidNode, textToNodeMap, dynamicTextToNodeMap]);

  // 等待Mermaid图表渲染完成的检查函数 - 移到顶层作用域
  const waitForMermaidRender = useCallback(() => {
    return new Promise((resolve) => {
      const checkMermaid = () => {
        const mermaidElement = window.document?.querySelector('.mermaid, [data-processed-by-mermaid]');
        const svgElement = mermaidElement?.querySelector('svg');
        
        if (svgElement && svgElement.children.length > 0) {
          console.log('🎨 [Mermaid检查] Mermaid图表已渲染完成');
          resolve(true);
        } else {
          console.log('🎨 [Mermaid检查] 等待Mermaid图表渲染...');
          setTimeout(checkMermaid, 200);
        }
      };
      
      checkMermaid();
      
      // 超时保护
      setTimeout(() => {
        console.log('🎨 [Mermaid检查] Mermaid图表渲染检查超时，继续执行');
        resolve(false);
      }, 5000);
    });
  }, []);

  // 初始化检测函数 - 统一使用内容块检测
  const initializeDetection = useCallback(async () => {
    console.log('🎨 [统一模式] 开始初始化内容块检测，文档ID:', documentId);
    
    // 立即启动段落检测，不等待思维导图渲染
    setTimeout(() => {
      console.log('🎨 [统一模式] 执行初始内容块检测');
      determineActiveParagraph();
    }, 300);
    
    // 如果存在思维导图，额外等待渲染完成后再次检测
    const mermaidElement = window.document?.querySelector('.mermaid, [data-processed-by-mermaid]');
    if (mermaidElement) {
      console.log('🎨 [思维导图检测] 发现思维导图，等待渲染完成');
      await waitForMermaidRender();
      setTimeout(() => {
        console.log('🎨 [思维导图检测] 思维导图渲染完成，重新执行段落检测');
        determineActiveParagraph();
      }, 100);
    }
  }, [documentId, waitForMermaidRender, determineActiveParagraph]);

  // 段落级滚动检测逻辑 - 使用稳定的引用避免重复执行
  useEffect(() => {
    console.log('🔧 [段落滚动检测] useEffect触发，文档ID:', documentId);
    console.log('🔧 [段落滚动检测] 当前动态映射数量:', Object.keys(dynamicTextToNodeMap).length);
    console.log('🔧 [段落滚动检测] 当前静态映射数量:', Object.keys(textToNodeMap).length);
    
    // 创建节流处理函数 - 直接使用最新的状态引用，避免闭包问题
    const throttledHandler = throttle(() => {
      if (contentBlockRefs.current.size > 0) {
        console.log('📜 [滚动事件] 触发段落检测，当前段落数量:', contentBlockRefs.current.size);
        console.log('📜 [滚动事件] 可用段落列表:', Array.from(contentBlockRefs.current.keys()));
        
        // 直接调用最新的段落检测逻辑，避免闭包问题
        const viewportHeight = window.innerHeight;
        const anchorY = viewportHeight * 0.4;

        let currentActiveParagraphId = null;
        let bestDistance = Infinity;

        contentBlockRefs.current.forEach((element, blockId) => {
          const rect = element.getBoundingClientRect();
          const paragraphCenter = rect.top + rect.height / 2;
          const distance = Math.abs(paragraphCenter - anchorY);
          
          console.log(`📜 [滚动检测] 段落 ${blockId}: top=${rect.top.toFixed(1)}, center=${paragraphCenter.toFixed(1)}, distance=${distance.toFixed(1)}`);
          
          if (rect.top < viewportHeight && rect.bottom > 0 && distance < bestDistance) {
            currentActiveParagraphId = blockId;
            bestDistance = distance;
            console.log(`📜 [滚动检测] 段落 ${blockId} 成为最佳候选`);
          }
        });

        console.log(`📜 [滚动事件] 检测结果: ${currentActiveParagraphId}`);

        // 直接调用状态更新
        setActiveContentBlockId(prevId => {
          if (prevId !== currentActiveParagraphId) {
            console.log("📜 [滚动事件] 活动段落变更:", prevId, "→", currentActiveParagraphId);
            
            // 触发段落高亮和节点映射
            if (currentActiveParagraphId) {
              // 异步调用高亮函数，避免状态更新冲突
              setTimeout(() => {
                // 段落高亮
                const currentBlock = contentBlockRefs.current.get(currentActiveParagraphId);
                if (currentBlock) {
                  // 移除所有之前的高亮
                  const allElements = window.document.querySelectorAll('.paragraph-block, .content-block, [id^="para-"], [data-para-id], [id^="text-"], [id^="chunk-"]');
                  allElements.forEach(element => {
                    if (element && element.classList) {
                      element.classList.remove('semantic-paragraph-highlighted');
                    }
                  });
                  
                  // 添加新高亮
                  currentBlock.classList.add('semantic-paragraph-highlighted');
                  console.log('📜 [滚动事件] 成功高亮段落:', currentActiveParagraphId);
                }
                
                // 节点映射和高亮 - 直接调用determineActiveParagraph中的逻辑
                console.log('📜 [滚动节点映射] 开始处理节点映射');
                
                // 重新调用determineActiveParagraph来确保使用最新状态
                setTimeout(() => {
                  determineActiveParagraph();
                }, 50);
              }, 0);
            }
            
            return currentActiveParagraphId;
          }
          return prevId;
        });
      } else {
        console.log('📜 [滚动事件] 没有可用的段落进行检测');
      }
    }, 200);

    // 查找滚动容器
    let scrollContainer = null;
    
    const findScrollContainer = () => {
      if (containerRef.current) {
        const selectors = [
          '.overflow-y-auto',
          '[style*="overflow-y: auto"]',
          '[style*="overflow: auto"]',
          '.h-full.overflow-hidden.flex.flex-col > div:last-child',
        ];
        
        for (const selector of selectors) {
          scrollContainer = containerRef.current.querySelector(selector);
          if (scrollContainer) {
            console.log('📜 [滚动检测] 找到滚动容器，选择器:', selector);
            return scrollContainer;
          }
        }
        
        // 通过样式检测
        const allElements = containerRef.current.querySelectorAll('*');
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
              style.overflow === 'auto' || style.overflow === 'scroll') {
            scrollContainer = el;
            console.log('📜 [滚动检测] 通过样式检测找到滚动容器:', el.className);
            return scrollContainer;
          }
        }
      }
      return null;
    };

    // 延迟设置监听器，确保DOM已经渲染
    const setupScrollListener = () => {
      scrollContainer = findScrollContainer();
      
      if (scrollContainer) {
        console.log('📜 [滚动检测] 添加滚动监听到容器');
        scrollContainer.addEventListener('scroll', throttledHandler, { passive: true });
      } else {
        console.log('📜 [滚动检测] 未找到滚动容器，使用window滚动监听');
        window.addEventListener('scroll', throttledHandler, { passive: true });
      }
      
      window.addEventListener('resize', throttledHandler, { passive: true });
    };

    // 延迟设置，确保DOM完全加载
    const timer = setTimeout(setupScrollListener, 300);

    return () => {
      console.log('🔧 [段落滚动检测] 清理事件监听器');
      clearTimeout(timer);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', throttledHandler);
      } else {
        window.removeEventListener('scroll', throttledHandler);
      }
      window.removeEventListener('resize', throttledHandler);
    };
  }, [documentId, determineActiveParagraph]); // 添加determineActiveParagraph作为依赖

  // 统一的初始化检测 - 在内容加载完成后启动
  useEffect(() => {
    console.log('🎨 [统一初始化] 启动初始化检测');
    
    // 启动初始化检测
    const timer = setTimeout(() => {
      initializeDetection();
    }, 200); // 稍微延迟确保DOM已准备好
    
    return () => {
      clearTimeout(timer);
    };
  }, [initializeDetection]); // 只依赖初始化函数

  // 组件卸载时清理MutationObserver
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.mermaidMutationObserver) {
        console.log('🧹 [清理] 断开MutationObserver连接');
        window.mermaidMutationObserver.disconnect();
        window.mermaidMutationObserver = null;
      }
    };
  }, []);

  // 监听动态映射状态变化，确保状态更新后重新检测
  useEffect(() => {
    const dynamicMappingCount = Object.keys(dynamicTextToNodeMap).length;
    console.log('🔄 [映射状态监听] 动态映射状态变化，数量:', dynamicMappingCount);
    
    if (dynamicMappingCount > 0) {
      console.log('🔄 [映射状态监听] 检测到动态映射已创建，触发段落重新检测');
      
      // 延迟一点时间确保状态完全更新
      const timer = setTimeout(() => {
        console.log('🔄 [映射状态监听] 执行延迟段落检测');
        determineActiveParagraph();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [dynamicTextToNodeMap, determineActiveParagraph]);

  const scrollToSection = (item) => {
    const element = sectionRefs.current.get(item.id);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  // 根据节点ID滚动到对应的语义块（支持多段落高亮）
  const scrollToContentBlock = useCallback((nodeId) => {
    console.log('📜 [语义块滚动] 开始查找节点对应的语义块:', nodeId);
    console.log('📜 [语义块滚动] 当前文档ID:', documentId);
    
    // 优先使用动态映射，回退到静态映射
    const currentNodeToTextMap = Object.keys(dynamicNodeToTextMap).length > 0 ? dynamicNodeToTextMap : nodeToTextMap;
    const textBlockIds = currentNodeToTextMap[nodeId];
    
    console.log('📜 [语义块滚动] 使用映射类型:', Object.keys(dynamicNodeToTextMap).length > 0 ? 'semantic' : 'static');
    console.log('📜 [语义块滚动] 动态映射数量:', Object.keys(dynamicNodeToTextMap).length);
    console.log('📜 [语义块滚动] 找到的文本块:', textBlockIds);
    
    if (!textBlockIds) {
      console.warn('📜 [语义块滚动] 未找到节点对应的文本块映射:', nodeId);
      console.log('📜 [语义块滚动] 可用的节点映射:', Object.keys(currentNodeToTextMap));
      console.log('📜 [语义块滚动] 动态映射详情:', dynamicNodeToTextMap);
      console.log('📜 [语义块滚动] 静态映射详情:', nodeToTextMap);
      return;
    }

    // 处理语义映射（数组）或静态映射（字符串）
    const targetIds = Array.isArray(textBlockIds) ? textBlockIds : [textBlockIds];
    console.log('📜 [语义块滚动] 目标段落/块ID列表:', targetIds);

    // 查找并高亮所有相关的段落
    const foundElements = [];
    let primaryElement = null;

    targetIds.forEach(blockId => {
      // 首先尝试查找段落元素（para-X格式）
      let element = null;
      
      if (blockId.startsWith('para-')) {
        // 查找段落元素
        element = window.document?.getElementById(blockId) || 
                 window.document?.querySelector(`[data-para-id="${blockId}"]`) ||
                 contentBlockRefs.current.get(blockId);
        
        if (element) {
          console.log('📜 [语义块滚动] 找到段落元素:', blockId);
          foundElements.push({ element, id: blockId, type: 'paragraph' });
          
          // 将第一个找到的段落作为主要滚动目标
          if (!primaryElement) {
            primaryElement = element;
          }
        } else {
          console.warn('📜 [语义块滚动] 未找到段落元素:', blockId);
        }
      } else {
        // 查找内容块元素（chunk-X格式）
        element = contentBlockRefs.current.get(blockId);
        
        if (element) {
          console.log('📜 [语义块滚动] 找到内容块元素:', blockId);
          foundElements.push({ element, id: blockId, type: 'block' });
          
          if (!primaryElement) {
            primaryElement = element;
          }
        } else {
          console.warn('📜 [语义块滚动] 未找到内容块元素:', blockId);
        }
      }
    });

    if (foundElements.length > 0) {
      console.log('📜 [语义块滚动] 找到', foundElements.length, '个相关元素');
      
      // 滚动到主要元素 - 将目标段落放在视口40%位置
      if (primaryElement) {
        console.log('📜 [语义块滚动] 滚动到主要元素（40%位置）');
        
        // 查找滚动容器（优先查找.overflow-y-auto容器）
        let scrollContainer = null;
        if (containerRef.current) {
          const selectors = [
            '.overflow-y-auto',
            '[style*="overflow-y: auto"]',
            '[style*="overflow: auto"]'
          ];
          
          for (const selector of selectors) {
            scrollContainer = containerRef.current.querySelector(selector);
            if (scrollContainer) {
              console.log('📜 [滚动容器] 找到滚动容器，选择器:', selector);
              break;
            }
          }
        }
        
        if (scrollContainer) {
          // 使用容器滚动
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = primaryElement.getBoundingClientRect();
          
          // 计算元素相对于滚动容器的位置
          const elementRelativeTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
          
          // 计算容器高度的40%
          const containerHeight = scrollContainer.clientHeight;
          const targetOffset = containerHeight * 0.35;
          
          // 计算滚动位置：元素顶部 - 容器40%位置
          const scrollTo = elementRelativeTop - targetOffset;
          
          console.log('📜 [滚动计算] 使用容器滚动 - 元素相对位置:', elementRelativeTop, '容器40%偏移:', targetOffset, '目标滚动位置:', scrollTo);
          
          // 平滑滚动到目标位置
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTo), // 确保不滚动到负数位置
            behavior: 'smooth'
          });
        } else {
          // 回退到窗口滚动
          console.log('📜 [滚动计算] 未找到容器，使用window滚动');
          const elementRect = primaryElement.getBoundingClientRect();
          const elementTop = elementRect.top + window.pageYOffset;
          
          // 计算视口高度的40%
          const viewportHeight = window.innerHeight;
          const targetOffset = viewportHeight * 0.35;
          
          // 计算滚动位置：元素顶部 - 视口40%位置
          const scrollTo = elementTop - targetOffset;
          
          console.log('📜 [滚动计算] 元素顶部位置:', elementTop, '视口40%偏移:', targetOffset, '目标滚动位置:', scrollTo);
          
          // 平滑滚动到目标位置
          window.scrollTo({
            top: Math.max(0, scrollTo), // 确保不滚动到负数位置
            behavior: 'smooth'
          });
        }
      }
      
      console.log('📜 [语义块滚动] 滚动完成（不进行高亮）');
    } else {
      console.warn('📜 [语义块滚动] 未找到任何目标元素');
      console.log('📜 [语义块滚动] 可用的内容块:', Array.from(contentBlockRefs.current.keys()));
      
      // 输出DOM中所有可能的段落元素进行调试
      const allParaElements = window.document?.querySelectorAll('[id^="para-"], [data-para-id]');
      if (allParaElements && allParaElements.length > 0) {
        console.log('📜 [语义块滚动] DOM中的段落元素:', Array.from(allParaElements).map(el => el.id || el.getAttribute('data-para-id')));
      }
    }
  }, [documentId, dynamicNodeToTextMap, containerRef]);

  // 更新动态映射函数 - 基于AI语义块的段落级映射
  const updateDynamicMapping = useCallback((chunks, mermaidCode, nodeMapping = null) => {
    console.log('🔗 [语义映射] 开始创建基于段落的语义块映射');
    console.log('🔗 [语义映射] chunks数量:', chunks?.length);
    console.log('🔗 [语义映射] mermaidCode长度:', mermaidCode?.length);
    console.log('🔗 [语义映射] nodeMapping类型:', typeof nodeMapping);
    console.log('🔗 [语义映射] nodeMapping内容:', nodeMapping);
    
    if (!mermaidCode) {
      console.warn('🔗 [语义映射] 缺少mermaidCode，无法创建映射');
      return;
    }
    
    const newTextToNodeMap = {};
    const newNodeToTextMap = {};
    
    if (nodeMapping && typeof nodeMapping === 'object') {
      console.log('🔗 [语义映射] 基于AI语义块创建段落级映射');
      console.log('🔗 [语义映射] nodeMapping键数量:', Object.keys(nodeMapping).length);
      
      // 为每个AI语义块创建映射
      Object.entries(nodeMapping).forEach(([nodeId, nodeInfo]) => {
        console.log(`🔗 [语义块处理] 处理节点 ${nodeId}:`, nodeInfo);
        
        if (nodeInfo && nodeInfo.paragraph_ids && Array.isArray(nodeInfo.paragraph_ids)) {
          console.log(`🔗 [语义块] 节点 ${nodeId} 包含段落:`, nodeInfo.paragraph_ids);
          
          // 为每个段落创建到节点的映射
          nodeInfo.paragraph_ids.forEach(paraId => {
            if (paraId && typeof paraId === 'string') {
              // 统一段落ID格式
              const paragraphId = paraId.startsWith('para-') ? paraId : `para-${paraId}`;
              
              // 段落到节点的映射（多对一：多个段落可能对应同一个节点）
              newTextToNodeMap[paragraphId] = nodeId;
              
              console.log(`📍 [段落映射创建] ${paragraphId} -> 节点 ${nodeId}`);
            } else {
              console.warn(`📍 [段落映射警告] 无效的段落ID:`, paraId);
            }
          });
          
          // 节点到段落组的映射（一对多：一个节点对应多个段落）
          newNodeToTextMap[nodeId] = nodeInfo.paragraph_ids.map(paraId => 
            paraId.startsWith('para-') ? paraId : `para-${paraId}`
          );
          
          console.log(`🔗 [节点映射创建] 节点 ${nodeId} -> 段落组 [${newNodeToTextMap[nodeId].join(', ')}]`);
        } else {
          console.warn(`🔗 [语义块警告] 节点 ${nodeId} 缺少有效的段落ID数组:`, nodeInfo);
        }
      });
      
      console.log('🔗 [语义映射] AI语义块映射创建完成');
      console.log('🔗 [语义映射] 段落到节点映射数量:', Object.keys(newTextToNodeMap).length);
      console.log('🔗 [语义映射] 节点到段落映射数量:', Object.keys(newNodeToTextMap).length);
      console.log('🔗 [语义映射] 最终段落映射表:', newTextToNodeMap);
      console.log('🔗 [语义映射] 最终节点映射表:', newNodeToTextMap);
    } else {
      // 回退逻辑：基于chunks创建简单映射
      console.log('🔗 [语义映射] 使用chunks创建回退映射');
      
      if (chunks && chunks.length > 0) {
        chunks.forEach((chunk, index) => {
          const blockId = `chunk-${index + 1}`;
          const nodeId = String.fromCharCode(65 + index); // A, B, C...
          
          newTextToNodeMap[blockId] = nodeId;
          newNodeToTextMap[nodeId] = [blockId];
          
          console.log(`🔗 [回退映射] 块 ${blockId} <-> 节点 ${nodeId}`);
        });
        
        console.log('🔗 [回退映射] 回退映射创建完成:', newTextToNodeMap);
      } else {
        console.warn('🔗 [语义映射] 没有chunks数据，无法创建回退映射');
      }
    }
    
    // 更新状态
    console.log('🔗 [状态更新] 更新动态映射状态');
    console.log('🔗 [状态更新] 即将设置的textToNodeMap数量:', Object.keys(newTextToNodeMap).length);
    console.log('🔗 [状态更新] 即将设置的nodeToTextMap数量:', Object.keys(newNodeToTextMap).length);
    
    setDynamicTextToNodeMap(newTextToNodeMap);
    setDynamicNodeToTextMap(newNodeToTextMap);
    
    console.log('🔗 [语义映射] 映射创建完成');
    console.log('🔗 [语义映射] 最终textToNodeMap:', newTextToNodeMap);
    console.log('🔗 [语义映射] 最终nodeToTextMap:', newNodeToTextMap);
    
    // 保存到localStorage用于调试
    try {
      localStorage.setItem('debug_semanticTextToNodeMap', JSON.stringify(newTextToNodeMap));
      localStorage.setItem('debug_semanticNodeToTextMap', JSON.stringify(newNodeToTextMap));
      localStorage.setItem('debug_aiNodeMapping', JSON.stringify(nodeMapping));
      console.log('💾 [调试保存] 语义映射已保存到localStorage，可通过 localStorage.getItem("debug_semanticTextToNodeMap") 查看');
    } catch (e) {
      console.warn('💾 [调试保存] 保存失败:', e);
    }
    
    // 在状态更新后触发检测 - 使用setTimeout确保状态更新完成
    console.log('🔗 [状态更新] 准备在状态更新后触发段落检测');
    setTimeout(() => {
      console.log('🔗 [状态更新] 延迟触发段落检测，当前mapping数量应该是:', Object.keys(newTextToNodeMap).length);
      // 注意：这里由于闭包问题，需要依赖useEffect监听状态变化来触发检测
      // determineActiveParagraph(); // 不在这里直接调用，而是依赖useEffect监听
    }, 50);
    
  }, []);

  // 调试辅助函数
  const debugScrollDetection = useCallback(() => {
    console.log('=== 🔍 滚动检测调试信息 ===');
    console.log('📄 文档ID:', documentId);
    console.log('📊 段落数量:', contentBlockRefs.current.size);
    console.log('📋 可用段落列表:', Array.from(contentBlockRefs.current.keys()));
    console.log('📍 当前活动段落:', activeContentBlockId);
    
    console.log('🗺️ 动态映射数量:', Object.keys(dynamicTextToNodeMap).length);
    console.log('🗺️ 动态段落映射前10个:', Object.fromEntries(Object.entries(dynamicTextToNodeMap).slice(0, 10)));
    console.log('🗺️ 动态节点映射:', dynamicNodeToTextMap);
    
    console.log('📖 静态映射数量:', Object.keys(textToNodeMap).length);
    console.log('📖 静态段落映射前5个:', Object.fromEntries(Object.entries(textToNodeMap).slice(0, 5)));
    console.log('📖 静态节点映射:', nodeToTextMap);
    
    // 检查DOM中的段落元素
    const domParagraphs = window.document?.querySelectorAll('[id^="para-"], [data-para-id], [id^="text-"], [id^="chunk-"]');
    console.log('🌐 DOM中的段落元素数量:', domParagraphs?.length || 0);
    if (domParagraphs && domParagraphs.length > 0) {
      const domParagraphIds = Array.from(domParagraphs).map(el => el.id || el.getAttribute('data-para-id') || el.className);
      console.log('🌐 DOM段落ID前10个:', domParagraphIds.slice(0, 10));
    }
    
    // 检查Mermaid节点
    const mermaidNodes = window.document?.querySelectorAll('[data-id], .node');
    console.log('🎨 Mermaid节点数量:', mermaidNodes?.length || 0);
    if (mermaidNodes && mermaidNodes.length > 0) {
      const nodeIds = Array.from(mermaidNodes).map(el => el.getAttribute('data-id') || el.id).filter(Boolean);
      console.log('🎨 Mermaid节点ID列表:', [...new Set(nodeIds)]);
    }
    
    // 检查当前活动段落的映射
    if (activeContentBlockId) {
      const hasDynamicMapping = Object.keys(dynamicTextToNodeMap).length > 0;
      const currentMapping = hasDynamicMapping ? dynamicTextToNodeMap : textToNodeMap;
      const mappedNode = currentMapping[activeContentBlockId];
      console.log(`🔗 当前段落 ${activeContentBlockId} 映射到节点:`, mappedNode);
      console.log(`🔗 使用的映射类型:`, hasDynamicMapping ? '动态' : '静态');
      
      if (!mappedNode) {
        console.warn('❌ 当前段落没有对应的节点映射！');
        console.log('💡 建议检查:', {
          '段落ID格式': '确保段落ID格式正确（如para-1, para-2...）',
          '映射创建': '检查updateDynamicMapping函数是否被正确调用',
          '数据结构': '检查nodeMapping数据结构是否正确'
        });
        
        // 尝试查找相似的键
        const allKeys = Object.keys(currentMapping);
        const similarKeys = allKeys.filter(key => 
          key.includes(activeContentBlockId.replace('para-', '')) || 
          activeContentBlockId.includes(key.replace('para-', ''))
        );
        console.log('🔍 相似的映射键:', similarKeys);
      }
    }
    
    console.log('=== 🔍 调试信息结束 ===');
    
    // 手动触发一次段落检测
    console.log('🔄 手动触发段落检测...');
    setTimeout(() => {
      determineActiveParagraph();
    }, 100);
    
    // 返回有用的调试数据
    return {
      documentId,
      paragraphCount: contentBlockRefs.current.size,
      paragraphIds: Array.from(contentBlockRefs.current.keys()),
      activeContentBlockId,
      dynamicMapping: { textToNodeMap: dynamicTextToNodeMap, nodeToTextMap: dynamicNodeToTextMap },
      staticMapping: { textToNodeMap, nodeToTextMap },
      domParagraphs: domParagraphs ? Array.from(domParagraphs).map(el => ({
        id: el.id,
        dataParaId: el.getAttribute('data-para-id'),
        className: el.className
      })) : []
    };
  }, [documentId, activeContentBlockId, dynamicTextToNodeMap, dynamicNodeToTextMap, textToNodeMap, nodeToTextMap, determineActiveParagraph]);

  // 将调试函数暴露到全局window对象
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.debugScrollDetection = debugScrollDetection;
      console.log('🔧 [调试工具] debugScrollDetection函数已挂载到window对象，可在控制台中调用 window.debugScrollDetection() 查看详细信息');
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete window.debugScrollDetection;
      }
    };
  }, [debugScrollDetection]);

  return {
    activeChunkId,
    activeContentBlockId,
    contentChunks,
    handleSectionRef,
    handleContentBlockRef,
    scrollToSection,
    scrollToContentBlock,
    highlightParagraph,
    highlightMermaidNode,
    updateDynamicMapping, // 暴露动态映射函数
    dynamicMapping: { textToNodeMap: dynamicTextToNodeMap, nodeToTextMap: dynamicNodeToTextMap }, // 暴露动态映射关系
    nodeToTextMap, // 暴露静态映射关系供外部使用
    textToNodeMap,  // 暴露静态映射关系供外部使用
    debugScrollDetection // 暴露调试函数
  };
}; 