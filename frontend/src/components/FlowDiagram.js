import React, { useEffect, useState, useCallback, useImperativeHandle, forwardRef, useMemo, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Panel,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { convertDataToReactFlow } from '../utils/dataConverter';
import { getLayoutedElements } from '../utils/layoutHelper';
import { updateNodeLabel, handleApiError } from '../utils/api';
import EditableNode from './EditableNode';

// 注册自定义节点类型
const nodeTypes = {
  editableNode: EditableNode,
};

/**
 * React Flow图表组件，兼容MermaidDiagram接口
 * @param {Object} props - 组件属性
 * @param {string} props.code - Mermaid代码字符串 (向后兼容)
 * @param {Object} props.apiData - 包含mermaid_string和node_mappings的数据
 * @param {string} props.highlightedNodeId - 需要高亮的节点ID
 * @param {Function} props.onNodeClick - 节点点击回调函数
 * @param {Function} props.onNodeLabelUpdate - 节点标签更新回调函数
 * @param {Function} props.onAddNode - 添加节点回调函数（通用）
 * @param {Function} props.onAddChildNode - 添加子节点回调函数
 * @param {Function} props.onAddSiblingNode - 添加同级节点回调函数
 * @param {Function} props.onDeleteNode - 删除节点回调函数
 * @param {Object} props.layoutOptions - 布局选项
 * @param {string} props.className - CSS类名
 */
const FlowDiagramInner = ({ 
  code, 
  apiData,
  highlightedNodeId,
  onNodeClick, 
  onNodeLabelUpdate,
  onAddNode,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  layoutOptions = {}, 
  className = '',
  onReactFlowInstanceChange
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documentId, setDocumentId] = useState(null);

  // 使用useRef来稳定化handleLabelChange函数，避免不必要的重新渲染
  const handleLabelChangeRef = useRef(null);

  // 标签更新的回调函数 - 使用useCallback但不包含在useEffect依赖中
  const handleLabelChange = useCallback(async (nodeId, newLabel) => {
    try {
      console.log('🔄 [FlowDiagram] 更新节点标签:', nodeId, '->', newLabel);
      
      // 更新本地状态
      setNodes((currentNodes) => 
        currentNodes.map(node => 
          node.id === nodeId 
            ? { ...node, data: { ...node.data, label: newLabel } }
            : node
        )
      );

      // 调用父组件的节点标签更新回调（优先级高）
      if (onNodeLabelUpdate) {
        console.log('🔄 [FlowDiagram] 调用父组件节点标签更新回调');
        onNodeLabelUpdate(nodeId, newLabel);
      }

      // 调用后端API持久化更改
      if (documentId) {
        try {
          await updateNodeLabel(documentId, nodeId, newLabel);
          console.log('📝 [FlowDiagram] 节点标签更新成功');
        } catch (apiError) {
          console.error('❌ [FlowDiagram] API调用失败:', apiError);
          // 可以选择显示用户友好的错误消息
          // alert(handleApiError(apiError));
        }
      }
    } catch (error) {
      console.error('❌ [FlowDiagram] 更新节点标签失败:', error);
      // 可以在这里添加错误提示
    }
  }, [documentId, setNodes, onNodeLabelUpdate]); // 🔑 添加onNodeLabelUpdate到依赖中

  // 将handleLabelChange存储到ref中，保持引用稳定
  useEffect(() => {
    handleLabelChangeRef.current = handleLabelChange;
  }, [handleLabelChange]);

  // 处理数据变化 - 移除handleLabelChange依赖，使用ref来避免重新渲染
  useEffect(() => {
    // 优先使用apiData，否则使用code进行向后兼容
    const dataToProcess = apiData || (code ? {
      mermaid_string: code,
      node_mappings: extractNodeMappingsFromMermaid(code)
    } : null);

    if (!dataToProcess) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // 从 apiData 中提取 document_id（如果有的话）
    if (apiData && apiData.document_id) {
      setDocumentId(apiData.document_id);
    }

    setIsLoading(true);

    try {
      // 转换API数据为React Flow格式
      const { nodes: convertedNodes, edges: convertedEdges } = convertDataToReactFlow(dataToProcess);
      
      console.log('🔄 [FlowDiagram] 数据转换 - 节点:', convertedNodes.length, '边:', convertedEdges.length);
      
      if (convertedNodes.length === 0) {
        console.log('🔄 [FlowDiagram] 没有转换出节点，设置空数组');
        setNodes([]);
        setEdges([]);
        setIsLoading(false);
        return;
      }

      // 为节点添加 onLabelChange 回调并设置为可编辑类型
      // 使用ref中的函数避免重新创建
      const nodesWithCallback = convertedNodes.map(node => ({
        ...node,
        type: 'editableNode', // 设置为可编辑节点类型
        data: {
          ...node.data,
          onLabelChange: (...args) => handleLabelChangeRef.current?.(...args), // 使用ref中的函数
          onAddNode: onAddNode,
          onAddChildNode: onAddChildNode,
          onAddSiblingNode: onAddSiblingNode,
          onDeleteNode: onDeleteNode
        }
      }));

      // 应用自动布局
      const layoutOptionsToUse = {
        direction: layoutOptions.direction || 'TB',
        nodeSpacing: layoutOptions.nodeSpacing || 100,
        rankSpacing: layoutOptions.rankSpacing || 150,
        nodeWidth: layoutOptions.nodeWidth || 200,
        nodeHeight: layoutOptions.nodeHeight || 80,
        ...layoutOptions
      };
      
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodesWithCallback, 
        convertedEdges,
        layoutOptionsToUse
      );

      console.log('🔄 [FlowDiagram] 布局完成 - 节点数量:', layoutedNodes.length);
      console.log('🔄 [关键] 设置到状态的节点位置:', layoutedNodes.map(n => ({ id: n.id, position: n.position })));

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

    } catch (error) {
      console.error('处理图表数据时出错:', error);
      setNodes([]);
      setEdges([]);
    } finally {
      setIsLoading(false);
    }
  }, [code, apiData, layoutOptions]); // 移除handleLabelChange依赖

  // 非破坏性高亮实现 - 直接操作DOM而不修改节点对象
  const applyNodeHighlighting = useCallback((nodeIdToHighlight) => {
    console.log('🎯 [非破坏性高亮] 开始应用节点高亮:', nodeIdToHighlight);
    
    // 🔑 优化：使用更稳定的查找方式，避免在拖拽时失效
    const findNodeElement = (nodeId) => {
      // 策略1：直接通过data-id属性查找
      let nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
      if (nodeElement) {
        console.log('🎯 [节点查找] 策略1成功 - data-id:', nodeId);
        return nodeElement;
      }
      
      // 策略2：查找React Flow节点容器
      nodeElement = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
      if (nodeElement) {
        console.log('🎯 [节点查找] 策略2成功 - react-flow__node:', nodeId);
        return nodeElement;
      }
      
      // 策略3：遍历所有React Flow节点
      const allNodes = document.querySelectorAll('.react-flow__node');
      for (const node of allNodes) {
        const dataId = node.getAttribute('data-id');
        if (dataId === nodeId) {
          console.log('🎯 [节点查找] 策略3成功 - 遍历匹配:', nodeId);
          return node;
        }
        
        // 检查子元素
        const childMatch = node.querySelector(`[data-id="${nodeId}"]`);
        if (childMatch) {
          console.log('🎯 [节点查找] 策略3成功 - 子元素匹配:', nodeId);
          return node;
        }
      }
      
      console.warn('🎯 [节点查找] 所有策略都失败了:', nodeId);
      return null;
    };
    
    // 移除所有现有高亮
    const allNodes = document.querySelectorAll('.react-flow__node');
    allNodes.forEach(nodeElement => {
      nodeElement.classList.remove('highlighted-node');
    });
    console.log('🎯 [非破坏性高亮] 清除了所有现有高亮');
    
    // 如果有指定的节点ID，添加高亮
    if (nodeIdToHighlight) {
      const foundNode = findNodeElement(nodeIdToHighlight);
      
      if (foundNode) {
        foundNode.classList.add('highlighted-node');
        console.log('🎯 [非破坏性高亮] ✅ 成功高亮节点:', nodeIdToHighlight);
        
        // 🔑 延迟检查高亮是否还在，如果不在则重新应用
        setTimeout(() => {
          const stillHighlighted = foundNode.classList.contains('highlighted-node');
          if (!stillHighlighted) {
            console.log('🎯 [高亮恢复] 检测到高亮丢失，重新应用:', nodeIdToHighlight);
            foundNode.classList.add('highlighted-node');
          }
        }, 100);
        
        // 确保高亮的节点在视口中可见（可选）
        const nodeRect = foundNode.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        const isVisible = nodeRect.top >= 0 && 
                         nodeRect.left >= 0 && 
                         nodeRect.bottom <= viewportHeight && 
                         nodeRect.right <= viewportWidth;
        
        if (!isVisible) {
          console.log('🎯 [非破坏性高亮] 节点不在视口中，滚动到可见位置');
          foundNode.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
          });
        }
      } else {
        console.warn('🎯 [非破坏性高亮] ❌ 未找到节点元素:', nodeIdToHighlight);
        
        // 输出调试信息
        const allNodes = document.querySelectorAll('.react-flow__node');
        const nodeIds = Array.from(allNodes).map(node => ({
          dataId: node.getAttribute('data-id'),
          id: node.id,
          className: node.className
        }));
        console.log('🎯 [调试] 页面中所有节点的信息:', nodeIds);
      }
    } else {
      console.log('🎯 [非破坏性高亮] 清除所有高亮（nodeIdToHighlight为空）');
    }
  }, []);

  // 监听高亮节点变化，使用非破坏性方式应用高亮
  useEffect(() => {
    if (nodes.length > 0) {
      // 延迟执行，确保DOM已经更新
      setTimeout(() => {
        applyNodeHighlighting(highlightedNodeId);
      }, 100);
    }
  }, [highlightedNodeId, nodes, applyNodeHighlighting]); // 🔑 修复：监听整个nodes数组而不只是length

  // 🔑 新增：处理ReactFlow节点变化事件，确保拖拽后重新应用高亮
  const handleNodesChange = useCallback((changes) => {
    console.log('🎯 [ReactFlow] 节点变化事件:', changes);
    
    // 调用原始的onNodesChange处理函数
    onNodesChange(changes);
    
    // 🔑 优化：只在特定变化类型且有高亮节点时才处理
    if (!highlightedNodeId) {
      console.log('🎯 [ReactFlow] 无高亮节点，跳过高亮处理');
      return;
    }
    
    // 检查是否有需要重新应用高亮的变化
    const needsHighlightReapply = changes.some(change => {
      const isRelevantChange = 
        change.type === 'position' ||     // 位置变化（拖拽）
        change.type === 'dimensions' ||   // 尺寸变化
        change.type === 'select' ||       // 选择状态变化
        change.type === 'replace';        // 节点替换
      
      // 如果是拖拽结束事件，也需要重新应用高亮
      const isDragEnd = change.type === 'position' && change.dragging === false;
      
      return isRelevantChange || isDragEnd;
    });
    
    if (needsHighlightReapply) {
      console.log('🎯 [ReactFlow] 检测到需要重新应用高亮的变化，节点:', highlightedNodeId);
      
      // 🔑 使用更短的延迟，提高响应速度
      setTimeout(() => {
        // 再次检查高亮节点ID是否仍然有效
        if (highlightedNodeId) {
          console.log('🎯 [ReactFlow] 执行延迟高亮重新应用:', highlightedNodeId);
          applyNodeHighlighting(highlightedNodeId);
        }
      }, 50); // 减少延迟，提高响应速度
    } else {
      console.log('🎯 [ReactFlow] 变化不需要重新应用高亮');
    }
  }, [onNodesChange, highlightedNodeId, applyNodeHighlighting]);

  // 🔑 新增：处理ReactFlow画布点击事件，防止高亮意外清除
  const handlePaneClick = useCallback((event) => {
    console.log('�� [ReactFlow] 画布点击事件，当前高亮节点:', highlightedNodeId);
    
    // 🔑 保持现有高亮状态，不执行任何清除操作
    // 如果需要清除高亮，应该通过外部控制highlightedNodeId的值
    // 这样可以确保高亮状态的管理是统一和可控的
    
    // 可选：在画布点击后验证高亮状态是否仍然正确
    if (highlightedNodeId) {
      setTimeout(() => {
        const highlightedElement = document.querySelector(`[data-id="${highlightedNodeId}"].highlighted-node`);
        if (!highlightedElement) {
          console.log('🎯 [ReactFlow] 画布点击后检测到高亮丢失，重新应用:', highlightedNodeId);
          applyNodeHighlighting(highlightedNodeId);
        } else {
          console.log('🎯 [ReactFlow] 画布点击后高亮状态正常');
        }
      }, 50);
    }
  }, [highlightedNodeId, applyNodeHighlighting]);

  // 从Mermaid代码中提取节点映射
  const extractNodeMappingsFromMermaid = (mermaidCode) => {
    const nodeMappings = {};
    
    if (!mermaidCode) return nodeMappings;

    // 匹配节点定义，如 A[文本], A(文本), A{文本}
    const nodeDefRegex = /([A-Za-z0-9_]+)[\[\(\{]([^\]\)\}]+)[\]\)\}]/g;
    let match;
    
    while ((match = nodeDefRegex.exec(mermaidCode)) !== null) {
      const [, nodeId, nodeText] = match;
      nodeMappings[nodeId] = {
        text_snippet: nodeText.trim(),
        paragraph_ids: []
      };
    }

    // 如果没有找到节点定义，从连接关系中提取节点ID
    if (Object.keys(nodeMappings).length === 0) {
      const connectionRegex = /([A-Za-z0-9_]+)\s*(-{1,2}>?|={1,2}>?)\s*([A-Za-z0-9_]+)/g;
      const nodeIds = new Set();
      
      while ((match = connectionRegex.exec(mermaidCode)) !== null) {
        const [, source, , target] = match;
        nodeIds.add(source);
        nodeIds.add(target);
      }
      
      // 为每个节点ID创建基本映射
      nodeIds.forEach(nodeId => {
        nodeMappings[nodeId] = {
          text_snippet: nodeId,
          paragraph_ids: []
        };
      });
    }

    return nodeMappings;
  };

  // 处理连接
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  // 处理节点点击
  const onNodeClickHandler = useCallback((event, node) => {
    console.log('FlowDiagram节点点击:', node.id, node);
    if (onNodeClick) {
      // 调用与MermaidDiagram兼容的回调
      // 传递节点ID作为第一个参数，事件作为第二个参数
      onNodeClick(node.id, event);
    }
  }, [onNodeClick]);

  // 处理ReactFlow实例初始化
  const onInit = useCallback((reactFlowInstance) => {
    console.log('🔄 [FlowDiagram] ReactFlow实例初始化');
    if (onReactFlowInstanceChange) {
      onReactFlowInstanceChange(reactFlowInstance);
    }
    
    // 延迟适应视图，确保节点已经渲染
    setTimeout(() => {
      const allNodes = reactFlowInstance.getNodes();
      console.log('🔄 [关键] ReactFlow实例中的节点:', allNodes.map(n => ({ 
        id: n.id, 
        position: n.position,
        width: n.width,
        height: n.height
      })));
      
      if (allNodes.length > 0) {
        console.log('🔄 [FlowDiagram] 执行fitView');
        reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
      }
    }, 500); // 增加延迟时间，确保布局完成
  }, [onReactFlowInstanceChange]);

  // 自定义节点样式 - 基础样式，高亮样式由CSS处理
  const nodeDefaults = {
    style: {
      background: '#ffffff',
      border: '2px solid #1a192b',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 500,
      padding: '10px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      minWidth: '150px',
      textAlign: 'center',
      width: 200,
      height: 80
    },
  };

  return (
    <div className={`w-full h-full ${className}`}>
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">正在加载流程图...</p>
          </div>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}  // 直接使用原始节点，不再通过nodesWithHighlightClass处理
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClickHandler}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{
            padding: 0.1,
            includeHiddenNodes: false,
          }}
          onInit={(instance) => {
            console.log('🔄 [FlowDiagram] ReactFlow实例初始化完成');
            if (onReactFlowInstanceChange) {
              onReactFlowInstanceChange(instance);
            }
          }}
        >
          <Background variant="dots" gap={20} size={1} />
          <Controls />
          <MiniMap 
            nodeStrokeColor="#374151" 
            nodeColor="#f3f4f6" 
            nodeBorderRadius={8}
          />
        </ReactFlow>
      )}
    </div>
  );
};

