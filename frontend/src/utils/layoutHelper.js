import dagre from 'dagre';

// 定义节点的默认尺寸，与CSS保持一致
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 50;

/**
 * 使用Dagre算法计算节点布局
 * @param {Array} nodes - React Flow格式的节点数组
 * @param {Array} edges - React Flow格式的边数组
 * @param {Object} options - 布局选项
 * @returns {Object} 包含布局后的nodes和原始edges的对象
 */
export const getLayoutedElements = (nodes, edges, options = {}) => {
  console.log('🔧 [布局计算] 开始布局计算');
  console.log('🔧 [布局计算] 输入节点数量:', nodes.length);
  console.log('🔧 [布局计算] 输入边数量:', edges.length);
  console.log('🔧 [布局计算] 布局选项:', options);

  if (nodes.length === 0) {
    console.log('🔧 [布局计算] 没有节点，返回空数组');
    return { nodes: [], edges: [] };
  }

  try {
    // 创建有向图
    const graph = new dagre.graphlib.Graph();
    
    // 设置图的默认属性
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
      rankdir: options.direction || 'TB', // TB: 上到下, LR: 左到右
      nodesep: options.nodeSpacing || 100, // 节点间距
      ranksep: options.rankSpacing || 150, // 层级间距
      marginx: options.marginX || 50,
      marginy: options.marginY || 50
    });

    // 使用与CSS一致的节点尺寸
    const nodeWidth = options.nodeWidth || DEFAULT_NODE_WIDTH;
    const nodeHeight = options.nodeHeight || DEFAULT_NODE_HEIGHT;

    // 添加节点到图中
    nodes.forEach((node) => {
      graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    // 添加边到图中
    edges.forEach((edge) => {
      graph.setEdge(edge.source, edge.target);
    });

    // 计算布局
    dagre.layout(graph);
    console.log('🔧 [布局计算] Dagre布局计算完成');

    // 应用计算出的位置到节点
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = graph.node(node.id);
      
      if (!nodeWithPosition) {
        console.error('🔧 [布局计算] 节点位置计算失败:', node.id);
        return {
          ...node,
          position: { x: 0, y: 0 }
        };
      }

      const finalPosition = {
        // dagre返回的是节点中心点坐标，需要转换为左上角坐标
        // 确保坐标是数字类型
        x: Number(nodeWithPosition.x - nodeWidth / 2),
        y: Number(nodeWithPosition.y - nodeHeight / 2)
      };
      
      return {
        ...node,
        position: finalPosition,
        // 确保React Flow需要的其他属性
        width: nodeWidth,
        height: nodeHeight
      };
    });

    console.log('🔧 [布局计算] 布局计算完成，返回节点数量:', layoutedNodes.length);
    console.log('🔧 [布局计算] 所有节点位置:', layoutedNodes.map(n => ({ id: n.id, position: n.position })));

    return {
      nodes: layoutedNodes,
      edges: edges
    };
  } catch (error) {
    console.error('🔧 [布局计算] 布局计算失败:', error);
    // 如果布局计算失败，返回节点的默认位置
    const fallbackNodes = nodes.map((node, index) => ({
      ...node,
      position: { 
        x: (index % 3) * 250, // 简单的网格布局
        y: Math.floor(index / 3) * 150 
      }
    }));
    console.log('🔧 [布局计算] 使用回退布局:', fallbackNodes.map(n => ({ id: n.id, position: n.position })));
    return {
      nodes: fallbackNodes,
      edges: edges
    };
  }
};

/**
 * 重新布局现有的元素
 * @param {Array} nodes - 当前的节点数组
 * @param {Array} edges - 当前的边数组
 * @param {Object} options - 布局选项
 * @returns {Object} 重新布局后的nodes和edges
 */
export const relayoutElements = (nodes, edges, options = {}) => {
  return getLayoutedElements(nodes, edges, options);
}; 