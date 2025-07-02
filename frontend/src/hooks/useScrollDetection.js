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
  
  const sectionRefs = useRef(new Map()); // Map<chunk_id, HTMLElement>
  const contentBlockRefs = useRef(new Map()); // Map<block_id, HTMLElement>
  const contentChunks = useRef([]); // 存储内容分块信息

  // onSectionRef 回调实现
  const handleSectionRef = useCallback((element, chunkId) => {
    if (element) {
      sectionRefs.current.set(chunkId, element);
      console.log('📍 [章节引用] 设置章节引용:', chunkId, '总数:', sectionRefs.current.size);
      
      // 当所有章节引用都设置完成后，触发一次检测
      if (sectionRefs.current.size === contentChunks.current.length && contentChunks.current.length > 0) {
        console.log('📍 [章节引用] 所有章节引用已设置完成，触发初始检测');
        setTimeout(() => {
          // 手动触发一次滚动检测
          const event = new Event('scroll');
          const scrollContainer = containerRef.current?.querySelector('.overflow-y-auto');
          if (scrollContainer) {
            scrollContainer.dispatchEvent(event);
          } else {
            window.dispatchEvent(event);
          }
        }, 100);
      }
    } else {
      // 当元素卸载时，从 Map 中移除
      sectionRefs.current.delete(chunkId);
      console.log('📍 [章节引用] 移除章节引용:', chunkId, '剩余:', sectionRefs.current.size);
    }
  }, []);

  // 内容块引用回调 - 用于演示模式
  const handleContentBlockRef = useCallback((element, blockId) => {
    if (element) {
      contentBlockRefs.current.set(blockId, element);
      console.log('📍 [内容块引用] 设置内容块引用:', blockId, '总数:', contentBlockRefs.current.size);
    } else {
      contentBlockRefs.current.delete(blockId);
      console.log('📍 [内容块引用] 移除内容块引用:', blockId, '剩余:', contentBlockRefs.current.size);
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

  // 高亮内容块
  const highlightContentBlock = useCallback((blockId) => {
    // 确保在浏览器环境中且document可用
    if (typeof window === 'undefined' || !window.document || typeof window.document.querySelectorAll !== 'function') {
      console.warn('🎯 [内容块高亮] DOM环境不可用，跳过内容块高亮');
      return;
    }

    try {
      console.log('🎯 [内容块高亮] 开始高亮内容块:', blockId);
      
      // 移除所有之前的高亮
      const allContentBlocks = window.document.querySelectorAll('.content-block');
      allContentBlocks.forEach(block => {
        if (block && block.classList) {
          block.classList.remove('active');
        }
      });

      // 添加新的高亮
      if (blockId) {
        const currentBlock = contentBlockRefs.current.get(blockId);
        if (currentBlock && currentBlock.classList) {
          currentBlock.classList.add('active');
          console.log('🎯 [内容块高亮] 成功高亮内容块:', blockId);
        } else {
          console.warn('🎯 [内容块高亮] 未找到内容块元素:', blockId);
        }
      }
    } catch (error) {
      console.error('🎯 [内容块高亮] 高亮内容块时出错:', error);
    }
  }, []);

  // 普通滚动检测逻辑
  useEffect(() => {
    console.log('🔧 [滚动检测] useEffect触发，内容块数量:', contentChunks.current.length);
    
    if (contentChunks.current.length === 0) {
      console.log('🔧 [滚动检测] 跳过：无内容块');
      return;
    }

    const determineActiveSection = () => {
      const viewportHeight = window.innerHeight;
      const anchorY = viewportHeight * 0.20; // 视口顶部向下20%

      console.log('🎯 [滚动检测] 开始检测，锚点Y:', anchorY, '内容块数量:', contentChunks.current.length);
      console.log('🎯 [滚动检测] 章节引用数量:', sectionRefs.current.size);

      let currentActiveId = null;
      
      // 按文档顺序遍历chunks
      if (contentChunks.current && contentChunks.current.length > 0) {
        for (const chunk of contentChunks.current) {
          const element = sectionRefs.current.get(chunk.chunk_id);
          if (element) {
            const rect = element.getBoundingClientRect();
            console.log(`🎯 [滚动检测] 章节 ${chunk.chunk_id}: top=${rect.top}, bottom=${rect.bottom}, 锚点=${anchorY}`);
            // 如果元素的顶部在锚点之上或与之重合
            if (rect.top <= anchorY) {
              currentActiveId = chunk.chunk_id;
              console.log(`🎯 [滚动检测] 章节 ${chunk.chunk_id} 符合条件，设为候选`);
            } else {
              // 由于元素是按顺序排列的，一旦找到一个元素的顶部在锚点之下，
              // 那么之前记录的 currentActiveId 就是正确的
              console.log(`🎯 [滚动检测] 章节 ${chunk.chunk_id} 在锚点下方，停止检测`);
              break; 
            }
          } else {
            console.log(`🎯 [滚动检测] 章节 ${chunk.chunk_id} 没有找到DOM元素`);
          }
        }
      }
      
      // 如果没有元素在锚点之上，但有chunks，考虑将第一个chunk设为active
      if (currentActiveId === null && contentChunks.current && contentChunks.current.length > 0) {
        const firstChunkElement = sectionRefs.current.get(contentChunks.current[0].chunk_id);
        if (firstChunkElement) {
          const firstRect = firstChunkElement.getBoundingClientRect();
          console.log(`🎯 [滚动检测] 检查第一个章节: top=${firstRect.top}, bottom=${firstRect.bottom}`);
          // 如果第一个元素在视口中且锚点在第一个元素之前或内部
          if (firstRect.top < viewportHeight && firstRect.bottom > 0 && anchorY >= firstRect.top) {
            currentActiveId = contentChunks.current[0].chunk_id;
            console.log(`🎯 [滚动检测] 设置第一个章节为活动: ${currentActiveId}`);
          }
        }
      }

      console.log(`🎯 [滚动检测] 最终确定活动章节: ${currentActiveId}`);

      // 更新活动章节状态
      setActiveChunkId(prevId => {
        if (prevId !== currentActiveId) {
          console.log("🎯 [滚动检测] 活动章节变更为:", currentActiveId);
          return currentActiveId;
        }
        return prevId;
      });

      // 检查AI阅读问题
      if (currentActiveId && showReadingAssistant) {
        console.log("🎯 [滚动检测] 调用AI问题检查，章节:", currentActiveId);
        checkForNewQuestions(currentActiveId);
      } else {
        console.log("🎯 [滚动检测] 跳过AI问题检查，章节:", currentActiveId, "助手状态:", showReadingAssistant);
      }
    };

    // 初始检测一次
    const initialCheckTimeout = setTimeout(() => {
      console.log('🔧 [滚动检测] 执行初始检测');
      determineActiveSection();
    }, 100);

    // 创建节流处理函数
    const throttledHandler = throttle((...args) => {
      console.log('📜 [滚动事件] 触发滚动检测');
      determineActiveSection();
    }, 150); // 每150ms最多执行一次

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
      console.log('🔧 [滚动检测] 清理事件监听器');
      clearTimeout(initialCheckTimeout);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', throttledHandler);
      } else {
        window.removeEventListener('scroll', throttledHandler);
      }
      window.removeEventListener('resize', throttledHandler);
    };
  }, [showReadingAssistant, checkForNewQuestions]); // 移除contentChunks.current依赖

  // 演示模式内容块滚动检测 - 仅在演示模式下启用
  useEffect(() => {
    // 只在演示模式下启用
    if (!documentId.startsWith('demo-') || currentMindmapMode !== 'demo') {
      console.log('🎨 [演示模式] 非演示模式，跳过内容块检测');
      return;
    }

    console.log('🎨 [演示模式] 启用内容块滚动检测');

    const determineActiveContentBlock = () => {
      const viewportHeight = window.innerHeight;
      const anchorY = viewportHeight * 0.25; // 视口顶部向下25%

      console.log('🎯 [内容块检测] 开始检测，锚点Y:', anchorY, '内容块数量:', contentBlockRefs.current.size);

      let currentActiveBlockId = null;
      let bestDistance = Infinity;

      // 遍历所有内容块
      contentBlockRefs.current.forEach((element, blockId) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - anchorY);
        
        console.log(`🎯 [内容块检测] 内容块 ${blockId}: top=${rect.top}, distance=${distance}`);
        
        // 如果元素在视口中且距离锚点最近
        if (rect.top < viewportHeight && rect.bottom > 0 && distance < bestDistance) {
          currentActiveBlockId = blockId;
          bestDistance = distance;
          console.log(`🎯 [内容块检测] 内容块 ${blockId} 成为最佳候选，距离=${distance}`);
        }
      });

      console.log(`🎯 [内容块检测] 最终确定活动内容块: ${currentActiveBlockId}`);

      // 更新活动内容块状态
      setActiveContentBlockId(prevId => {
        if (prevId !== currentActiveBlockId) {
          console.log("🎯 [内容块检测] 活动内容块变更为:", currentActiveBlockId);
          
          // 高亮内容块
          highlightContentBlock(currentActiveBlockId);
          
          // 获取对应的节点ID并高亮
          const nodeId = currentActiveBlockId ? textToNodeMap[currentActiveBlockId] : null;
          console.log('🎯 [内容块检测] 查找节点映射:', currentActiveBlockId, '->', nodeId);
          
          if (nodeId) {
            console.log('🎯 [内容块检测] 尝试高亮节点:', nodeId);
            highlightMermaidNode(nodeId);
          } else if (currentActiveBlockId) {
            console.warn('🎯 [内容块检测] 未找到对应的节点ID:', currentActiveBlockId);
            console.log('🎯 [内容块检测] 可用的映射:', Object.keys(textToNodeMap));
          }
          
          return currentActiveBlockId;
        }
        return prevId;
      });
    };

    // 等待Mermaid图表渲染完成的检查函数
    const waitForMermaidRender = () => {
      return new Promise((resolve) => {
        const checkMermaid = () => {
          const mermaidElement = window.document?.querySelector('.mermaid, [data-processed-by-mermaid]');
          const svgElement = mermaidElement?.querySelector('svg');
          
          if (svgElement && svgElement.children.length > 0) {
            console.log('🎨 [演示模式] Mermaid图表已渲染完成');
            resolve(true);
          } else {
            console.log('🎨 [演示模式] 等待Mermaid图表渲染...');
            setTimeout(checkMermaid, 200);
          }
        };
        
        checkMermaid();
        
        // 超时保护
        setTimeout(() => {
          console.log('🎨 [演示模式] Mermaid图表渲染检查超时，继续执行');
          resolve(false);
        }, 5000);
      });
    };

    // 初始化函数
    const initializeDetection = async () => {
      console.log('🎨 [演示模式] 开始初始化内容块检测');
      
      // 等待Mermaid图表渲染
      await waitForMermaidRender();
      
      // 初始检测一次
      setTimeout(() => {
        console.log('🎨 [演示模式] 执行初始内容块检测');
        determineActiveContentBlock();
      }, 300);
    };

    // 启动初始化
    initializeDetection();

    // 创建节流处理函数
    const throttledHandler = throttle(() => {
      console.log('📜 [内容块滚动] 触发内容块检测');
      determineActiveContentBlock();
    }, 150);

    // 查找滚动容器
    let scrollContainer = null;
    
    if (containerRef.current) {
      const selectors = [
        '.overflow-y-auto',
        '[style*="overflow-y: auto"]',
        '[style*="overflow: auto"]',
      ];
      
      for (const selector of selectors) {
        scrollContainer = containerRef.current.querySelector(selector);
        if (scrollContainer) {
          console.log('📜 [内容块检测] 找到滚动容器，选择器:', selector);
          break;
        }
      }
    }
    
    if (scrollContainer) {
      console.log('📜 [内容块检测] 添加滚动监听到容器');
      scrollContainer.addEventListener('scroll', throttledHandler, { passive: true });
    } else {
      console.log('📜 [内容块检测] 未找到滚动容器，使用window滚动监听');
      window.addEventListener('scroll', throttledHandler, { passive: true });
    }
    
    window.addEventListener('resize', throttledHandler, { passive: true });

    return () => {
      console.log('🎨 [演示模式] 清理内容块检测事件监听器');
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', throttledHandler);
      } else {
        window.removeEventListener('scroll', throttledHandler);
      }
      window.removeEventListener('resize', throttledHandler);
    };
  }, [documentId, currentMindmapMode, highlightContentBlock, highlightMermaidNode]); // 依赖演示模式相关状态

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

  // 根据节点ID滚动到对应的文本块
  const scrollToContentBlock = useCallback((nodeId) => {
    console.log('📜 [滚动到文本块] 开始查找节点对应的文本块:', nodeId);
    
    // 从节点到文本块的映射
    const textBlockId = nodeToTextMap[nodeId];
    
    if (!textBlockId) {
      console.warn('📜 [滚动到文本块] 未找到节点对应的文本块映射:', nodeId);
      console.log('📜 [滚动到文本块] 可用的节点映射:', Object.keys(nodeToTextMap));
      return;
    }

    console.log('📜 [滚动到文本块] 找到对应的文本块ID:', textBlockId);

    // 根据文档模式选择不同的滚动方式
    if (documentId.startsWith('demo-') && currentMindmapMode === 'demo') {
      // 演示模式：滚动到内容块
      const contentBlockElement = contentBlockRefs.current.get(textBlockId);
      if (contentBlockElement) {
        console.log('📜 [滚动到文本块] 滚动到演示模式内容块:', textBlockId);
        contentBlockElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // 高亮该内容块
        highlightContentBlock(textBlockId);
      } else {
        console.warn('📜 [滚动到文本块] 未找到演示模式内容块元素:', textBlockId);
        console.log('📜 [滚动到文本块] 可用的内容块:', Array.from(contentBlockRefs.current.keys()));
      }
    } else {
      // 普通模式：尝试滚动到对应的章节
      // 这里需要建立节点到章节的映射关系
      // 暂时先输出日志，让用户知道功能正在工作
      console.log('📜 [滚动到文本块] 普通模式暂不支持节点点击跳转');
      console.log('📜 [滚动到文本块] 节点:', nodeId, '对应文本块:', textBlockId);
      
      // 可以在这里添加其他模式的滚动逻辑
      // 例如：根据文本内容搜索对应的章节
    }
  }, [documentId, currentMindmapMode, highlightContentBlock]);

  return {
    activeChunkId,
    activeContentBlockId,
    contentChunks,
    handleSectionRef,
    handleContentBlockRef,
    scrollToSection,
    scrollToContentBlock,
    highlightContentBlock,
    highlightMermaidNode,
    nodeToTextMap, // 暴露映射关系供外部使用
    textToNodeMap  // 暴露映射关系供外部使用
  };
}; 