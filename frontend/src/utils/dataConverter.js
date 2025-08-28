/**
 * 将API数据转换为React Flow格式
 * @param {Object} apiData - 包含mermaid_string和node_mappings的对象
 * @returns {Object} 包含nodes和edges数组的对象
 */
export const convertDataToReactFlow = (apiData) => {
  console.log('🔧 [数据转换] 开始转换数据:', apiData);
  
  if (!apiData || !apiData.node_mappings || !apiData.mermaid_string) {
    console.log('🔧 [数据转换] 数据无效，返回空数组');
    console.log('🔧 [数据转换] apiData存在:', !!apiData);
    console.log('🔧 [数据转换] node_mappings存在:', !!(apiData && apiData.node_mappings));
    console.log('🔧 [数据转换] mermaid_string存在:', !!(apiData && apiData.mermaid_string));
    return { nodes: [], edges: [] };
  }

  const { mermaid_string, node_mappings } = apiData;
  
  console.log('🔧 [数据转换] node_mappings:', node_mappings);
  console.log('🔧 [数据转换] mermaid_string:', mermaid_string);

  // 创建nodes数组
  const nodes = Object.keys(node_mappings).map((nodeId, index) => ({
    id: nodeId,
    data: { 
      label: node_mappings[nodeId].text_snippet || nodeId,
      paragraph_ids: node_mappings[nodeId].paragraph_ids || []
    },
    position: { x: 0, y: 0 }, // 初始位置，将在布局阶段更新
    type: 'default'
  }));
  
  console.log('🔧 [数据转换] 创建的节点:', nodes);

  // 从mermaid_string解析连接关系创建edges数组
  const edges = [];
  
  // 匹配Mermaid图表中的连接关系，支持多种格式：
  // A --> B, A -> B, A --- B, A -- B
  // 支持带标签的节点，如：A[标签] --> B[标签]
  // 🆕 支持数字ID格式：1 --> 2, 1.1 --> 1.2, 1.1.1 --> 1.1.2
  const connectionRegex = /([A-Za-z0-9_.]+)(?:\[[^\]]*\])?\s*(-{1,2}>?|={1,2}>?)\s*([A-Za-z0-9_.]+)(?:\[[^\]]*\])?/g;
  let match;
  let edgeIndex = 0;

  while ((match = connectionRegex.exec(mermaid_string)) !== null) {
    const [, source, connector, target] = match;
    
    console.log('🔧 [数据转换] 找到连接:', source, connector, target);
    
    // 确保源节点和目标节点都存在于node_mappings中
    if (node_mappings[source] && node_mappings[target]) {
      const edge = {
        id: `edge-${edgeIndex++}`,
        source: source,
        target: target,
        type: 'smoothstep', // 使用平滑的边类型
        animated: false
      };
      edges.push(edge);
    } else {
      console.warn('🔧 [数据转换] 跳过无效边:', source, '->', target, 
        '(源节点存在:', !!node_mappings[source], '目标节点存在:', !!node_mappings[target], ')');
    }
  }
  
  console.log('🔧 [数据转换] 最终结果:');
  console.log('🔧 [数据转换] 节点数量:', nodes.length);
  console.log('🔧 [数据转换] 边数量:', edges.length);

  return { nodes, edges };
};