const FlowDiagram = forwardRef(({ 
  code, 
  apiData, 
  highlightedNodeId, 
  onNodeClick, 
  onNodeLabelUpdate,
  onAddNode,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  layoutOptions = {}, 
  className = '' 
}, ref) => {
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // 处理ReactFlow实例变化
  const handleReactFlowInstanceChange = useCallback((instance) => {
    setReactFlowInstance(instance);
  }, []);

  // 提供与MermaidDiagram兼容的ref方法
  useImperativeHandle(ref, () => ({
    // 兼容MermaidDiagram的ensureNodeVisible方法
    ensureNodeVisible: (nodeId) => {
      if (reactFlowInstance) {
        try {
          // 获取节点并聚焦到它
          const node = reactFlowInstance.getNode(nodeId);
          if (node) {
            // 使用更平滑的动画效果聚焦到节点
            reactFlowInstance.setCenter(
              node.position.x + (node.width || 200) / 2, 
              node.position.y + (node.height || 80) / 2, 
              { zoom: 1.2, duration: 800 }
            );
          }
        } catch (error) {
          console.warn('无法聚焦到节点:', nodeId, error);
        }
      }
    },
    
    // 提供获取React Flow实例的方法
    getReactFlowInstance: () => reactFlowInstance,
    
    // 重新布局方法
    fitView: () => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
      }
    }
  }), [reactFlowInstance]);

  // 当高亮节点变化时，自动聚焦到该节点
  useEffect(() => {
    if (highlightedNodeId && reactFlowInstance) {
      // 延迟执行，确保节点已经更新
      setTimeout(() => {
        const node = reactFlowInstance.getNode(highlightedNodeId);
        if (node && node.position) {
          console.log('🎯 [自动聚焦] 聚焦到节点:', highlightedNodeId, '位置:', node.position);
          reactFlowInstance.setCenter(
            node.position.x + (node.width || 200) / 2, 
            node.position.y + (node.height || 80) / 2, 
            { zoom: 1.2, duration: 800 }
          );
        } else {
          console.warn('🎯 [自动聚焦] 未找到节点或节点位置无效:', highlightedNodeId, node);
        }
      }, 300); // 增加延迟时间，确保高亮样式更新完成
    }
  }, [highlightedNodeId, reactFlowInstance]);

      return (
      <ReactFlowProvider>
        <FlowDiagramInner 
          code={code}
          apiData={apiData}
          highlightedNodeId={highlightedNodeId}
          onNodeClick={onNodeClick}
          onNodeLabelUpdate={onNodeLabelUpdate}
          onAddNode={onAddNode}
          onAddChildNode={onAddChildNode}
          onAddSiblingNode={onAddSiblingNode}
          onDeleteNode={onDeleteNode}
          layoutOptions={layoutOptions}
          className={className}
          onReactFlowInstanceChange={handleReactFlowInstanceChange}
        />
      </ReactFlowProvider>
    );
});

FlowDiagram.displayName = 'FlowDiagram';

export default FlowDiagram; 