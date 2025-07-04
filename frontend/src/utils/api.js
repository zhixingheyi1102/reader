/**
 * API 工具函数
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * 更新节点标签
 * @param {string} documentId - 文档ID
 * @param {string} nodeId - 节点ID
 * @param {string} newLabel - 新标签
 * @returns {Promise<Object>} API响应
 */
export const updateNodeLabel = async (documentId, nodeId, newLabel) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/document/${documentId}/node/${nodeId}/label`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newLabel })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ [API] 更新节点标签失败:', error);
    throw error;
  }
};

/**
 * 通用 API 错误处理
 * @param {Error} error - 错误对象
 * @returns {string} 用户友好的错误消息
 */
export const handleApiError = (error) => {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return '网络连接失败，请检查网络设置';
  }
  
  if (error.message.includes('404')) {
    return '请求的资源未找到';
  }
  
  if (error.message.includes('500')) {
    return '服务器内部错误，请稍后重试';
  }
  
  return error.message || '操作失败，请重试';
};