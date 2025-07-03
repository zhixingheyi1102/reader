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

export const useScrollDetection = (containerRef, documentId, currentMindmapMode, showReadingAssistant, checkForNewQuestions, mermaidDiagramRef) => {
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
          
          // 多种选择器尝试
          const selectors = [
            `[data-id="${nodeId}"]`,
            `#${nodeId}`,
            `.node-${nodeId}`,
            `[id*="${nodeId}"]`,
            `[class*="${nodeId}"]`
          ];
          
          let foundCurrent = false;
          selectors.forEach(selector => {
            const currentNodes = window.document.querySelectorAll(selector);
            if (currentNodes.length > 0) {
              foundCurrent = true;
              console.log('🎯 [节点高亮] 找到当前节点:', selector, currentNodes.length);
              currentNodes.forEach(node => {
                if (node && node.classList) {
                  node.classList.add('mermaid-highlighted-node');
                  console.log('🎯 [节点高亮] 成功高亮节点:', node);
                }
              });
            }
          });
          
          if (!foundCurrent) {
            console.warn('🎯 [节点高亮] 未找到当前节点:', nodeId);
            // 输出所有可能的节点信息
            const allMermaidElements = window.document.querySelectorAll('[class*="node"], [data-id], [id]');
            console.log('🎯 [节点高亮] 页面中所有可能的节点:', Array.from(allMermaidElements).map(el => ({
              id: el.id,
              dataId: el.getAttribute('data-id'),
              className: el.className,
              tagName: el.tagName
            })));
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
          
          // 查找对应的Mermaid节点并高亮
          const currentTextToNodeMap = Object.keys(dynamicTextToNodeMap).length > 0 ? dynamicTextToNodeMap : textToNodeMap;
          const nodeId = currentTextToNodeMap[currentActiveParagraphId];
          
          console.log('🔍 [节点映射] 段落ID:', currentActiveParagraphId);
          console.log('🔍 [节点映射] 映射类型:', Object.keys(dynamicTextToNodeMap).length > 0 ? '动态映射' : '静态映射');
          console.log('🔍 [节点映射] 找到节点ID:', nodeId);
          
          if (nodeId) {
            console.log('📖 [段落检测] 高亮对应的Mermaid节点:', nodeId);
            highlightMermaidNode(nodeId);
          } else {
            console.warn('📖 [段落检测] 未找到段落对应的节点映射:', currentActiveParagraphId);
            console.log('📖 [段落检测] 可用的映射关系:', currentTextToNodeMap);
          }
        }
        
        // 检查AI阅读问题（如果启用）
        if (currentActiveParagraphId && showReadingAssistant) {
          console.log("📖 [段落检测] 调用AI问题检查，段落:", currentActiveParagraphId);
          checkForNewQuestions(currentActiveParagraphId);
        }
        
        return currentActiveParagraphId;
      }
      return prevId;
    });
  }, [highlightParagraph, highlightMermaidNode, textToNodeMap, dynamicTextToNodeMap, showReadingAssistant, checkForNewQuestions]);

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
    
    // 等待Mermaid图表渲染
    await waitForMermaidRender();
    
    // 统一使用内容块检测，因为现在所有模式都使用 DemoModeRenderer
    setTimeout(() => {
      console.log('🎨 [统一模式] 执行初始内容块检测');
      determineActiveParagraph();
    }, 300);
  }, [documentId, waitForMermaidRender, determineActiveParagraph]);

  // 段落级滚动检测逻辑
  useEffect(() => {
    console.log('🔧 [段落滚动检测] useEffect触发，段落数量:', contentBlockRefs.current.size);
    
    // 设置定时检查，等待段落注册完成
    const checkParagraphs = () => {
      if (contentBlockRefs.current.size > 0) {
        console.log('🔧 [段落滚动检测] 检测到段落，开始初始化滚动检测');
        
        // 初始检测当前阅读的段落
        setTimeout(() => {
          console.log('🔧 [段落滚动检测] 执行初始段落检测');
          determineActiveParagraph();
        }, 100);
        
        return true; // 表示已找到段落
      }
      return false; // 继续等待
    };

    // 立即检查一次
    if (checkParagraphs()) {
      // 如果已经有段落，直接开始
    } else {
      // 如果没有段落，定时检查
      const checkInterval = setInterval(() => {
        if (checkParagraphs()) {
          clearInterval(checkInterval);
        }
      }, 100);
      
      // 5秒后停止检查
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log('🔧 [段落滚动检测] 停止等待段落注册');
      }, 5000);
    }

    // 创建节流处理函数 - 使用段落检测
    const throttledHandler = throttle(() => {
      if (contentBlockRefs.current.size > 0) {
        console.log('📜 [滚动事件] 触发段落检测');
        determineActiveParagraph();
      }
    }, 200); // 每200ms最多执行一次

    // 查找滚动容器 - 改进查找逻辑
    let scrollContainer = null;
    
    if (containerRef.current) {
      // 尝试多种选择器
      const selectors = [
        '.overflow-y-auto',
        '[style*="overflow-y: auto"]',
        '[style*="overflow: auto"]',
        '.h-full.overflow-hidden.flex.flex-col > div:last-child', // 文档阅读器的滚动区域
      ];
      
      for (const selector of selectors) {
        scrollContainer = containerRef.current.querySelector(selector);
        if (scrollContainer) {
          console.log('📜 [滚动检测] 找到滚动容器，选择器:', selector);
          break;
        }
      }
      
      // 如果还是没找到，尝试查找所有可能的滚动元素
      if (!scrollContainer) {
        const allElements = containerRef.current.querySelectorAll('*');
        for (const el of allElements) {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
              style.overflow === 'auto' || style.overflow === 'scroll') {
            scrollContainer = el;
            console.log('📜 [滚动检测] 通过样式检测找到滚动容器:', el.className);
            break;
          }
        }
      }
    }
    
    if (scrollContainer) {
      console.log('📜 [滚动检测] 添加滚动监听到容器');
      scrollContainer.addEventListener('scroll', throttledHandler, { passive: true });
    } else {
      console.log('📜 [滚动检测] 未找到滚动容器，使用window滚动监听');
      window.addEventListener('scroll', throttledHandler, { passive: true });
    }
    
    window.addEventListener('resize', throttledHandler, { passive: true });

    return () => {
      console.log('🔧 [段落滚动检测] 清理事件监听器');
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', throttledHandler);
      } else {
        window.removeEventListener('scroll', throttledHandler);
      }
      window.removeEventListener('resize', throttledHandler);
    };
  }, [determineActiveParagraph]); // 依赖段落检测函数

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
    console.log('🔗 [语义映射] nodeMapping:', nodeMapping);
    
    if (!mermaidCode) {
      console.warn('🔗 [语义映射] 缺少mermaidCode，无法创建映射');
      return;
    }
    
    const newTextToNodeMap = {};
    const newNodeToTextMap = {};
    
    if (nodeMapping && typeof nodeMapping === 'object') {
      console.log('🔗 [语义映射] 基于AI语义块创建段落级映射');
      
      // 为每个AI语义块创建映射
      Object.entries(nodeMapping).forEach(([nodeId, nodeInfo]) => {
        if (nodeInfo && nodeInfo.paragraph_ids && Array.isArray(nodeInfo.paragraph_ids)) {
          console.log(`🔗 [语义块] 处理节点 ${nodeId}:`, {
            role: nodeInfo.semantic_role,
            snippet: nodeInfo.text_snippet?.substring(0, 50) + '...',
            paragraphs: nodeInfo.paragraph_ids
          });
          
          // 为每个段落创建到节点的映射
          nodeInfo.paragraph_ids.forEach(paraId => {
            if (paraId && typeof paraId === 'string') {
              // 统一段落ID格式
              const paragraphId = paraId.startsWith('para-') ? paraId : `para-${paraId}`;
              
              // 段落到节点的映射（多对一：多个段落可能对应同一个节点）
              newTextToNodeMap[paragraphId] = nodeId;
              
              console.log(`📍 [段落映射] ${paragraphId} -> 节点 ${nodeId}`);
            }
          });
          
          // 节点到段落组的映射（一对多：一个节点对应多个段落）
          newNodeToTextMap[nodeId] = nodeInfo.paragraph_ids.map(paraId => 
            paraId.startsWith('para-') ? paraId : `para-${paraId}`
          );
          
          console.log(`🔗 [节点映射] 节点 ${nodeId} -> 段落组 [${newNodeToTextMap[nodeId].join(', ')}]`);
        }
      });
      
      console.log('🔗 [语义映射] AI语义块映射创建完成');
      console.log('🔗 [语义映射] 段落到节点映射数量:', Object.keys(newTextToNodeMap).length);
      console.log('🔗 [语义映射] 节点到段落映射数量:', Object.keys(newNodeToTextMap).length);
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
      }
    }
    
    // 更新状态
    setDynamicTextToNodeMap(newTextToNodeMap);
    setDynamicNodeToTextMap(newNodeToTextMap);
    
    console.log('🔗 [语义映射] 映射创建完成');
    console.log('🔗 [语义映射] textToNodeMap:', newTextToNodeMap);
    console.log('🔗 [语义映射] nodeToTextMap:', newNodeToTextMap);
    
    // 保存到localStorage用于调试
    try {
      localStorage.setItem('debug_semanticTextToNodeMap', JSON.stringify(newTextToNodeMap));
      localStorage.setItem('debug_semanticNodeToTextMap', JSON.stringify(newNodeToTextMap));
      localStorage.setItem('debug_aiNodeMapping', JSON.stringify(nodeMapping));
      console.log('💾 [调试保存] 语义映射已保存到localStorage');
    } catch (e) {
      console.warn('💾 [调试保存] 保存失败:', e);
    }
  }, []);

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
    textToNodeMap  // 暴露静态映射关系供外部使用
  };
}; 