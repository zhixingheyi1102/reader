import React, { useEffect, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
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

/**
 * React Flow图表组件，兼容MermaidDiagram接口
 * @param {Object} props - 组件属性
 * @param {string} props.code - Mermaid代码字符串 (向后兼容)
 * @param {Object} props.apiData - 包含mermaid_string和node_mappings的数据
 * @param {string} props.highlightedNodeId - 需要高亮的节点ID
 * @param {Function} props.onNodeClick - 节点点击回调函数
 * @param {Object} props.layoutOptions - 布局选项
 * @param {string} props.className - CSS类名
 */
const FlowDiagramInner = ({ 
  code, 
  apiData,
  highlightedNodeId,
  onNodeClick, 
  layoutOptions = {}, 
  className = '',
  onReactFlowInstanceChange
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 处理数据变化
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
        convertedNodes, 
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
  }, [code, apiData, layoutOptions]);

  // 为节点添加高亮className - 不改变任何其他属性，只添加className
  const nodesWithHighlightClass = useMemo(() => {
    if (nodes.length === 0) return [];

    return nodes.map((node) => {
      const isHighlighted = node.id === highlightedNodeId;
      
      return {
        ...node,
        // 添加或移除高亮className，保持其他所有属性不变
        className: isHighlighted 
          ? (node.className ? `${node.className} highlighted-node` : 'highlighted-node')
          : (node.className ? node.className.replace(/\s*highlighted-node\s*/g, '').trim() : undefined)
      };
    });
  }, [nodes, highlightedNodeId]);

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
    <div className={`flow-diagram ${className}`} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodesWithHighlightClass}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickHandler}
        onInit={onInit}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView={false}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        defaultNodeOptions={nodeDefaults}
        proOptions={{ hideAttribution: true }}
        preventScrolling={false}
        snapToGrid={false}
        snapGrid={[15, 15]}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={4}
      >
        <Background variant="dots" gap={20} size={1} />
        <Controls />
        <MiniMap 
          nodeStrokeColor="#1a192b"
          nodeColor="#ffffff"
          nodeBorderRadius={8}
          maskColor="rgba(0, 0, 0, 0.1)"
          position="top-right"
        />
        
        {isLoading && (
          <Panel position="top-center">
            <div style={{ 
              background: 'white', 
              padding: '10px 20px', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              正在处理图表数据...
            </div>
          </Panel>
        )}
        
        {nodesWithHighlightClass.length === 0 && !isLoading && (
          <Panel position="center">
            <div style={{ 
              background: 'white', 
              padding: '20px', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              textAlign: 'center',
              color: '#666'
            }}>
              暂无图表数据
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};

const FlowDiagram = forwardRef(({ 
  code, 
  apiData, 
  highlightedNodeId, 
  onNodeClick, 
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
          layoutOptions={layoutOptions}
          className={className}
          onReactFlowInstanceChange={handleReactFlowInstanceChange}
        />
      </ReactFlowProvider>
    );
});

FlowDiagram.displayName = 'FlowDiagram';

export default FlowDiagram; 